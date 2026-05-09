import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Home from './screens/Home';
import Train from './screens/Train';
import Nutri from './screens/Nutri';
import Community from './screens/Community';
import Me from './screens/Me';
import ClientProfile from './screens/ClientProfile';
import Login from './screens/Login';
import Settings from './screens/Settings';
import PublicProfileSettings from './screens/PublicProfileSettings';
import Privacy from './screens/Privacy';

export default function App() {
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
          <Route path="/community" element={<Community />} />
          <Route path="/me" element={<Me />} />
          <Route path="/me/settings" element={<Settings />} />
          <Route path="/me/settings/public-profile" element={<PublicProfileSettings />} />
          <Route path="/me/settings/privacy" element={<Privacy />} />
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
    { to: '/', label: 'Today', icon: '•' },
    { to: '/train', label: 'Train', icon: '↗' },
    { to: '/nutri', label: 'Eat', icon: '◇' },
    { to: '/community', label: 'Chat', icon: '⋯' },
    { to: '/me', label: 'Me', icon: '○' },
  ];

  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map((tab) => {
        const active = tab.to === '/' ? pathname === '/' : pathname.startsWith(tab.to);
        return (
          <Link key={tab.to} to={tab.to} className={`tab ${active ? 'tab--active' : ''}`}>
            <span className="tab-icon" aria-hidden>{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
