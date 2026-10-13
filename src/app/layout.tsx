import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import GlobalChatButton from "@/components/GlobalChatButton";
import { Analytics } from '@vercel/analytics/next';
import Script from 'next/script';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
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
