import React, { useState, useEffect, useRef } from 'react';

interface StatsBarProps {
  backendUrl: string;
  petId: string;
  compact?: boolean;
  onCheckin?: (result: any) => void;
}

interface PetStats {
  hunger: number;
  mood: number;
  energy: number;
  xp: number;
  level: number;
  coins: number;
  nextLevelXp: number;
  dailyCheckIn: { lastDate: string; streak: number; totalDays: number };
}

export default function StatsBar({ backendUrl, petId, compact = false, onCheckin }: StatsBarProps) {
  const [stats, setStats] = useState<PetStats | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; color: string }[]>([]);
  const [feeding, setFeeding] = useState(false);
  const toastId = useRef(0);

  const showToast = (text: string, color = '#FF385C') => {
    const id = toastId.current++;
    setToasts(prev => [...prev, { id, text, color }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2000);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/stats`);
      const data = await res.json();
      setStats(data);
      const today = new Date().toISOString().slice(0, 10);
      setCheckedIn(data.dailyCheckIn?.lastDate === today);
    } catch {}
  };

  useEffect(() => {
    fetchStats();
    if (compact) {
      fetch(`${backendUrl}/api/pets/${petId}/checkin`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setCheckedIn(true);
            setStats(data.stats);
            showToast(`打卡成功 +${data.coinsReward}🪙 连续${data.streak}天`, '#4CAF50');
            onCheckin?.(data);
          } else if (data.alreadyCheckedIn) {
            setCheckedIn(true);
          }
        })
        .catch(() => {});
    }
    const timer = setInterval(fetchStats, 30000);
    return () => clearInterval(timer);
  }, [backendUrl, petId]);

  const handleCheckin = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/checkin`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCheckedIn(true);
        setStats(data.stats);
        showToast(`打卡成功 +${data.coinsReward}🪙 +20XP 连续${data.streak}天`, '#00A699');
        if (data.leveledUp) showToast('恭喜升级！', '#FFB400');
        onCheckin?.(data);
      }
    } catch {}
  };

  const handleFeed = async () => {
    if (feeding) return;
    setFeeding(true);
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/feed`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        showToast('+10XP  🍖+20', '#FF385C');
        if (data.leveledUp) showToast('恭喜升级！', '#FFB400');
      } else if (data.error === 'Too soon') {
        showToast(`${data.cooldownSeconds}秒后可再次投喂`, '#717171');
      }
    } catch {
      showToast('网络开小差了', '#C13515');
    }
    setTimeout(() => setFeeding(false), 500);
  };

  if (!stats) return null;

  const bars = [
    { label: '🍖', name: '饱腹', value: stats.hunger, color: '#FF385C' },
    { label: '😊', name: '情绪', value: stats.mood, color: '#FFB400' },
    { label: '⚡', name: '活力', value: stats.energy, color: '#00A699' },
  ];

  const xpPercent = stats.nextLevelXp > 0 ? Math.min(100, (stats.xp / stats.nextLevelXp) * 100) : 0;

  const toastLayer = toasts.length > 0 && (
    <div style={{
      position: 'absolute', top: compact ? 24 : -8, left: 0, right: 0,
      display: 'flex', flexDirection: 'column', alignItems: compact ? 'flex-start' : 'center',
      gap: 2, zIndex: 999, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '4px 12px', borderRadius: 10,
          background: '#222222', color: '#fff',
          fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          animation: 'toastUp 2s ease forwards',
        }}>
          {t.text}
        </div>
      ))}
      <style>{`@keyframes toastUp { 0% { opacity:1; transform:translateY(0); } 70% { opacity:1; } 100% { opacity:0; transform:translateY(-20px); } }`}</style>
    </div>
  );

  // Compact mode (Electron) — keep minimal dark overlay
  if (compact) {
    return (
      <div style={{ position: 'relative' }}>
        {toastLayer}
        <div style={{
          display: 'flex', gap: 3, alignItems: 'center', padding: '2px 6px',
          background: 'rgba(0,0,0,0.5)', borderRadius: 10, fontSize: 9,
          WebkitAppRegion: 'no-drag', pointerEvents: 'auto',
        } as any}>
          <span style={{ color: '#ffd166', fontWeight: 700 }}>Lv{stats.level}</span>
          {bars.map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>{b.label}</span>
              <div style={{ width: 20, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
                <div style={{ width: `${b.value}%`, height: '100%', background: b.color, borderRadius: 2, transition: 'width 0.5s' }} />
              </div>
            </div>
          ))}
          <span style={{ color: '#ffd166' }}>🪙{stats.coins}</span>
          <button onClick={handleFeed} disabled={feeding} style={{
            background: feeding ? 'rgba(255,255,255,0.1)' : 'rgba(255,154,118,0.7)',
            border: 'none', borderRadius: 6,
            color: '#fff', fontSize: 8, padding: '2px 5px', cursor: 'pointer', fontWeight: 600,
          }}>🍖喂</button>
        </div>
      </div>
    );
  }

  // Full mode (browser) — Airbnb white card
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '16px 18px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
      position: 'relative',
    }}>
      {toastLayer}
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#fff',
            background: '#FF385C', padding: '2px 10px', borderRadius: 12,
          }}>Lv.{stats.level}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#222222' }}>🪙 {stats.coins}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!checkedIn ? (
            <button onClick={handleCheckin} style={{
              padding: '6px 14px', borderRadius: 12, border: 'none',
              background: '#00A699', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              打卡 {stats.dailyCheckIn.streak > 0 ? `🔥${stats.dailyCheckIn.streak}` : ''}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#00A699', fontWeight: 500, padding: '6px 0' }}>
              ✓ 今日已打卡 🔥{stats.dailyCheckIn.streak}
            </span>
          )}
          <button onClick={handleFeed} disabled={feeding} style={{
            padding: '6px 14px', borderRadius: 12, border: '1.5px solid #EBEBEB',
            background: '#fff', color: '#222222', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', opacity: feeding ? 0.5 : 1,
          }}>🍖 投喂</button>
        </div>
      </div>

      {/* Stat bars */}
      {bars.map(b => (
        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 44, fontSize: 12, color: '#717171' }}>{b.label} {b.name}</span>
          <div style={{ flex: 1, height: 8, background: '#F7F7F7', borderRadius: 4 }}>
            <div style={{
              width: `${b.value}%`, height: '100%', background: b.color,
              borderRadius: 4, transition: 'width 0.5s',
            }} />
          </div>
          <span style={{ fontSize: 12, color: '#717171', width: 28, textAlign: 'right' }}>{Math.round(b.value)}</span>
        </div>
      ))}

      {/* XP bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ width: 44, fontSize: 12, color: '#B0B0B0' }}>XP</span>
        <div style={{ flex: 1, height: 6, background: '#F7F7F7', borderRadius: 3 }}>
          <div style={{
            width: `${xpPercent}%`, height: '100%',
            background: 'linear-gradient(90deg, #FF385C, #FFB400)',
            borderRadius: 3, transition: 'width 0.5s',
          }} />
        </div>
        <span style={{ fontSize: 11, color: '#B0B0B0' }}>{stats.xp}/{stats.nextLevelXp}</span>
      </div>
    </div>
  );
}
