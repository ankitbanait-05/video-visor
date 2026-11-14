'use strict';
// "Draft with AI": the in-app version of the connector. The person types what they want; the app sends
// the instruction, the clip list and the transcript to the AI service they chose (with their own key),
// and carries out the edits the model asks for through the same command layer the connector uses, so
// the same checks and the same safety rules apply. The video and audio files themselves are never sent.
const catalog = require('../connector/tools.cjs');

// What the model may do while drafting. Everything is scoped to one project: the model never names a
// project, so it cannot touch any other. Importing files, duplicating projects and rendering are the
// person's decisions and stay out of the list.
const DRAFT_TOOLS = ['get_project', 'get_transcript', 'list_presets', 'remove_pauses', 'remove_ranges', 'reorder_clips', 'add_title', 'add_icon', 'remove_element', 'set_captions', 'set_music', 'set_canvas'];
const LABELS = { get_project: 'Reading the project', get_transcript: 'Reading the transcript', list_presets: 'Looking at the title and music presets', get_frame: 'Looking at a frame', remove_pauses: 'Cutting silent pauses', remove_ranges: 'Cutting out parts', reorder_clips: 'Reordering clips', add_title: 'Adding a title', add_icon: 'Adding an icon', remove_element: 'Removing a title', set_captions: 'Setting captions', set_music: 'Setting music', set_canvas: 'Setting the frame shape' };
const MAX_STEPS = 40, MAX_TOKENS = 400000 /* 0.15 (DS-05): spending cap per session, input and output together */;

function toolsFor(allowFrames) {
  return [...DRAFT_TOOLS, ...(allowFrames ? ['get_frame'] : [])].map(name => {
    const t = catalog.tools.find(x => x.name === name), { project_id, ...properties } = t.inputSchema.properties;
    return { name: t.name, description: t.description, inputSchema: { type: 'object', properties, required: t.inputSchema.required.filter(k => k !== 'project_id'), additionalProperties: false } };
  });
}
const SYSTEM = [
  'You are the editing assistant inside Video Visor, a video editor on the person\'s Mac. You are working on one draft project and your job is to carry out the person\'s instruction by calling the tools.',
  'You cannot watch or hear the video. You know it through the clip list and the transcript you are given, which say what is spoken and when. Base every cut on the transcript. If the footage has no speech, say so and make only the changes that do not depend on what is shown.',
  'All times are seconds on the edited timeline. Every cut moves everything after it, so read the transcript or the project again before the next edit that depends on a time.',
  'Work in this order unless the instruction says otherwise: cut (pauses, then parts the person wants gone), then titles and icons, then captions, music and frame shape. Use list_presets before adding a title, icon or music so you choose from what exists. Keep titles short, taken from what is actually said.',
  'Do what was asked and no more. If part of the instruction cannot be done with these tools, do the rest and say which part was left.',
  'When you are finished, reply without calling a tool: two to five plain sentences for the person saying what you changed and what they should check in the editor. No headings, no lists, no mention of tool names.'
].join('\n\n');

// The first message, built on this Mac and shown to the person, word for word, before anything is sent.
function opening({ prompt, summary, transcript }) {
  const lines = transcript.lines.length ? transcript.lines.map(l => `[${l.start.toFixed(2)}–${l.end.toFixed(2)}] ${l.text}`).join('\n') : '(No speech was found in this footage.)';
  return `Instruction from the person:\n${prompt.trim()}\n\nThe draft project as it is now:\n${JSON.stringify(summary, null, 1)}\n\nTranscript (seconds on the timeline):\n${lines}`;
}
// What is about to leave the Mac, for the review screen.
function preview({ provider, model, prompt, summary, transcript, allowFrames }) {
  const text = opening({ prompt, summary, transcript }), tools = toolsFor(allowFrames);
  return { provider, model, text, characters: SYSTEM.length + text.length + JSON.stringify(tools).length, approximateTokens: Math.ceil((SYSTEM.length + text.length + JSON.stringify(tools).length) / 4), transcriptLines: transcript.lines.length, clips: summary.clips.length, frames: !!allowFrames };
}

// Runs one drafting session. `adapter` speaks to the AI service (see providers.cjs); `execute` runs a
// command on the project. Returns what happened; throws only for problems with the service itself.
async function run({ adapter, execute, projectId, prompt, summary, transcript, allowFrames = false, onStep = () => {}, signal }) {
  const tools = toolsFor(allowFrames), allowed = new Set(tools.map(t => t.name)), steps = [], usage = { input: 0, output: 0 };
  const conversation = adapter.start({ system: SYSTEM, tools, prompt: opening({ prompt, summary, transcript }), signal });
  let results = null, id = projectId, final = '', stopped = 'done';
  const step = s => { steps.push(s); onStep(s); };
  for (let turn = 0; ; turn++) {
    if (signal?.aborted) { stopped = 'cancelled'; break; }
    if (turn >= MAX_STEPS) { stopped = 'limit'; break; }
    if (usage.input + usage.output >= MAX_TOKENS) { stopped = 'budget'; break; }
    let answer;
    try { answer = await conversation.next(results); } catch (e) { if (signal?.aborted) { stopped = 'cancelled'; break; } throw e; }
    usage.input += answer.usage?.input || 0; usage.output += answer.usage?.output || 0;
    if (answer.text) final = answer.text;
    if (answer.stop === 'refused') { stopped = 'refused'; break; }
    // A reply cut off for length may hold half-written requests: never act on them.
    if (answer.stop === 'length') { stopped = 'length'; break; }
    if (!answer.calls?.length) break;
    results = [];
    for (const call of answer.calls) {
      if (signal?.aborted) { results.push({ id: call.id, name: call.name, text: 'The person stopped the session.', isError: true }); continue; }
      const entry = { tool: call.name, label: LABELS[call.name] || call.name, ok: false };
      try {
        if (!allowed.has(call.name)) throw Error(`"${call.name}" is not available in this session.`);
        if (!call.args || typeof call.args !== 'object' || Array.isArray(call.args) || 'project_id' in call.args) throw Error('That request was not understood. Nothing was changed.');
        const scoped = 'project_id' in catalog.tools.find(t => t.name === call.name).inputSchema.properties; // presets, for example, belong to no project
        const args = scoped ? { ...call.args, project_id: id } : { ...call.args }, checked = catalog.check(call.name, args);
        if (checked.problem) throw Error('That request was not understood: ' + checked.problem + '. Nothing was changed.');
        const result = await execute(call.name, args);
        if (result.data?.project_id && result.data.project_id !== id) id = result.data.project_id; // an edit that landed on a copy
        entry.ok = true;
        results.push({ id: call.id, name: call.name, text: typeof result.text === 'string' ? result.text : JSON.stringify(result.data ?? {}), isError: false, ...(result.image ? { image: result.image } : {}) });
      } catch (e) {
        entry.problem = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').replace(/^Error: /, '').slice(0, 300);
        results.push({ id: call.id, name: call.name, text: entry.problem, isError: true });
      }
      step(entry);
    }
  }
  const edits = steps.filter(s => s.ok && !['get_project', 'get_transcript', 'list_presets', 'get_frame'].includes(s.tool)).length;
  const notes = { budget: 'The session reached its spending cap of about ' + Math.round(MAX_TOKENS / 1000) + ',000 tokens and was stopped. The edits made so far are in the draft.', cancelled: 'You stopped the session. The edits made up to that point are in the draft.', limit: 'The session reached its limit of ' + MAX_STEPS + ' rounds and was stopped. The edits made so far are in the draft.', refused: 'The AI service declined this request. Nothing more was changed.', length: 'The AI service\'s reply was cut off, so the session was stopped. The edits made so far are in the draft.' };
  return { projectId: id, stopped, summary: stopped === 'done' ? final.trim() : notes[stopped], steps, edits, usage };
}
module.exports = { run, preview, opening, toolsFor, SYSTEM, DRAFT_TOOLS, LABELS, MAX_STEPS, MAX_TOKENS };
