import React, { useState, useEffect } from 'react';

interface LandingPageProps {
  backendUrl: string;
  onGoLogin: () => void;
}

interface PetPreview {
  id: string;
  name: string;
  mattedMovingUrl: string | null;
  photoUrl: string;
}

const FEATURES = [
  { icon: '🖥', title: '桌面悬浮陪伴', desc: '透明窗口悬浮在桌面，随时陪在你身边' },
  { icon: '🗣', title: 'AI 语音聊天', desc: '专属声音和性格，像朋友一样聊天' },
  { icon: '🎮', title: '趣味小游戏', desc: '记忆挑战、快速点击、猜拳对战' },
  { icon: '📈', title: '每日成长系统', desc: '打卡升级、每日任务、排行榜竞争' },
];

export default function LandingPage({ backendUrl, onGoLogin }: LandingPageProps) {
  const [pets, setPets] = useState<PetPreview[]>([]);

  // Curated showcase: mix of real photos and anime-style pets
  const SHOWCASE_IDS = ['zafkhxri', 't6ura6ab', 'default', '7iwnvs7e'];

  useEffect(() => {
    fetch(`${backendUrl}/api/pets`)
      .then(r => r.json())
      .then(data => {
        const all = (data.pets || []).filter((p: any) => p.status === 'ready' && p.mattedMovingUrl);
        const curated = SHOWCASE_IDS
          .map(id => all.find((p: any) => p.id === id))
          .filter(Boolean);
        setPets(curated.length >= 3 ? curated : all.slice(0, 4));
      })
      .catch(() => {});
  }, [backendUrl]);

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <div style={s.logoArea}>
            <span style={{ fontSize: 20 }}>🐾</span>
            <span style={s.logoText}>桌面陪伴</span>
          </div>
          <button onClick={onGoLogin} style={s.loginBtn}>登录</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={s.hero}>
        <h1 style={s.heroTitle}>让你在意的 TA，以最可爱的方式常驻桌面</h1>
        <p style={s.heroSub}>
          上传一张照片，AI 生成专属动画形象，TA 会在你的桌面上陪你工作、聊天、玩游戏
        </p>

        {/* Pet showcase */}
        {pets.length > 0 && (
          <div style={s.showcase}>
            {pets.map(pet => (
              <div key={pet.id} style={s.showcaseItem}>
                <video
                  src={`${backendUrl}${pet.mattedMovingUrl}`}
                  autoPlay loop muted playsInline
                  style={s.showcaseVideo}
                />
                <span style={s.showcaseName}>{pet.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Download buttons */}
        <div style={s.downloadArea}>
          <a href={`${backendUrl}/api/download/mac`} style={s.dlBtnMac}>
             macOS 下载
          </a>
          <a href={`${backendUrl}/api/download/win`} style={s.dlBtnWin}>
            🪟 Windows 下载
          </a>
        </div>
        <p style={s.dlTip}>
          macOS 首次打开：右键点击 App → 打开 → 确认打开
        </p>
      </section>

      {/* Features */}
      <section style={s.featSection}>
        <h2 style={s.featTitle}>你的专属桌面伙伴</h2>
        <div style={s.featGrid}>
          {FEATURES.map(f => (
            <div key={f.title} style={s.featCard}>
              <span style={s.featIcon}>{f.icon}</span>
              <h3 style={s.featCardTitle}>{f.title}</h3>
              <p style={s.featCardDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={s.howSection}>
        <h2 style={s.featTitle}>三步开始</h2>
        <div style={s.howSteps}>
          <div style={s.howStep}>
            <div style={s.howNum}>1</div>
            <p style={s.howText}>下载安装桌面客户端</p>
          </div>
          <div style={s.howArrow}>→</div>
          <div style={s.howStep}>
            <div style={s.howNum}>2</div>
            <p style={s.howText}>输入兑换码，上传照片</p>
          </div>
          <div style={s.howArrow}>→</div>
          <div style={s.howStep}>
            <div style={s.howNum}>3</div>
            <p style={s.howText}>AI 生成动画，开始陪伴</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={s.footer}>
        <p style={s.footerText}>
          已有账号？
          <button onClick={onGoLogin} style={s.footerLink}>去登录</button>
        </p>
        <p style={{ fontSize: 11, color: '#B0B0B0', marginTop: 8 }}>© 2026 桌面陪伴 Desktop Pet</p>
      </footer>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    minHeight: '100vh',
    background: '#FFFFFF',
    overflow: 'auto',
  },

  // Nav
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(12px)',
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
  logoText: {
    fontSize: 16,
    fontWeight: 700,
    color: '#FF385C',
    letterSpacing: -0.3,
  },
  loginBtn: {
    padding: '8px 20px',
    borderRadius: 20,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#222222',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },

  // Hero
  hero: {
    textAlign: 'center',
    padding: '60px 20px 40px',
    maxWidth: 700,
    margin: '0 auto',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: '#222222',
    margin: '0 0 16px',
    letterSpacing: -0.5,
    lineHeight: 1.3,
  },
  heroSub: {
    fontSize: 16,
    color: '#717171',
    margin: '0 0 32px',
    lineHeight: 1.6,
  },

  // Showcase
  showcase: {
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 40,
    flexWrap: 'wrap',
  },
  showcaseItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  showcaseVideo: {
    width: 120,
    height: 120,
    objectFit: 'contain',
    borderRadius: 16,
    background: '#F7F7F7',
  },
  showcaseName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#717171',
  },

  // Download
  downloadArea: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  dlBtnMac: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '14px 32px',
    borderRadius: 12,
    border: 'none',
    background: '#FF385C',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    boxShadow: '0 4px 16px rgba(255,56,92,0.3)',
    transition: 'background 0.2s',
  },
  dlBtnWin: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '14px 32px',
    borderRadius: 12,
    border: 'none',
    background: '#222222',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    transition: 'background 0.2s',
  },
  dlTip: {
    fontSize: 12,
    color: '#B0B0B0',
    marginTop: 12,
  },

  // Features
  featSection: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '40px 20px 48px',
  },
  featTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#222222',
    textAlign: 'center',
    marginBottom: 28,
    letterSpacing: -0.3,
  },
  featGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
  },
  featCard: {
    background: '#F7F7F7',
    borderRadius: 20,
    padding: '28px 20px',
    textAlign: 'center',
    transition: 'box-shadow 0.2s, transform 0.2s',
  },
  featIcon: {
    fontSize: 36,
    display: 'block',
    marginBottom: 12,
  },
  featCardTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#222222',
    margin: '0 0 8px',
  },
  featCardDesc: {
    fontSize: 13,
    color: '#717171',
    margin: 0,
    lineHeight: 1.5,
  },

  // How it works
  howSection: {
    maxWidth: 700,
    margin: '0 auto',
    padding: '0 20px 48px',
  },
  howSteps: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  howStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  howNum: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#FFECEF',
    color: '#FF385C',
    fontSize: 18,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howText: {
    fontSize: 13,
    color: '#222222',
    fontWeight: 500,
    margin: 0,
    textAlign: 'center',
  },
  howArrow: {
    fontSize: 20,
    color: '#B0B0B0',
    fontWeight: 300,
  },

  // Footer
  footer: {
    textAlign: 'center',
    padding: '32px 20px',
    borderTop: '1px solid #EBEBEB',
  },
  footerText: {
    fontSize: 14,
    color: '#717171',
    margin: 0,
  },
  footerLink: {
    background: 'none',
    border: 'none',
    color: '#FF385C',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    marginLeft: 4,
  },
};
