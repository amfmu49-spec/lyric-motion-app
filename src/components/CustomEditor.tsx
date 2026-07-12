import React from 'react';
import type { LyricLine } from '../lib/lrcParser';
import type { CustomConfigMap, LineConfig, CharacterConfig } from '../types';
import { FONTS } from '../types';

interface LeftProps {
  lyrics: LyricLine[];
  customConfigs: CustomConfigMap;
  currentTime: number;
  selectedLineId: string | null;
  onLineClick: (line: LyricLine) => void;
}

export const CustomLeftPanel: React.FC<LeftProps> = ({ lyrics, customConfigs, currentTime, selectedLineId, onLineClick }) => {
  const activeLineIndex = lyrics.findIndex((l, i) => {
    const nextTime = i + 1 < lyrics.length ? lyrics[i + 1].time : Infinity;
    return currentTime >= l.time && currentTime < nextTime;
  });

  return (
    <div className="custom-left-sidebar glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '40vh', overflow: 'hidden' }}>
      <h3 style={{ padding: '1rem', margin: 0, borderBottom: '1px solid var(--panel-border)', fontSize: '1rem' }}>歌詞タイムライン</h3>
      <div className="lyric-list" style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {lyrics.map((line, idx) => (
          <div 
            key={line.id} 
            onClick={() => onLineClick(line)}
            style={{ 
              padding: '0.75rem 0.5rem', 
              cursor: 'pointer', 
              backgroundColor: selectedLineId === line.id ? 'var(--primary-color)' : (idx === activeLineIndex ? 'rgba(255,255,255,0.1)' : 'transparent'),
              borderBottom: '1px solid var(--panel-border)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.9rem'
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.text || '(空行)'}</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{customConfigs[line.id] ? '✏️' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface RightProps {
  lyrics: LyricLine[];
  customConfigs: CustomConfigMap;
  setCustomConfigs: React.Dispatch<React.SetStateAction<CustomConfigMap>>;
  selectedLineId: string | null;
  selectedCharIndex: number | null;
  onCharClick: (index: number) => void;
  onClearCharSelection: () => void;
}

export const CustomRightPanel: React.FC<RightProps> = ({ 
  lyrics, customConfigs, setCustomConfigs, 
  selectedLineId, selectedCharIndex, onCharClick, onClearCharSelection 
}) => {
  const selectedLine = lyrics.find(l => l.id === selectedLineId);
  const lineConfig = selectedLineId ? customConfigs[selectedLineId] || {} : {};
  const charConfig = (selectedLineId && selectedCharIndex !== null && lineConfig.chars) ? (lineConfig.chars[selectedCharIndex] || {}) : {};

  const updateLineConfig = (updates: Partial<LineConfig>) => {
    if (!selectedLineId) return;
    setCustomConfigs(prev => ({
      ...prev,
      [selectedLineId]: { ...prev[selectedLineId], ...updates }
    }));
  };

  const updateCharConfig = (updates: Partial<CharacterConfig>) => {
    if (!selectedLineId || selectedCharIndex === null) return;
    setCustomConfigs(prev => {
      const lineConf = prev[selectedLineId] || {};
      const chars = { ...lineConf.chars };
      chars[selectedCharIndex] = { ...chars[selectedCharIndex], ...updates };
      return {
        ...prev,
        [selectedLineId]: { ...lineConf, chars }
      };
    });
  };

  const clearLineConfig = () => {
    if (!selectedLineId) return;
    setCustomConfigs(prev => {
      const next = { ...prev };
      delete next[selectedLineId];
      return next;
    });
    onClearCharSelection();
  };

  const clearCharConfig = () => {
    if (!selectedLineId || selectedCharIndex === null) return;
    setCustomConfigs(prev => {
      const lineConf = prev[selectedLineId];
      if (!lineConf || !lineConf.chars) return prev;
      const chars = { ...lineConf.chars };
      delete chars[selectedCharIndex];
      return {
        ...prev,
        [selectedLineId]: { ...lineConf, chars }
      };
    });
  };

  if (!selectedLine) {
    return (
      <div className="custom-right-sidebar glass-panel" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>左のリストから編集したい行を選択してください。</p>
      </div>
    );
  }

  return (
    <div className="custom-right-sidebar glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ padding: '1rem', margin: 0, borderBottom: '1px solid var(--panel-border)', fontSize: '1rem' }}>演出エディタ</h3>
      
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Line Config Panel */}
        <div className="line-config" style={{ padding: '1rem', border: '1px solid var(--primary-color)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ margin: 0 }}>行の設定</h4>
            <button className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={clearLineConfig}>リセット</button>
          </div>
          
          <div className="control-group" style={{ marginBottom: '0.5rem' }}>
            <label>モーション</label>
            <select className="select-input" value={lineConfig.motionType || ''} onChange={e => updateLineConfig({ motionType: e.target.value || undefined })}>
              <option value="">(EASY設定に従う)</option>
              <option value="telop">番組テロップ風 (Telop)</option>
              <option value="slide-up">スライドアップ (Slide-Up)</option>
              <option value="cinematic">シネマティック (Cinematic)</option>
              <option value="typewriter">タイプライター (Typewriter)</option>
              <option value="vocaloid">ボカロ風 (Kinetic)</option>
              <option value="bounce">ポップ＆バウンス (Bounce)</option>
            </select>
          </div>
          <div className="control-group" style={{ marginBottom: '0.5rem' }}>
            <label>フォント</label>
            <select className="select-input" value={lineConfig.fontFamily || ''} onChange={e => updateLineConfig({ fontFamily: e.target.value || undefined })}>
              <option value="">(EASY設定に従う)</option>
              {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
            </select>
          </div>
          <div className="control-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label>色</label>
              <input type="color" className="color-input" value={lineConfig.textColor || '#ffffff'} onChange={e => updateLineConfig({ textColor: e.target.value })} style={{ height: '32px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label>サイズ倍率 (x)</label>
              <input type="number" step="0.1" className="text-input" value={lineConfig.fontSize || 1.0} onChange={e => updateLineConfig({ fontSize: parseFloat(e.target.value) || 1.0 })} style={{ padding: '0.2rem' }} />
            </div>
          </div>
        </div>

        {/* Character Config Panel */}
        <div className="char-config" style={{ padding: '1rem', border: '1px solid #e74c3c', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>文字ごとの設定</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>文字をクリックして個別設定</p>
          <div className="char-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '1rem' }}>
            {selectedLine.text.split('').map((char, i) => (
              <button 
                key={i} 
                onClick={() => onCharClick(i)}
                style={{
                  padding: '0.5rem',
                  fontSize: '1.2rem',
                  backgroundColor: selectedCharIndex === i ? '#e74c3c' : (lineConfig.chars && lineConfig.chars[i] ? 'rgba(231, 76, 60, 0.3)' : 'transparent'),
                  border: '1px solid var(--panel-border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: 'white'
                }}
              >
                {char}
              </button>
            ))}
          </div>

          {selectedCharIndex !== null && (
            <div className="char-edit-form" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--panel-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h5 style={{ margin: 0 }}>「{selectedLine.text[selectedCharIndex]}」の設定</h5>
                <button className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={clearCharConfig}>クリア</button>
              </div>
              
              <div className="control-group" style={{ marginBottom: '0.5rem' }}>
                <label>モーション上書き</label>
                <select className="select-input" value={charConfig.motionType || ''} onChange={e => updateCharConfig({ motionType: e.target.value || undefined })}>
                  <option value="">(行設定に従う)</option>
                  <option value="slide-up">スライドアップ</option>
                  <option value="bounce">バウンス</option>
                  <option value="vocaloid">ボカロ風</option>
                </select>
              </div>
              <div className="control-group" style={{ marginBottom: '0.5rem' }}>
                <label>フォント</label>
                <select className="select-input" value={charConfig.fontFamily || ''} onChange={e => updateCharConfig({ fontFamily: e.target.value || undefined })}>
                  <option value="">(行設定に従う)</option>
                  {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                </select>
              </div>
              <div className="control-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label>色</label>
                  <input type="color" className="color-input" value={charConfig.textColor || '#ffffff'} onChange={e => updateCharConfig({ textColor: e.target.value })} style={{ height: '32px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>サイズ倍率 (x)</label>
                  <input type="number" step="0.1" className="text-input" value={charConfig.fontSize || 1.0} onChange={e => updateCharConfig({ fontSize: parseFloat(e.target.value) || 1.0 })} style={{ padding: '0.2rem' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
