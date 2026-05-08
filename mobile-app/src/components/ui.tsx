import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

type Children = {
  children: ReactNode;
};

const monoFont = "'JetBrains Mono', monospace";
const displayFont = 'Fraunces, serif';

export const screenTopStyle: CSSProperties = {
  paddingTop: 20,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  background: 'rgba(242,237,228,0.04)',
  border: '1px solid var(--border)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: 15,
  boxSizing: 'border-box',
};

export function ScreenTitle({ children }: Children) {
  return (
    <h1
      style={{
        fontFamily: displayFont,
        fontSize: 32,
        fontWeight: 400,
        letterSpacing: '-0.02em',
        margin: '0 0 6px',
      }}
    >
      {children}
    </h1>
  );
}

export function Card({ children }: Children) {
  return (
    <div
      style={{
        background: 'rgba(242,237,228,0.04)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 18,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: Children) {
  return (
    <div
      style={{
        fontFamily: monoFont,
        fontSize: 10,
        letterSpacing: '0.14em',
        color: 'var(--teal-bright)',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

export function Title({ children }: Children) {
  return (
    <div
      style={{
        fontFamily: displayFont,
        fontSize: 22,
        letterSpacing: '-0.015em',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

export function Sub({ children }: Children) {
  return <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{children}</div>;
}

export function PrimaryAction({ children, style, type, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type ?? 'button'}
      style={{
        marginTop: 14,
        width: '100%',
        padding: '12px 18px',
        borderRadius: 999,
        background: 'var(--teal)',
        color: 'var(--paper)',
        border: 0,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 500,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryAction({ children, style, type, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type ?? 'button'}
      style={{
        marginTop: 14,
        padding: '10px 18px',
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--ink)',
        border: '1px solid var(--border)',
        fontFamily: 'inherit',
        fontSize: 13,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span
        style={{
          display: 'block',
          fontSize: 12,
          color: 'var(--muted)',
          marginBottom: 6,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: 'var(--ink)' }}>{value || '-'}</span>
    </div>
  );
}
