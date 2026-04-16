import React, { useState } from 'react';
import FeedingGame from './FeedingGame';
import MemoryGame from './MemoryGame';
import QuickTapGame from './QuickTapGame';
import LeaderboardPanel from './LeaderboardPanel';
import RPSGame from './RPSGame';

interface GamePanelProps {
  backendUrl: string;
  petId: string;
  onClose: () => void;
  onStatsChange?: () => void;
}

type GameId = 'menu' | 'feeding' | 'memory' | 'quicktap' | 'leaderboard' | 'rps';

export default function GamePanel({ backendUrl, petId, onClose, onStatsChange }: GamePanelProps) {
  const [currentGame, setCurrentGame] = useState<GameId>('menu');

  const handleResult = () => {
    onStatsChange?.();
  };

  if (currentGame === 'feeding') {
    return (
      <FeedingGame
        backendUrl={backendUrl}
        petId={petId}
        onClose={() => setCurrentGame('menu')}
        onResult={handleResult}
      />
    );
  }

  if (currentGame === 'memory') {
    return (
      <MemoryGame
        backendUrl={backendUrl}
        petId={petId}
        onClose={() => setCurrentGame('menu')}
        onResult={handleResult}
      />
    );
  }

  if (currentGame === 'quicktap') {
    return (
      <QuickTapGame
        backendUrl={backendUrl}
        petId={petId}
        onClose={() => setCurrentGame('menu')}
        onResult={handleResult}
      />
    );
  }

  if (currentGame === 'leaderboard') {
    return (
      <LeaderboardPanel
        backendUrl={backendUrl}
        gameId="quicktap"
        onClose={() => setCurrentGame('menu')}
      />
    );
  }

  if (currentGame === 'rps') {
    return (
      <RPSGame
        backendUrl={backendUrl}
        petId={petId}
        onClose={() => setCurrentGame('menu')}
        onResult={handleResult}
      />
    );
  }

  // Game menu
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>🎮 趣味互动</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div style={styles.gameList}>
        <GameCard
          emoji="🍎"
          name="美食达人"
          desc="接住天上掉下来的美味"
          reward="+经验 +金币 +饱腹"
          onClick={() => setCurrentGame('feeding')}
        />
        <GameCard
          emoji="🃏"
          name="记忆大师"
          desc="考验记忆力的配对挑战"
          reward="+经验 +金币 +情绪"
          onClick={() => setCurrentGame('memory')}
        />
        <GameCard
          emoji="👆"
          name="极速反应"
          desc="20 秒极限挑战，冲击全服榜单"
          reward="+经验 +金币 +排名"
          onClick={() => setCurrentGame('quicktap')}
        />
        <div
          onClick={() => setCurrentGame('leaderboard')}
          style={{
            padding: '6px 12px', borderRadius: 8, background: '#FFECEF',
            cursor: 'pointer', textAlign: 'center', fontSize: 11, color: '#FF385C', fontWeight: 600,
          }}
        >
          🏆 全服排行榜
        </div>
        <GameCard
          emoji="✊"
          name="猜拳对决"
          desc="实时匹配，在线 PvP"
          reward="+经验 +金币"
          onClick={() => setCurrentGame('rps')}
        />
      </div>
    </div>
  );
}

function GameCard({ emoji, name, desc, reward, onClick, locked = false }: {
  emoji: string; name: string; desc: string; reward: string;
  onClick: () => void; locked?: boolean;
}) {
  return (
    <div
      onClick={locked ? undefined : onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 10,
        background: locked ? '#F7F7F7' : '#fff',
        cursor: locked ? 'default' : 'pointer',
        opacity: locked ? 0.4 : 1,
        transition: 'background 0.2s, box-shadow 0.2s',
        border: '1px solid #EBEBEB',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: 28 }}>{emoji}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: '#222222' }}>
          {name} {locked && <span style={{ fontSize: 10, color: '#717171' }}>敬请期待</span>}
        </div>
        <div style={{ fontSize: 10, color: '#717171' }}>{desc}</div>
        <div style={{ fontSize: 9, color: '#FF385C', marginTop: 2 }}>{reward}</div>
      </div>
      {!locked && <span style={{ fontSize: 14, color: '#B0B0B0' }}>▶</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', height: '100%',
    background: '#fff',
    borderRadius: '12px 12px 0 0',
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
  gameList: {
    flex: 1, overflowY: 'auto', padding: '8px 10px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
};
