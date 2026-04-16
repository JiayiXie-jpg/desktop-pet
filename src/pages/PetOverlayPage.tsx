import React, { useState, useEffect, useRef, useCallback } from 'react';
import PetRenderer from '../components/PetRenderer';
import ReminderPanel from '../components/ReminderPanel';
import ChatDialog from '../components/ChatDialog';
import StatsBar from '../components/StatsBar';
import DailyTasks from '../components/DailyTasks';
import GamePanel from '../components/GamePanel';

interface PetOverlayPageProps {
  backendUrl: string;
  petId: string;
  transparent?: boolean;
  onBackToSetup?: () => void;
  onBack?: () => void;
}

const STATES = ['sitting', 'sleeping', 'eating', 'moving'] as const;

type CameraStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export default function PetOverlayPage({ backendUrl, petId, transparent = false, onBackToSetup, onBack }: PetOverlayPageProps) {
  const [mockRunning, setMockRunning] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('disconnected');
  const [mode, setMode] = useState<'mock' | 'camera' | 'reminder'>('mock');
  const [chatOpen, setChatOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [touchLoading, setTouchLoading] = useState(false);
  const [statsKey, setStatsKey] = useState(0);
  const [reminderToast, setReminderToast] = useState<{ label: string; message: string } | null>(null);
  const lastInteractionRef = useRef(Date.now());

  const handleReminder = useCallback((data: { label: string; message: string; audioUrl?: string | null }) => {
    setReminderToast({ label: data.label, message: data.message });
    setTimeout(() => setReminderToast(null), 6000);
    if (data.audioUrl) {
      const audio = new Audio(`${backendUrl}${data.audioUrl}`);
      audio.play().catch(() => {});
    }
  }, [backendUrl]);

  useEffect(() => {
    if (mode !== 'camera') return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/camera/status`);
        const data = await res.json();
        setCameraStatus(data.status);
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, [mode, backendUrl]);

  const startMock = async () => {
    await fetch(`${backendUrl}/api/pets/${petId}/mock/start`, { method: 'POST' });
    setMockRunning(true);
  };

  const stopMock = async () => {
    await fetch(`${backendUrl}/api/pets/${petId}/mock/stop`, { method: 'POST' });
    setMockRunning(false);
  };

  const setState = async (state: string) => {
    await fetch(`${backendUrl}/api/pets/${petId}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
  };

  const startCamera = async (useMock = false) => {
    setCameraStatus('connecting');
    if (mockRunning) {
      await fetch(`${backendUrl}/api/pets/${petId}/mock/stop`, { method: 'POST' });
      setMockRunning(false);
    }
    const url = useMock
      ? `${backendUrl}/api/camera/start?mock=true`
      : `${backendUrl}/api/camera/start`;
    await fetch(url, { method: 'POST' });
  };

  const stopCamera = async () => {
    await fetch(`${backendUrl}/api/camera/stop`, { method: 'POST' });
    setCameraStatus('disconnected');
  };

  // Zoom via scroll wheel + Cmd+/- keyboard shortcuts
  useEffect(() => {
    if (!transparent) return;
    const api = (window as any).electronAPI;
    if (!api?.resizeWindow) return;

    const handleWheel = (e: WheelEvent) => {
      if (chatOpen || reminderOpen) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY < 0 ? 20 : -20;
      if (api.zoomPet) {
        api.zoomPet(delta);
      } else {
        const base = (window as any).__petBaseSize || window.innerWidth;
        const s = Math.max(150, Math.min(800, base + delta));
        (window as any).__petBaseSize = s;
        api.resizeWindow(s, s);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (chatOpen || reminderOpen) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const base = (window as any).__petBaseSize || window.innerWidth;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        const s = Math.min(800, base + 50);
        (window as any).__petBaseSize = s;
        api.resizeWindow(s, s);
      } else if (e.key === '-') {
        e.preventDefault();
        const s = Math.max(150, base - 50);
        (window as any).__petBaseSize = s;
        api.resizeWindow(s, s);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKey);
    };
  }, [transparent, chatOpen, reminderOpen]);

  // Double-click or Enter to open chat in transparent mode
  useEffect(() => {
    if (!transparent) return;
    const handleDblClick = () => setChatOpen(prev => !prev);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) setChatOpen(prev => !prev);
    };
    window.addEventListener('dblclick', handleDblClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('dblclick', handleDblClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [transparent]);

  const [savedPetSize, setSavedPetSize] = useState(300);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!transparent) return;
    setSavedPetSize(window.innerWidth);
    const onResize = () => {
      if (!chatOpen && !reminderOpen) {
        const s = window.innerWidth;
        setSavedPetSize(s);
        (window as any).__petBaseSize = s;
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [transparent, chatOpen, reminderOpen]);

  const electronApi = typeof window !== 'undefined' ? (window as any).electronAPI : null;
  const getBaseSize = () => (window as any).__petBaseSize || savedPetSize;

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    setChatLoading(true);
    lastInteractionRef.current = Date.now();
    const newHistory = [...chatHistory, { role: 'user', content: text }];
    setChatHistory(newHistory.slice(-10));
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: newHistory.slice(-10) }),
      });
      const data = await res.json();
      const reply = data.reply || '...';
      setChatHistory(prev => [...prev, { role: 'assistant', content: reply }]);
      if (data.audioUrl) {
        try {
          const actionState = data.action || 'talking';
          fetch(`${backendUrl}/api/pets/${petId}/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: actionState }),
          }).catch(() => {});
          const audio = new Audio(`${backendUrl}${data.audioUrl}`);
          audio.onended = () => {
            fetch(`${backendUrl}/api/pets/${petId}/state`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ state: 'sitting' }),
            }).catch(() => {});
          };
          audio.play().catch(() => {});
        } catch {}
      }
    } catch {
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatHistory, backendUrl, petId]);

  const handleTouch = useCallback(async () => {
    if (touchLoading || chatLoading || chatOpen || reminderOpen) return;
    setTouchLoading(true);
    lastInteractionRef.current = Date.now();
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/touch`, { method: 'POST' });
      const data = await res.json();
      if (data.audioUrl) {
        const actionState = data.action || 'waving';
        fetch(`${backendUrl}/api/pets/${petId}/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: actionState }),
        }).catch(() => {});
        const audio = new Audio(`${backendUrl}${data.audioUrl}`);
        audio.onended = () => {
          fetch(`${backendUrl}/api/pets/${petId}/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: 'sitting' }),
          }).catch(() => {});
          setTouchLoading(false);
        };
        audio.play().catch(() => setTouchLoading(false));
      } else {
        setTouchLoading(false);
      }
    } catch {
      setTouchLoading(false);
    }
  }, [touchLoading, chatLoading, chatOpen, reminderOpen, backendUrl, petId]);

  const openPanel = (panel: 'chat' | 'reminder' | 'game') => {
    if (panel === 'chat') {
      setChatOpen(!chatOpen);
      setReminderOpen(false);
      setGameOpen(false);
      if (!chatOpen) setTimeout(() => chatInputRef.current?.focus(), 100);
    } else if (panel === 'reminder') {
      setChatOpen(false);
      setGameOpen(false);
      setReminderOpen(!reminderOpen);
    } else if (panel === 'game') {
      setChatOpen(false);
      setReminderOpen(false);
      setGameOpen(!gameOpen);
    }
  };

  const closeAllPanels = () => {
    setChatOpen(false);
    setReminderOpen(false);
    setGameOpen(false);
  };

  // Time awareness
  useEffect(() => {
    if (!transparent) return;
    const getTimeState = () => {
      const h = new Date().getHours();
      const m = new Date().getMinutes();
      const t = h * 60 + m;
      if (t < 420) return 'sleeping';
      if (t < 510) return 'waving';
      if (t < 690) return 'sitting';
      if (t < 780) return 'eating';
      if (t < 1050) return 'sitting';
      if (t < 1140) return 'eating';
      if (t < 1380) return 'sitting';
      return 'sleeping';
    };
    const timer = setInterval(() => {
      const idleMs = Date.now() - lastInteractionRef.current;
      if (idleMs > 30000 && !chatOpen && !reminderOpen && !chatLoading && !touchLoading) {
        const timeState = getTimeState();
        fetch(`${backendUrl}/api/pets/${petId}/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: timeState }),
        }).catch(() => {});
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [transparent, chatOpen, reminderOpen, chatLoading, touchLoading, backendUrl, petId]);

  // ===== Electron transparent mode =====
  if (transparent) {
    const petRatio = chatOpen ? 0.85 : reminderOpen ? 0.6 : gameOpen ? 0.3 : 1;
    const petHeight = `${petRatio * 100}%`;
    const panelHeight = `${(1 - petRatio) * 100}%`;

    return (
      <div style={{ width: '100vw', height: '100vh', background: 'transparent', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: '100%', height: petHeight, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          <PetRenderer backendUrl={backendUrl} petId={petId} transparent onReminder={handleReminder} />
          {reminderToast && (
            <div style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)', zIndex: 300, pointerEvents: 'none', WebkitAppRegion: 'no-drag' } as any}>
              <div style={{ background: 'rgba(0,0,0,0.75)', borderRadius: 12, padding: '6px 14px', maxWidth: 200, textAlign: 'center', backdropFilter: 'blur(8px)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#ffd166', marginBottom: 2 }}>⏰ {reminderToast.label}</div>
                <div style={{ fontSize: 10, color: '#fff', lineHeight: 1.4 }}>{reminderToast.message}</div>
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 100, WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as any}>
            <StatsBar key={statsKey} backendUrl={backendUrl} petId={petId} compact />
          </div>
          {!chatOpen && !reminderOpen && !gameOpen && (
            <div
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, cursor: 'grab', WebkitAppRegion: 'no-drag' } as any}
              onMouseDown={(e) => {
                let lastX = e.screenX;
                let lastY = e.screenY;
                const startTime = Date.now();
                let moved = false;
                const api = (window as any).electronAPI;
                const onMove = (ev: MouseEvent) => {
                  const dx = ev.screenX - lastX;
                  const dy = ev.screenY - lastY;
                  if (!moved && (Math.abs(ev.screenX - e.screenX) > 3 || Math.abs(ev.screenY - e.screenY) > 3)) moved = true;
                  if (moved && api?.moveWindowBy) api.moveWindowBy(dx, dy);
                  lastX = ev.screenX;
                  lastY = ev.screenY;
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                  if (!moved && Date.now() - startTime < 300) handleTouch();
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            />
          )}
          {chatLoading && (
            <div style={{ position: 'absolute', top: '3%', left: '50%', transform: 'translateX(-50%)', zIndex: 200, pointerEvents: 'none' } as any}>
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: '4px 10px' }}>
                <div style={{ fontSize: 10, color: '#fff' }}>🎤 ...</div>
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 4, right: 4, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 100, WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as any}>
            <button onClick={() => openPanel('chat')} title="聊天" style={{
              width: 22, height: 22, borderRadius: '50%', border: 'none',
              background: chatOpen ? '#ff9a76' : 'rgba(255,255,255,0.25)',
              color: '#fff', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }}>💬</button>
            <button onClick={() => openPanel('reminder')} title="提醒" style={{
              width: 22, height: 22, borderRadius: '50%', border: 'none',
              background: reminderOpen ? '#4CAF50' : 'rgba(255,255,255,0.25)',
              color: '#fff', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }}>⏰</button>
            <button onClick={() => openPanel('game')} title="游戏" style={{
              width: 22, height: 22, borderRadius: '50%', border: 'none',
              background: gameOpen ? '#ffd166' : 'rgba(255,255,255,0.25)',
              color: '#fff', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }}>🎮</button>
            <button onClick={() => {
              const api = (window as any).electronAPI;
              if (api) {
                api.showPetWindow && api.closeSetupWindow && (() => {})();
                // Re-open setup window (homepage) via IPC
                if (api.showSetupWindow) {
                  api.showSetupWindow();
                } else {
                  // Fallback: just close pet window, tray will reopen setup
                  window.close();
                }
              } else if (onBack) {
                onBack();
              }
            }} title="返回首页" style={{
              width: 22, height: 22, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.25)',
              color: '#fff', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }}>🏠</button>
          </div>
        </div>
        {chatOpen && (
          <div style={{ height: panelHeight, minHeight: 36, display: 'flex', gap: 4, padding: '3px 6px', alignItems: 'center', background: 'transparent', WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as any}>
            <input ref={chatInputRef} value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } }}
              placeholder="说点什么..." disabled={chatLoading}
              style={{ flex: 1, padding: '0 8px', height: '70%', borderRadius: 8, border: '1px solid rgba(200,200,200,0.4)', background: 'rgba(255,255,255,0.75)', color: '#333', fontSize: 11, outline: 'none' }}
            />
            <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{
              padding: '0 10px', height: '70%', borderRadius: 8, border: 'none',
              background: '#ff9a76', color: '#fff', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
            }}>发送</button>
          </div>
        )}
        {reminderOpen && (
          <div style={{ height: panelHeight, overflow: 'auto', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderRadius: '0 0 10px 10px', padding: '6px 8px', color: '#333', fontSize: 11, WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as any}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
              <button onClick={closeAllPanels} style={{ background: 'none', border: 'none', color: '#999', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
            <ReminderPanel backendUrl={backendUrl} petId={petId} light />
          </div>
        )}
        {gameOpen && (
          <div style={{ height: panelHeight, overflow: 'auto', WebkitAppRegion: 'no-drag', pointerEvents: 'auto', background: 'rgba(20,20,35,0.95)', borderRadius: '12px 12px 0 0' } as any}>
            <GamePanel backendUrl={backendUrl} petId={petId} onClose={closeAllPanels} onStatsChange={() => setStatsKey(k => k + 1)} />
          </div>
        )}
      </div>
    );
  }

  // ===== Browser preview mode — Airbnb white style =====
  const statusColors: Record<CameraStatus, string> = {
    disconnected: '#B0B0B0',
    connecting: '#FFB400',
    connected: '#00A699',
    error: '#C13515',
  };

  return (
    <div style={bStyles.page}>
      {chatOpen && <ChatDialog backendUrl={backendUrl} petId={petId} onClose={() => setChatOpen(false)} />}
      {gameOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 360, height: 500, borderRadius: 20, overflow: 'hidden', background: '#fff', boxShadow: 'rgba(0,0,0,0.1) 0 4px 16px' }}>
            <GamePanel backendUrl={backendUrl} petId={petId} onClose={() => setGameOpen(false)} onStatsChange={() => setStatsKey(k => k + 1)} />
          </div>
        </div>
      )}

      {/* Back button */}
      {onBack && !transparent && (
        <button onClick={onBack} style={{
          position: 'absolute', top: 16, left: 16, zIndex: 100,
          padding: '8px 16px', borderRadius: 20, border: '1.5px solid #EBEBEB',
          background: '#fff', color: '#222222', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>← 返回</button>
      )}

      {/* Pet display area */}
      <div style={bStyles.petArea}>
        <PetRenderer backendUrl={backendUrl} petId={petId} onReminder={handleReminder} />
      </div>

      {/* Action bar */}
      <div style={bStyles.actionBar}>
        <button
          style={{ ...bStyles.pillBtn, ...(chatOpen ? bStyles.pillActive : {}) }}
          onClick={() => setChatOpen(!chatOpen)}
        >💬 对话</button>
        <button style={bStyles.pillBtn} onClick={handleTouch} disabled={touchLoading}>
          👋 互动
        </button>
        <button
          style={{ ...bStyles.pillBtn, ...(gameOpen ? bStyles.pillActive : {}) }}
          onClick={() => setGameOpen(!gameOpen)}
        >🎮 游戏</button>
        <button
          style={{ ...bStyles.pillBtn, ...(reminderOpen ? bStyles.pillActive : {}) }}
          onClick={() => setReminderOpen(!reminderOpen)}
        >⏰ 提醒</button>
        {!!(window as any).electronAPI && (
          <button style={{ ...bStyles.pillBtn, background: '#FF385C', color: '#fff', border: 'none' }} onClick={() => {
            (window as any).electronAPI.showPetWindow(petId);
          }}>🖥 桌面悬浮</button>
        )}
      </div>

      {/* Side panel */}
      <div style={bStyles.sidePanel}>
        <StatsBar key={statsKey} backendUrl={backendUrl} petId={petId} />
        <div style={{ height: 12 }} />
        <DailyTasks backendUrl={backendUrl} petId={petId} onCoinsChange={() => setStatsKey(k => k + 1)} />

        {/* Reminder section */}
        {reminderOpen && (
          <div style={{ marginTop: 12 }}>
            <ReminderPanel backendUrl={backendUrl} petId={petId} />
          </div>
        )}

        {/* Controls */}
        <div style={bStyles.controlSection}>
          <p style={bStyles.sectionTitle}>高级设置</p>

          {/* Mode tabs */}
          <div style={bStyles.tabRow}>
            {(['mock', 'camera'] as const).map(m => (
              <button key={m} style={{ ...bStyles.tabBtn, ...(mode === m ? bStyles.tabActive : {}) }}
                onClick={() => setMode(m)}
              >{m === 'mock' ? '自动演示' : '摄像头'}</button>
            ))}
          </div>

          {mode === 'mock' ? (
            <>
              <div style={bStyles.stateRow}>
                {STATES.map(s => (
                  <button key={s} style={bStyles.stateBtn} onClick={() => setState(s)}>{s}</button>
                ))}
              </div>
              {mockRunning ? (
                <button style={{ ...bStyles.actionBtn, background: '#C13515' }} onClick={stopMock}>停止演示</button>
              ) : (
                <button style={bStyles.actionBtn} onClick={startMock}>开始演示</button>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[cameraStatus] }} />
                <span style={{ fontSize: 12, color: '#717171' }}>{cameraStatus}</span>
              </div>
              {cameraStatus === 'disconnected' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button style={bStyles.actionBtn} onClick={() => startCamera(false)}>连接摄像头</button>
                  <button style={{ ...bStyles.actionBtn, background: '#717171' }} onClick={() => startCamera(true)}>模拟模式</button>
                </div>
              ) : (
                <button style={{ ...bStyles.actionBtn, background: '#C13515' }} onClick={stopCamera}>断开</button>
              )}
            </>
          )}
        </div>

        {/* Downloads */}
        <div style={bStyles.controlSection}>
          <p style={bStyles.sectionTitle}>桌面客户端</p>
          <a href={`${backendUrl}/api/download/mac`} style={bStyles.downloadBtn}>
            macOS 版下载
          </a>
          <p style={{ fontSize: 11, color: '#B0B0B0', margin: '4px 0 8px', lineHeight: 1.4 }}>
            首次打开：右键 App → 打开 → 确认打开
          </p>
          <a href={`${backendUrl}/api/download/win`} style={{ ...bStyles.downloadBtn, background: '#222222' }}>
            Windows 版下载
          </a>
        </div>

        {onBackToSetup && (
          <button style={bStyles.reuploadBtn} onClick={onBackToSetup}>
            更换形象
          </button>
        )}
      </div>
    </div>
  );
}

const bStyles: Record<string, React.CSSProperties> = {
  page: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    background: '#FFFFFF',
    overflow: 'hidden',
  },
  petArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F7F7F7',
    position: 'relative',
  },
  actionBar: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 8,
    padding: '8px 16px',
    background: '#fff',
    borderRadius: 24,
    boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 16px',
    zIndex: 50,
  },
  pillBtn: {
    padding: '8px 16px',
    borderRadius: 20,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#222222',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  pillActive: {
    background: '#FF385C',
    color: '#fff',
    borderColor: '#FF385C',
  },
  sidePanel: {
    width: 280,
    height: '100vh',
    overflowY: 'auto',
    padding: '16px',
    borderLeft: '1px solid #EBEBEB',
    background: '#fff',
    flexShrink: 0,
  },
  controlSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: '1px solid #EBEBEB',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#222222',
    margin: '0 0 10px',
  },
  tabRow: {
    display: 'flex',
    gap: 4,
    marginBottom: 10,
    background: '#F7F7F7',
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    padding: '6px 0',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: '#717171',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabActive: {
    background: '#fff',
    color: '#222222',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
  },
  stateRow: {
    display: 'flex',
    gap: 4,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  stateBtn: {
    padding: '5px 12px',
    borderRadius: 12,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#222222',
    fontSize: 12,
    cursor: 'pointer',
  },
  actionBtn: {
    width: '100%',
    padding: '8px 0',
    borderRadius: 12,
    border: 'none',
    background: '#FF385C',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  downloadBtn: {
    display: 'block',
    width: '100%',
    padding: '10px 0',
    borderRadius: 12,
    border: 'none',
    background: '#FF385C',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
    textDecoration: 'none',
  },
  reuploadBtn: {
    marginTop: 16,
    width: '100%',
    padding: '10px 0',
    borderRadius: 12,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#717171',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
};
