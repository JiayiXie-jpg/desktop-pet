import React, { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import RedeemPage from './pages/RedeemPage';
import SetupPage from './pages/SetupPage';
import GeneratingPage from './pages/GeneratingPage';
import PetOverlayPage from './pages/PetOverlayPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import LandingPage from './pages/LandingPage';

type Page = 'landing' | 'login' | 'home' | 'redeem' | 'setup' | 'generating' | 'pet' | 'profile';

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8765'
  : `${window.location.protocol}//${window.location.host}`;

function parseHash(): { page: Page; petId: string | null } {
  const hash = window.location.hash.replace('#/', '').replace('#', '').replace(/\/+$/, '');
  const petMatch = hash.match(/^pet\/([^/]+)(\/(.+))?$/);
  if (petMatch) {
    const petId = petMatch[1];
    const sub = petMatch[3];
    if (sub === 'setup') return { page: 'setup', petId };
    if (sub === 'generating') return { page: 'generating', petId };
    return { page: 'pet', petId };
  }
  if (hash === 'redeem') return { page: 'redeem', petId: null };
  if (hash === 'profile') return { page: 'profile', petId: null };
  if (hash === 'login') return { page: 'login', petId: null };
  return { page: 'home', petId: null };
}

function App() {
  const initial = parseHash();
  const isElectron = !!(window as any).electronAPI;
  const isElectronPet = initial.page === 'pet' && isElectron;

  const [page, setPage] = useState<Page>(initial.page);
  const [petId, setPetId] = useState<string | null>(initial.petId);
  const [authChecked, setAuthChecked] = useState(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('desktop-pet-token'));
  const [username, setUsername] = useState('');
  const [userPetIds, setUserPetIds] = useState<string[]>([]);

  // Check auth on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('desktop-pet-token');
    if (!savedToken) {
      // If directly viewing a pet page (e.g. Electron), skip auth
      if (initial.page === 'pet' && initial.petId) {
        setAuthChecked(true);
        return;
      }
      // Show login page if explicitly requested, otherwise landing
      setPage(initial.page === 'login' ? 'login' : 'landing');
      setAuthChecked(true);
      return;
    }

    fetch(`${BACKEND_URL}/api/me`, {
      headers: { 'Authorization': `Bearer ${savedToken}` },
    })
      .then(r => {
        if (!r.ok) throw new Error('Invalid');
        return r.json();
      })
      .then(data => {
        setToken(savedToken);
        setUsername(data.username);
        setUserPetIds(data.petIds || []);
        // Set myPetId if not already set
        const myPet = localStorage.getItem('desktop-pet-my-pet-id');
        if (!myPet && data.petIds?.length > 0) {
          localStorage.setItem('desktop-pet-my-pet-id', data.petIds[0]);
        }
        // If on login page, go to home
        if (initial.page === 'login' || (!initial.petId && initial.page !== 'redeem')) {
          setPage('home');
        }
        setAuthChecked(true);
      })
      .catch(() => {
        localStorage.removeItem('desktop-pet-token');
        setToken(null);
        if (initial.page === 'pet' && initial.petId) {
          setAuthChecked(true);
          return;
        }
        setPage(initial.page === 'login' ? 'login' : 'landing');
        setAuthChecked(true);
      });

    // Heartbeat
    fetch(`${BACKEND_URL}/api/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: isElectron ? 'electron' : 'browser' }),
    }).catch(() => {});
  }, []);

  const navigate = (p: Page, id?: string | null) => {
    if (id !== undefined) setPetId(id);
    setPage(p);
    const pid = id !== undefined ? id : petId;
    if (p === 'home') window.location.hash = '#/';
    else if (p === 'landing') window.location.hash = '#/';
    else if (p === 'login') window.location.hash = '#/login';
    else if (p === 'redeem') window.location.hash = '#/redeem';
    else if (p === 'profile') window.location.hash = '#/profile';
    else if (pid) window.location.hash = p === 'pet' ? `#/pet/${pid}` : `#/pet/${pid}/${p}`;
  };

  const handleLogin = (newToken: string, userId: string, name: string, petIds: string[]) => {
    localStorage.setItem('desktop-pet-token', newToken);
    setToken(newToken);
    setUsername(name);
    setUserPetIds(petIds);
    if (petIds.length > 0) {
      localStorage.setItem('desktop-pet-my-pet-id', petIds[0]);
    }
    navigate('home');
  };

  const handleLogout = () => {
    localStorage.removeItem('desktop-pet-token');
    localStorage.removeItem('desktop-pet-my-pet-id');
    setToken(null);
    setUsername('');
    setUserPetIds([]);
    navigate('landing');
  };

  const handleGenerationComplete = () => {
    if (isElectron) {
      (window as any).electronAPI.showPetWindow(petId);
      (window as any).electronAPI.closeSetupWindow();
    } else {
      navigate('pet');
    }
  };

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: isElectron ? 'transparent' : '#FFF8F6' }}>
        {!isElectron && <div style={{ color: '#FF385C', fontSize: 16 }}>加载中...</div>}
      </div>
    );
  }

  switch (page) {
    case 'landing':
      return (
        <LandingPage
          backendUrl={BACKEND_URL}
          onGoLogin={() => navigate('login')}
        />
      );
    case 'login':
      return (
        <LoginPage
          backendUrl={BACKEND_URL}
          onLogin={handleLogin}
          onGoRedeem={() => navigate('redeem')}
        />
      );
    case 'home':
      return (
        <HomePage
          backendUrl={BACKEND_URL}
          onRedeem={() => navigate('redeem')}
          myPetId={localStorage.getItem('desktop-pet-my-pet-id') || undefined}
          onViewPet={(id) => {
            localStorage.setItem('desktop-pet-my-pet-id', id);
            if (isElectron) {
              (window as any).electronAPI.showPetWindow(id);
              (window as any).electronAPI.closeSetupWindow();
            } else {
              navigate('pet', id);
            }
          }}
          username={username}
          onLogout={handleLogout}
          onProfile={() => navigate('profile')}
          token={token || undefined}
        />
      );
    case 'redeem':
      return (
        <RedeemPage
          backendUrl={BACKEND_URL}
          onSuccess={(id) => {
            // If logged in, add pet to user
            if (token) {
              setUserPetIds(prev => [...prev, id]);
              localStorage.setItem('desktop-pet-my-pet-id', id);
            }
            navigate('setup', id);
          }}
          onBack={() => navigate(token ? 'home' : 'landing')}
          token={token || undefined}
        />
      );
    case 'setup':
      return (
        <SetupPage
          backendUrl={BACKEND_URL}
          petId={petId!}
          onStartGeneration={() => navigate('generating')}
          onLaunchPet={handleGenerationComplete}
        />
      );
    case 'generating':
      return (
        <GeneratingPage
          backendUrl={BACKEND_URL}
          petId={petId!}
          onComplete={handleGenerationComplete}
        />
      );
    case 'pet':
      return (
        <>
          <PetOverlayPage
            backendUrl={BACKEND_URL}
            petId={petId!}
            transparent={isElectron}
            onBackToSetup={() => navigate('home')}
            onBack={() => navigate('home')}
          />
        </>
      );
    case 'profile':
      return (
        <ProfilePage
          backendUrl={BACKEND_URL}
          token={token!}
          username={username}
          petIds={userPetIds}
          onBack={() => navigate('home')}
          onUsernameChange={(name) => setUsername(name)}
          onLogout={handleLogout}
        />
      );
    default:
      return (
        <HomePage
          backendUrl={BACKEND_URL}
          onRedeem={() => navigate('redeem')}
          myPetId={localStorage.getItem('desktop-pet-my-pet-id') || undefined}
          onViewPet={(id) => {
            localStorage.setItem('desktop-pet-my-pet-id', id);
            if (isElectron) {
              (window as any).electronAPI.showPetWindow(id);
              (window as any).electronAPI.closeSetupWindow();
            } else {
              navigate('pet', id);
            }
          }}
          username={username}
          onLogout={handleLogout}
          onProfile={() => navigate('profile')}
          token={token || undefined}
        />
      );
  }
}

export default App;
