import React, { useState, useEffect, useCallback } from 'react';

interface Reminder {
  id: string;
  petId: string;
  label: string;
  message: string;
  type: 'fixed' | 'interval';
  time?: string;
  intervalMinutes?: number;
  enabled: boolean;
  createdAt: string;
}

interface ReminderPanelProps {
  backendUrl: string;
  petId: string;
  light?: boolean;
}

export default function ReminderPanel({ backendUrl, petId, light = false }: ReminderPanelProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Reminder>>({});

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/reminders`);
      const data = await res.json();
      setReminders(data);
    } catch {}
  }, [backendUrl, petId]);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  const toggleEnabled = async (r: Reminder) => {
    await fetch(`${backendUrl}/api/pets/${petId}/reminders/${r.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !r.enabled }),
    });
    fetchReminders();
  };

  const deleteReminder = async (id: string) => {
    await fetch(`${backendUrl}/api/pets/${petId}/reminders/${id}`, { method: 'DELETE' });
    fetchReminders();
  };

  const startEdit = (r?: Reminder) => {
    if (r) {
      setForm({ label: r.label, message: r.message, type: r.type, time: r.time, intervalMinutes: r.intervalMinutes });
      setEditing(r.id);
    } else {
      setForm({ label: '', message: '', type: 'fixed', time: '12:00', intervalMinutes: 60 });
      setEditing('new');
    }
  };

  const saveEdit = async () => {
    if (!form.label || !form.message) return;
    const body: any = { label: form.label, message: form.message, type: form.type };
    if (form.type === 'fixed') body.time = form.time;
    else body.intervalMinutes = form.intervalMinutes;

    if (editing === 'new') {
      await fetch(`${backendUrl}/api/pets/${petId}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch(`${backendUrl}/api/pets/${petId}/reminders/${editing}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    setEditing(null);
    fetchReminders();
  };

  const c = light
    ? { text: '#333', sub: '#555', muted: '#888', inputBg: '#fff', inputBorder: '#ddd', itemBg: 'rgba(0,0,0,0.04)', onBg: '#4CAF50', offBg: '#ccc' }
    : { text: '#eee', sub: '#bbb', muted: '#888', inputBg: 'rgba(255,255,255,0.08)', inputBorder: 'rgba(255,255,255,0.15)', itemBg: 'rgba(255,255,255,0.06)', onBg: '#4CAF50', offBg: '#555' };

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: c.text }}>{editing === 'new' ? '添加提醒' : '修改提醒'}</span>
          <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: c.muted, fontSize: 14, cursor: 'pointer' }}>✕</button>
        </div>
        <input
          style={{ ...inputStyle, background: c.inputBg, borderColor: c.inputBorder, color: c.text }}
          value={form.label || ''} onChange={e => setForm({ ...form, label: e.target.value })}
          placeholder="名称，如：午餐时间"
        />
        <input
          style={{ ...inputStyle, background: c.inputBg, borderColor: c.inputBorder, color: c.text }}
          value={form.message || ''} onChange={e => setForm({ ...form, message: e.target.value })}
          placeholder="提醒内容，如：该休息一下啦～"
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['fixed', 'interval'] as const).map(t => (
            <button key={t} onClick={() => setForm({ ...form, type: t })} style={{
              flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 10, cursor: 'pointer',
              border: `1px solid ${c.inputBorder}`,
              background: form.type === t ? c.onBg : 'transparent',
              color: form.type === t ? '#fff' : c.muted,
              fontWeight: form.type === t ? 600 : 400,
            }}>{t === 'fixed' ? '定时' : '间隔'}</button>
          ))}
        </div>
        {form.type === 'fixed' ? (
          <input style={{ ...inputStyle, background: c.inputBg, borderColor: c.inputBorder, color: c.text }} type="time" value={form.time || '12:00'} onChange={e => setForm({ ...form, time: e.target.value })} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: c.sub }}>每</span>
            <input style={{ ...inputStyle, flex: 1, marginBottom: 0, background: c.inputBg, borderColor: c.inputBorder, color: c.text }} type="number" min={1} value={form.intervalMinutes || 60} onChange={e => setForm({ ...form, intervalMinutes: parseInt(e.target.value) || 60 })} />
            <span style={{ fontSize: 10, color: c.sub }}>分钟</span>
          </div>
        )}
        <button onClick={saveEdit} style={{
          padding: '6px 0', borderRadius: 6, border: 'none', background: '#4CAF50',
          color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 2,
        }}>保存</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: c.text }}>日程提醒</span>
        <button onClick={() => startEdit()} style={{
          padding: '2px 8px', borderRadius: 6, border: `1px solid ${c.inputBorder}`,
          background: c.inputBg, color: '#4CAF50', fontSize: 10, cursor: 'pointer', fontWeight: 500,
        }}>+ 添加</button>
      </div>
      {reminders.length === 0 && (
        <div style={{ fontSize: 11, color: c.muted, textAlign: 'center', padding: 12 }}>还没有提醒，点击添加</div>
      )}
      {reminders.map(r => (
        <div key={r.id} style={{
          background: c.itemBg, borderRadius: 8, padding: '6px 8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => toggleEnabled(r)} style={{
              padding: '2px 6px', borderRadius: 4, border: 'none', fontSize: 9, fontWeight: 600,
              cursor: 'pointer', color: '#fff',
              background: r.enabled ? c.onBg : c.offBg,
            }}>{r.enabled ? 'ON' : 'OFF'}</button>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: r.enabled ? c.text : c.muted }}>{r.label}</span>
            <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', color: c.muted, fontSize: 12, cursor: 'pointer', padding: '0 2px' }}>✎</button>
            <button onClick={() => deleteReminder(r.id)} style={{ background: 'none', border: 'none', color: c.muted, fontSize: 12, cursor: 'pointer', padding: '0 2px' }}>✕</button>
          </div>
          <div style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>
            {r.type === 'fixed' ? `每天 ${r.time}` : `每 ${r.intervalMinutes} 分钟`} · {r.message.length > 20 ? r.message.slice(0, 20) + '...' : r.message}
          </div>
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: '1px solid',
  fontSize: 11,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  marginBottom: 2,
};
