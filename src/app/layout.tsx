import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import GlobalChatButton from "@/components/GlobalChatButton";
import { Analytics } from '@vercel/analytics/next';
import Script from 'next/script';

// Inter, self-hosted (src/app/fonts, OFL). next/font/google fetched it from Google during the build,
// and the build failed whenever that fetch did (CI on #2449 and #2453). The file is the Latin subset
// the Google call preloaded, as one variable font (weights 100 to 900); a character outside it falls
// back to the size-matched fallback, as the Google call's other subsets did until they loaded.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Shape — Train, eat, and move with a plan",
  description: "Subscribe to certified trainers, nutritionists, and gyms on Shape.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <div className="flex-1">{children}</div>
        <Footer />
        <GlobalChatButton />
        <Analytics />
        {/* Where a sign-up came from (public/signup-source.js): the first link a visitor
            arrives from, remembered only as consent allows, for the admin console. */}
        <Script src="/signup-source.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
