import React from 'react';

interface SpeechBubbleProps {
  message: string;
  onDismiss: () => void;
}

export default function SpeechBubble({ message, onDismiss }: SpeechBubbleProps) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'absolute',
        top: -60,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#fff',
        borderRadius: 12,
        padding: '8px 14px',
        fontSize: 12,
        color: '#333',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        zIndex: 100,
        maxWidth: 200,
        textAlign: 'center',
      }}
    >
      {message}
      <div style={{
        position: 'absolute',
        bottom: -6,
        left: '50%',
        marginLeft: -6,
        width: 0,
        height: 0,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: '6px solid #fff',
      }} />
    </div>
  );
}
