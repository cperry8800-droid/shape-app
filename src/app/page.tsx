// Root route — show the cinematic intro. Same chrome-free layer the
// /intro-preview route uses so Nav + Footer don't overlap the film.

import IntroScroll from './intro-preview/IntroScroll';

export const metadata = {
  title: 'Shape — Real coaching, powered by community',
};

export default function RootPage() {
  return (
    <>
      <style>{`
        .navbar, .footer, header, footer { display: none !important; }
        html, body {
          background: #000 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow-x: hidden;
        }
        body > *:not(script):not(style) { margin: 0 !important; padding: 0 !important; }
      `}</style>
      <IntroScroll />
    </>
  );
}
