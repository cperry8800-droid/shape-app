export type ListingStep = 'price' | 'payouts' | 'photo';
export const LISTING_STEPS: ListingStep[];
export function listingMissing(input?: {
  price?: number | string | null;
  stripeAccountStatus?: string | null;
  portrait?: string | null;
  avatar?: string | null;
}): ListingStep[];
export function parseRate(value: unknown): number | null;
