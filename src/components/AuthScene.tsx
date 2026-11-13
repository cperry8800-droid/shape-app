// The website's Log in page, as a frame for the Next password pages (/forgot-password, /reset-password).
//
// Owner, 2026-11-13, with a screenshot of Set a new password: "Need to update to current design". The
// pages were the 2025 Next look (the old site bar, a square panel, uppercase labels) between the
// website's Log in (public/newdesign/login.jsx) and the dashboards. They now stand where Log in does:
// the spotlight photograph, the glass card with the teal edge, the site's faces, Log in's own bar and
// foot. The site nav and footer stay off these two paths (Nav.tsx, Footer.tsx), as Login.html has none.
//
// The card's parts are classes in auth-scene.module.css, which the forms import too.

import localFont from 'next/font/local';
import Link from 'next/link';
import styles from './auth-scene.module.css';

// The site's type system (public/newdesign/pageShell.jsx), self-hosted as the root layout's Inter is
// (src/app/fonts, OFL, the Latin subsets the Google calls load).
const display = localFont({
  src: '../app/fonts/anybody-latin-wdth-wght-normal.woff2',
  weight: '100 900',
  variable: '--auth-display',
  adjustFontFallback: 'Arial',
});
const body = localFont({
  src: '../app/fonts/schibsted-grotesk-latin-wght-normal.woff2',
  weight: '400 900',
  variable: '--auth-body',
  adjustFontFallback: 'Arial',
});
const mono = localFont({
  src: '../app/fonts/jetbrains-mono-latin-wght-normal.woff2',
  weight: '100 800',
  variable: '--auth-mono',
});

// Login's grain, over the photograph and its vignette.
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95  0 0 0 0 0.93  0 0 0 0 0.89  0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export default function AuthScene({ back, children }: { back: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <div className={`${styles.page} ${display.variable} ${body.variable} ${mono.variable}`}>
      <div
        aria-hidden
        className={styles.layer}
        style={{ backgroundImage: "url('/login%20page%201.webp')", backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}
      />
      <div
        aria-hidden
        className={styles.layer}
        style={{
          background: 'radial-gradient(ellipse 60% 70% at 74% 52%, rgba(0,0,0,0) 0%, rgba(5,4,3,0.25) 62%, rgba(5,4,3,0.6) 100%)',
          zIndex: 1,
        }}
      />
      <div aria-hidden className={styles.layer} style={{ backgroundImage: GRAIN, opacity: 0.35, mixBlendMode: 'overlay', zIndex: 2 }} />

      <header className={styles.head}>
        <div className={styles.row}>
          <Link href="/" aria-label="Shape home">
            {/* eslint-disable-next-line @next/next/no-img-element -- the site's SVG logo, drawn at Login's height */}
            <img src="/shape-logo-white.svg" alt="Shape" width={89} height={42} className={styles.logo} />
          </Link>
          <Link href={back.href} className={styles.back}>
            {back.label}
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.mainrow}>
          <div className={styles.card}>
            <div aria-hidden className={styles.edge} />
            {children}
          </div>
        </div>
      </main>

      <footer className={styles.sitefoot}>
        <div className={styles.row}>
          <span>© 2026 Shape</span>
          <div className={styles.legal}>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/help">Help</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
