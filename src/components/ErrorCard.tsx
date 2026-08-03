'use client';
// Crash card shared by error.tsx and global-error.tsx. Inline styles ONLY:
// global-error renders when the root layout has crashed, i.e. with NO
// stylesheet loaded — Tailwind classes are dead there, so nothing here may
// depend on one.
import * as React from 'react';

export default function ErrorCard({ onRetry }: { onRetry?: () => void }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: '#111' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Something went wrong</div>
      {/*
        Deliberately neutral: this copy must stay TRUE whether or not error
        delivery is configured. There is no Sentry org and no DSN, so both Next
        boundaries call a disabled SDK (every capture* is a documented no-op),
        and the web app has no alternate local recorder — so nothing about this
        crash is stored anywhere. "The error has been recorded" (the previous
        copy) told the reader their report was already filed, which is the one
        message most likely to stop them telling us. Do NOT re-add a claim that
        the error was recorded / reported / logged / sent, or that anyone will
        look at it, unless the delivery path is real AND verified end to end.
      */}
      <div style={{ fontSize: 14, color: '#555', maxWidth: 360, lineHeight: 1.5 }}>
        Something went wrong on our end. Try again, or head back to the homepage.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry ? (
          <button onClick={onRetry} style={{ padding: '10px 22px', borderRadius: 8, background: '#111', color: '#fff', border: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Try again
          </button>
        ) : null}
        <a href="/" style={{ padding: '10px 22px', borderRadius: 8, background: 'transparent', color: '#111', border: '1px solid #ccc', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          Go home
        </a>
      </div>
    </div>
  );
}
