// The Kitchen's jump row (≤ 15 min · 15–30 · 30–60 · 1 hr +): which course it lights, and
// where a tap scrolls to. Pure, so both rules can be driven without a layout engine.
//
// ⚠ THE SPY AND THE JUMP USED TO MEASURE FROM DIFFERENT TOPS. The jump put a course's top
// under the row counting from the top of the page's scroller; the spy read that same top
// counting from the top of the SCREEN. The scroller starts below the screen's top (20px in
// the app's preview, measured 2026-10-08), so a course a tap had just scrolled to sat short of
// the spy's line, and the tab before it stayed lit: 15–30 lit ≤ 15, 30–60 lit 15–30, 1 hr +
// lit 30–60. Both now take the line from bsJumpLine, so they cannot disagree.

const num = (v) => (Number.isFinite(v) ? v : 0);

// The bottom edge of the row once it is stuck, in viewport pixels: where the scroller starts,
// the masthead the row sticks under, and the row's own height.
export function bsJumpLine({ hostTop = 0, stickyTop = 0, rowHeight = 0 } = {}) {
  return num(hostTop) + num(stickyTop) + num(rowHeight);
}

// The course to light. `tops[i]` is course i's top edge in viewport pixels, or null when the
// course is not on the page (a filter left it empty). The last course whose top has reached
// the line, within `slack`, is the one being read. At the end of the scroll a short last course
// may never reach the line, so there the last course on screen is lit. With none reached,
// the first course on the page. -1 only when no course is on the page.
export function bsJumpActive({ tops, line, slack = 24, atEnd = false, viewBottom = Infinity } = {}) {
  const list = Array.isArray(tops) ? tops : [];
  let first = -1;
  let idx = -1;
  list.forEach((top, i) => {
    if (!Number.isFinite(top)) return;
    if (first < 0) first = i;
    if (top - num(line) <= slack) idx = i;
  });
  if (atEnd) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (Number.isFinite(list[i]) && list[i] < viewBottom) { idx = Math.max(idx, i); break; }
    }
  }
  return idx >= 0 ? idx : first;
}

// Whether the scroller is at its end. A page too short to scroll is never at its end, so a
// short filtered menu lights its first course, not its last.
export function bsJumpAtEnd({ scrollTop, scrollHeight, clientHeight } = {}) {
  const max = num(scrollHeight) - num(clientHeight);
  return max > 0 && num(scrollTop) > 0 && num(scrollTop) >= max - 2;
}

// Where a tap scrolls the scroller: the course's top on the line.
export function bsJumpScrollTop({ scrollTop = 0, top = 0, line = 0 } = {}) {
  return Math.max(0, num(scrollTop) + num(top) - num(line));
}
