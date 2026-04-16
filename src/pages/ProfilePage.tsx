import React, { useState } from 'react';

interface ProfilePageProps {
  backendUrl: string;
  token: string;
  username: string;
  petIds: string[];
  onBack: () => void;
  onUsernameChange: (newName: string) => void;
  onLogout: () => void;
}

export default function ProfilePage({ backendUrl, token, username, petIds, onBack, onUsernameChange, onLogout }: ProfilePageProps) {
  const [newUsername, setNewUsername] = useState(username);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [loading, setLoading] = useState(false);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleUpdateUsername = async () => {
    if (!newUsername.trim() || newUsername.trim() === username) return;
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/me/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUsernameChange(data.username);
      showMsg('昵称已更新', 'success');
    } catch (err: any) {
      showMsg(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!oldPassword || !newPassword) {
      showMsg('请填写当前密码和新密码', 'error');
      return;
    }
    if (newPassword.length < 4) {
      showMsg('新密码至少 4 个字符', 'error');
      return;
    }
    if (newPassword !== confirmPwd) {
      showMsg('两次输入的密码不一致', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/me/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ oldPassword, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOldPassword('');
      setNewPassword('');
      setConfirmPwd('');
      showMsg('密码修改成功', 'success');
    } catch (err: any) {
      showMsg(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <button onClick={onBack} style={styles.backBtn}>← 返回</button>
          <span style={styles.headerTitle}>账号与设置</span>
          <div style={{ width: 60 }} />
        </div>

        {msg && (
          <div style={{ ...styles.msg, color: msgType === 'success' ? '#00A699' : '#C13515' }}>
            {msg}
          </div>
        )}

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>昵称</h3>
          <input
            type="text"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            style={styles.input}
            placeholder="输入新昵称"
          />
          <button
            onClick={handleUpdateUsername}
            disabled={loading || !newUsername.trim() || newUsername.trim() === username}
            style={{
              ...styles.saveBtn,
              ...(loading || !newUsername.trim() || newUsername.trim() === username ? { opacity: 0.4 } : {}),
            }}
          >保存</button>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>安全设置</h3>
          <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} style={styles.input} placeholder="当前密码" />
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={styles.input} placeholder="新密码" />
          <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} style={styles.input} placeholder="确认新密码" />
          <button
            onClick={handleUpdatePassword}
            disabled={loading}
            style={{ ...styles.saveBtn, ...(loading ? { opacity: 0.4 } : {}) }}
          >修改密码</button>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>我的伙伴</h3>
          <p style={styles.info}>已创建 {petIds.length} 位伙伴</p>
        </div>

        <button onClick={onLogout} style={styles.logoutBtn}>退出账号</button>
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
    padding: '24px 28px 32px',
    width: 400,
    boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    border: 'none',
    background: 'none',
    color: '#FF385C',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#222222',
  },
  msg: {
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center' as const,
    marginBottom: 14,
    padding: '8px 14px',
    borderRadius: 12,
    background: '#F7F7F7',
  },
  section: {
    marginBottom: 20,
    padding: '16px',
    background: '#F7F7F7',
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#222222',
    margin: '0 0 12px 0',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1.5px solid #EBEBEB',
    fontSize: 14,
    marginBottom: 8,
    boxSizing: 'border-box' as const,
    outline: 'none',
    color: '#222222',
  },
  saveBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 12,
    border: 'none',
    background: '#FF385C',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  info: {
    fontSize: 14,
    color: '#717171',
    margin: 0,
  },
  logoutBtn: {
    width: '100%',
    padding: '12px 0',
    borderRadius: 12,
    border: '1.5px solid #C13515',
    background: 'transparent',
    color: '#C13515',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
