# Integration

## 1. Include the scripts

```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>

<!-- pageShell.jsx defines PAPER/INK/TEAL/serif/sans + Header + Footer -->
<script type="text/babel" src="pageShell.jsx"></script>

<!-- Chat widget -->
<script type="text/babel" src="chatWidget.jsx"></script>
<script type="text/babel" src="clientChatThreads.jsx"></script>
```

## 2. Mount it

```jsx
function Page() {
  return (
    <>
      {/* your page content */}
      <ChatWidget tabs={window.clientChatTabs} />
    </>
  );
}
```

Or pass legacy flat threads:

```jsx
<ChatWidget threads={[...]} title="Messages" eyebrow="DIRECT CHAT" />
```

## 3. Programmatic open

The widget exposes `window.__openChat(tabId, threadMatcher)` when mounted — call it from elsewhere in your app to jump into a specific thread.

```js
window.__openChat("friends", t => t.who === "Jade Liu");
```

## 4. Wiring to a live backend

Replace the static `window.clientChatTabs` seed with a hydrated object from your API. Keep the `Tab`/`Thread` shape in README.md.

Recommended update points:
- **On new message arrival** — push to `tab.threads[i].messages`, bump `unread`, update `last` + `time`.
- **On read** — the widget already zeroes `unread` when you select a thread (`selectThread`); mirror that to your server.
- **On send** — the widget calls an internal `send()`; intercept by wrapping `ChatWidget` or forking and adding an `onSend({tabId, threadIdx, text})` prop.
- **Pin state** — currently local (React state only). Persist by listening to `togglePin` and POSTing to the server.

## 5. Styling hooks

- CSS custom classes the widget uses:
  - `.chw-row` — each thread row (apply your hover states)
  - `.chw-pin` — pin icon (shown on row hover)

- Scrollbars are hidden inside `[data-chat-panel]` via:
  ```css
  [data-chat-panel] *::-webkit-scrollbar { width: 0; height: 0; }
  [data-chat-panel] * { scrollbar-width: none; }
  ```
