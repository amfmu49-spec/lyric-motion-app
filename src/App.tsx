import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, FileAudio, FileText, ImageIcon, Edit3, MonitorPlay, Loader2, Settings, Maximize, Minimize } from 'lucide-react';
import { CanvasRenderer } from './components/CanvasRenderer';
import type { CanvasRendererRef } from './components/CanvasRenderer';
import { parseLrc } from './lib/lrcParser';
import type { LyricLine } from './lib/lrcParser';
import './App.css';
import { FONTS } from './types';
import type { AppSettings } from './types';
import { CustomLeftPanel, CustomRightPanel } from './components/CustomEditor';
import { VideoExporter } from './lib/VideoExporter';

function App() {
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [rawLrc, setRawLrc] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [bgMediaUrl, setBgMediaUrl] = useState<string | null>(null);
  const [bgMediaType, setBgMediaType] = useState<'image' | 'video'>('image');
  const [bgFileName, setBgFileName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioFileName, setAudioFileName] = useState('');
  const [lrcFileName, setLrcFileName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [exportedBlob, setExportedBlob] = useState<{ blob: Blob, url: string } | null>(null);
  
  // Mode Selection
  const [appMode, setAppMode] = useState<'EASY' | 'CUSTOM'>('EASY');
  const [customConfigs, setCustomConfigs] = useState<import('./types').CustomConfigMap>({});
  
  // Custom Mode Editor State
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedCharIndex, setSelectedCharIndex] = useState<number | null>(null);
  
  const [settings, setSettings] = useState<AppSettings>({
    motionType: 'telop',
    fontFamily: "'Noto Sans JP', sans-serif",
    fontSize: 48,
    autoSize: true,
    textColor: '#ffffff',
    autoColor: false,
    beatSyncIntensity: 1,
    aspectRatio: '16:9',
    songTitle: '',
    artistName: '',
    overlayStyle: 'none',
    visualizerType: 'none',
    visualizerColor: '#ffffff',
    visualizerSensitivity: 1.0,
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const reqRef = useRef<number>(0);
  const playerAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<CanvasRendererRef>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const exporterRef = useRef<any>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const initAudioContext = () => {
    if (!audioContextRef.current && audioRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const dest = ctx.createMediaStreamDestination();
      destRef.current = dest;

      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(dest);
      analyser.connect(ctx.destination);
      
      sourceRef.current = source;
    }
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  useEffect(() => {
    const renderLoop = () => {
      if (isPlaying && audioRef.current) {
        setCurrentTime(audioRef.current.currentTime * 1000);
      }

      // Render Loop inside App.tsx only updates preview time


      reqRef.current = requestAnimationFrame(renderLoop);
    };

    if (isPlaying) {
      initAudioContext();
      reqRef.current = requestAnimationFrame(renderLoop);
    }
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [isPlaying]);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setAudioFileName(file.name);
      setIsPlaying(false);
      setCurrentTime(0);
      if (sourceRef.current) {
         sourceRef.current.disconnect();
         sourceRef.current = null;
      }
    }
  };

  const handleLrcUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      setRawLrc(text);
      setLyrics(parseLrc(text));
      setLrcFileName(file.name);
    }
  };

  const handleLrcTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRawLrc(text);
    setLyrics(parseLrc(text));
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setBgMediaUrl(url);
      const isVideo = file.type.startsWith('video/');
      setBgMediaType(isVideo ? 'video' : 'image');
      setBgFileName(file.name);

      if (isVideo) {
        const vid = document.createElement('video');
        vid.src = url;
        vid.onloadedmetadata = () => {
          if (vid.videoHeight > vid.videoWidth) {
            setSettings(prev => ({ ...prev, aspectRatio: '9:16' }));
          } else {
            setSettings(prev => ({ ...prev, aspectRatio: '16:9' }));
          }
        };
      } else {
        const img = new window.Image();
        img.src = url;
        img.onload = () => {
          if (img.height > img.width) {
            setSettings(prev => ({ ...prev, aspectRatio: '9:16' }));
          } else {
            setSettings(prev => ({ ...prev, aspectRatio: '16:9' }));
          }
        };
      }
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const getDimensions = (ratio: string) => {
    switch (ratio) {
      case '9:16': return { width: 1080, height: 1920 };
      case '1:1': return { width: 1080, height: 1080 };
      case '16:9': default: return { width: 1920, height: 1080 };
    }
  };

  const startExport = async () => {
    if (!canvasRef.current || !audioUrl) {
      alert('準備が完了していません。音源を選択してください。');
      return;
    }

    try {
      setIsRecording(true);
      setRenderProgress(0);
      setExportedBlob(null); // Reset previous export

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Create exporter
      exporterRef.current = new VideoExporter(
        canvasRef.current as HTMLCanvasElement,
        (timeMs) => canvasRef.current?.renderFrame(timeMs),
        arrayBuffer, // Actually we need the original ArrayBuffer to decode again? Wait, we can pass arrayBuffer directly.
        decodedBuffer.duration
      );

      const blob = await exporterRef.current.export((progress: number) => {
         setRenderProgress(Math.floor(progress * 100));
      });

      // Export finished
      const url = URL.createObjectURL(blob);
      setExportedBlob({ blob, url });
      
      setIsRecording(false);
      setRenderProgress(null);
      exporterRef.current = null;

    } catch (err: any) {
      console.error(err);
      if (err.message !== "Aborted") {
        alert(`動画生成中にエラーが発生しました。\n詳細: ${err.message || err}`);
      }
      setIsRecording(false);
      setRenderProgress(null);
      exporterRef.current = null;
    }
  };

  const downloadFromOPFS = async (fileName: string) => {
    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    } catch (err) {
      console.error("Failed to download from OPFS", err);
      alert("ファイルの保存に失敗しました。");
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
  };

  const stopExport = async () => {
    setIsRecording(false);
    setIsConverting(true); // Show "Encoding..." 
    
    if (exporterRef.current) {
      await exporterRef.current.stop();
      exporterRef.current = null;
    } else if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    if (isRecording && exporterRef.current) {
      stopExport();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time * 1000);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getAudioEnergy = () => {
    if (!analyserRef.current) return 0;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    let bassSum = 0;
    for(let i=0; i<10; i++) {
      bassSum += dataArray[i];
    }
    return (bassSum / 10) / 255;
  };

  return (
    <div className="app-container">
      <div className={`main-content ${appMode === 'CUSTOM' ? 'layout-custom' : 'layout-easy'}`}>
        
        {appMode === 'CUSTOM' && (
          <CustomLeftPanel 
            lyrics={lyrics}
            customConfigs={customConfigs}
            currentTime={currentTime}
            selectedLineId={selectedLineId}
            onLineClick={(line) => {
               setSelectedLineId(line.id);
               setSelectedCharIndex(null);
               if (audioRef.current) {
                 audioRef.current.currentTime = line.time / 1000;
                 setCurrentTime(line.time);
               }
            }}
          />
        )}

        <div className="player-section">
          <div className="preview-container">
            <div className={`player-area ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={playerAreaRef} data-aspect={settings.aspectRatio}>
              <button 
                className="glass-panel"
                onClick={() => setIsFullscreen(!isFullscreen)} 
                style={{
                  position: 'absolute', 
                  bottom: '1rem', 
                  right: '1rem', 
                  zIndex: 100, 
                  padding: '0.5rem', 
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,255,255,0.2)'
                }}
              >
                {isFullscreen ? <Minimize size={20} color="#fff" /> : <Maximize size={20} color="#fff" />}
              </button>
              {audioUrl ? (
                <>
                <CanvasRenderer 
                  ref={canvasRef}
                  lyrics={lyrics} 
                  currentTime={currentTime} 
                  settings={settings}
                  customConfigs={appMode === 'CUSTOM' ? customConfigs : undefined}
                  getAudioEnergy={getAudioEnergy}
                  bgMediaUrl={bgMediaUrl}
                  bgMediaType={bgMediaType}
                />
                <canvas ref={exportCanvasRef} style={{ display: 'none' }} />
              </>
              ) : (
                <div className="placeholder">
                  <MonitorPlay size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                  <p>1. コントロールパネルから音源を選択してください</p>
                  <p>2. LRC または SRT 形式の字幕ファイルを選択してください</p>
                </div>
              )}
            </div>
          </div>

          <div className="audio-controls glass-panel" style={{ padding: '0.5rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              
              <button 
                className="btn btn-primary" 
                onClick={togglePlay}
                disabled={!audioUrl || isRecording || isConverting}
                style={{ padding: '0', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                title={isPlaying ? "停止" : "再生"}
              >
                {isPlaying && !isRecording ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
              </button>

              <input 
                type="range" 
                className="range-input" 
                min="0" 
                max={audioDuration || 100}
                step="0.1"
                value={audioRef.current ? audioRef.current.currentTime : 0}
                onChange={handleSeek}
                disabled={!audioUrl || isRecording || isConverting}
                style={{ flex: 1, margin: 0 }}
              />

              <button 
                className="btn" 
                onClick={isRecording ? stopExport : startExport}
                disabled={!audioUrl || isConverting}
                style={{ padding: '0', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', border: `2px solid ${isRecording ? '#ff4444' : (isConverting ? '#f39c12' : 'rgba(0, 0, 0, 0.2)')}`, flexShrink: 0 }}
                title={isRecording ? "レンダリング停止" : "レンダリング開始"}
              >
                {isConverting ? (
                  <Loader2 size={16} className="animate-spin" style={{ color: '#f39c12' }} />
                ) : isRecording ? (
                  <div style={{ width: '12px', height: '12px', backgroundColor: '#ff4444', borderRadius: '2px' }} />
                ) : (
                  <div style={{ width: '14px', height: '14px', backgroundColor: '#ff4444', borderRadius: '50%' }} />
                )}
              </button>

            </div>
            
            <div className="status-indicator" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', padding: '0 0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: isRecording ? '#ff4444' : (isConverting ? '#f39c12' : 'var(--text-secondary)') }}>
                {isRecording ? (renderProgress !== null ? `動画生成中... ${renderProgress}%` : '● リアルタイム録画中...') : (isConverting ? '動画変換中...' : '待機中')}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {formatTime(currentTime)} / {formatTime(audioDuration * 1000)}
              </span>
            </div>

            {exportedBlob && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: 'rgba(46, 204, 113, 0.1)', border: '1px solid #2ecc71', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ color: '#2ecc71', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>✅ 動画の生成が完了しました！</p>
                  
                  {navigator.share && navigator.canShare && navigator.canShare({ files: [new File([exportedBlob.blob], 'video.mp4', { type: 'video/mp4' })] }) ? (
                    <button 
                      className="btn btn-primary" 
                      style={{ width: '100%', backgroundColor: '#2ecc71', color: '#000', fontWeight: 'bold' }}
                      onClick={async () => {
                        try {
                          await navigator.share({
                            files: [new File([exportedBlob.blob], `lyric_motion_${Date.now()}.mp4`, { type: 'video/mp4' })],
                            title: 'LyricMotion Video'
                          });
                        } catch (err) {
                          console.log('Share cancelled', err);
                        }
                      }}
                    >
                      📷 カメラロールに保存する
                    </button>
                  ) : (
                    <a 
                      href={exportedBlob.url} 
                      download={`lyric_motion_${Date.now()}.mp4`}
                      className="btn btn-primary" 
                      style={{ width: '100%', display: 'block', textDecoration: 'none', backgroundColor: '#2ecc71', color: '#000', fontWeight: 'bold' }}
                    >
                      ⬇️ 動画をダウンロード
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {audioUrl && (
            <audio 
              ref={audioRef} 
              src={audioUrl} 
              onEnded={handleAudioEnded}
              onLoadedMetadata={() => {
                if (audioRef.current) setAudioDuration(audioRef.current.duration);
              }}
              crossOrigin="anonymous"
              style={{ display: 'none' }}
            />
          )}
        </div>

        <div className="controls-sidebar">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button 
              className={`btn ${appMode === 'EASY' ? 'btn-primary' : ''}`} 
              onClick={() => setAppMode('EASY')}
              style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem', backgroundColor: appMode === 'EASY' ? 'var(--primary-color)' : 'transparent', border: '1px solid var(--primary-color)' }}
            >
              EASY MODE
            </button>
            <button 
              className={`btn ${appMode === 'CUSTOM' ? 'btn-primary' : ''}`} 
              onClick={() => setAppMode('CUSTOM')}
              style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem', backgroundColor: appMode === 'CUSTOM' ? '#e74c3c' : 'transparent', border: '1px solid #e74c3c' }}
            >
              CUSTOM MODE
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <div className="file-input-wrapper">
                <button className="btn btn-primary" style={{ width: '100%', padding: '0.5rem' }} title={audioFileName || '1. 音源'}><FileAudio size={16}/> 音源</button>
                <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac" onChange={handleAudioUpload} />
              </div>
              <div className="file-input-wrapper">
                <button className="btn btn-primary" style={{ width: '100%', padding: '0.5rem' }} title={bgFileName || '2. 背景'}><ImageIcon size={16}/> 背景</button>
                <input type="file" accept="image/*,video/*,.jpg,.jpeg,.png,.mp4,.mov" onChange={handleBgUpload} />
              </div>
              <div className="file-input-wrapper">
                <button className="btn btn-primary" style={{ width: '100%', padding: '0.5rem' }} title={lrcFileName || '3. 歌詞'}><FileText size={16}/> 歌詞</button>
                <input type="file" onChange={handleLrcUpload} />
              </div>
            </div>
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem' }}><Edit3 size={14} style={{display:'inline', verticalAlign:'middle'}}/> 歌詞を直接編集する</summary>
              <textarea 
                className="text-input" 
                value={rawLrc} 
                onChange={handleLrcTextChange}
                placeholder="[00:00.00] 歌詞を入力&#10;改行も反映されます"
                style={{ width: '100%', height: '120px', marginTop: '0.5rem', resize: 'vertical' }}
              />
            </details>
          </div>

          {appMode === 'EASY' ? (
            <>
              {/* Settings */}
              <div className="control-group">
                <label><Settings size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }}/> 画面比率 (Aspect Ratio)</label>
                <select 
                  className="select-input"
                  value={settings.aspectRatio}
                  onChange={(e) => setSettings({...settings, aspectRatio: e.target.value as any})}
                >
                  <option value="16:9">16:9 (YouTube / 横画面)</option>
                  <option value="9:16">9:16 (TikTok / 縦画面)</option>
                </select>
              </div>

              <div className="control-group">
                <label><Settings size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }}/> モーション (Motion)</label>
                <select 
                  className="select-input"
                  value={settings.motionType}
                  onChange={(e) => setSettings({...settings, motionType: e.target.value as any})}
                >
                  <option value="auto">★ AIオートディレクター (Auto Sync)</option>
                  <option value="mix">★ 全自動ミックス (Auto Mix)</option>
                  <option value="telop">番組テロップ風 (Telop)</option>
                  <option value="slide-up">スライドアップ (Slide-Up)</option>
                  <option value="cinematic">シネマティック (Cinematic)</option>
                  <option value="typewriter">タイプライター (Typewriter)</option>
                  <option value="vocaloid">ボカロ風 (Kinetic)</option>
                  <option value="bounce">ポップ＆バウンス (Bounce)</option>
                </select>
              </div>

              <div className="control-group">
                <label>フォント (Font)</label>
                <select 
                  className="select-input"
                  value={settings.fontFamily}
                  onChange={(e) => setSettings({...settings, fontFamily: e.target.value})}
                >
                  <option value="auto">★ 自動選択 (Auto Font)</option>
                  {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                </select>
              </div>

              <div className="control-group">
                <label>
                  ベースサイズ (Size): {settings.autoSize ? '自動 (最大化)' : `${settings.fontSize}px`}
                  <span style={{float:'right'}}>
                    <input type="checkbox" checked={settings.autoSize} onChange={(e) => setSettings({...settings, autoSize: e.target.checked})} /> 自動最大化
                  </span>
                </label>
                <input 
                  type="range" 
                  className="range-input" 
                  min="24" max="120" 
                  value={settings.fontSize}
                  onChange={(e) => setSettings({...settings, fontSize: parseInt(e.target.value)})}
                  disabled={settings.autoSize}
                  style={{ opacity: settings.autoSize ? 0.5 : 1 }}
                />
              </div>

              <div className="control-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label>
                    文字色
                    <span style={{float:'right'}}>
                      <input type="checkbox" checked={settings.autoColor} onChange={(e) => setSettings({...settings, autoColor: e.target.checked})} /> 自動
                    </span>
                  </label>
                  <input 
                    type="color" 
                    className="color-input" 
                    value={settings.textColor}
                    onChange={(e) => setSettings({...settings, textColor: e.target.value})}
                    disabled={settings.autoColor}
                    style={{ opacity: settings.autoColor ? 0.5 : 1 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>ビート同期</label>
                  <input 
                    type="range" 
                    className="range-input" 
                    min="0" max="2" step="0.1"
                    title={`同期強度: ${settings.beatSyncIntensity}`}
                    value={settings.beatSyncIntensity}
                    onChange={(e) => setSettings({...settings, beatSyncIntensity: parseFloat(e.target.value)})}
                  />
                </div>
              </div>

              <div className="control-group" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginTop: '1rem' }}>
                <label style={{ color: '#d97706', fontWeight: 'bold' }}>MVスタイル (Advanced Options)</label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="select-input"
                    style={{ fontSize: '0.85rem' }}
                    placeholder="曲名 (Song Title)" 
                    value={settings.songTitle} 
                    onChange={e => setSettings({...settings, songTitle: e.target.value})}
                  />
                  <input 
                    type="text" 
                    className="select-input"
                    style={{ fontSize: '0.85rem' }}
                    placeholder="アーティスト名 (Artist Name)" 
                    value={settings.artistName} 
                    onChange={e => setSettings({...settings, artistName: e.target.value})}
                  />
                </div>
              </div>

              <div className="control-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>オーバーレイ</label>
                  <select 
                    className="select-input" 
                    style={{ fontSize: '0.8rem' }}
                    value={settings.overlayStyle}
                    onChange={e => setSettings({...settings, overlayStyle: e.target.value as any})}
                  >
                    <option value="none">なし (None)</option>
                    <option value="intro">イントロ (Intro)</option>
                    <option value="corner">コーナー (Corner)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ビジュアライザー</label>
                  <select 
                    className="select-input" 
                    style={{ fontSize: '0.8rem' }}
                    value={settings.visualizerType}
                    onChange={e => setSettings({...settings, visualizerType: e.target.value as any})}
                  >
                    <option value="none">なし (None)</option>
                    <option value="particles">パーティクル (Particles)</option>
                    <option value="waveform">波形 (Waveform)</option>
                    <option value="bars">バー (Bars)</option>
                    <option value="circle">サークル波形 (Circle Wave)</option>
                    <option value="grid">サイバーグリッド (Cyber Grid)</option>
                  </select>
                </div>
              </div>

              {settings.visualizerType !== 'none' && (
                <div className="control-group" style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>色 (Color)</label>
                    <input 
                      type="color" 
                      className="color-input" 
                      style={{ height: '32px', padding: '0 4px' }}
                      value={settings.visualizerColor}
                      onChange={e => setSettings({...settings, visualizerColor: e.target.value})}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>感度 (Sensitivity)</label>
                    <input 
                      type="range" 
                      className="range-input" 
                      min="0.1" max="3" step="0.1"
                      title={`感度: ${settings.visualizerSensitivity}`}
                      value={settings.visualizerSensitivity}
                      onChange={e => setSettings({...settings, visualizerSensitivity: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <CustomRightPanel 
              lyrics={lyrics}
              customConfigs={customConfigs}
              setCustomConfigs={setCustomConfigs}
              selectedLineId={selectedLineId}
              selectedCharIndex={selectedCharIndex}
              onCharClick={(idx) => setSelectedCharIndex(idx)}
              onClearCharSelection={() => setSelectedCharIndex(null)}
            />
          )}

        </div>
      </div>
    </div>
  );
}

export default App;
