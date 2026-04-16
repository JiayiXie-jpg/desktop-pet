import React, { useState, useEffect, useRef, useCallback } from 'react';

interface FeedingGameProps {
  backendUrl: string;
  petId: string;
  onClose: () => void;
  onResult?: (result: any) => void;
}

interface FoodItem {
  id: number;
  emoji: string;
  good: boolean;
  x: number; // % from left
  y: number; // % from top (animated)
  speed: number; // px per frame
  caught: boolean;
}

const GOOD_FOODS = ['🍎', '🍊', '🍓', '🥕', '🍰', '🍩', '🧁', '🍪', '🍕', '🌽'];
const BAD_FOODS = ['💀', '🦴', '🗑️'];
const GAME_DURATION = 30; // seconds

export default function FeedingGame({ backendUrl, petId, onClose, onResult }: FeedingGameProps) {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [combo, setCombo] = useState(0);
  const [resultData, setResultData] = useState<any>(null);
  const [voiceBubble, setVoiceBubble] = useState('');
  const nextIdRef = useRef(0);
  const scoreRef = useRef(0);
  const animRef = useRef<number>(0);
  const foodsRef = useRef<FoodItem[]>([]);
  const lastSpawnRef = useRef(0);
  const voiceAudios = useRef<Record<string, HTMLAudioElement[]>>({});
  const voicePlaying = useRef(false);
  const comboVoicePlayed = useRef(false);

  scoreRef.current = score;

  // Preload encourage voices on mount
  useEffect(() => {
    fetch(`${backendUrl}/api/pets/${petId}/game/encourage`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.audios) {
          for (const [cat, urls] of Object.entries(data.audios as Record<string, string[]>)) {
            voiceAudios.current[cat] = (urls as string[]).map(u => {
              const a = new Audio(backendUrl + u);
              a.preload = 'auto';
              return a;
            });
          }
        }
      })
      .catch(() => {});
  }, [backendUrl, petId]);

  const playVoice = (category: string) => {
    if (voicePlaying.current) return;
    const audios = voiceAudios.current[category];
    if (!audios?.length) return;
    const audio = audios[Math.floor(Math.random() * audios.length)];
    voicePlaying.current = true;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    // Show speech bubble text
    const textMap: Record<string, string[]> = {
      start: ['加油哦！', '开始啦！', '冲鸭！'],
      combo: ['太棒了！', '好厉害！', '继续保持！'],
      miss_bad: ['小心呀！', '别碰！'],
      end_high: ['太厉害了！', '你最棒！'],
      end_low: ['再来一次！', '加油！'],
    };
    const texts = textMap[category] || [''];
    setVoiceBubble(texts[Math.floor(Math.random() * texts.length)]);
    audio.onended = () => {
      voicePlaying.current = false;
      setVoiceBubble('');
    };
    setTimeout(() => { voicePlaying.current = false; setVoiceBubble(''); }, 4000);
  };

  const startGame = () => {
    setPhase('playing');
    setScore(0);
    setCombo(0);
    setTimeLeft(GAME_DURATION);
    setFoods([]);
    foodsRef.current = [];
    nextIdRef.current = 0;
    lastSpawnRef.current = Date.now();
    scoreRef.current = 0;
    comboVoicePlayed.current = false;
    setTimeout(() => playVoice('start'), 300);
  };

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase('result');
          submitScore();
          setTimeout(() => playVoice(scoreRef.current >= 80 ? 'end_high' : 'end_low'), 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Spawn and animate foods
  useEffect(() => {
    if (phase !== 'playing') return;

    const tick = () => {
      const now = Date.now();
      // Spawn new food every 600-1000ms
      if (now - lastSpawnRef.current > 600 + Math.random() * 400) {
        lastSpawnRef.current = now;
        const isGood = Math.random() > 0.2; // 80% good
        const food: FoodItem = {
          id: nextIdRef.current++,
          emoji: isGood
            ? GOOD_FOODS[Math.floor(Math.random() * GOOD_FOODS.length)]
            : BAD_FOODS[Math.floor(Math.random() * BAD_FOODS.length)],
          good: isGood,
          x: 5 + Math.random() * 80, // 5-85%
          y: -5,
          speed: 0.4 + Math.random() * 0.3,
          caught: false,
        };
        foodsRef.current = [...foodsRef.current, food];
      }

      // Move foods down
      foodsRef.current = foodsRef.current
        .map(f => ({ ...f, y: f.y + f.speed }))
        .filter(f => f.y < 105 && !f.caught);

      setFoods([...foodsRef.current]);
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase]);

  const catchFood = useCallback((food: FoodItem) => {
    if (food.caught) return;
    food.caught = true;
    foodsRef.current = foodsRef.current.filter(f => f.id !== food.id);

    if (food.good) {
      const newCombo = Math.min(combo + 1, 5);
      setScore(prev => prev + 10 + combo);
      scoreRef.current += 10 + combo;
      setCombo(newCombo);
      // Voice on combo 3+
      if (newCombo >= 3 && !comboVoicePlayed.current) {
        comboVoicePlayed.current = true;
        playVoice('combo');
        setTimeout(() => { comboVoicePlayed.current = false; }, 6000);
      }
    } else {
      setScore(prev => Math.max(0, prev - 10));
      scoreRef.current = Math.max(0, scoreRef.current - 10);
      setCombo(0);
      playVoice('miss_bad');
    }
  }, [combo]);

  const submitScore = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/game/feeding/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: scoreRef.current }),
      });
      const data = await res.json();
      setResultData(data);
      onResult?.(data);
    } catch {}
  };

  // Ready screen
  if (phase === 'ready') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>🍎 美食达人</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🍽️</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#222222' }}>美食达人挑战</div>
          <div style={{ fontSize: 11, color: '#717171', marginBottom: 20, lineHeight: 1.6, textAlign: 'center' as const }}>
            点击接住掉落的美味！<br/>
            美食 +10 分，垃圾食品 -10 分<br/>
            连击可获得额外加分
          </div>
          <button onClick={startGame} style={styles.startBtn}>开始挑战（30 秒）</button>
        </div>
      </div>
    );
  }

  // Result screen
  if (phase === 'result') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>🍎 美食达人</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#222222' }}>{score} 分</div>
          {resultData && (
            <div style={{ fontSize: 11, color: '#717171', lineHeight: 1.8, textAlign: 'center' as const }}>
              +{resultData.xpReward} XP &nbsp; +{resultData.coinsReward} 🪙<br/>
              饱腹 +{resultData.hungerBoost} &nbsp; 情绪 +{resultData.moodBoost}
              {resultData.leveledUp && <div style={{ color: '#FF385C', fontWeight: 700, marginTop: 4 }}>恭喜升级！</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={startGame} style={styles.startBtn}>再挑战一次</button>
            <button onClick={onClose} style={{ ...styles.startBtn, background: '#F7F7F7', color: '#222222', border: '1px solid #EBEBEB' }}>返回</button>
          </div>
        </div>
      </div>
    );
  }

  // Playing screen
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>🕐 {timeLeft}s</span>
        <span style={{ fontWeight: 700 }}>{score} 分 {combo > 1 ? `x${combo}` : ''}</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      {voiceBubble && (
        <div style={{
          position: 'absolute', top: 36, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', zIndex: 50, pointerEvents: 'none',
        }}>
          <div style={{
            background: '#fff', color: '#222222', padding: '4px 12px',
            borderRadius: 12, fontSize: 12, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            animation: 'bubblePop 0.3s ease',
          }}>
            🐾 {voiceBubble}
          </div>
        </div>
      )}
      <div style={styles.gameArea}>
        {foods.map(f => (
          <div
            key={f.id}
            onClick={() => catchFood(f)}
            style={{
              position: 'absolute',
              left: `${f.x}%`,
              top: `${f.y}%`,
              fontSize: 28,
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'transform 0.1s',
              filter: f.good ? 'none' : 'drop-shadow(0 0 4px rgba(255,0,0,0.5))',
              width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#fff', borderRadius: '50%',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            {f.emoji}
          </div>
        ))}
      </div>
      <style>{`@keyframes bubblePop { 0% { transform: scale(0.5); opacity:0; } 100% { transform: scale(1); opacity:1; } }`}</style>
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
