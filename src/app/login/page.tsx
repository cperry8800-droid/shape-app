import { redirect } from 'next/navigation';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';

// `/login` is the address the app's own pages use (`/login?next=/admin`, the checkout's
// `/login?next=<back>`), so it forwards to the website's login with `next` kept. It used to
// redirect to the old root `login.html` and drop the query, so `next` never reached the
// login page and a sign-in landed on the role's default page instead of the one that asked.
type SearchParams = Promise<{ next?: string | string[] }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  const back = safeReturnPath(Array.isArray(next) ? next[0] : next, '');
  redirect(back ? `/newdesign/Login.html?next=${encodeURIComponent(back)}` : '/newdesign/Login.html');
}
