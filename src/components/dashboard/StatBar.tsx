export default function StatBar({ stats }: { stats: Array<{ value: string; label: string }> }) {
  return (
    <div className="flex gap-12 py-8 border-b border-white/[0.07]">
      {stats.map((s) => (
        <div key={s.label}>
          <div className="text-4xl font-extralight tracking-tight text-white">{s.value}</div>
          <div className="text-[0.65rem] uppercase tracking-widest font-light text-white/40 mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
