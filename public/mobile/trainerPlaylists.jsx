// Shared playlist data for Shape trainer + client surfaces.
// Trainers paste Spotify / Apple Music links; each playlist can be attached
// to one or many workouts (by template id OR by client workout).
const TRAINER_PLAYLISTS = [
  {
    id: "pl-heavy",
    name: "Heavy Squat Day",
    provider: "spotify",
    url: "https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP",
    note: "Slow BPM, heavy hitters. Save skips for the warmup.",
    bpm: "75–95",
    trackCount: 28,
    duration: "2h 14m",
    cover: "linear-gradient(135deg, #7a2a2a 0%, #1a1612 70%)",
    accent: "#d84a4a",
    attachedTo: ["tpl-lower-pull", "tpl-lower-push"],
    shared: true,
    updated: "2d ago",
    listens: 412,
    sampleTracks: [
      ["Wun Two", "Cafe con Leche", "3:42"],
      ["Nujabes", "Feather", "5:06"],
      ["Denzel Curry", "CLOUT COBAIN", "2:43"],
      ["Griselda", "Scotties", "3:18"],
      ["Freddie Gibbs", "Frank Lucas", "3:54"],
    ],
  },
  {
    id: "pl-tempo",
    name: "Tempo Run — Zone 2",
    provider: "spotify",
    url: "https://open.spotify.com/playlist/37i9dQZF1DXdxcBWuJkbcy",
    note: "155 BPM floor. No ballads. Keep you honest.",
    bpm: "150–168",
    trackCount: 42,
    duration: "2h 58m",
    cover: "linear-gradient(135deg, #1c5a4a 0%, #1a1612 70%)",
    accent: "#1EC0A8",
    attachedTo: ["tpl-zone2", "tpl-marathon-base"],
    shared: true,
    updated: "6d ago",
    listens: 1184,
    sampleTracks: [
      ["Fred again..", "Delilah (pull me out of this)", "4:12"],
      ["Overmono", "So U Kno", "3:58"],
      ["Four Tet", "Lush", "5:28"],
      ["Jamie xx", "Gosh", "6:18"],
      ["Bonobo", "Linked", "6:42"],
    ],
  },
  {
    id: "pl-upper",
    name: "Upper Push — Peak",
    provider: "spotify",
    url: "https://open.spotify.com/playlist/37i9dQZF1DX8FwnYE6PRcL",
    note: "Builds across the session. Peaks at the top sets.",
    bpm: "95–130",
    trackCount: 31,
    duration: "2h 06m",
    cover: "linear-gradient(135deg, #2a3a6a 0%, #1a1612 70%)",
    accent: "#6a8cff",
    attachedTo: ["tpl-upper-push"],
    shared: false,
    updated: "14h ago",
    listens: 86,
    sampleTracks: [
      ["Kanye West", "POWER", "4:52"],
      ["Run The Jewels", "Legend Has It", "3:29"],
      ["Tyler, The Creator", "NEW MAGIC WAND", "4:15"],
      ["Danny Brown", "Ain't It Funny", "3:01"],
      ["JPEGMAFIA", "1539 N. Calvert", "2:14"],
    ],
  },
  {
    id: "pl-mobility",
    name: "Mobility + Warmup",
    provider: "apple",
    url: "https://music.apple.com/us/playlist/mobility-warmup/pl.u-GgA5pbMfM5V3LW",
    note: "Low key. Get your hips open. Don't rush.",
    bpm: "60–90",
    trackCount: 18,
    duration: "1h 12m",
    cover: "linear-gradient(135deg, #6a4a1c 0%, #1a1612 70%)",
    accent: "#f2a94e",
    attachedTo: ["tpl-mobility", "tpl-warmup"],
    shared: true,
    updated: "1w ago",
    listens: 624,
    sampleTracks: [
      ["Nils Frahm", "Says", "8:18"],
      ["Ólafur Arnalds", "Near Light", "4:22"],
      ["Tycho", "Division", "5:42"],
      ["Bonobo", "Cirrus", "5:48"],
      ["Emancipator", "Soon It Will Be Cold Enough", "5:30"],
    ],
  },
  {
    id: "pl-hiit",
    name: "HIIT / Conditioning",
    provider: "spotify",
    url: "https://open.spotify.com/playlist/37i9dQZF1DWUVpAXiEPK8P",
    note: "30s on, 30s off. Matches the work intervals.",
    bpm: "128–145",
    trackCount: 36,
    duration: "2h 32m",
    cover: "linear-gradient(135deg, #5a1c4a 0%, #1a1612 70%)",
    accent: "#e86bd8",
    attachedTo: ["tpl-hiit", "tpl-conditioning"],
    shared: true,
    updated: "3d ago",
    listens: 892,
    sampleTracks: [
      ["Overmono", "BMW Track", "4:00"],
      ["Fred again..", "Turn On The Lights again..", "3:42"],
      ["Skrillex", "Rumble", "3:28"],
      ["Flume", "Say Nothing", "3:12"],
      ["Jamie xx", "Idontknow", "4:36"],
    ],
  },
  {
    id: "pl-long-run",
    name: "Long Run Sunday",
    provider: "spotify",
    url: "https://open.spotify.com/playlist/37i9dQZF1DX9sIqqvKsjG8",
    note: "3-hour mix. No repeats. Podcasts after km 15 if you need.",
    bpm: "130–160",
    trackCount: 48,
    duration: "3h 24m",
    cover: "linear-gradient(135deg, #1c4a5a 0%, #1a1612 70%)",
    accent: "#4ab8d8",
    attachedTo: ["tpl-long-run"],
    shared: false,
    updated: "Yesterday",
    listens: 42,
    sampleTracks: [
      ["Caribou", "Never Come Back", "4:38"],
      ["Floating Points", "Vocoder", "5:42"],
      ["Peggy Gou", "(It Goes Like) Nanana", "3:15"],
      ["Jamie xx", "All You Children", "4:06"],
      ["Four Tet", "Teenage Birdsong", "4:53"],
    ],
  },
];

// Workout templates a trainer owns — used to match playlists to workouts.
const TRAINER_WORKOUTS = [
  { id: "tpl-lower-pull", name: "Lower Pull (Deadlift)", program: "Strength + hybrid", duration: "75 min", clientsDoing: 14 },
  { id: "tpl-lower-push", name: "Lower Push (Squat)", program: "Strength + hybrid", duration: "70 min", clientsDoing: 14 },
  { id: "tpl-upper-push", name: "Upper Push (Bench)", program: "Strength + hybrid", duration: "60 min", clientsDoing: 14 },
  { id: "tpl-upper-pull", name: "Upper Pull (Row)", program: "Strength + hybrid", duration: "55 min", clientsDoing: 14 },
  { id: "tpl-zone2", name: "Zone 2 Run", program: "Hybrid cut", duration: "40 min", clientsDoing: 5 },
  { id: "tpl-hiit", name: "HIIT Intervals", program: "Hybrid cut", duration: "25 min", clientsDoing: 5 },
  { id: "tpl-conditioning", name: "Metcon Finisher", program: "Hybrid cut", duration: "15 min", clientsDoing: 5 },
  { id: "tpl-mobility", name: "Mobility Flow", program: "All programs", duration: "20 min", clientsDoing: 34 },
  { id: "tpl-warmup", name: "Dynamic Warmup", program: "All programs", duration: "10 min", clientsDoing: 34 },
  { id: "tpl-long-run", name: "Long Run Sunday", program: "Marathon base", duration: "90+ min", clientsDoing: 2 },
  { id: "tpl-marathon-base", name: "Easy Base Run", program: "Marathon base", duration: "60 min", clientsDoing: 2 },
];

// Small provider glyphs
function ProviderMark({ kind = "spotify", size = 14 }) {
  if (kind === "apple") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 2.5.92 4.78 2.44 6.53.35.4.97.4 1.32 0 .3-.34.28-.85-.03-1.17A7.5 7.5 0 1 1 19.5 12a7.47 7.47 0 0 1-2.76 5.8c-.32.26-.37.72-.12 1.03.26.32.72.37 1.03.12A8.96 8.96 0 0 0 22 12c0-5.52-4.48-10-10-10z" fill="currentColor" opacity=".7"/>
        <path d="M12 6a6 6 0 0 0-6 6c0 1.4.48 2.7 1.3 3.7.22.27.62.3.87.06.26-.23.28-.63.06-.9A4.5 4.5 0 1 1 16.5 12c0 1.05-.36 2.02-.96 2.78-.23.28-.2.68.06.9.25.22.65.2.87-.06A6 6 0 0 0 12 6z" fill="currentColor" opacity=".85"/>
        <path d="M13 8.5v5.8a2.5 2.5 0 1 1-1-2V9.8l3-.6V12a2.5 2.5 0 1 1-1-2V7.2L13 7.5v1z" fill="currentColor"/>
      </svg>
    );
  }
  // spotify
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1ED760"/>
      <path d="M7.2 10.4c3.2-.9 7.4-.7 10.3 1.1.4.2.5.8.2 1.2-.2.4-.8.5-1.2.2-2.5-1.5-6.2-1.7-9-.9-.5.2-1-.2-1.1-.6-.1-.5.2-.9.8-1zM7.5 13c2.7-.8 6.3-.5 8.6 1 .3.2.4.7.2 1-.2.3-.7.4-1 .2-2-1.2-5.1-1.5-7.4-.8-.4.1-.8-.2-.9-.5 0-.4.2-.8.5-.9zM7.8 15.4c2.2-.6 4.9-.5 6.9.7.3.2.3.5.2.8-.2.3-.5.3-.8.2-1.7-1-4-1.1-5.9-.6-.3.1-.6-.1-.7-.4-.1-.3.1-.6.4-.7z" fill="#000"/>
    </svg>
  );
}

Object.assign(window, { TRAINER_PLAYLISTS, TRAINER_WORKOUTS, ProviderMark });
