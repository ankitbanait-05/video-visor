'use strict';
/* 0.15 (Win-fix 9): the assistant is told where it runs: this Mac or this PC */
const HERE = process.platform === 'darwin' ? 'this Mac' : 'this PC';
// Everything an assistant can ask Video Visor to do, in one list.
// Used by the app (to answer and to check requests) and by the stdio bridge (to list tools while the app is closed).
// Each tool belongs to one permission group, switched on or off in Settings → Connect an AI assistant.
const id = { type: 'string', minLength: 1, maxLength: 80, description: 'A project_id from list_projects or create_draft.' };
const seconds = description => ({ type: 'number', minimum: 0, maximum: 14400, description });
const percent = description => ({ type: 'number', minimum: 0, maximum: 100, description });
const colour = description => ({ type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description });
const files = description => ({ type: 'array', minItems: 1, maxItems: 40, items: { type: 'string', minLength: 2, maxLength: 1024 }, description });
const shape = { type: 'string', enum: ['16:9', '9:16', '1:1', '4:5'] };
const tool = (name, permission, title, description, properties = {}, required = [], hints = {}) => ({
  name, permission, title, description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations: { title, readOnlyHint: permission === 'read', destructiveHint: false, idempotentHint: permission === 'read', openWorldHint: false, ...hints }
});

const tools = [
  tool('list_projects', 'read', 'List projects', 'Lists the video projects in Video Visor with their ids, names, lengths and whether each is an AI draft. Start here to find a project_id.'),
  tool('get_project', 'read', 'Read a project', 'Describes one project: frame shape, length, the clips on the timeline in order (with ids and times), titles and callouts, captions, music, camera circle, and the media available to it. All times are seconds on the edited timeline.', { project_id: id }, ['project_id']),
  tool('list_media', 'read', 'List media files', 'Lists the video, image and audio files in a folder the user has allowed in Settings. Call it with no folder to see which folders are allowed.', { folder: { type: 'string', maxLength: 1024, description: 'Absolute path of an allowed folder, or a folder inside one.' } }),
  tool('get_transcript', 'read', 'Read the transcript', 'Returns what is said in the project as timed lines (seconds on the edited timeline). The assistant cannot watch the video; this is how to understand it. If the project has no transcript yet, pass generate: true to transcribe on ' + HERE + ' (takes roughly a tenth of the video length).', { project_id: id, generate: { type: 'boolean', description: 'Transcribe now if there is no transcript. Default false.' } }, ['project_id'], { idempotentHint: false }),
  tool('get_frame', 'read', 'Look at a frame', 'Returns one frame of the edited video as an image, with titles, captions and the camera circle drawn as they will export. Use it sparingly to check how something looks.', { project_id: id, time: seconds('Seconds on the edited timeline.') }, ['project_id', 'time']),
  tool('list_presets', 'read', 'List presets', 'Lists what can be added to a video: title and callout presets (with ids), icon names, caption styles, music tracks and frame shapes.'),

  tool('create_draft', 'edit', 'Create a draft', 'Creates a new project tagged "AI draft" from media files, placed on the timeline in the order given. Files must be inside a folder the user allowed in Settings (see list_media). Returns the new project_id. The person finishes the draft in the Video Visor editor.', { name: { type: 'string', minLength: 1, maxLength: 60, description: 'Project name.' }, files: files('Absolute paths of videos or images for the timeline, in order. Audio files are added to the project media only.'), canvas: { ...shape, description: 'Frame shape. Default: the shape of the first video.' } }, ['name', 'files']),
  tool('duplicate_project', 'edit', 'Duplicate a project', 'Makes a copy of a project, tagged "AI draft", and returns its project_id.', { project_id: id, name: { type: 'string', minLength: 1, maxLength: 60 } }, ['project_id']),
  tool('import_media', 'edit', 'Add media to a project', 'Adds files to a project. By default videos and images are appended to the end of the timeline.', { project_id: id, files: files('Absolute paths inside an allowed folder.'), add_to_timeline: { type: 'boolean', description: 'Default true. False only adds the files to the project media.' } }, ['project_id', 'files']),
  tool('remove_ranges', 'edit', 'Cut out parts', 'Removes parts of the edited timeline and closes the gaps. Titles, captions and the camera circle stay in step. Give all ranges in one call, using times from the current timeline (get_project or get_transcript).', { project_id: id, ranges: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', properties: { start: seconds('Start, seconds.'), end: seconds('End, seconds.') }, required: ['start', 'end'], additionalProperties: false } } }, ['project_id', 'ranges']),
  tool('remove_pauses', 'edit', 'Cut out silent pauses', 'Finds silent pauses in the speech and removes them, leaving a short breath on each side.', { project_id: id, min_pause: { type: 'number', minimum: 0.7, maximum: 10, description: 'Shortest pause to remove, seconds. Default 1.' }, keep: { type: 'number', minimum: 0, maximum: 1, description: 'Silence to leave at each side of a cut, seconds. Default 0.15.' } }, ['project_id']),
  tool('reorder_clips', 'edit', 'Reorder clips', 'Puts the clips on the timeline in a new order. Give every clip id from get_project exactly once.', { project_id: id, order: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string', minLength: 1, maxLength: 80 } } }, ['project_id', 'order']),
  tool('add_title', 'edit', 'Add a title or callout', 'Adds an animated title, lower third, chapter card, quote, number or callout from list_presets. It can be restyled later in the editor.', { project_id: id, preset: { type: 'string', minLength: 1, maxLength: 40, description: 'Preset id from list_presets, for example "t-clean" or "l-plate".' }, text: { type: 'string', maxLength: 180, description: 'Main text.' }, subtitle: { type: 'string', maxLength: 180, description: 'Supporting line, for presets that have one.' }, label: { type: 'string', maxLength: 40, description: 'Small label, number or badge text, for presets that have one.' }, start: seconds('When it appears, seconds.'), end: seconds('When it leaves, seconds.'), x: percent('Horizontal centre, percent of the frame. Default: the preset position.'), y: percent('Vertical centre, percent of the frame.'), color: colour('Text colour, #rrggbb.'), accent: colour('Accent colour, #rrggbb.') }, ['project_id', 'preset', 'start', 'end']),
  tool('add_icon', 'edit', 'Add an animated icon', 'Adds an animated icon (names from list_presets) that draws on and can sit anywhere in the frame.', { project_id: id, icon: { type: 'string', minLength: 1, maxLength: 40 }, start: seconds('When it appears, seconds.'), end: seconds('When it leaves, seconds.'), x: percent('Horizontal centre, percent. Default 50.'), y: percent('Vertical centre, percent. Default 50.'), size: { type: 'number', minimum: 10, maximum: 90, description: 'Default 28.' }, color: colour('Badge colour, #rrggbb.') }, ['project_id', 'icon', 'start', 'end']),
  tool('remove_element', 'edit', 'Remove a title or icon', 'Removes one title, callout or icon by its id from get_project.', { project_id: id, element_id: { type: 'string', minLength: 1, maxLength: 80 } }, ['project_id', 'element_id'], { destructiveHint: true }),
  tool('set_captions', 'edit', 'Turn captions on or off', 'Shows or hides captions and sets their style. Turning captions on transcribes the speech on ' + HERE + ' first if needed.', { project_id: id, enabled: { type: 'boolean' }, style: { type: 'string', enum: ['clean', 'boxed', 'word', 'karaoke', 'editorial', 'subtitle', 'pop', 'outline', 'highlighter', 'twotone', 'typewriter', 'neon'] }, position: { type: 'string', enum: ['bottom', 'middle', 'top'] } }, ['project_id', 'enabled']),
  tool('set_music', 'edit', 'Add or remove music', 'Adds a track from the built-in library (names from list_presets) under the whole video, lowered while people speak, or removes the music.', { project_id: id, track: { type: ['string', 'null'], maxLength: 60, description: 'Track name from list_presets, or null to remove the music.' }, volume: percent('Music level, percent. Default 20.') }, ['project_id', 'track']),
  tool('set_canvas', 'edit', 'Set the frame shape', 'Changes the frame shape of the video.', { project_id: id, shape, fit: { type: 'string', enum: ['fit', 'fill'], description: '"fit" shows the whole picture with bars; "fill" crops to fill the frame. Default: keep the current setting.' } }, ['project_id', 'shape']),
  tool('add_camera', 'edit', 'Add a camera circle', 'Shows a camera video of the presenter in a circle over the screen recording on the timeline (the explainer layout). The camera video must start at the same moment as the screen recording.', { project_id: id, file: { type: 'string', minLength: 2, maxLength: 1024, description: 'Absolute path of the camera video, inside an allowed folder.' }, shape: { type: 'string', enum: ['circle', 'rounded', 'rect'] }, corner: { type: 'string', enum: ['tl', 'tr', 'bl', 'br'], description: 'Corner: top/bottom, left/right. Default br.' } }, ['project_id', 'file']),

  tool('render', 'render', 'Render a video', 'Adds the project to the render queue, once per frame shape asked for. Rendering runs in the background in Video Visor, one video at a time; check render_status for progress and the saved file.', { project_id: id, shapes: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: shape, description: 'Frame shapes to render. Default: the project shape.' }, format: { type: 'string', enum: ['MP4', 'MOV'], description: 'Default MP4.' }, resolution: { type: 'string', enum: ['720p', '1080p', '4K'], description: 'Default 1080p.' } }, ['project_id'], { idempotentHint: false }),
  tool('render_status', 'render', 'Check renders', 'Reports the render queue: waiting, rendering (with percent), done (with the saved file path), failed or cancelled.', { job_id: { type: 'string', maxLength: 80, description: 'One job. Default: the whole queue.' } }, [], { readOnlyHint: true, idempotentHint: true }),
  tool('cancel_render', 'render', 'Cancel a render', 'Cancels one waiting or running render.', { job_id: { type: 'string', minLength: 1, maxLength: 80 } }, ['job_id'], { destructiveHint: true })
];
const permissions = [['read', 'See projects, transcripts and frames'], ['edit', 'Create and edit drafts'], ['render', 'Render videos']];
const instructions = 'Video Visor is a video editor on ' + HERE + '. You cannot watch video: work from get_transcript (what is said and when), get_project (what is on the timeline) and, sparingly, get_frame. Typical first draft: list_media → create_draft → get_transcript with generate: true → remove_pauses or remove_ranges → add_title → set_captions → tell the person the draft is ready to open in Video Visor. All times are seconds on the edited timeline and change after every cut, so read the project again before the next timed edit. Your own drafts are edited in place; the person\'s own projects are never changed, edits to them go to a copy whose project_id is returned. Rendering is queued and runs in the background.';

// What the client sees: the definition without our own bookkeeping.
const publicTool = ({ permission, ...t }) => t;
function visible(allowed) { return tools.filter(t => !allowed || allowed[t.permission]).map(publicTool); }

// A small JSON Schema checker covering exactly what the schemas above use.
// Returns a plain-language problem, or null when the value fits.
function problem(schema, value, where = 'arguments') {
  const types = [].concat(schema.type || []), kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' && !Number.isFinite(value) ? 'invalid' : typeof value;
  if (types.length && !types.some(t => t === kind || (t === 'integer' && kind === 'number' && Number.isInteger(value)))) return `${where} must be ${types.join(' or ')}, not ${kind}`;
  if (schema.enum && !schema.enum.includes(value)) return `${where} must be one of: ${schema.enum.join(', ')}`;
  if (kind === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) return `${where} is too short`;
    if (schema.maxLength != null && value.length > schema.maxLength) return `${where} is longer than ${schema.maxLength} characters`;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${where} is not in the expected form${schema.description ? ' (' + schema.description + ')' : ''}`;
  }
  if (kind === 'number') {
    if (schema.minimum != null && value < schema.minimum) return `${where} must be at least ${schema.minimum}`;
    if (schema.maximum != null && value > schema.maximum) return `${where} must be at most ${schema.maximum}`;
  }
  if (kind === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) return `${where} needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`;
    if (schema.maxItems != null && value.length > schema.maxItems) return `${where} has more than ${schema.maxItems} items`;
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) return `${where} repeats an item`;
    if (schema.items) for (let i = 0; i < value.length; i++) { const p = problem(schema.items, value[i], `${where}[${i}]`); if (p) return p; }
  }
  if (kind === 'object') {
    for (const key of schema.required || []) if (value[key] === undefined) return `${where === 'arguments' ? '' : where + '.'}${key} is required`;
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (!sub) { if (schema.additionalProperties === false) return `${where === 'arguments' ? '' : where + '.'}${key} is not an option for this tool`; continue; }
      if (v === undefined) continue;
      const p = problem(sub, v, where === 'arguments' ? key : `${where}.${key}`); if (p) return p;
    }
  }
  return null;
}
function check(name, args) {
  const t = tools.find(t => t.name === name); if (!t) return { unknown: true };
  if (args === undefined || args === null) args = {};
  return { tool: t, args, problem: problem(t.inputSchema, args) };
}
module.exports = { tools, permissions, instructions, visible, problem, check };
