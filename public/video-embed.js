// Only canonical provider embeds are admitted. No arbitrary frame URLs or HTML.
(function () {
  const source = window.ShapeVideo.resolve(new URLSearchParams(window.location.search).get('video'));
  const status = document.getElementById('status');
  if (!source || source.kind !== 'embed') { status.textContent = 'This video link cannot be embedded.'; return; }
  const frame = document.createElement('iframe');
  frame.src = source.src;
  frame.title = 'Video — ' + source.provider;
  frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  status.replaceWith(frame);
})();
