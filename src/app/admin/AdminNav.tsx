'use client';

// The console's tabs and the admin tools (./layout.tsx). A client component only to read the
// path, so the tab for the page that is open is marked. The console's own Overview is '/admin'
// exactly; an account page ('/admin/accounts/…') is reached from Members or Coaches and marks no tab.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MONO } from './ui';

type Item = { href: string; label: string };

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2';

export default function AdminNav({ pages, tools }: { pages: Item[]; tools: Item[] }) {
  const pathname = usePathname() ?? '';
  const isOpen = (href: string) => (href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      <nav aria-label="Admin console" className="border-b border-border-hairline">
        <ul className="flex overflow-x-auto [scrollbar-width:none]">
          {pages.map((p) => {
            const open = isOpen(p.href);
            return (
              <li key={p.href} className="shrink-0">
                <Link
                  href={p.href}
                  aria-current={open ? 'page' : undefined}
                  className={`${MONO} ${FOCUS} inline-flex items-center min-h-[44px] px-3 sm:px-4 text-[11px] uppercase tracking-[0.14em] border-b-2 transition-colors ${
                    open ? 'border-accent text-neutral-50' : 'border-transparent text-neutral-400 hover:text-neutral-100 hover:border-white/20'
                  }`}
                >
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {tools.length > 0 && (
        <nav aria-label="Admin tools" className="flex items-center gap-2 flex-wrap pt-3">
          <span className={`${MONO} text-[10px] uppercase tracking-[0.2em] text-neutral-500 mr-1`}>Tools</span>
          {tools.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`${FOCUS} inline-flex items-center min-h-[36px] px-3 border border-border-hairline text-xs text-neutral-400 hover:text-neutral-50 hover:border-accent/60 transition-colors`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
