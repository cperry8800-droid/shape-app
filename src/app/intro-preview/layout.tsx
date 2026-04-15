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
        body { background: #000 !important; }
      `}</style>
      {children}
    </>
  );
}
