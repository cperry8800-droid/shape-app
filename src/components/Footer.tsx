// Shared footer with links to marketing + legal pages.
// Visuals match legacy shape-website/styles.css .footer.

import Link from 'next/link';
import { headers } from 'next/headers';

const HIDE_FOOTER_PREFIXES = ['/purchase', '/subscribe'];

export default async function Footer() {
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (HIDE_FOOTER_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }

  return (
    <>
      <style>{`
        .site-footer {
          border-top: 1px solid var(--border);
          background: var(--bg);
          padding: 72px 0 32px;
          margin-top: 120px;
        }
        .footer-inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .footer-grid {
          display: grid;
          grid-template-columns: 1.4fr repeat(4, 1fr);
          gap: 48px;
        }
        .footer-col h4 {
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text);
          margin-bottom: 20px;
        }
        .footer-brand {
          font-size: 1.15rem;
          font-weight: 500;
          letter-spacing: -0.02em;
          color: var(--text);
          text-decoration: none;
          display: block;
          margin-bottom: 12px;
        }
        .footer-desc {
          font-size: 0.82rem;
          color: var(--text-muted);
          font-weight: 300;
          line-height: 1.7;
          max-width: 260px;
        }
        .footer-col a:not(.footer-brand) {
          display: block;
          font-size: 0.82rem;
          color: var(--text-muted);
          text-decoration: none;
          font-weight: 300;
          margin-bottom: 12px;
          transition: color 0.3s var(--ease);
        }
        .footer-col a:not(.footer-brand):hover { color: var(--text); }
        .footer-bottom {
          margin-top: 56px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        @media (max-width: 900px) {
          .footer-grid { grid-template-columns: 1fr 1fr; gap: 40px; }
        }
      `}</style>
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-grid">
            <div className="footer-col">
              <Link href="/" className="footer-brand">Shape</Link>
              <p className="footer-desc">
                Real trainers. Real nutritionists. One platform. Join the community.
              </p>
            </div>
            <div className="footer-col">
              <h4>Marketplace</h4>
              <Link href="/trainers">Trainers</Link>
              <Link href="/nutritionists">Nutritionists</Link>
              <Link href="/gyms">Gyms</Link>
              <Link href="/newdesign/Pricing.html">Pricing</Link>
            </div>
            <div className="footer-col">
              <h4>For pros</h4>
              <Link href="/for-trainers">For trainers</Link>
              <Link href="/for-nutritionists">For nutritionists</Link>
              <Link href="/for-gyms">Shape Pass</Link>
            </div>
            <div className="footer-col">
              <h4>Get started</h4>
              <Link href="/signup">Sign up</Link>
              <Link href="/login">Log in</Link>
              <Link href="/contact">Contact</Link>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
          <div className="footer-bottom">© 2026 Shape. All rights reserved.</div>
        </div>
      </footer>
    </>
  );
}
