/* Shape — mobile nav injector
   Adds a hamburger button + slide-down drawer on ≤480px.
   Tagging existing nav elements as `.shape-desktop-nav` lets the CSS
   hide them on mobile. This script just builds and wires the drawer. */
(function () {
  if (window.__shapeMobileNavBooted) return;
  window.__shapeMobileNavBooted = true;

  const LINKS = [
    { href: "Shape Redesign.html", label: "Explore" },
    { href: "Landing.html", label: "Get started" },
    { href: "Pricing.html", label: "Pricing" },
    { href: "Login.html", label: "Log in", accent: true },
  ];

  function build() {
    if (document.getElementById("shape-mobile-nav")) return;

    // Drawer
    const nav = document.createElement("div");
    nav.id = "shape-mobile-nav";
    nav.setAttribute("role", "dialog");
    nav.setAttribute("aria-hidden", "true");
    nav.innerHTML = `
      <button class="close" aria-label="Close menu">✕</button>
      <nav style="display:flex;flex-direction:column;gap:0;margin-top:20px">
        ${LINKS.map(l => `<a href="${l.href}">${l.accent ? `<em>${l.label}</em>` : l.label}</a>`).join("")}
      </nav>
      <div class="meta">Shape · 2026</div>
    `;
    document.body.appendChild(nav);

    const close = () => { nav.classList.remove("open"); nav.setAttribute("aria-hidden","true"); document.body.style.overflow=""; };
    nav.querySelector(".close").addEventListener("click", close);
    nav.addEventListener("click", e => { if (e.target === nav) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

    // Toggle button — injected into each <header> that doesn't already have one
    function injectToggles() {
      const headers = document.querySelectorAll("header");
      headers.forEach(h => {
        if (h.querySelector("#shape-mobile-nav-toggle")) return;
        const btn = document.createElement("button");
        btn.id = "shape-mobile-nav-toggle";
        btn.setAttribute("aria-label", "Open menu");
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
        btn.addEventListener("click", () => {
          nav.classList.add("open");
          nav.setAttribute("aria-hidden","false");
          document.body.style.overflow = "hidden";
        });
        // Place at end of the header's flex row
        const flexRow = h.querySelector(':scope > div, :scope > nav') || h;
        flexRow.appendChild(btn);
      });

      // Tag existing desktop nav elements so CSS can hide them on mobile
      document.querySelectorAll("header nav, header [data-desktop-nav]").forEach(el => {
        if (!el.classList.contains("shape-desktop-nav")) el.classList.add("shape-desktop-nav");
      });
      // Also tag the "Log in" / "Already have an account?" line in Landing
      document.querySelectorAll('header a[href="Login.html"]').forEach(a => {
        const wrap = a.closest("div");
        if (wrap && wrap !== document.querySelector("header")) {
          wrap.classList.add("shape-desktop-nav");
        }
      });
    }

    injectToggles();
    // Re-run on React re-mounts
    const mo = new MutationObserver(() => injectToggles());
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
