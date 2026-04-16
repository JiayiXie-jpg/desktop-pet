import React, { useState } from 'react';

interface LoginPageProps {
  backendUrl: string;
  onLogin: (token: string, userId: string, username: string, petIds: string[]) => void;
  onGoRedeem: () => void;
}

export default function LoginPage({ backendUrl, onLogin, onGoRedeem }: LoginPageProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('请填写用户名和密码');
      return;
    }

    if (tab === 'register') {
      if (username.trim().length < 2 || username.trim().length > 20) {
        setError('用户名需要 2-20 个字符');
        return;
      }
      if (password.trim().length < 4) {
        setError('密码至少需要 4 个字符');
        return;
      }
      if (password !== confirmPwd) {
        setError('两次输入的密码不一致');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = tab === 'login' ? '/api/login' : '/api/register';
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败，请稍后重试');
      onLogin(data.token, data.userId, data.username, data.petIds || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Logo area */}
        <div style={styles.logoWrap}>
          <div style={styles.logoCircle}>
            <span style={styles.logoEmoji}>&#x1F43E;</span>
          </div>
        </div>

        <h1 style={styles.title}>桌面陪伴</h1>
        <p style={styles.subtitle}>让你在意的 TA，以最可爱的方式常驻桌面</p>

        {/* Pill tabs */}
        <div style={styles.tabWrap}>
          <div style={styles.tabBg}>
            <button
              style={{
                ...styles.tabBtn,
                ...(tab === 'login' ? styles.tabActive : {}),
              }}
              onClick={() => { setTab('login'); setError(''); }}
            >登录</button>
            <button
              style={{
                ...styles.tabBtn,
                ...(tab === 'register' ? styles.tabActive : {}),
              }}
              onClick={() => { setTab('register'); setError(''); }}
            >注册</button>
          </div>
        </div>

        {/* Inputs */}
        <div style={styles.inputGroup}>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="用户名"
            style={styles.input}
            autoFocus
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="密码"
            style={styles.input}
          />
          {tab === 'register' && (
            <input
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="确认密码"
              style={styles.input}
            />
          )}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            ...styles.ctaBtn,
            ...(loading ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
          }}
        >
          {loading ? '请稍候...' : tab === 'login' ? '登录' : '创建账号'}
        </button>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>或</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Redeem link */}
        <button onClick={onGoRedeem} style={styles.redeemBtn}>
          使用兑换码激活
        </button>

        {tab === 'login' && (
          <p style={styles.hint}>
            已有宠物？用宠物名称 + 兑换码即可登录
          </p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#FFF8F6',
    padding: 20,
  },
  card: {
    background: '#fff',
    borderRadius: 24,
    padding: '40px 32px 32px',
    width: 380,
    textAlign: 'center',
    boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 16px',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: '#FFECEF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: {
    fontSize: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: '#222222',
    margin: '0 0 6px 0',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#717171',
    margin: '0 0 24px 0',
    lineHeight: 1.5,
  },
  tabWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 20,
  },
  tabBg: {
    display: 'flex',
    background: '#F7F7F7',
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  tabBtn: {
    padding: '8px 28px',
    border: 'none',
    borderRadius: 10,
    background: 'transparent',
    color: '#717171',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    background: '#fff',
    color: '#222222',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 16,
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1.5px solid #EBEBEB',
    fontSize: 15,
    color: '#222222',
    background: '#fff',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  },
  error: {
    color: '#C13515',
    fontSize: 13,
    margin: '0 0 12px 0',
    fontWeight: 500,
  },
  ctaBtn: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 12,
    border: 'none',
    background: '#FF385C',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
    letterSpacing: 0.3,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '20px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: '#EBEBEB',
  },
  dividerText: {
    fontSize: 12,
    color: '#B0B0B0',
  },
  redeemBtn: {
    width: '100%',
    padding: '12px 0',
    borderRadius: 12,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#222222',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  hint: {
    fontSize: 12,
    color: '#B0B0B0',
    marginTop: 16,
  },
};
