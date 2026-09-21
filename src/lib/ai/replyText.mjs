// Nora's reply, as the chat bubble can show it.
//
// Both clients render `reply` as PLAIN TEXT (mobile: a text node in the thread;
// web: the same), so markdown reaches the member as raw asterisks and hashes.
// The prompt tells the model to write plain prose; this is the guard behind
// it, because GPT-6 Astra leans toward formatted, sectioned answers and a
// stray `**` is the kind of thing a prompt rule loses one turn in ten.
//
// It removes markup ONLY — emphasis markers, heading hashes, code fences, and
// list bullets become the plain sentence they were wrapping. It never rewrites,
// reorders, or drops a word the model said. Pure, node-tested.

export function plainText(text) {
  let s = String(text ?? '').replace(/\r\n?/g, '\n');
  s = s.replace(/```[a-z0-9-]*\n?/gi, '');            // code fences
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');       // heading hashes
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, '• ');          // list bullets → a bullet the bubble can show
  s = s.replace(/^[ \t]*(\d+)[.)][ \t]+/gm, '$1. ');    // numbered lists keep their number
  s = s.replace(/\*\*(.+?)\*\*/gs, '$1');              // **bold**
  s = s.replace(/__(.+?)__/gs, '$1');                  // __bold__
  // *italic* / _italic_ — markdown emphasis has no whitespace just inside its
  // delimiters, so the pair must open and close on a non-space: "185 lb * 3 * 5"
  // is two multiplication signs and stays exactly as written.
  s = s.replace(/(^|[^*\w])\*([^\s*](?:[^*\n]*?[^\s*])?)\*(?=[^*\w]|$)/g, '$1$2');
  s = s.replace(/(^|[^_\w])_([^\s_](?:[^_\n]*?[^\s_])?)_(?=[^_\w]|$)/g, '$1$2');
  s = s.replace(/`([^`\n]+)`/g, '$1');                 // `code`
  s = s.replace(/^[ \t]*>[ \t]?/gm, '');               // blockquotes
  s = s.replace(/[ \t]+$/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
