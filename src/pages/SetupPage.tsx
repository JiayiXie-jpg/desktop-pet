import React, { useState, useRef } from 'react';

interface SetupPageProps {
  backendUrl: string;
  petId: string;
  onStartGeneration: () => void;
  onLaunchPet: () => void;
  onBackToPet?: () => void;
}

export default function SetupPage({ backendUrl, petId, onStartGeneration, onLaunchPet, onBackToPet }: SetupPageProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleSubmit = async () => {
    if (!photo) {
      setError('Please select a pet photo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('photo', photo);

      const res = await fetch(`${backendUrl}/api/pets/${petId}/generate`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }

      onStartGeneration();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <div style={styles.iconCircle}>
            <span style={{ fontSize: 32 }}>📸</span>
          </div>
        </div>

        <h1 style={styles.title}>上传形象照片</h1>
        <p style={styles.subtitle}>选一张最有灵气的照片，AI 会赋予 TA 生命</p>

        <div
          style={{
            ...styles.uploadArea,
            ...(preview ? styles.uploadAreaWithPreview : {}),
          }}
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="Pet" style={styles.previewImg} />
          ) : (
            <div style={styles.uploadPlaceholder}>
              <span style={styles.uploadIcon}>+</span>
              <span>点击选择照片</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading || !photo}
          style={{
            ...styles.button,
            ...(loading || !photo ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
          }}
        >
          {loading ? '创建中...' : '开始生成'}
        </button>

        {onBackToPet && (
          <button onClick={onBackToPet} style={styles.backBtn}>
            返回
          </button>
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
    padding: '40px 32px',
    width: 400,
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
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#222222',
    margin: '0 0 6px 0',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: '#717171',
    margin: '0 0 24px 0',
  },
  uploadArea: {
    width: '100%',
    aspectRatio: '1',
    maxWidth: 280,
    margin: '0 auto 20px',
    borderRadius: 20,
    border: '2px dashed #EBEBEB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
    background: '#F7F7F7',
    transition: 'border-color 0.2s',
  },
  uploadAreaWithPreview: {
    border: '2px solid #FF385C',
  },
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  uploadPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    color: '#B0B0B0',
    fontSize: 14,
  },
  uploadIcon: {
    fontSize: 48,
    fontWeight: 300,
    color: '#EBEBEB',
  },
  error: {
    color: '#C13515',
    fontSize: 13,
    margin: '0 0 12px 0',
    fontWeight: 500,
  },
  button: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 12,
    border: 'none',
    background: '#FF385C',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: 0.3,
  },
  backBtn: {
    marginTop: 12,
    width: '100%',
    padding: '12px 0',
    borderRadius: 12,
    border: '1.5px solid #EBEBEB',
    background: '#fff',
    color: '#717171',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
};
