// Root route — show the cinematic intro.

import IntroScroll from './intro-preview/IntroScroll';

export const metadata = {
  title: 'Shape — Real coaching, powered by community',
};

export default function RootPage() {
  return <IntroScroll />;
}
