// The Wall's magazine look: its red and its headline face. The Wall's stories, the chat page and the app's
// chrome (the masthead's corner and the tab bar) all read them here, so one red runs through the app (owner,
// 2026-10-24: the chat page "to match the new feed wall look", then the header's corner and the tab bar).
export const bsWsRed = (t) => (t.isLight ? '#b23a1f' : '#ff7a5c');
export const bsWsHead = (t) => t.HEADLINE || t.DISPLAY;
