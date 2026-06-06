<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<title>Shape · Signal — Coach Profile</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#0b0907;color:#f2ede4;-webkit-font-smoothing:antialiased;min-height:100%}
  ::selection{background:#1ec0a8;color:#06110e}
  .lv-scroll::-webkit-scrollbar{width:0;display:none}
  .lv-scroll{scrollbar-width:none}
  .lv-tabrow::-webkit-scrollbar{height:0;display:none}
  /* ── Signal motion ── */
  @keyframes sgRing { 0%,100%{transform:scale(1)} 50%{transform:scale(1.018)} }
  @keyframes sgCore { 0%,100%{transform:scale(1);opacity:.92} 50%{transform:scale(1.12);opacity:1} }
  @keyframes sgOrbit { to { transform: rotate(360deg) } }
  .sg-ring{ animation: sgRing 5.5s ease-in-out infinite }
  .sg-core{ animation: sgCore 2.4s ease-in-out infinite }
  .sg-orbit{ animation: sgOrbit 7s linear infinite }
  @keyframes lvPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.7)} }
  .lv-pulse{ animation: lvPulse 1.6s ease-in-out infinite }
  @media (prefers-reduced-motion: reduce){
    .sg-ring,.sg-core,.sg-orbit,.lv-pulse{ animation: none !important }
  }
</style>
</head><body>
<template id="__bundler_thumbnail">
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#100d0a"/>
  <circle cx="50" cy="50" r="32" fill="none" stroke="#f2b84e" stroke-width="2.5" stroke-dasharray="150 70"/>
  <circle cx="50" cy="50" r="23" fill="none" stroke="#f2b84e" stroke-width="2.5" stroke-dasharray="95 50" opacity="0.7"/>
  <circle cx="50" cy="50" r="14" fill="none" stroke="#1ec0a8" stroke-width="2.5" stroke-dasharray="55 35"/>
  <circle cx="50" cy="50" r="5" fill="#2ee0c4"/>
</svg>
</template>
<div id="root"></div>
<script type="text/babel" data-presets="react" src="livingShared.jsx"></script>
<script type="text/babel" data-presets="react" src="livingSignal.jsx"></script>
<script type="text/babel" data-presets="react" src="ios-frame.jsx"></script>
<script type="text/babel" data-presets="react" src="signalCoachApp.jsx"></script>
</body></html>
