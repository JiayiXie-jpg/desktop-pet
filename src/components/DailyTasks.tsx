import React, { useState, useEffect } from 'react';

interface DailyTasksProps {
  backendUrl: string;
  petId: string;
  onCoinsChange?: () => void;
}

interface TaskItem {
  id: string;
  name: string;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

export default function DailyTasks({ backendUrl, petId, onCoinsChange }: DailyTasksProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [claiming, setClaiming] = useState('');

  const fetchTasks = () => {
    fetch(`${backendUrl}/api/pets/${petId}/tasks`)
      .then(r => r.json())
      .then(data => setTasks(data.tasks || []))
      .catch(() => {});
  };

  useEffect(() => { fetchTasks(); }, [backendUrl, petId]);

  const claimTask = async (taskId: string) => {
    if (claiming) return;
    setClaiming(taskId);
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/tasks/${taskId}/claim`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchTasks();
        onCoinsChange?.();
      }
    } catch {}
    setClaiming('');
  };

  const completed = tasks.filter(t => t.claimed).length;
  const total = tasks.length;

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          padding: '10px 14px', borderRadius: 12,
          background: '#fff', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13, color: '#222222',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <span style={{ fontWeight: 500 }}>📋 今日目标</span>
        <span style={{ color: completed === total && total > 0 ? '#00A699' : '#FF385C', fontWeight: 600 }}>
          {completed}/{total}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '12px 14px',
      color: '#222222', fontSize: 13,
      boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>📋 今日目标 ({completed}/{total})</span>
        <button onClick={() => setExpanded(false)} style={{
          background: 'none', border: 'none', color: '#B0B0B0', fontSize: 12, cursor: 'pointer',
        }}>▼</button>
      </div>
      {tasks.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 0', borderTop: '1px solid #EBEBEB',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, marginBottom: 3, color: '#222222' }}>{t.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 4, background: '#F7F7F7', borderRadius: 2 }}>
                <div style={{
                  width: `${Math.min(100, (t.progress / t.target) * 100)}%`,
                  height: '100%', borderRadius: 2, transition: 'width 0.3s',
                  background: t.progress >= t.target ? '#00A699' : '#FF385C',
                }} />
              </div>
              <span style={{ fontSize: 11, color: '#B0B0B0', minWidth: 28 }}>{t.progress}/{t.target}</span>
            </div>
          </div>
          {t.claimed ? (
            <span style={{ fontSize: 11, color: '#00A699', fontWeight: 600 }}>✓</span>
          ) : t.progress >= t.target ? (
            <button
              onClick={() => claimTask(t.id)}
              disabled={!!claiming}
              style={{
                padding: '4px 10px', borderRadius: 8, border: 'none',
                background: '#FF385C', color: '#fff', fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              +{t.reward}🪙
            </button>
          ) : (
            <span style={{ fontSize: 11, color: '#B0B0B0' }}>{t.reward}🪙</span>
          )}
        </div>
      ))}
    </div>
  );
}
