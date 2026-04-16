// Root route — logged-out visitors get the cinematic intro;
// logged-in users skip straight to their dashboard.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import IntroScroll from './intro-preview/IntroScroll';

export const metadata = {
  title: 'Shape — Real coaching, powered by community',
};

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/clients');
  }

  return (
    <>
      <style>{`
        .navbar, .footer, header, footer { display: none !important; }
        html, body {
          background: #000 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow-x: hidden;
        }
        body > *:not(script):not(style) { margin: 0 !important; padding: 0 !important; }
      `}</style>
      <IntroScroll />
    </>
  );
}
