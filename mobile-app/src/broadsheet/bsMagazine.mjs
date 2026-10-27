// The Wall's magazine look: its accent and its headline face. The Wall's stories, the chat page, the
// profiles and the app's chrome (the tab bar) all read them here, so one colour runs through the app (owner,
// 2026-10-24: the chat page "to match the new feed wall look", then the header's corner and the tab bar).
// The accent is Shape's teal, not the magazine's red it was (owner, 2026-10-27: "Those should be shape
// colors"): on light paper the deeper teal that small text needs (#0a7a72, 4.6:1 on cream where the
// brand's #0a8f87 is 3.5:1), on dark the bright one, the pair Settings uses for its small teal text.
// The headline face is the app's own (Saira, t.DISPLAY), as on every other page (owner, 2026-10-24: "Font
// needs to be same on whole app", "The font on Chat page needs to not be so tall"): Oswald is gone.
export const bsWsAccent = (t) => (t.isLight ? '#0a7a72' : '#34d6c5');
export const bsWsHead = (t) => t.DISPLAY;
