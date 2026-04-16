import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ReminderData {
  reminderId: string;
  label: string;
  message: string;
  audioUrl?: string | null;
}

interface PetRendererProps {
  backendUrl: string;
  petId: string;
  transparent?: boolean;
  onReminder?: (data: ReminderData) => void;
}

// Base states always shown in controls; extra states are triggered by interactions
const BASE_STATES = ['sitting', 'sleeping', 'eating', 'moving'] as const;

const STATE_LABELS: Record<string, string> = {
  sleeping: '💤 休憩',
  sitting: '🐱 安坐',
  eating: '🍽 进食',
  moving: '🏃 漫步',
  talking: '💬 交谈',
  happy: '😊 愉悦',
  cute: '🥰 撒娇',
  waving: '👋 招呼',
};

export default function PetRenderer({ backendUrl, petId, transparent = false, onReminder }: PetRendererProps) {
  const [currentState, setCurrentState] = useState('sitting');
  const [manifest, setManifest] = useState<any>(null);
  const [hasMatted, setHasMatted] = useState(false);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [allStates, setAllStates] = useState<string[]>([...BASE_STATES]);
  const [loadError, setLoadError] = useState(false);
  const [loadedStates, setLoadedStates] = useState<Set<string>>(new Set(['sitting']));

  const currentStateRef = useRef(currentState);
  currentStateRef.current = currentState;
  const videoElsRef = useRef<Record<string, HTMLVideoElement | null>>({});

  // Load manifest on mount — discover all available states
  useEffect(() => {
    fetch(`${backendUrl}/api/pets/${petId}/manifest?_t=${Date.now()}`)
      .then(r => r.json())
      .then(m => {
        setManifest(m);
        const matted = m?.videos?.matted && Object.keys(m.videos.matted).length > 0;
        if (matted) setHasMatted(true);

        // Discover all states from manifest
        const idleStates = Object.keys(m?.videos?.idle || {});
        const mattedStates = Object.keys(m?.videos?.matted || {});
        const discoveredStates = Array.from(new Set([...idleStates, ...mattedStates]));
        setAllStates(discoveredStates.length > 0 ? discoveredStates : [...BASE_STATES]);

        const cacheBust = `v=${Date.now()}`;
        const urls: Record<string, string> = {};
        for (const state of discoveredStates) {
          if (!m?.videos?.idle?.[state]) continue;
          const mattedPath = m?.videos?.matted?.[state] || '';
          if (matted && mattedPath.endsWith('.webm')) {
            urls[state] = `${backendUrl}/api/pets/${petId}/assets/matted/${state}.webm?${cacheBust}`;
          } else {
            urls[state] = `${backendUrl}/api/pets/${petId}/assets/videos/${state}.mp4?${cacheBust}`;
          }
        }
        setVideoUrls(urls);
      })
      .catch(err => {
        console.error('Failed to load manifest:', err);
        setLoadError(true);
      });
  }, [backendUrl, petId]);

  // Preload base states first, then the rest
  useEffect(() => {
    if (!manifest || Object.keys(videoUrls).length === 0) return;
    // Immediately load base states
    setLoadedStates(new Set(BASE_STATES));
    // After 2s, load all extra states
    const timer = setTimeout(() => {
      setLoadedStates(new Set(allStates));
    }, 2000);
    return () => clearTimeout(timer);
  }, [manifest, videoUrls, allStates]);

  // When a new state is about to be shown, ensure it's loaded
  useEffect(() => {
    setLoadedStates(prev => {
      if (prev.has(currentState)) return prev;
      const next = new Set(prev);
      next.add(currentState);
      return next;
    });
  }, [currentState]);

  const setVideoRef = useCallback((state: string) => (el: HTMLVideoElement | null) => {
    videoElsRef.current[state] = el;
    if (el && state === currentStateRef.current) {
      el.play().catch(() => {});
    }
  }, []);

  // When state changes, play active video, pause others
  useEffect(() => {
    for (const state of allStates) {
      const el = videoElsRef.current[state];
      if (!el) continue;
      if (state === currentState) {
        el.currentTime = 0;
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    }
  }, [currentState, allStates]);

  const switchState = useCallback((newState: string) => {
    if (newState === currentStateRef.current) return;
    setCurrentState(newState);
  }, []);

  // Map state to available video state — fallback if video not available
  const mapToVideoState = useCallback((state: string): string => {
    if (videoUrls[state]) return state;
    // Fallback: moving > sitting
    if (videoUrls['moving']) return 'moving';
    return 'sitting';
  }, [videoUrls]);

  // WebSocket for live state updates
  useEffect(() => {
    const wsUrl = backendUrl.replace('http', 'ws') + '/ws';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', petId }));
      fetch(`${backendUrl}/api/pets/${petId}/mock/start`, { method: 'POST' }).catch(() => {});
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state_change' && data.new_state) {
          switchState(mapToVideoState(data.new_state));
        } else if (data.type === 'reminder' && onReminder) {
          onReminder(data);
        }
      } catch {}
    };

    return () => ws.close();
  }, [backendUrl, petId, switchState, mapToVideoState, onReminder]);

  const wrapperStyle: React.CSSProperties = transparent
    ? { ...styles.wrapper, background: 'transparent', WebkitAppRegion: 'drag' } as any
    : { ...styles.wrapper, background: '#F7F7F7' };

  const stackWidth = transparent ? '100%' : '80%';
  const stackMaxWidth = transparent ? 'none' : 500;
  const stackHeight = transparent ? '100%' : 'auto';
  const stackAspect = transparent ? undefined : '1 / 1';

  const showLoading = transparent && !manifest && !loadError;
  const showError = transparent && loadError;

  return (
    <div style={wrapperStyle}>
      {showLoading && (
        <div style={{ color: '#717171', fontSize: 14, textAlign: 'center', padding: 20, background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          正在加载...
        </div>
      )}
      {showError && (
        <div style={{ color: '#C13515', fontSize: 13, textAlign: 'center', padding: 20, background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          加载失败，请检查网络连接
        </div>
      )}
      <div style={{
        position: 'relative',
        width: stackWidth,
        maxWidth: stackMaxWidth,
        height: stackHeight,
        aspectRatio: stackAspect,
      }}>
        {allStates.map(state => {
          const url = videoUrls[state];
          if (!url) return null;
          if (!loadedStates.has(state)) return null;
          const isActive = state === currentState;
          return (
            <video
              key={state}
              ref={setVideoRef(state)}
              src={url}
              loop
              muted
              playsInline
              autoPlay={isActive}
              preload="auto"
              onError={() => {
                console.error(`Video load error for state: ${state}, url: ${url}`);
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: transparent ? 0 : 16,
                opacity: isActive ? 1 : 0,
                zIndex: isActive ? 1 : 0,
                pointerEvents: isActive ? 'auto' : 'none',
              }}
            />
          );
        })}
      </div>

      {!transparent && (
        <>
          <div style={styles.stateIndicator}>
            {STATE_LABELS[currentState] || currentState}
            {hasMatted && <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.6 }}>✨ alpha</span>}
          </div>

          <div style={styles.controls}>
            {BASE_STATES.map(s => {
              if (!videoUrls[s]) return null;
              return (
                <button
                  key={s}
                  onClick={() => switchState(s)}
                  style={{
                    ...styles.stateBtn,
                    ...(s === currentState ? styles.stateBtnActive : {}),
                  }}
                >
                  {STATE_LABELS[s] || s}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateIndicator: {
    marginTop: 12,
    padding: '6px 16px',
    background: '#fff',
    borderRadius: 20,
    color: '#222222',
    fontSize: 14,
    fontWeight: 500,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
  },
  controls: {
    marginTop: 16,
    display: 'flex',
    gap: 8,
    padding: '8px 16px',
    background: '#fff',
    borderRadius: 24,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
  },
  stateBtn: {
    padding: '8px 16px',
    borderRadius: 12,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#717171',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  stateBtnActive: {
    background: '#FF385C',
    borderColor: '#FF385C',
    color: '#fff',
    fontWeight: 600,
  },
};
