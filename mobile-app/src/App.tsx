import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import Home from './screens/Home';
import Train from './screens/Train';
import Nutri from './screens/Nutri';
import Me from './screens/Me';

export default function App() {
  // Match the dark Shape palette in the iOS status bar.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    }
  }, []);

  return (
    <div className="app">
      <main className="screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/train" element={<Train />} />
          <Route path="/nutri" element={<Nutri />} />
          <Route path="/me" element={<Me />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  const tabs: Array<{ to: string; label: string; icon: string }> = [
    { to: '/',      label: 'Today', icon: '◐' },
    { to: '/train', label: 'Train', icon: '↗' },
    { to: '/nutri', label: 'Nutri', icon: '◇' },
    { to: '/me',    label: 'Me',    icon: '○' },
  ];
  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map(t => {
        const active = t.to === '/' ? pathname === '/' : pathname.startsWith(t.to);
        return (
          <Link key={t.to} to={t.to} className={`tab ${active ? 'tab--active' : ''}`}>
            <span className="tab-icon" aria-hidden>{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
