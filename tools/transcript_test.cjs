// Tests for word timings from the speech engine (src/engines/transcript.cjs). Run with any Node, or the app's:
//   node tools/transcript_test.cjs
//   ELECTRON_RUN_AS_NODE=1 "dist/Video Visor Dev.app/Contents/MacOS/Video Visor" tools/transcript_test.cjs
// 0.15 (Win-fix 6): the Windows whisper.cpp build gives the first words of a segment no length (" This@3200 | is@3200 | a@3200").
const { parseTranscript } = require(require('node:path').join(__dirname, '../src/engines/transcript.cjs'));
let bad = 0; const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : JSON.stringify({ got, want })); };
const tok = (text, from, to = from) => ({ text, offsets: { from, to } });
const seg = (text, from, to, tokens) => ({ text, offsets: { from, to }, tokens });
const parse = (segments, duration) => parseTranscript({ transcription: segments }, 'a1', duration);
const ordered = words => words.every((w, i) => w.end > w.start && (i === 0 || w.start >= words[i - 1].end - 1e-9));
const r3 = n => Math.round(n * 1000) / 1000;

// The sequence from the Windows test pass: the segment's first three words have no length.
let [line] = parse([seg(' This is a test.', 3200, 4000, [tok('[_BEG_]', 3200), tok(' This', 3200), tok(' is', 3200), tok(' a', 3200), tok(' test', 3200, 3900), tok('.', 3900, 3950), tok('[_TT_200]', 4000)])]);
eq('zero-length words are kept', line.words.map(w => w.text), ['This', 'is', 'a', 'test.']);
eq('they start where whisper put them', line.words[0].start, 3.2);
eq('each gets at least 40 ms', line.words.slice(0, 3).map(w => r3(w.end - w.start)), [0.04, 0.04, 0.04]);
eq('sorted and non-overlapping', ordered(line.words), true);
eq('the next word gives up the time and keeps its end', [r3(line.words[3].start), line.words[3].end], [3.32, 3.95]);

// A gap after the zero-length words: they share it, up to 0.5 s each.
[line] = parse([seg(' Hello there world', 1000, 2600, [tok(' Hello', 1000), tok(' there', 1000), tok(' world', 1600, 2000)])]);
eq('spread to the next word', line.words.map(w => [r3(w.start), r3(w.end)]), [[1, 1.3], [1.3, 1.6], [1.6, 2]]);
[line] = parse([seg(' Hi everyone', 1000, 4000, [tok(' Hi', 1000), tok(' everyone', 3500, 4000)])]);
eq('at most 0.5 s per word', line.words.map(w => [r3(w.start), r3(w.end)]), [[1, 1.5], [3.5, 4]]);

// Last word of a segment with no length: it runs to the segment end.
[line] = parse([seg(' Okay', 5000, 5400, [tok(' Okay', 5000)])]);
eq('last word uses the segment end', line.words.map(w => [w.text, r3(w.start), r3(w.end)]), [['Okay', 5, 5.4]]);

// A zero-length piece of a word joins the word.
[line] = parse([seg(" Ankit's demo", 100, 1000, [tok(' Ankit', 100, 400), tok("'s", 400), tok(' demo', 400, 900)])]);
eq('zero-length suffix joins its word', line.words.map(w => w.text), ["Ankit's", 'demo']);
eq('…and the words stay in order', ordered(line.words), true);

// Ordinary timings are unchanged.
[line] = parse([seg(' one two', 0, 700, [tok(' one', 0, 300), tok(' two', 300, 700)])]);
eq('normal words unchanged', line.words, [{ text: 'one', start: 0, end: 0.3 }, { text: 'two', start: 0.3, end: 0.7 }]);

// Clamped to the media length; special tokens and empty text ignored.
[line] = parse([seg(' end of clip', 9000, 10500, [tok(' end', 9000), tok(' of', 9000), tok(' clip', 9800, 10500), tok(' ', 10500), tok('[_TT_500]', 10500)])], 10);
eq('clamped to the clip', line.words.map(w => [w.text, r3(w.start), r3(w.end)]), [['end', 9, 9.4], ['of', 9.4, 9.8], ['clip', 9.8, 10]]);
eq('segment clamped to the clip', line.end, 10);

// Two segments: words keep their own segments.
const two = parse([seg(' A b', 0, 1000, [tok(' A', 0), tok(' b', 0, 1000)]), seg(' C', 1000, 2000, [tok(' C', 1000)])]);
eq('words per segment', two.map(l => l.words.map(w => w.text)), [['A', 'b'], ['C']]);

console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
