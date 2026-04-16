// Shared card component used by trainers, nutritionists, and gyms pages.
// One card renderer, three data shapes — keeps visual consistency without
// duplicating the layout three times.

import Link from 'next/link';

type Meta = { label: string; value: string };

export type ProviderCardProps = {
  name: string;
  subtitle: string | null;
  bio: string | null;
  color: string | null;
  credential?: string | null;
  primary: Meta; // e.g. rating
  secondary: Meta; // e.g. subscribers / members
  priceLabel: string; // e.g. "$49.99"
  priceSuffix: string; // e.g. "/ month"
  horizontal?: boolean;
  href?: string;
};

export default function ProviderCard({
  name,
  subtitle,
  bio,
  color,
  credential,
  primary,
  secondary,
  priceLabel,
  priceSuffix,
  horizontal = false,
  href,
}: ProviderCardProps) {
  const accent = color ?? '#2DD4BF';
  const Wrapper = ({ children, className, style }: { children: React.ReactNode; className: string; style: React.CSSProperties }) =>
    href ? (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    ) : (
      <div className={className} style={style}>
        {children}
      </div>
    );

  if (horizontal) {
    return (
      <Wrapper
        className="rounded-xl border border-neutral-800 bg-neutral-900/30 backdrop-blur-md p-5 flex items-center gap-5 hover:border-neutral-700 hover:bg-neutral-900 transition-colors"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <Avatar name={name} color={accent} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <h3 className="font-semibold truncate">{name}</h3>
            {credential && (
              <span className="text-[0.65rem] uppercase tracking-wider text-neutral-500 flex-shrink-0">
                {credential}
              </span>
            )}
          </div>
          {subtitle && <div className="text-sm text-neutral-400 truncate">{subtitle}</div>}
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
          <div className="text-sm font-medium">{primary.value}</div>
          <div className="text-xs text-neutral-500">{secondary.value}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-semibold">{priceLabel}</div>
          <div className="text-[0.65rem] text-neutral-500 uppercase tracking-wider">{priceSuffix}</div>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper
      className="rounded-xl border border-neutral-800 bg-neutral-900/30 backdrop-blur-md p-6 flex flex-col hover:border-neutral-700 hover:bg-neutral-900 transition-colors"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <Avatar name={name} color={accent} size="lg" />
      <div className="mt-4 flex-1">
        <h3 className="font-semibold text-lg">{name}</h3>
        {subtitle && <div className="text-sm text-neutral-400 mb-3">{subtitle}</div>}
        {bio && <p className="text-sm text-neutral-500 line-clamp-3 mb-4">{bio}</p>}
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
        <div>
          <div className="text-sm">{primary.value}</div>
          <div className="text-xs text-neutral-500">{secondary.value}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold">{priceLabel}</div>
          <div className="text-[0.65rem] text-neutral-500 uppercase tracking-wider">{priceSuffix}</div>
        </div>
      </div>
    </Wrapper>
  );
}

function Avatar({
  name,
  color,
  size = 'md',
}: {
  name: string;
  color: string;
  size?: 'md' | 'lg';
}) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  const dim = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-11 h-11 text-sm';
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {initials}
    </div>
  );
}
