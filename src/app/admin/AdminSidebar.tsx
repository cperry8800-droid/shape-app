'use client';

// The console's sidebar (./layout.tsx): its pages and the admin tools, each queue with what is
// waiting on it (src/lib/admin-waiting.ts), and who is signed in. A client component only to
// read the path (the open page is marked) and to open the menu on a phone, where the sidebar
// folds into a bar. The Overview is '/admin' exactly; an account page ('/admin/accounts/…') is
// reached from Members or Coaches and marks nothing.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { MONO } from './ui';

type Item = { href: string; label: string };

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2';

export default function AdminSidebar({
  pages,
  tools,
  counts,
  account,
}: {
  pages: Item[];
  tools: Item[];
  counts: Record<string, number>;
  account: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  // The phone's menu is open on the page it was opened on: following a link closes it.
  const [menuOn, setMenuOn] = useState<string | null>(null);
  const menu = menuOn === pathname;
  const isOpen = (href: string) => (href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const waiting = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const group = (title: string, items: Item[]) =>
    items.length > 0 && (
      <nav aria-label={title === 'Console' ? 'Admin console' : 'Admin tools'} className="flex flex-col gap-0.5">
        <div className={`${MONO} px-3 pb-1.5 text-[9.5px] uppercase tracking-[0.2em] text-neutral-500`}>{title}</div>
        {items.map((item) => {
          const open = isOpen(item.href);
          const n = counts[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={open ? 'page' : undefined}
              className={`${FOCUS} flex items-center justify-between gap-3 min-h-[40px] px-3 border-l-2 text-sm transition-colors ${
                open ? 'border-accent bg-accent/[0.07] text-neutral-50' : 'border-transparent text-neutral-400 hover:text-neutral-50 hover:bg-white/[0.03]'
              }`}
            >
              <span className="truncate">{item.label}</span>
              {n > 0 && (
                <>
                  <span aria-hidden="true" className={`${MONO} inline-flex items-center justify-center min-w-5 h-[18px] px-1.5 bg-accent text-[10.5px] text-neutral-950 tabular-nums`}>
                    {n}
                  </span>
                  <span className="sr-only">, {n} waiting</span>
                </>
              )}
            </Link>
          );
        })}
      </nav>
    );

  const mark = <div className={`${MONO} text-[11px] uppercase tracking-[0.2em] text-accent`}>Shape · Admin</div>;

  return (
    <>
      {/* A phone: a bar, and the sidebar as a menu under it. */}
      <div className="lg:hidden border-b border-border-hairline">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          {mark}
          <button
            type="button"
            onClick={() => setMenuOn(menu ? null : pathname)}
            aria-expanded={menu}
            aria-controls="admin-menu"
            className={`${FOCUS} ${MONO} inline-flex items-center gap-2 min-h-[44px] px-4 border border-white/15 text-[11px] uppercase tracking-[0.14em] text-neutral-100`}
          >
            {menu ? 'Close' : 'Menu'}
            {!menu && waiting > 0 && <span className="inline-flex items-center justify-center min-w-5 h-[18px] px-1.5 bg-accent text-neutral-950 tabular-nums">{waiting}</span>}
          </button>
        </div>
        {menu && (
          <div id="admin-menu" className="flex flex-col gap-6 px-1 pb-5 pt-1">
            {group('Console', pages)}
            {group('Tools', tools)}
            <div className="px-3">{account}</div>
          </div>
        )}
      </div>

      {/* A wider screen: the sidebar, held in view while the page scrolls. */}
      <aside className="hidden lg:block border-r border-border-hairline bg-[#0d0d0d]">
        <div className="sticky top-0 max-h-[100dvh] overflow-y-auto flex flex-col gap-7 px-3 py-6">
          <div className="px-3">{mark}</div>
          <div className="px-3">{account}</div>
          {group('Console', pages)}
          {group('Tools', tools)}
        </div>
      </aside>
    </>
  );
}
