// Interactive search + sort + category filter for marketplace pages.
// Client component — data is passed in from the server component that
// rendered the page, so the initial HTML is still SSR'd and fast.

'use client';

import { useMemo, useState } from 'react';
import ProviderCard from './ProviderCard';

type Item = {
  id: number;
  name: string;
  specialty?: string | null;
  type?: string | null;
  category: string | null;
  bio: string | null;
  color: string | null;
  credential?: string | null;
  rating: number | null;
  subscribers?: number | null;
  members?: number | null;
  location?: string | null;
  price: number | null;
};

export type SortKey = 'subscribers' | 'rating' | 'price';

export default function ProviderFilter({
  items,
  categories,
  kind,
  hrefPrefix,
}: {
  items: Item[];
  categories: { value: string; label: string }[];
  kind: 'trainer' | 'nutritionist' | 'gym';
  hrefPrefix: string;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('subscribers');
  const [category, setCategory] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items.filter((it) => {
      const matchesSearch =
        !q ||
        it.name.toLowerCase().includes(q) ||
        (it.specialty && it.specialty.toLowerCase().includes(q)) ||
        (it.location && it.location.toLowerCase().includes(q));
      const matchesCategory = category === 'all' || it.category === category;
      return matchesSearch && matchesCategory;
    });

    out = out.slice().sort((a, b) => {
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
      if (sort === 'price') return (a.price ?? 0) - (b.price ?? 0);
      const aCount = kind === 'gym' ? (a.members ?? 0) : (a.subscribers ?? 0);
      const bCount = kind === 'gym' ? (b.members ?? 0) : (b.subscribers ?? 0);
      return bCount - aCount;
    });

    return out;
  }, [items, search, sort, category, kind]);

  return (
    <div>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 backdrop-blur-md p-5 mb-8">
        <div className="flex gap-3 mb-4 flex-col md:flex-row">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="flex-1 px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="px-4 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-sm outline-none focus:border-teal-400 transition-colors md:w-56"
          >
            <option value="subscribers">
              {kind === 'gym' ? 'Most Members' : 'Most Subscribers'}
            </option>
            <option value="rating">Highest Rated</option>
            <option value="price">Lowest Price</option>
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[{ value: 'all', label: 'All' }, ...categories].map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                category === c.value
                  ? 'border-teal-400 text-teal-400 bg-teal-400/10'
                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-neutral-500 mb-4">
        Showing {filtered.length} of {items.length}
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((it) => (
          <ProviderCard
            key={it.id}
            name={it.name}
            subtitle={it.specialty ?? it.type ?? null}
            bio={it.bio}
            color={it.color}
            credential={it.credential}
            primary={{ label: 'Rating', value: `★ ${it.rating ?? '—'}` }}
            secondary={{
              label: 'Count',
              value:
                kind === 'gym'
                  ? `${it.members?.toLocaleString() ?? 0} members`
                  : `${it.subscribers?.toLocaleString() ?? 0} subs`,
            }}
            priceLabel={`$${it.price ?? 0}`}
            priceSuffix="/ month"
            horizontal
            href={`${hrefPrefix}/${it.id}`}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-neutral-500 py-12 border border-neutral-900 rounded-xl">
            No matches. Try a different search or filter.
          </div>
        )}
      </div>
    </div>
  );
}
