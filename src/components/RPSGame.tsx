import React, { useState, useEffect, useRef } from 'react';

interface RPSGameProps {
  backendUrl: string;
  petId: string;
  onClose: () => void;
  onResult?: (result: any) => void;
}

const CHOICES = [
  { id: 'rock', emoji: '✊', name: '石头' },
  { id: 'scissors', emoji: '✌️', name: '剪刀' },
  { id: 'paper', emoji: '🖐️', name: '布' },
];

type Phase = 'ready' | 'waiting' | 'matched' | 'choosing' | 'round_result' | 'final';

export default function RPSGame({ backendUrl, petId, onClose, onResult }: RPSGameProps) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [matchId, setMatchId] = useState('');
  const [myRole, setMyRole] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [myChoice, setMyChoice] = useState('');
  const [roundResult, setRoundResult] = useState<any>(null);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [waitTimer, setWaitTimer] = useState(15);
  const wsRef = useRef<WebSocket | null>(null);
  const countdownRef = useRef<number>(0);

  // Connect WebSocket
  useEffect(() => {
    const wsUrl = backendUrl.replace('http', 'ws') + '/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', petId }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'rps_matched') {
        setMatchId(data.matchId);
        setMyRole(data.you);
        setOpponentName(data.opponentName);
        setPhase('matched');
      } else if (data.type === 'rps_round_start') {
        setPhase('choosing');
        setMyChoice('');
        setCountdown(5);
        let t = 5;
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = window.setInterval(() => {
          t--;
          setCountdown(t);
          if (t <= 0) clearInterval(countdownRef.current);
        }, 1000);
      } else if (data.type === 'rps_round_result') {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setRoundResult(data);
        setPhase('round_result');
      } else if (data.type === 'rps_final') {
        setFinalResult(data);
        setPhase('final');
        onResult?.(data);
      }
    };

    return () => { ws.close(); if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [backendUrl, petId]);

  const startMatch = async () => {
    setPhase('waiting');
    setWaitTimer(15);
    const interval = setInterval(() => {
      setWaitTimer(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);

    try {
      await fetch(`${backendUrl}/api/game/rps/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId }),
      });
    } catch {}
  };

  const makeChoice = (choice: string) => {
    if (myChoice || !wsRef.current) return;
    setMyChoice(choice);
    wsRef.current.send(JSON.stringify({ type: 'rps_choice', matchId, choice }));
  };

  const getResultText = (winner: string) => {
    if (winner === 'draw') return '平局';
    return winner === myRole ? '你赢了！' : '你输了';
  };

  const getResultColor = (winner: string) => {
    if (winner === 'draw') return '#FFB400';
    return winner === myRole ? '#00A699' : '#C13515';
  };

  if (phase === 'ready') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>✊ 猜拳对决</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✊✌️🖐️</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#222222' }}>实时对决</div>
          <div style={{ fontSize: 11, color: '#717171', marginBottom: 20, lineHeight: 1.6, textAlign: 'center' as const }}>
            全服实时匹配对手<br/>
            三局两胜，每局 5 秒<br/>
            胜 +50XP +20🪙 &nbsp; 负 +15XP +5🪙
          </div>
          <button onClick={startMatch} style={styles.startBtn}>寻找对手</button>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>✊ 猜拳对决</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 40, marginBottom: 16, animation: 'pulse 1.5s ease infinite' }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#222222' }}>正在匹配...</div>
          <div style={{ fontSize: 11, color: '#717171' }}>
            {waitTimer > 0 ? `${waitTimer}秒后AI对战` : 'AI对手已就绪'}
          </div>
          <style>{`@keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.1); } }`}</style>
        </div>
      </div>
    );
  }

  if (phase === 'matched') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>✊ 猜拳对决</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#222222' }}>对手匹配成功！</div>
          <div style={{ fontSize: 12, color: '#FF385C', marginTop: 8 }}>vs {opponentName}</div>
          <div style={{ fontSize: 11, color: '#717171', marginTop: 8 }}>准备开始...</div>
        </div>
      </div>
    );
  }

  if (phase === 'choosing') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>⏱ {countdown}s</span>
          <span style={{ fontWeight: 600 }}>vs {opponentName}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 13, marginBottom: 16, color: '#FF385C', fontWeight: 600 }}>
            第 {roundResult ? roundResult.round + 1 : 1} 局 — 出招！
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {CHOICES.map(c => (
              <button
                key={c.id}
                onClick={() => makeChoice(c.id)}
                style={{
                  ...styles.choiceBtn,
                  background: myChoice === c.id ? '#FFECEF' : '#F7F7F7',
                  border: myChoice === c.id ? '2px solid #FF385C' : '2px solid #EBEBEB',
                  opacity: myChoice && myChoice !== c.id ? 0.3 : 1,
                }}
              >
                <div style={{ fontSize: 36 }}>{c.emoji}</div>
                <div style={{ fontSize: 10, marginTop: 4 }}>{c.name}</div>
              </button>
            ))}
          </div>
          {myChoice && <div style={{ fontSize: 11, color: '#00A699', marginTop: 12 }}>已出招，等待对手...</div>}
        </div>
      </div>
    );
  }

  if (phase === 'round_result' && roundResult) {
    const myC = myRole === 'p1' ? roundResult.p1Choice : roundResult.p2Choice;
    const opC = myRole === 'p1' ? roundResult.p2Choice : roundResult.p1Choice;
    const myEmoji = CHOICES.find(c => c.id === myC)?.emoji || '?';
    const opEmoji = CHOICES.find(c => c.id === opC)?.emoji || '?';

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>✊ 第 {roundResult.round} 局</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40 }}>{myEmoji}</div>
              <div style={{ fontSize: 10, color: '#717171', marginTop: 4 }}>你</div>
            </div>
            <div style={{ fontSize: 20, color: '#FF385C', fontWeight: 700 }}>VS</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40 }}>{opEmoji}</div>
              <div style={{ fontSize: 10, color: '#717171', marginTop: 4 }}>{opponentName}</div>
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: getResultColor(roundResult.winner) }}>
            {getResultText(roundResult.winner)}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'final' && finalResult) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span>✊ 猜拳对决</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.centerContent}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>
            {finalResult.winner === myRole ? '🏆' : finalResult.winner === 'draw' ? '🤝' : '😅'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: getResultColor(finalResult.winner), marginBottom: 8 }}>
            {finalResult.winner === 'draw' ? '平局！' : finalResult.winner === myRole ? '你赢了！' : '你输了'}
          </div>
          <div style={{ fontSize: 11, color: '#717171', lineHeight: 1.8, textAlign: 'center' as const }}>
            比分 {finalResult.p1Wins} : {finalResult.p2Wins}<br/>
            +{finalResult.xpReward} XP &nbsp; +{finalResult.coinsReward} 🪙
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={startMatch} style={styles.startBtn}>再来一局</button>
            <button onClick={onClose} style={{ ...styles.startBtn, background: '#F7F7F7', color: '#222222', border: '1px solid #EBEBEB' }}>返回</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
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
  choiceBtn: {
    padding: '12px 16px', borderRadius: 12, border: '2px solid #EBEBEB',
    background: '#F7F7F7', cursor: 'pointer', color: '#222222',
    textAlign: 'center' as const, transition: 'all 0.2s',
  },
};
