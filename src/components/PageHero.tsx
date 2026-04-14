// Shared hero block for marketplace pages — tag, title with gradient
// accent word, and subtitle. Keeps the three pages visually identical.

export default function PageHero({
  tag,
  title,
  gradientWord,
  subtitle,
}: {
  tag: string;
  title: string;
  gradientWord: string;
  subtitle: string;
}) {
  return (
    <div className="mb-16">
      <div className="inline-block text-[0.68rem] uppercase tracking-[0.12em] font-semibold text-teal-400 bg-teal-400/10 border border-teal-400/20 rounded-full px-3 py-1 mb-6">
        {tag}
      </div>
      <h1 className="text-5xl md:text-6xl font-light tracking-tight mb-4">
        {title}{' '}
        <span className="bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
          {gradientWord}
        </span>
      </h1>
      <p className="text-neutral-400 text-lg max-w-2xl">{subtitle}</p>
    </div>
  );
}
