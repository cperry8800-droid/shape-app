import Link from 'next/link';

export default function CinematicPageShell({
  title,
  subtitle,
  children,
  backgroundImage,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  backgroundImage?: string;
}) {
  const bgStyle = backgroundImage
    ? `html { background: #000 !important; }
       body { background: transparent !important; margin: 0 !important; padding: 0 !important; position: relative; }
       body::before {
         content: ''; position: fixed; inset: 0; z-index: -1;
         background-image: linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.6)), url('${backgroundImage}');
         background-size: auto 130vh; background-position: center center; background-repeat: no-repeat;
       }`
    : `html, body { background: #000 !important; margin: 0 !important; padding: 0 !important; }`;
  return (
    <>
      <style>{`
        .navbar, .footer, header, footer { display: none !important; }
        ${bgStyle}
        body > *:not(script):not(style) { margin: 0 !important; padding: 0 !important; }
      `}</style>
      <div className={`min-h-screen text-white ${backgroundImage ? '' : 'bg-black'}`}>
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-5 md:px-12">
          <Link href="/" aria-label="Shape home">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="70 8 60 84" className="h-10 w-auto md:h-12">
              <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
              <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
            </svg>
          </Link>
          <div className="flex items-center gap-6 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-white/80 md:gap-8 md:text-[0.76rem]">
            <Link href="/trainers" className="hidden hover:text-white md:inline">Coaches</Link>
            <Link href="/nutritionists" className="hidden hover:text-white md:inline">Nutritionists</Link>
            <Link href="/pricing" className="hidden hover:text-white md:inline">Pricing</Link>
            <Link href="/login" className="hover:text-white">Log in</Link>
            <Link href="/signup" className="inline-flex items-center justify-center border border-white/60 bg-transparent px-5 py-2 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-white hover:text-neutral-950 md:px-6 md:py-2.5">
              Get Started
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <div className="px-6 pt-8 pb-12 text-center md:px-12 md:pt-16 md:pb-16">
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-light leading-tight tracking-[-0.02em]">{title}</h1>
          {subtitle && (
            <p className="mx-auto mt-4 max-w-xl text-[clamp(0.9rem,1.3vw,1.1rem)] font-light text-white/60">{subtitle}</p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 pb-20 md:px-12">{children}</div>

        {/* Footer */}
        <footer className="flex flex-col items-center gap-4 py-10 text-center text-[0.68rem] uppercase tracking-[0.16em] text-white/40">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="70 8 60 84" className="h-7 w-auto">
            <polygon points="72,44 72,88 105,66" fill="#FFFFFF" />
            <polygon points="128,12 128,56 95,34" fill="#FFFFFF" />
          </svg>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="mailto:hello@theshapecommunity.com" className="hover:text-white">Contact</Link>
          </div>
          <div className="text-white/30">&copy; {new Date().getFullYear()} Shape</div>
        </footer>
      </div>
    </>
  );
}
