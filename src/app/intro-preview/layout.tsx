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
        .navbar, .footer { display: none !important; }
        html, body {
          background: #000 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        /* Root layout wraps children in a flex-col body + flex-1 div.
           Collapse any gaps so the intro starts flush at the top. */
        body > div, body > main, body > section { margin: 0 !important; }
        body { padding-top: 0 !important; }
      `}</style>
      {children}
    </>
  );
}
