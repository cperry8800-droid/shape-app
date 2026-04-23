/* Mobile preview Tweak — loaded on every page.
   Exposes a "Mobile view" toggle that constrains the page to 390px
   and triggers the responsive rules in mobilePreview.css via
   .mobile-preview-active on <html>. */
(function () {
  if (window.__mobilePreviewInstalled) return;
  window.__mobilePreviewInstalled = true;

  // Read persisted default from the EDITMODE block if present
  const scriptEl = document.currentScript;
  let defaults = { mobileView: false };
  try {
    const src = document.documentElement.innerHTML;
    const m = src.match(/\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\//);
    if (m) {
      const parsed = JSON.parse(m[1]);
      if (typeof parsed.mobileView === "boolean") defaults.mobileView = parsed.mobileView;
    }
  } catch (e) { /* ignore */ }

  let state = Object.assign({}, defaults);

  // Build the panel
  const panel = document.createElement("div");
  panel.id = "__mobile-preview-panel";
  panel.innerHTML = `
    <div class="head">Tweaks</div>
    <label>
      <input type="checkbox" id="__mobile-preview-toggle" />
      <span>Mobile view</span>
    </label>
    <div class="hint">Simulates a 390px phone viewport.</div>
  `;
  document.body.appendChild(panel);

  const toggle = panel.querySelector("#__mobile-preview-toggle");

  function apply(on) {
    document.documentElement.classList.toggle("mobile-preview-active", !!on);
    toggle.checked = !!on;
  }

  apply(state.mobileView);

  toggle.addEventListener("change", (e) => {
    state.mobileView = e.target.checked;
    apply(state.mobileView);
    try {
      window.parent.postMessage({
        type: "__edit_mode_set_keys",
        edits: { mobileView: state.mobileView }
      }, "*");
    } catch (err) { /* ignore */ }
  });

  // Tweaks protocol — listener FIRST, then announce
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "__activate_edit_mode") panel.classList.add("active");
    else if (d.type === "__deactivate_edit_mode") panel.classList.remove("active");
  });
  try {
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
  } catch (err) { /* ignore */ }
})();
