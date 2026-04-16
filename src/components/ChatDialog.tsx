import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatDialogProps {
  backendUrl: string;
  petId: string;
  onClose: () => void;
  embedded?: boolean;
}

export default function ChatDialog({ backendUrl, petId, onClose, embedded = false }: ChatDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch(`${backendUrl}/api/pets/${petId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: newMessages.slice(-10) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
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
      setMessages(prev => [...prev, { role: 'assistant', content: '消息发送失败，请再试一次' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const animStyles = `
    @keyframes chatIn {
      0% { transform: translateY(10px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    .chat-typing::after {
      content: '';
      animation: dots 1.5s infinite;
    }
    @keyframes dots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60%, 100% { content: '...'; }
    }
  `;

  if (embedded) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'rgba(20,20,35,0.95)',
        borderRadius: '12px 12px 0 0',
        display: 'flex', flexDirection: 'column' as const,
        overflow: 'hidden',
      }}>
        <style>{animStyles}</style>
        <div style={styles.header}>
          <span>对话</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div ref={scrollRef} style={styles.messages}>
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#999', fontSize: 12, padding: 20 }}>
              说些什么，TA 会认真倾听
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              <div style={{ ...styles.bubble, ...(m.role === 'user' ? styles.userBubble : styles.petBubble) }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
              <div style={{ ...styles.bubble, ...styles.petBubble }}>
                <span className="chat-typing">正在回复</span>
              </div>
            </div>
          )}
        </div>
        <div style={styles.inputRow}>
          <input
            style={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="想和 TA 说..."
            autoFocus
          />
          <button style={styles.sendBtn} onClick={send} disabled={loading || !input.trim()}>
            发送
          </button>
        </div>
      </div>
    );
  }

  // Overlay mode — Airbnb white bubble style
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <style>{animStyles}</style>
        <div style={styles.dialogHeader}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#222222' }}>对话</span>
          <button style={styles.dialogClose} onClick={onClose}>✕</button>
        </div>
        <div ref={scrollRef} style={styles.dialogMessages}>
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#B0B0B0', fontSize: 13, padding: 30 }}>
              说些什么，TA 会认真倾听
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
              <div style={{
                ...styles.dialogBubble,
                ...(m.role === 'user' ? styles.dialogUserBubble : styles.dialogPetBubble),
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{ ...styles.dialogBubble, ...styles.dialogPetBubble }}>
                <span className="chat-typing">正在回复</span>
              </div>
            </div>
          )}
        </div>
        <div style={styles.dialogInputRow}>
          <input
            style={styles.dialogInput}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="想和 TA 说..."
            autoFocus
          />
          <button
            style={{
              ...styles.dialogSend,
              ...(loading || !input.trim() ? { opacity: 0.4 } : {}),
            }}
            onClick={send}
            disabled={loading || !input.trim()}
          >发送</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  /* Embedded mode (Electron) — keep dark theme */
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    color: '#ddd',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 4px',
  },
  messages: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '10px 12px',
  },
  bubble: {
    maxWidth: '80%',
    padding: '6px 10px',
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'break-word' as const,
  },
  userBubble: {
    background: 'rgba(255,154,118,0.3)',
    color: '#fff',
    borderBottomRightRadius: 4,
  },
  petBubble: {
    background: 'rgba(255,255,255,0.12)',
    color: '#eee',
    borderBottomLeftRadius: 4,
  },
  inputRow: {
    display: 'flex',
    gap: 6,
    padding: '8px 10px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: 12,
    outline: 'none',
  },
  sendBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: '#ff9a76',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },

  /* Overlay mode — Airbnb white */
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  } as any,
  dialog: {
    width: 360,
    height: 480,
    background: '#fff',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 16px',
    animation: 'chatIn 0.25s ease',
    overflow: 'hidden',
  },
  dialogHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    borderBottom: '1px solid #EBEBEB',
  },
  dialogClose: {
    background: 'none',
    border: 'none',
    color: '#717171',
    fontSize: 18,
    cursor: 'pointer',
    padding: '0 4px',
  },
  dialogMessages: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px',
  },
  dialogBubble: {
    maxWidth: '80%',
    padding: '10px 14px',
    borderRadius: 16,
    fontSize: 14,
    lineHeight: 1.6,
    wordBreak: 'break-word' as const,
  },
  dialogUserBubble: {
    background: '#FF385C',
    color: '#fff',
    borderBottomRightRadius: 4,
  },
  dialogPetBubble: {
    background: '#F7F7F7',
    color: '#222222',
    borderBottomLeftRadius: 4,
  },
  dialogInputRow: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid #EBEBEB',
  },
  dialogInput: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 12,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#222222',
    fontSize: 14,
    outline: 'none',
  },
  dialogSend: {
    padding: '10px 18px',
    borderRadius: 12,
    border: 'none',
    background: '#FF385C',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
