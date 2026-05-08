import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Home from './screens/Home';
import Train from './screens/Train';
import Nutri from './screens/Nutri';
import Me from './screens/Me';
import ClientProfile from './screens/ClientProfile';
import Login from './screens/Login';

export default function App() {
  // Match the dark Shape palette in the iOS status bar.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    }
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return <div className="app" style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>;
  }

  if (!session) {
    return <div className="app"><Login /></div>;
  }

  return (
    <div className="app">
      <main className="screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/train" element={<Train />} />
          <Route path="/nutri" element={<Nutri />} />
          <Route path="/me" element={<Me />} />
          <Route path="/clients/:slug" element={<ClientProfile />} />
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
