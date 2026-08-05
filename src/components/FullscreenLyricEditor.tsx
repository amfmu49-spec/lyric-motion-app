import React, { useState } from 'react';
import { X, Save, Edit3, List, Play, Check } from 'lucide-react';
import { parseLrc } from '../lib/lrcParser';
import type { LyricLine } from '../lib/lrcParser';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rawLrc: string;
  onSave: (newRawLrc: string, parsedLyrics: LyricLine[]) => void;
  onSeek?: (timeMs: number) => void;
}

export const FullscreenLyricEditor: React.FC<Props> = ({
  isOpen,
  onClose,
  rawLrc,
  onSave,
  onSeek
}) => {
  const [tab, setTab] = useState<'text' | 'list'>('text');
  const [textVal, setTextVal] = useState(rawLrc);
  const [parsed, setParsed] = useState<LyricLine[]>(() => parseLrc(rawLrc));
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTextVal(val);
    setParsed(parseLrc(val));
    setIsSaved(false);
  };

  const handleSave = () => {
    onSave(textVal, parsed);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleLineTextChange = (index: number, newText: string) => {
    const updated = [...parsed];
    updated[index] = { ...updated[index], text: newText };
    setParsed(updated);
    
    // Reconstruct raw LRC
    const newLrc = updated.map(item => {
      const totalSec = item.time / 1000;
      const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const s = (totalSec % 60).toFixed(2).padStart(5, '0');
      return `[${m}:${s}] ${item.text}`;
    }).join('\n');
    setTextVal(newLrc);
    setIsSaved(false);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      backgroundColor: '#0d0e15',
      display: 'flex',
      flexDirection: 'column',
      color: '#fff',
      padding: '1rem',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>全画面歌詞エディタ</h2>
          <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '2px' }}>
            <button
              className="btn"
              onClick={() => setTab('text')}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.85rem',
                backgroundColor: tab === 'text' ? 'var(--primary-color, #3498db)' : 'transparent',
                borderRadius: '6px'
              }}
            >
              <Edit3 size={14} style={{ display: 'inline', marginRight: '4px' }} /> テキスト直接編集
            </button>
            <button
              className="btn"
              onClick={() => setTab('list')}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.85rem',
                backgroundColor: tab === 'list' ? 'var(--primary-color, #3498db)' : 'transparent',
                borderRadius: '6px'
              }}
            >
              <List size={14} style={{ display: 'inline', marginRight: '4px' }} /> 行別調整リスト ({parsed.length}行)
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: isSaved ? '#2ecc71' : 'var(--primary-color, #3498db)',
              padding: '0.5rem 1.25rem',
              fontWeight: 'bold'
            }}
          >
            {isSaved ? <Check size={18} /> : <Save size={18} />}
            {isSaved ? '保存しました！' : '変更を保存'}
          </button>
          <button
            className="btn"
            onClick={onClose}
            style={{
              padding: '0.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="閉じる"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, marginTop: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'text' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
              LRCフォーマット（例: <code>[00:12.34] 歌詞テキスト</code>）で入力できます。タイムタグが無くても改行で自動パースされます。
            </p>
            <textarea
              value={textVal}
              onChange={handleTextChange}
              placeholder="[00:00.00] 歌詞を入力&#10;[00:05.00] ここに次のフレーズ"
              style={{
                flex: 1,
                width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '1rem',
                fontFamily: 'monospace',
                fontSize: '1rem',
                lineHeight: '1.6',
                resize: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
            {parsed.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: '2rem' }}>歌詞が入力されていません。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {parsed.map((line, idx) => {
                  const totalSec = line.time / 1000;
                  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
                  const s = (totalSec % 60).toFixed(2).padStart(5, '0');
                  return (
                    <div
                      key={line.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.6rem 0.8rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <button
                        className="btn"
                        onClick={() => onSeek && onSeek(line.time)}
                        style={{
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.75rem',
                          backgroundColor: 'rgba(255, 255, 255, 0.15)',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          flexShrink: 0
                        }}
                        title="このタイムスタンプへジャンプ"
                      >
                        <Play size={12} /> [{m}:{s}]
                      </button>

                      <input
                        type="text"
                        value={line.text}
                        onChange={(e) => handleLineTextChange(idx, e.target.value)}
                        style={{
                          flex: 1,
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid rgba(255,255,255,0.2)',
                          color: '#fff',
                          padding: '0.3rem',
                          fontSize: '1rem'
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div style={{
        marginTop: '0.75rem',
        paddingTop: '0.5rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.8rem',
        color: 'rgba(255,255,255,0.5)'
      }}>
        <span>総行数: {parsed.length} 行</span>
        <span>Esc キーまたは右上の✕ボタンで閉じます</span>
      </div>
    </div>
  );
};
