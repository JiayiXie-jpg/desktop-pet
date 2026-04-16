import React, { useState, useEffect, useCallback, useRef } from 'react';

interface HomePageProps {
  backendUrl: string;
  onRedeem: () => void;
  onViewPet: (petId: string) => void;
  myPetId?: string;
  username?: string;
  onLogout?: () => void;
  onProfile?: () => void;
  token?: string;
}

interface PetInfo {
  id: string;
  name: string;
  status: string;
  photoUrl: string;
  likes: number;
  mattedMovingUrl: string | null;
  level?: number;
  mood?: number;
  isOnline?: boolean;
  activity?: string | null;
}

function getClientId(): string {
  let id = localStorage.getItem('desktop-pet-client-id');
  if (!id) {
    id = 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16)
    );
    localStorage.setItem('desktop-pet-client-id', id);
  }
  return id;
}

export default function HomePage({ backendUrl, onRedeem, onViewPet, myPetId, username, onLogout, onProfile, token }: HomePageProps) {
  const [pets, setPets] = useState<PetInfo[]>([]);
  const [totalMyLikes, setTotalMyLikes] = useState(0);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');
  const [giftTarget, setGiftTarget] = useState<string | null>(null);
  const [hoveredPet, setHoveredPet] = useState<string | null>(null);
  const clientId = useRef(getClientId());
  const isElectron = !!(window as any).electronAPI;
  const isCompact = isElectron || window.innerWidth < 700;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleVisit = async (e: React.MouseEvent, targetPetId: string) => {
    e.stopPropagation();
    if (!myPetId) { showToast('先创建你的专属陪伴吧'); return; }
    try {
      const res = await fetch(`${backendUrl}/api/pets/${targetPetId}/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorPetId: myPetId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`串门成功！经验 +10，心情 +5`);
      } else if (data.error === 'Visit limit reached') {
        showToast('今天的串门次数已用完，明天再来吧');
      }
    } catch { showToast('网络开小差了，再试一次'); }
  };

  const handleGift = async (e: React.MouseEvent, targetPetId: string, itemId: string) => {
    e.stopPropagation();
    if (!myPetId) { showToast('先创建你的专属陪伴吧'); return; }
    try {
      const res = await fetch(`${backendUrl}/api/pets/${targetPetId}/gift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPetId: myPetId, itemId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`送出${data.itemName}！`);
        setGiftTarget(null);
      } else {
        showToast(data.error || '赠送失败，请稍后重试');
      }
    } catch { showToast('网络开小差了，再试一次'); }
  };

  const fetchPets = useCallback(() => {
    fetch(`${backendUrl}/api/pets?clientId=${clientId.current}`)
      .then(r => r.json())
      .then(data => {
        setPets((data.pets || []).filter((p: PetInfo) => p.status === 'ready'));
        setTotalMyLikes(data.totalMyLikes || 0);
      })
      .catch(() => {});
  }, [backendUrl]);

  useEffect(() => { fetchPets(); }, [fetchPets]);

  const handleLike = async (e: React.MouseEvent, petId: string) => {
    e.stopPropagation();
    if (totalMyLikes >= 3) return;

    setPets(prev => prev.map(p =>
      p.id === petId ? { ...p, likes: p.likes + 1 } : p
    ));
    setTotalMyLikes(prev => prev + 1);

    setAnimatingIds(prev => new Set(prev).add(petId));
    setTimeout(() => setAnimatingIds(prev => {
      const next = new Set(prev);
      next.delete(petId);
      return next;
    }), 400);

    try {
      const resp = await fetch(`${backendUrl}/api/pets/${petId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.current }),
      });
      const data = await resp.json();
      setPets(prev => prev.map(p =>
        p.id === petId ? { ...p, likes: data.likes } : p
      ));
      setTotalMyLikes(data.totalMyLikes);
    } catch {
      setPets(prev => prev.map(p =>
        p.id === petId ? { ...p, likes: p.likes - 1 } : p
      ));
      setTotalMyLikes(prev => prev - 1);
    }
  };

  const moodEmoji = (mood: number) => mood >= 70 ? '😊' : mood >= 40 ? '😐' : '😢';
  const moodLabel = (mood: number) => mood >= 70 ? '愉悦' : mood >= 40 ? '平静' : '低落';

  return (
    <div style={styles.page}>
      <style>{cssAnimations}</style>

      {/* Toast */}
      {toast && (
        <div style={styles.toastWrap}>
          <div style={styles.toast}>{toast}</div>
        </div>
      )}

      {/* Top Nav */}
      <div style={styles.nav}>
        <div style={{ ...styles.navInner, ...(isCompact ? { padding: '6px 10px' } : {}) }}>
          <div style={styles.logoArea}>
            <span style={{ ...styles.logoIcon, ...(isCompact ? { fontSize: 13 } : {}) }}>&#x1F43E;</span>
            <span style={{ ...styles.logoText, ...(isCompact ? { fontSize: 12 } : {}) }}>桌面陪伴</span>
          </div>
          {username && (
            <div style={{ ...styles.userArea, ...(isCompact ? { gap: 6 } : {}) }}>
              <div style={{ ...styles.avatar, ...(isCompact ? { width: 20, height: 20, fontSize: 9 } : {}) }}>{username.charAt(0).toUpperCase()}</div>
              {!isCompact && <span style={styles.userName}>{username}</span>}
              <button style={{ ...styles.navBtn, ...(isCompact ? { fontSize: 10, padding: '3px 8px' } : {}) }} onClick={onProfile}>设置</button>
              <button style={{ ...styles.navBtn, ...(isCompact ? { fontSize: 10, padding: '3px 8px' } : {}) }} onClick={onLogout}>退出</button>
            </div>
          )}
        </div>
      </div>

      {/* Hero section */}
      <div style={{ ...styles.hero, ...(isCompact ? { padding: '10px 12px 6px' } : {}) }}>
        <h1 style={{ ...styles.heroTitle, ...(isCompact ? { fontSize: 15, marginBottom: 0 } : {}) }}>探索陪伴世界</h1>
        {!isCompact && <p style={styles.heroSub}>每一位桌面伙伴都独一无二，找到属于你的那份陪伴</p>}
      </div>

      {/* Pet grid */}
      <div style={{ ...styles.gridWrap, ...(isCompact ? { padding: '0 8px 70px' } : {}) }}>
        {pets.length === 0 ? (
          <div style={styles.empty}>
            <span style={{ fontSize: 48 }}>&#x1F43E;</span>
            <p style={{ color: '#717171', marginTop: 12, fontSize: 15 }}>这里还空空的，去创建你的第一位伙伴吧</p>
          </div>
        ) : (
          <div style={{ ...styles.grid, ...(isCompact ? { gap: 6 } : {}) }}>
            {pets.map(pet => {
              const isHovered = hoveredPet === pet.id;
              const isMine = pet.id === myPetId;
              return (
                <div
                  key={pet.id}
                  style={{
                    ...styles.card,
                    ...(isHovered ? styles.cardHover : {}),
                    ...(isMine ? styles.cardMine : {}),
                  }}
                  onClick={() => onViewPet(pet.id)}
                  onMouseEnter={() => setHoveredPet(pet.id)}
                  onMouseLeave={() => { setHoveredPet(null); setGiftTarget(null); }}
                >
                  {/* Pet media */}
                  <div style={styles.mediaWrap}>
                    {pet.mattedMovingUrl ? (
                      <video
                        src={`${backendUrl}${pet.mattedMovingUrl}`}
                        autoPlay loop muted playsInline
                        style={styles.media}
                      />
                    ) : (
                      <img
                        src={`${backendUrl}${pet.photoUrl}`}
                        alt={pet.name}
                        style={styles.media}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    {/* Level badge */}
                    <span style={styles.levelBadge}>Lv.{pet.level || 1}</span>
                    {/* Online indicator */}
                    {pet.isOnline && <span style={styles.onlineBadge}>在线</span>}
                    {isMine && <span style={styles.mineBadge}>我的</span>}
                  </div>

                  {/* Info */}
                  <div style={{ ...styles.cardBody, ...(isCompact ? { padding: '4px 6px' } : {}) }}>
                    <div style={styles.cardRow}>
                      <span style={{ ...styles.petName, ...(isCompact ? { fontSize: 10, maxWidth: 50 } : {}) }}>{pet.name}</span>
                      <div style={styles.moodWrap}>
                        <span style={{ fontSize: isCompact ? 10 : 14 }}>{moodEmoji(pet.mood || 50)}</span>
                        {!isCompact && <span style={styles.moodText}>{moodLabel(pet.mood || 50)}</span>}
                      </div>
                    </div>

                    {/* Like + social */}
                    <div style={styles.cardFooter}>
                      <button
                        style={{
                          ...styles.likeBtn,
                          ...(isCompact ? { fontSize: 10 } : {}),
                          ...(totalMyLikes >= 3 ? { opacity: 0.4, cursor: 'default' } : {}),
                        }}
                        className={animatingIds.has(pet.id) ? 'heart-pop' : ''}
                        onClick={(e) => handleLike(e, pet.id)}
                        disabled={totalMyLikes >= 3}
                      >
                        {pet.likes > 0 ? '❤️' : '🤍'} {pet.likes > 0 ? pet.likes : ''}
                      </button>

                      {myPetId && !isMine && (
                        <div style={styles.socialBtns}>
                          <button onClick={(e) => handleVisit(e, pet.id)} style={{ ...styles.socialBtn, ...(isCompact ? { fontSize: 10, padding: '3px 6px' } : {}) }}>👋 {isCompact ? '' : '串门'}</button>
                          <button onClick={(e) => { e.stopPropagation(); setGiftTarget(giftTarget === pet.id ? null : pet.id); }} style={{ ...styles.socialBtn, ...(isCompact ? { fontSize: 10, padding: '3px 6px' } : {}) }}>🎁 {isCompact ? '' : '赠礼'}</button>
                        </div>
                      )}
                    </div>

                    {/* Gift menu */}
                    {giftTarget === pet.id && (
                      <div style={styles.giftMenu} onClick={e => e.stopPropagation()}>
                        {[
                          { id: 'snack', emoji: '🍖', name: '小食', price: 10 },
                          { id: 'toy_ball', emoji: '🎾', name: '玩具', price: 20 },
                          { id: 'stardust', emoji: '✨', name: '星光', price: 50 },
                          { id: 'golden_bone', emoji: '🦴', name: '至宝', price: 100 },
                          { id: 'love_letter', emoji: '💌', name: '心意', price: 0 },
                        ].map(item => (
                          <button key={item.id} onClick={(e) => handleGift(e, pet.id, item.id)} style={styles.giftItem}>
                            <span style={{ fontSize: 18 }}>{item.emoji}</span>
                            <span style={styles.giftLabel}>{item.price > 0 ? `${item.price}🪙` : '免费'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div style={{ ...styles.bottomBar, ...(isCompact ? { padding: '8px 10px' } : {}) }}>
        <button style={{ ...styles.ctaBtn, ...(isCompact ? { fontSize: 11, padding: '8px 20px' } : {}) }} onClick={onRedeem}>
          + 创建新的桌面伙伴
        </button>
      </div>
    </div>
  );
}

const cssAnimations = `
  @keyframes heartPop {
    0% { transform: scale(1); }
    30% { transform: scale(1.4); }
    60% { transform: scale(0.9); }
    100% { transform: scale(1); }
  }
  .heart-pop {
    animation: heartPop 0.4s ease !important;
  }
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    background: '#FFFFFF',
  },

  /* Nav */
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: '#FFFFFF',
    borderBottom: '1px solid #EBEBEB',
  },
  navInner: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    fontSize: 18,
  },
  logoText: {
    fontSize: 15,
    fontWeight: 700,
    color: '#FF385C',
    letterSpacing: -0.3,
  },
  userArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#FFECEF',
    color: '#FF385C',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
  },
  userName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#222222',
  },
  navBtn: {
    padding: '5px 12px',
    borderRadius: 20,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#222222',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },

  /* Hero */
  hero: {
    textAlign: 'center',
    padding: '24px 20px 16px',
    maxWidth: 600,
    margin: '0 auto',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#222222',
    margin: '0 0 6px',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 13,
    color: '#717171',
    margin: 0,
    lineHeight: 1.5,
  },

  /* Grid */
  gridWrap: {
    flex: 1,
    maxWidth: 960,
    margin: '0 auto',
    padding: '0 20px 100px',
    width: '100%',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
  },

  /* Card */
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    background: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s, transform 0.2s',
  },
  cardHover: {
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    transform: 'translateY(-2px)',
  },
  cardMine: {
    border: '2px solid #FF385C',
  },

  /* Media */
  mediaWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '1',
    background: '#F7F7F7',
    overflow: 'hidden',
  },
  media: {
    width: '85%',
    height: '85%',
    objectFit: 'contain',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  levelBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: 'rgba(0,0,0,0.5)',
    padding: '1px 6px',
    borderRadius: 10,
    backdropFilter: 'blur(4px)',
  },
  onlineBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 9,
    fontWeight: 600,
    color: '#fff',
    background: '#00A699',
    padding: '1px 6px',
    borderRadius: 10,
  },
  mineBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    fontSize: 9,
    fontWeight: 600,
    color: '#FF385C',
    background: '#FFECEF',
    padding: '1px 6px',
    borderRadius: 10,
  },

  /* Card body */
  cardBody: {
    padding: '8px 10px',
  },
  cardRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  petName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#222222',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 80,
  },
  moodWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  moodText: {
    fontSize: 11,
    color: '#717171',
  },

  /* Footer */
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  likeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    padding: '2px 4px',
    color: '#222222',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  socialBtns: {
    display: 'flex',
    gap: 6,
  },
  socialBtn: {
    padding: '4px 10px',
    borderRadius: 12,
    border: '1px solid #EBEBEB',
    background: '#fff',
    color: '#222222',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  /* Gift menu */
  giftMenu: {
    display: 'flex',
    gap: 6,
    marginTop: 10,
    padding: '10px 0 4px',
    borderTop: '1px solid #EBEBEB',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  giftItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    background: '#F7F7F7',
    border: 'none',
    borderRadius: 12,
    padding: '8px 10px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  giftLabel: {
    fontSize: 10,
    color: '#717171',
    fontWeight: 500,
  },

  /* Toast */
  toastWrap: {
    position: 'fixed',
    top: 70,
    left: 0,
    right: 0,
    zIndex: 9999,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  toast: {
    background: '#222222',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 500,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  },

  /* Bottom CTA */
  bottomBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '16px 20px',
    background: 'linear-gradient(transparent, #fff 30%)',
    display: 'flex',
    justifyContent: 'center',
    zIndex: 90,
  },
  ctaBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#FF385C',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(255,56,92,0.3)',
    transition: 'background 0.2s',
    letterSpacing: 0.3,
  },
};
