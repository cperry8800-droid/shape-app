# Shape — Chat Widget Handoff

Drop-in floating chat widget for the Shape product. Tabs, channel search, pinnable channels, resizable panel, Friends DMs, Community channels.

## Files in this handoff

| File | Role |
|---|---|
| `chatWidget.jsx` | The `<ChatWidget>` React component. Floating bubble + resizable panel with tabs. |
| `clientChatThreads.jsx` | Seed data: `window.clientChatTabs` — array of tabs with threads/messages. Example payload you can swap for live data. |
| `integration.md` | How to mount it on a page. |

## What it does

- **Floating bubble** — bottom-right by default, draggable, persists position.
- **Resizable panel** — drag the teal corner handle; double-click to reset. Persists size in `localStorage` (`shape.chatWidget.size`).
- **Tabs** — one tab per relationship type. Defaults for the client persona:
  - **Circle** — your coaches (Maya, Rae, etc.)
  - **Clients** — training partners you know from Shape
  - **Trainers** — other trainers you've consulted
  - **Nutri** — other nutritionists
  - **Friends** — social DMs with other Shape clients (green "online" dot, activity status)
  - **Community** — searchable/pinnable/createable public channels
- **Pin channels** — hover a row, click the 📍; pinned rows jump to the top with a divider separating them from the rest.
- **Channel search** — fuzzy match on name / description / last message. Empty-state offers a one-click "Create #your-query".
- **Unread badges** — per-thread and per-tab (rolled up onto the floating bubble).
- **Hero header** — "Your community" heading above the tab bar.

## Keyboard/UX

- `Enter` sends, `Shift+Enter` newlines.
- Drag from the hero band or any tab row to move the panel.
- Drag the bottom-right corner to resize.

## Persistence keys (localStorage)

- `shape.chatWidget.pos` — panel position
- `shape.chatWidget.bubblePos` — collapsed bubble position
- `shape.chatWidget.size` — `{ w, h }` panel size

## Dependencies

- React 18 (UMD or bundled)
- Expects globals from `pageShell.jsx`: `PAPER`, `INK`, `TEAL`, `TEAL_BRIGHT`, `serif`, `sans`. If you don't have that shell, define these as:

```js
const PAPER = "#F2EDE4";
const INK = "#F2EDE4";
const TEAL = "#1EC0A8";
const TEAL_BRIGHT = "#3DD5BD";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Space Grotesk', system-ui, sans-serif";
```

## Thread/tab data shape

```ts
type Tab = {
  id: string;
  label: string;        // short tab label
  eyebrow: string;      // small caps above the title
  title: string;        // sidebar title
  canCreate?: boolean;  // show "+ NEW CHANNEL" (Community)
  canAddFriend?: boolean; // reserved for Friends tab (not yet wired)
  threads: Thread[];
};

type Thread = {
  who: string;          // display name — "# channel-name" for channels
  role?: string;        // subtitle under name (e.g. "Active now · Brooklyn")
  last: string;         // preview text
  time: string;         // "2m", "Yesterday", etc.
  unread: number;
  group?: boolean;      // render as channel (# monospace)
  pinned?: boolean;     // start pinned
  online?: boolean;     // green dot on the row
  coach?: boolean;      // message-level: highlight author as coach
  messages: {
    who: string;
    t: string;
    time: string;
    me: boolean;
    coach?: boolean;
  }[];
};
```
