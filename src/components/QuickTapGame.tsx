import React, { useState, useEffect, useRef } from 'react';

interface QuickTapGameProps {
  backendUrl: string;
  petId: string;
  onClose: () => void;
  onResult?: (result: any) => void;
}

interface Target {
  id: number;
  x: number;
  y: number;
  emoji: string;
  spawnedAt: number;
}

const TARGET_EMOJIS = ['⭐', '🎯', '💎', '🔥', '🌟', '✨', '🎪', '🎨'];
const GAME_DURATION = 20;

export default function QuickTapGame({ backendUrl, petId, onClose, onResult }: QuickTapGameProps) {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [targets, setTargets] = useState<Target[]>([]);
  const [resultData, setResultData] = useState<any>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const nextIdRef = useRef(0);
  const scoreRef = useRef(0);
  const targetsRef = useRef<Target[]>([]);
  const spawnTimerRef = useRef<number>(0);

  const spawnTarget = () => {
    const t: Target = {
      id: nextIdRef.current++,
      x: 10 + Math.random() * 70,
      y: 10 + Math.random() * 70,
      emoji: TARGET_EMOJIS[Math.floor(Math.random() * TARGET_EMOJIS.length)],
      spawnedAt: Date.now(),
    };
    targetsRef.current = [...targetsRef.current, t].slice(-3); // max 3
    setTargets([...targetsRef.current]);
  };

  const startGame = () => {
    setPhase('playing');
    setScore(0);
    scoreRef.current = 0;
    setTimeLeft(GAME_DURATION);
    setTargets([]);
    targetsRef.current = [];
    nextIdRef.current = 0;
    setResultData(null);
    setTimeout(spawnTarget, 300);
  };

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase('result');
          submitScore();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Auto-spawn targets
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      if (targetsRef.current.length < 3) {
        spawnTarget();
      }
      // Remove stale targets (> 2s old)
      const now = Date.now();
      targetsRef.current = targetsRef.current.filter(t => now - t.spawnedAt < 2000);
      setTargets([...targetsRef.current]);
    }, 400);
    return () => clearInterval(interval);
  }, [phase]);

  const handleTap = (id: number) => {
    targetsRef.current = targetsRef.current.filter(t => t.id !== id);
    setTargets([...targetsRef.current]);
    scoreRef.current++;
    setScore(scoreRef.current);
    // Spawn new one after short delay
    setTimeout(() => {
      if (targetsRef.current.length < 3) spawnTarget();
    }, 150);
  };

  const submitScore = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/game/quicktap/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: scoreRef.current }),
      });
      const data = await res.json();
      setResultData(data);
      onResult?.(data);
    } catch {}
  };

  if (phase === 'ready') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>👆 极速反应</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👆</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#222222' }}>极速反应挑战</div>
          <div style={{ fontSize: 11, color: '#717171', marginBottom: 20, lineHeight: 1.6, textAlign: 'center' as const }}>
            捕捉闪现的目标！<br/>
            20 秒内尽可能多地点击<br/>
            成绩计入全服周排行榜
          </div>
          <button onClick={startGame} style={styles.startBtn}>开始挑战（20 秒）</button>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>👆 极速反应</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#222222' }}>{score} 次</div>
          {resultData && (
            <div style={{ fontSize: 11, color: '#717171', lineHeight: 1.8, textAlign: 'center' as const }}>
              +{resultData.xpReward} XP &nbsp; +{resultData.coinsReward} 🪙<br/>
              情绪 +{resultData.moodBoost}
              {resultData.leveledUp && <div style={{ color: '#FF385C', fontWeight: 700, marginTop: 4 }}>恭喜升级！</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={startGame} style={styles.startBtn}>再来一次</button>
            <button onClick={onClose} style={{ ...styles.startBtn, background: '#F7F7F7', color: '#222222', border: '1px solid #EBEBEB' }}>返回</button>
          </div>
        </div>
      </div>
    );
  }

  // Playing
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>🕐 {timeLeft}s</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{score}</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div style={styles.gameArea}>
        {targets.map(t => (
          <div
            key={t.id}
            onClick={() => handleTap(t.id)}
            style={{
              position: 'absolute',
              left: `${t.x}%`, top: `${t.y}%`,
              width: 48, height: 48, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, cursor: 'pointer', userSelect: 'none',
              background: '#FFECEF',
              border: '2px solid #FF385C',
              animation: 'targetPop 0.2s ease',
              transition: 'transform 0.1s',
            }}
          >
            {t.emoji}
          </div>
        ))}
        <style>{`@keyframes targetPop { 0% { transform: scale(0); } 100% { transform: scale(1); } }`}</style>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', height: '100%',
    background: '#fff',
    borderRadius: 12,
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', color: '#222222',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#222222',
    borderBottom: '1px solid #EBEBEB',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#717171', fontSize: 16, cursor: 'pointer', padding: '0 4px',
  },
  centerContent: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  startBtn: {
    padding: '8px 20px', borderRadius: 12, border: 'none',
    background: '#FF385C', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  gameArea: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: '#F7F7F7',
  },
};
