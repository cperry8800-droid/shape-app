'use client';

import { useState } from 'react';
import Link from 'next/link';
import { logout } from '@/app/login/actions';

export default function Sidebar({ role, roles }: { role: string; roles: string[] }) {
  const [open, setOpen] = useState(false);

  const shapeScoreHref =
    role === 'trainer' || roles.includes('trainer')
      ? '/shape-score-trainer'
      : role === 'nutritionist' || roles.includes('nutritionist')
        ? '/shape-score-nutritionist'
        : '/shape-score';

  const links: { href: string; label: string; show: boolean }[] = [
    { href: '/dashboard', label: 'Overview', show: true },
    { href: '/dashboard/client', label: 'My Team', show: roles.includes('client') || role === 'client' },
    { href: '/dashboard/trainer', label: 'Trainer', show: roles.includes('trainer') || role === 'trainer' },
    { href: '/dashboard/nutritionist', label: 'Nutritionist', show: roles.includes('nutritionist') || role === 'nutritionist' },
    { href: shapeScoreHref, label: 'Shape Score', show: true },
    { href: '/shape-store', label: 'Shape Store', show: true },
    { href: '/dashboard/claim', label: 'Claim', show: true },
    { href: '/dashboard/settings', label: 'Settings', show: true },
    { href: '/home', label: 'Home', show: true },
  ];

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 md:hidden text-white/40 hover:text-white transition-colors"
        aria-label="Toggle menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          {open ? (
            <>
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="17" y2="6" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="14" x2="17" y2="14" />
            </>
          )}
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 w-[200px] bg-black border-r border-white/[0.07] min-h-screen flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Logo */}
        <Link href="/" className="block px-5 pt-6 pb-8">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="70 8 60 84" className="h-8 w-auto">
            <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
            <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
          </svg>
        </Link>

        {/* Nav links */}
        <nav className="flex-1">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block py-2.5 px-5 text-[0.72rem] uppercase tracking-[0.15em] font-light text-white/40 hover:text-white transition-colors"
              >
                {l.label}
              </Link>
            ))}
        </nav>

        {/* Logout */}
        <form action={logout}>
          <button
            type="submit"
            className="text-[0.65rem] uppercase tracking-[0.15em] text-white/25 hover:text-white/60 px-5 py-4 transition-colors"
          >
            Log out
          </button>
        </form>
      </aside>
    </>
  );
}
