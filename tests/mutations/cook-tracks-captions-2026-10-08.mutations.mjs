// Mutation spec for the website's step captions under the cook timeline's bars.
// Each mutation breaks one rule; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/cook-tracks-captions-2026-10-08.mutations.mjs --fail-on-skipped
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const ROOM = 'const room = Math.min(next ? x(next.at) : Math.max(X + w + 1, fx), W) - X - 6;';

export default {
  test: 'node --test tests/cook-tracks-rails.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'the website gets no captions', file: CLIENT, find: 'if (!words) return bar;', replace: 'if (true) return bar;' },
    { name: 'the phone gets captions too', file: CLIENT, find: 'if (!words) return bar;', replace: 'if (false) return bar;' },
    { name: 'a cook screen stops handing over its layout', file: CLIENT,
      find: "onOpen: () => setSheet('steps'), readyAt: finishAt, words: layout.web })", replace: "onOpen: () => setSheet('steps'), readyAt: finishAt })" },
    { name: 'the timeline loses the class that makes room for captions', file: CLIENT,
      find: "className={`tl${words ? ' words' : ''}`}", replace: 'className="tl"' },
    { name: 'the website lanes keep their caption-less height', file: CLIENT,
      find: '.bsck.web .cD .dtl .tl.words .lane{height:62px}', replace: '.bsck.web .cD .dtl .tl.words .lane{height:44px}' },
    { name: 'a caption sits on the ring of the current step', file: CLIENT,
      find: '.bsck .cB .tl .cap{position:absolute;top:44px;', replace: '.bsck .cB .tl .cap{position:absolute;top:36px;' },
    { name: 'a caption is held to its own bar', file: CLIENT, find: 'style={{ left: X + 1, width: room }}', replace: 'style={{ left: X + 1, width: w }}' },
    { name: 'a caption runs to the right edge, over the next step', file: CLIENT, find: ROOM, replace: ROOM.replace('next ? x(next.at) : ', '') },
    { name: 'a caption runs past the strip', file: CLIENT, find: ROOM, replace: ROOM.replace(', W) - X - 6', ', Infinity) - X - 6') },
    { name: 'captions in any room, however narrow', file: CLIENT, find: 'const BS_CK_CAP_MIN = 40;', replace: 'const BS_CK_CAP_MIN = 10;' },
    { name: 'the current step\'s caption is not marked', file: CLIENT, find: "${b.current && !fit ? ' cur' : ''}`} style={{ left: X + 1, width: room }}", replace: "`} style={{ left: X + 1, width: room }}" },
    { name: 'a lead-in is kept as the caption', file: CLIENT,
      find: 'const pick = clauses.length > 1 && BS_CK_LEAD_IN.test(clauses[0]) ? clauses[1]', replace: 'const pick = false ? clauses[1]' },
    { name: 'a leading "Now" stays on the caption', file: CLIENT, find: ": (clauses[0] || '').replace(BS_CK_ADVERB, '');", replace: ": (clauses[0] || '');" },
    { name: '"Now" counts as a lead-in clause, skipping the instruction it opens', file: CLIENT,
      find: '|as|after)\\b|^(then|now|next|finally)$/i;', replace: '|as|after|then|now|next|finally)\\b/i;' },
    { name: 'an en dash ends a clause, splitting a range', file: CLIENT, find: '.split(/[—,;:(]|\\.(?:\\s|$)/)', replace: '.split(/[—–,;:(]|\\.(?:\\s|$)/)' },
    { name: 'any full stop ends a clause, splitting a decimal', file: CLIENT, find: '.split(/[—,;:(]|\\.(?:\\s|$)/)', replace: '.split(/[—,;:(.]/)' },
    { name: 'a dangling word is trimmed even from a clause that ends on it', file: CLIENT, find: 'if (all.length > n) while', replace: 'if (true) while' },
    { name: 'a cut caption keeps its dangling word', file: CLIENT, find: 'if (all.length > n) while', replace: 'if (false) while' },
    { name: '"As" matches the start of any word', file: CLIENT, find: '|as|after)\\b|^(then', replace: '|as|after)|^(then' },
    { name: 'a caption after a lead-in starts lower-case', file: CLIENT, find: "return out ? out[0].toUpperCase() + out.slice(1) : '';", replace: "return out;" },
  ],
};
