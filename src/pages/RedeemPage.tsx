import React, { useState } from 'react';

interface RedeemPageProps {
  backendUrl: string;
  onSuccess: (petId: string) => void;
  onBack: () => void;
  token?: string;
}

export default function RedeemPage({ backendUrl, onSuccess, onBack, token }: RedeemPageProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError('请填写兑换码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${backendUrl}/api/redeem`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: code.trim(), name: name.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '兑换失败，请检查后重试');
      }

      onSuccess(data.petId);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Icon */}
        <div style={styles.iconWrap}>
          <div style={styles.iconCircle}>
            <span style={styles.iconEmoji}>&#x1F381;</span>
          </div>
        </div>

        <h2 style={styles.title}>激活兑换码</h2>
        <p style={styles.subtitle}>输入专属兑换码，开启你的桌面陪伴之旅</p>

        <div style={styles.inputGroup}>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="兑换码"
            style={{ ...styles.input, ...styles.codeInput }}
            maxLength={8}
            autoFocus
          />

          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="为 TA 取一个名字（选填）"
            style={styles.input}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading || !code.trim()}
          style={{
            ...styles.ctaBtn,
            ...(loading || !code.trim() ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
          }}
        >
          {loading ? '正在激活...' : '立即激活'}
        </button>

        <button onClick={onBack} style={styles.backBtn}>
          &#x2190; 返回
        </button>
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
  iconWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: '#FFECEF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 30,
  },
  title: {
    fontSize: 24,
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
  codeInput: {
    textAlign: 'center',
    letterSpacing: 4,
    fontSize: 18,
    fontWeight: 600,
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
  backBtn: {
    marginTop: 16,
    width: '100%',
    padding: '12px 0',
    borderRadius: 12,
    border: 'none',
    background: 'transparent',
    color: '#717171',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
};
