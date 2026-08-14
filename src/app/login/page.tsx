import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // `/login.html` ALREADY honors `?next=` with a same-origin guard of its own — but a bare
  // `redirect('/login.html')` does not carry the query string, so any caller that passes one
  // lost it here, silently. The consultation page is the caller that matters: a signed-out
  // visitor picks a coach and a slot, clicks "Sign in", and used to land on a dashboard with
  // the booking gone.
  //
  // Re-checked here rather than leaned on downstream: this decides what gets reflected into a
  // Location header, so it validates its own input instead of trusting the next hop to do it.
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  redirect(safe ? `/login.html?next=${encodeURIComponent(safe)}` : '/login.html');
}
