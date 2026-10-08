// Nora's streamed answer, read by both of her panels (the website's chat widget and the app's
// Nora sheet). POST /api/support/chat with `stream: true` answers with Server-Sent Events:
//   - `text`  { text }  her reply so far, already cleaned the way the final reply is;
//   - `reset` {}        a round turned out to be a lookup, so what it showed is taken back;
//   - `done`  {...}     exactly the object a plain request gets ({ reply, source, actions, ... }).
// Anything the route answers before the model runs (the daily limit, the bot check) is plain
// JSON, so a caller reads a stream only when the response says it is one (isNoraStream).
//
// ⚠ public/newdesign/chatWidget.jsx is a classic script and cannot import this file: it keeps
// an identical copy (cwIsNoraStream, cwReadNoraStream), and tests/nora-stream.test.mjs holds
// the two to each other.

export function isNoraStream(res) {
  const type = res && res.headers && typeof res.headers.get === 'function' ? String(res.headers.get('content-type') || '') : '';
  return /text\/event-stream/i.test(type);
}

// Reads the stream to its end: `onText` gets her reply so far on each `text`, `onReset` runs on
// each `reset`. Resolves the `done` object, or null when the stream ended without one (the
// connection dropped), which a caller treats as a failed request.
export async function readNoraStream(res, { onText, onReset } = {}) {
  const reader = res && res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = '';
  let done = null;
  const take = (block) => {
    let event = 'message';
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return;
    let value;
    try { value = JSON.parse(data.join('\n')); } catch (e) { return; }
    if (event === 'text') { if (value && typeof value.text === 'string' && onText) onText(value.text); }
    else if (event === 'reset') { if (onReset) onReset(); }
    else if (event === 'done') { if (value && typeof value === 'object') done = value; }
  };
  for (;;) {
    const { value, done: end } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    let cut = buffer.indexOf('\n\n');
    while (cut >= 0) {
      take(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf('\n\n');
    }
    if (end) break;
  }
  if (buffer.trim()) take(buffer);
  return done;
}
