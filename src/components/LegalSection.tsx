// Shared section for /privacy and /terms. Consistent spacing + typography.

export default function LegalSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-medium mb-2">
        <span className="text-teal-400 font-semibold mr-2">{n}.</span>
        {title}
      </h2>
      <div className="text-sm text-neutral-400 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
