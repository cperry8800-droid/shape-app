// The two ads (marketing/ads/2026-11-app-and-coaches.md). Times are seconds; cuts sit on bars of a 124 BPM
// track (one bar = 1.9355 s), which both tracks in use measured at (grid.py). Every claim is the site's own:
// pricing.jsx (a free account, the $5 membership, cancel any time, coaches price themselves). The coaches ad
// names no price and no fee (owner, 2026-11-16).
// Working files are not in the repository: work/seq (the app recordings, seqcap.cjs), work/desk (the coach
// dashboard's pages, deskcap.cjs), work/art/out (the drawings, prep.py) and work/music.
const PUB = '../../public/';
window.SEQ_BASE = 'work/seq/';
const ART = 'work/art/out/';
const DESK = 'work/desk/';
const BAR = 60 / 124 * 4;
const at = (bars) => Math.round(bars * BAR * 1000) / 1000;
window.ADS = {
  member: {
    seconds: 30,
    sample: 'App shown with sample data',
    scenes: [
      { type: 'hook', start: 0, end: at(1), kicker: 'Shape', big: 'Train.|Eat.|<em>Get coached.</em>', tag: 'One app for all of it.' },
      { type: 'phone', start: at(1), end: at(3), kicker: 'Your goal', head: 'Know where|<em>you stand.</em>', seq: 'm-home', frames: 118 },
      { type: 'phone', start: at(3), end: at(5), kicker: 'Train', head: 'Today’s session,|<em>ready to go.</em>', seq: 'm-train', frames: 118 },
      { type: 'phone', start: at(5), end: at(7), kicker: 'Eat', head: 'Every meal,|<em>planned.</em>', seq: 'm-eat', frames: 118 },
      { type: 'phone', start: at(7), end: at(9), kicker: 'Coaches', head: 'Add a coach.|<em>They set the price.</em>', seq: 'm-coaches', frames: 118 },
      { type: 'phone', start: at(9), end: at(11), kicker: 'Nora, your assistant', head: 'Just ask.|<em>She makes the change.</em>', size: 76, seq: 'm-nora', frames: 118, note: 'Nora comes with the membership · App shown with sample data' },
      { type: 'club', start: at(11), end: at(13), kicker: 'Club Shape', head: 'And a club|to walk into.', img: PUB + 'club/floor-p.webp', note: 'Club Shape is the virtual club inside the app · Pictures made with AI' },
      { type: 'end', start: at(13), end: 30, logo: PUB + 'shape-logo-white.svg', l1: 'Free to <em>start.</em>', l2: 'Membership is $5 a month. Cancel any time.', url: 'theshapecommunity.com', fine: 'App shown with sample data. Coaches set their own prices.' },
    ],
  },
  // The coaches ad, third cut (owner: "remove the 15% part and dont make it so commercial ... cool images of
  // coaches coaching, sitting at their desk and checking the app or desktop dashboard, but have the people be
  // highlighted outlines"). No price and no fee: outline drawings of the work, the real app, the real dashboard
  // on the drawn monitor (the site's own example mode, sample clients).
  coach: {
    seconds: 30,
    bpm: 124,
    sample: 'App shown with sample data',
    scenes: [
      { type: 'art', start: 0, end: at(2), drawn: true, kicker: 'For coaches', head: 'Coaching|<em>happens here.</em>', img: ART + 'squat-1.png', focus: [55, 58], zoom: [1.0, 1.1] },
      { type: 'art', start: at(2), end: at(3), kicker: 'For coaches', head: 'And here.', img: ART + 'plank-1.png', focus: [60, 66], zoom: [1.04, 1.12] },
      { type: 'art', start: at(3), end: at(4), kicker: 'For coaches', head: 'And here.', img: ART + 'nutri-2.png', focus: [50, 60], zoom: [1.0, 1.08] },
      { type: 'art', start: at(4), end: at(6), kicker: 'After hours', head: 'The rest|<em>happens here.</em>', img: ART + 'deskphone-2.png', focus: [64, 44], zoom: [1.0, 1.22] },
      { type: 'phone', start: at(6), end: at(8), kicker: 'Today', head: 'Your day,|<em>already sorted.</em>', seq: 'c-today', frames: 118 },
      { type: 'phone', start: at(8), end: at(9.5), kicker: 'Clients', head: 'See who needs|<em>you first.</em>', seq: 'c-clients', frames: 118 },
      { type: 'art', start: at(9.5), end: at(11.75), kicker: 'Dashboard', head: 'On your phone.|<em>And your desk.</em>', img: ART + 'desktop-1.png', focus: [73, 47], zoom: [1.0, 1.32], pan: [-185, 25],
        note: 'Coach dashboard shown with sample data',
        screen: { quad: [[845, 1040], [1430, 1080], [1388, 1552], [816, 1441]], w: 1360, h: 1000, shots: [DESK + 'd-today.jpg', DESK + 'd-clients.jpg', DESK + 'd-programs.jpg', DESK + 'd-week.jpg'], at: [0, BAR * 0.75, BAR * 1.25, BAR * 1.75] } },
      { type: 'art', start: at(11.75), end: at(13.25), kicker: 'Why you do it', head: 'More time|<em>for this.</em>', img: ART + 'fistbump-1.png', focus: [50, 46], zoom: [1.0, 1.1] },
      { type: 'end', start: at(13.25), end: 30, logo: PUB + 'shape-logo-white.svg', l1: 'Coach on <em>Shape.</em>', l2: 'For trainers and nutritionists.', url: 'theshapecommunity.com', fine: 'App and dashboard shown with sample data.' },
    ],
  },
};
