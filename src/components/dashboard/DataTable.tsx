import React from 'react';

type Column<T> = { label: string; render: (row: T) => React.ReactNode; className?: string };
type Props<T> = { columns: Column<T>[]; rows: T[]; keyFn: (row: T) => string; emptyText?: string };

export default function DataTable<T>({ columns, rows, keyFn, emptyText }: Props<T>) {
  if (rows.length === 0) {
    return <p className="text-sm text-white/30 py-8">{emptyText ?? 'Nothing here yet.'}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/[0.07]">
          {columns.map((c) => (
            <th key={c.label} className={`text-left text-[0.6rem] uppercase tracking-widest font-light text-white/30 py-3 ${c.className ?? ''}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={keyFn(row)} className="border-b border-white/[0.07] hover:bg-white/[0.02] transition-colors">
            {columns.map((c) => (
              <td key={c.label} className={`py-3 text-white/70 ${c.className ?? ''}`}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
