// Hides the global Nav and Footer for the cinematic intro preview.
// Nav + Footer live in the root layout and use .navbar / .footer class
// names — we inject a scoped <style> that hides them only while this
// layout is mounted. Leaves the legacy site's chrome intact everywhere
// else.

export default function IntroPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        /* Nuke every global chrome element so only the intro video
           and its CTA are visible. Root layout renders Nav + children
           wrapper + Footer — we hide Nav and Footer and flatten any
           inherited padding/margin. */
        .navbar, .footer, header, footer { display: none !important; }
        html, body {
          background: #000 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow-x: hidden;
        }
        body > *:not(script):not(style) { margin: 0 !important; padding: 0 !important; }
      `}</style>
      {children}
    </>
  );
}
