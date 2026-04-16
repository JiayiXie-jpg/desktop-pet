import React, { useState, useEffect, useRef, useCallback } from 'react';

interface MemoryGameProps {
  backendUrl: string;
  petId: string;
  onClose: () => void;
  onResult?: (result: any) => void;
}

const EMOJI_POOL = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🦁', '🐸', '🐙', '🦋', '🌸', '🍕', '🎸', '🚀', '⭐', '🎯'];
const GAME_DURATION = 60;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MemoryGame({ backendUrl, petId, onClose, onResult }: MemoryGameProps) {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready');
  const [cards, setCards] = useState<{ id: number; emoji: string; flipped: boolean; matched: boolean }[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [steps, setSteps] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [resultData, setResultData] = useState<any>(null);
  const lockRef = useRef(false);
  const stepsRef = useRef(0);
  const timeRef = useRef(GAME_DURATION);

  const startGame = () => {
    const chosen = shuffleArray(EMOJI_POOL).slice(0, 8);
    const pairs = shuffleArray([...chosen, ...chosen]);
    setCards(pairs.map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false })));
    setSelected([]);
    setSteps(0);
    stepsRef.current = 0;
    setMatchCount(0);
    setTimeLeft(GAME_DURATION);
    timeRef.current = GAME_DURATION;
    setScore(0);
    setResultData(null);
    lockRef.current = false;
    setPhase('playing');
  };

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          finishGame();
          return 0;
        }
        timeRef.current = prev - 1;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const finishGame = useCallback(() => {
    const s = Math.max(200 - stepsRef.current * 10, 50);
    setScore(s);
    setPhase('result');
    submitScore(s);
  }, []);

  const submitScore = async (s: number) => {
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/game/memory/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: s, steps: stepsRef.current, timeLeft: timeRef.current }),
      });
      const data = await res.json();
      setResultData(data);
      onResult?.(data);
    } catch {}
  };

  const handleCardClick = (idx: number) => {
    if (phase !== 'playing' || lockRef.current) return;
    const card = cards[idx];
    if (card.flipped || card.matched) return;
    if (selected.includes(idx)) return;

    const newCards = [...cards];
    newCards[idx] = { ...newCards[idx], flipped: true };
    setCards(newCards);

    const newSelected = [...selected, idx];
    setSelected(newSelected);

    if (newSelected.length === 2) {
      const newSteps = steps + 1;
      setSteps(newSteps);
      stepsRef.current = newSteps;
      lockRef.current = true;

      const [a, b] = newSelected;
      if (newCards[a].emoji === newCards[b].emoji) {
        // Match!
        setTimeout(() => {
          setCards(prev => prev.map((c, i) =>
            i === a || i === b ? { ...c, matched: true } : c
          ));
          const newMatchCount = matchCount + 1;
          setMatchCount(newMatchCount);
          setSelected([]);
          lockRef.current = false;
          if (newMatchCount === 8) {
            finishGame();
          }
        }, 300);
      } else {
        // No match - flip back
        setTimeout(() => {
          setCards(prev => prev.map((c, i) =>
            i === a || i === b ? { ...c, flipped: false } : c
          ));
          setSelected([]);
          lockRef.current = false;
        }, 600);
      }
    }
  };

  if (phase === 'ready') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>🃏 记忆大师</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#222222' }}>记忆力挑战</div>
          <div style={{ fontSize: 11, color: '#717171', marginBottom: 20, lineHeight: 1.6, textAlign: 'center' as const }}>
            翻开卡牌，找到匹配的一对！<br/>
            8 组配对，60 秒限时<br/>
            步数越少，得分越高
          </div>
          <button onClick={startGame} style={styles.startBtn}>开始挑战（60 秒）</button>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>🃏 记忆大师</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#222222' }}>{score} 分</div>
          <div style={{ fontSize: 11, color: '#717171', marginBottom: 8 }}>
            {matchCount === 8 ? `完美通关！共 ${steps} 步` : `时间到！完成 ${matchCount}/8 组`}
          </div>
          {resultData && (
            <div style={{ fontSize: 11, color: '#717171', lineHeight: 1.8, textAlign: 'center' as const }}>
              +{resultData.xpReward} XP &nbsp; +{resultData.coinsReward} 🪙<br/>
              情绪 +{resultData.moodBoost}
              {resultData.leveledUp && <div style={{ color: '#FF385C', fontWeight: 700, marginTop: 4 }}>恭喜升级！</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={startGame} style={styles.startBtn}>再来一局</button>
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
        <span style={{ fontWeight: 700 }}>步数 {steps} &nbsp; 配对 {matchCount}/8</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div style={styles.grid}>
        {cards.map((card, idx) => (
          <div
            key={card.id}
            onClick={() => handleCardClick(idx)}
            style={{
              width: '22%', aspectRatio: '1', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: card.flipped || card.matched ? 22 : 18,
              background: card.matched
                ? '#00A699'
                : card.flipped
                  ? '#FFECEF'
                  : '#F7F7F7',
              cursor: card.flipped || card.matched ? 'default' : 'pointer',
              transition: 'all 0.2s',
              border: card.flipped ? '2px solid #FF385C' : '2px solid #EBEBEB',
              userSelect: 'none',
              color: card.matched ? '#fff' : '#222222',
            }}
          >
            {card.flipped || card.matched ? card.emoji : '❓'}
          </div>
        ))}
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
  grid: {
    flex: 1, display: 'flex', flexWrap: 'wrap',
    alignContent: 'center', justifyContent: 'center', gap: 6,
    padding: 10,
  },
};
