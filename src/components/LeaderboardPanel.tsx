import React, { useState, useEffect } from 'react';

interface LeaderboardPanelProps {
  backendUrl: string;
  gameId: string;
  onClose: () => void;
}

interface ScoreEntry {
  petId: string;
  petName: string;
  score: number;
  playedAt: string;
}

export default function LeaderboardPanel({ backendUrl, gameId, onClose }: LeaderboardPanelProps) {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${backendUrl}/api/leaderboard/${gameId}`)
      .then(r => r.json())
      .then(data => {
        setScores(data.scores || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [backendUrl, gameId]);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>🏆 全服排行</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div style={{ padding: '6px 12px', fontSize: 10, color: '#717171', borderBottom: '1px solid #EBEBEB' }}>
        本周榜单 · {gameId === 'quicktap' ? '极速反应' : gameId}
      </div>
      <div style={styles.list}>
        {loading && <div style={{ textAlign: 'center', color: '#B0B0B0', padding: 20 }}>加载中...</div>}
        {!loading && scores.length === 0 && (
          <div style={{ textAlign: 'center', color: '#B0B0B0', padding: 20 }}>虚位以待，等你来挑战</div>
        )}
        {scores.map((entry, i) => (
          <div key={`${entry.petId}-${i}`} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8,
            background: i < 3 ? '#FFECEF' : 'transparent',
          }}>
            <span style={{ width: 24, textAlign: 'center', fontSize: i < 3 ? 16 : 12, color: i < 3 ? '#FF385C' : '#B0B0B0' }}>
              {i < 3 ? medals[i] : i + 1}
            </span>
            <span style={{ flex: 1, fontSize: 12, fontWeight: i < 3 ? 600 : 400, color: '#222222' }}>
              {entry.petName}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: i < 3 ? '#FF385C' : '#717171' }}>
              {entry.score}
            </span>
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
  list: {
    flex: 1, overflowY: 'auto', padding: '6px 4px',
  },
};
