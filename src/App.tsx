import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, FileAudio, FileText, ImageIcon, Edit3, Loader2, Settings, Maximize, Minimize, Expand, Images } from 'lucide-react';
import { CanvasRenderer } from './components/CanvasRenderer';
import type { CanvasRendererRef } from './components/CanvasRenderer';
import { parseLrc } from './lib/lrcParser';
import type { LyricLine } from './lib/lrcParser';
import './App.css';
import { FONTS } from './types';
import type { AppSettings } from './types';
import { CustomLeftPanel, CustomRightPanel } from './components/CustomEditor';
import { VideoExporter } from './lib/VideoExporter';
import { FullscreenLyricEditor } from './components/FullscreenLyricEditor';

function App() {
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [rawLrc, setRawLrc] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [bgMediaUrl, setBgMediaUrl] = useState<string | null>(`${import.meta.env.BASE_URL}amuvi_logo.png`);
  const [bgMediaType, setBgMediaType] = useState<'image' | 'video' | 'slideshow'>('image');
  const [bgImages, setBgImages] = useState<string[]>([]);
  const [bgFileName, setBgFileName] = useState<string | null>('amuvi_logo.png');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioFileName, setAudioFileName] = useState('');
  const [lrcFileName, setLrcFileName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [exportedBlob, setExportedBlob] = useState<{ blob: Blob, url: string } | null>(null);
  const [isFullscreenEditor, setIsFullscreenEditor] = useState(false);
  
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
    visualizerOpacity: 0.8,
    effectType: 'none',
    kanjiEmphasis: true,
    writingMode: 'horizontal',
    positionX: 'center',
    positionY: 'center',
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const reqRef = useRef<number>(0);
  const playerAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<CanvasRendererRef>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);


  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const exporterRef = useRef<VideoExporter | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Parse LRC from URL hash or search (e.g. from Bookmarklet)
  useEffect(() => {
    // Check both search and hash for backward compatibility and flexibility
    // Hash is preferred for large payloads to avoid 414 URI Too Long errors
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));

    const lrcData = searchParams.get('lrc') || hashParams.get('lrc');
    const audioUrlParam = searchParams.get('audio_url') || hashParams.get('audio_url');

    if (lrcData) {
      try {
        const decoded = decodeURIComponent(lrcData);
        setRawLrc(decoded);
        setLyrics(parseLrc(decoded));
        setLrcFileName('Webからインポート.lrc');
      } catch (err) {
        console.error('Failed to parse LRC from URL', err);
      }
    }

    if (audioUrlParam) {
      try {
        const decoded = decodeURIComponent(audioUrlParam);
        setAudioUrl(decoded);
        setAudioFileName('Sunoからインポート.mp3');
      } catch (err) {
        console.error('Failed to parse audio_url from URL', err);
      }
    }

    // Remove parameters from URL to clean it up
    if (lrcData || audioUrlParam) {
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      window.history.replaceState({}, document.title, url.toString());
    }
  }, []);


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

  const getAudioFrequencyData = useCallback(() => {
    if (!analyserRef.current) return new Uint8Array(0);
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    return dataArray;
  }, []);

  const getAudioEnergy = useCallback(() => {
    if (!analyserRef.current) return 0;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    return (sum / bufferLength) / 255;
  }, []);

  useEffect(() => {
    const renderLoop = () => {
      if (isPlaying && audioRef.current) {
        setCurrentTime(audioRef.current.currentTime * 1000);
      }
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

  const handleBgMultipleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const urls: string[] = [];
      Array.from(files).forEach(file => {
        urls.push(URL.createObjectURL(file));
      });
      setBgImages(urls);
      setBgMediaType('slideshow');
      setBgFileName(`${files.length}枚画像(スライドショー)`);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const startMediaRecorderExport = () => {
    if (!canvasRef.current || !audioRef.current || !audioUrl) {
      alert('準備ができていません。');
      return;
    }

    try {
      setIsRecording(true);
      setRenderProgress(null);
      setExportedBlob(null);

      initAudioContext();
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      const canvasEl = canvasRef.current as unknown as HTMLCanvasElement;
      const canvasStream = (canvasEl.captureStream ? canvasEl.captureStream(30) : (canvasEl as any).webkitCaptureStream?.(30)) as MediaStream;

      const stream = new MediaStream();
      if (canvasStream) {
        canvasStream.getVideoTracks().forEach(track => stream.addTrack(track));
      }
      if (destRef.current) {
        destRef.current.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      }

      const mimeTypes = [
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      let selectedMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const options = selectedMime ? { mimeType: selectedMime } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(chunks, { type: selectedMime || 'video/webm' });
        const url = URL.createObjectURL(finalBlob);
        setExportedBlob({ blob: finalBlob, url });
        setIsRecording(false);
        setIsConverting(false);
        mediaRecorderRef.current = null;
      };

      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      audioRef.current.play();
      setIsPlaying(true);

      mediaRecorder.start(1000);
    } catch (err: any) {
      console.error('MediaRecorder Fallback Error:', err);
      alert('動画のリアルタイム生成を開始できませんでした。');
      setIsRecording(false);
      setIsConverting(false);
    }
  };

  const startExport = async () => {
    if (!canvasRef.current || !audioUrl) {
      alert('準備ができていません。');
      return;
    }

    // Fallback to MediaRecorder directly if WebCodecs is not supported on this browser (e.g. older Android Chrome / WebView)
    if (typeof window.VideoEncoder === 'undefined' || typeof window.AudioEncoder === 'undefined') {
      startMediaRecorderExport();
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

      exporterRef.current = new VideoExporter(
        canvasRef.current as HTMLCanvasElement,
        (timeMs) => canvasRef.current?.renderFrame(timeMs),
        arrayBuffer,
        decodedBuffer.duration
      );

      const blob = await exporterRef.current.export((progress: number) => {
         setRenderProgress(Math.floor(progress * 100));
      });

      const url = URL.createObjectURL(blob);
      setExportedBlob({ blob, url });
      
      setIsRecording(false);
      setRenderProgress(null);
      exporterRef.current = null;

    } catch (err: any) {
      console.warn('WebCodecs export failed, falling back to MediaRecorder:', err);
      exporterRef.current = null;
      // Fallback to MediaRecorder export on Android or unsupported device configs
      startMediaRecorderExport();
    }
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
    if (isRecording) {
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
                  getAudioFrequencyData={getAudioFrequencyData}
                  bgMediaUrl={bgMediaUrl}
                  bgMediaType={bgMediaType}
                  bgImages={bgImages}
                />
                <canvas ref={exportCanvasRef} style={{ display: 'none' }} />
              </>
              ) : (
                <div className="placeholder" style={{ 
                  position: 'relative', 
                  width: '100%', 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  backgroundColor: '#000',
                  overflow: 'hidden'
                }}>
                  {bgMediaUrl && bgMediaType === 'image' && (
                    <img src={bgMediaUrl} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', opacity: 1 }} />
                  )}
                  {bgMediaUrl && bgMediaType === 'video' && (
                    <video src={bgMediaUrl} autoPlay loop muted playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', opacity: 1 }} />
                  )}
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
                  
                  <video 
                    src={exportedBlob.url} 
                    controls 
                    playsInline 
                    style={{ width: '100%', maxHeight: '200px', borderRadius: '6px', marginBottom: '0.5rem', backgroundColor: '#000' }}
                  />

                  {('share' in navigator) && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([exportedBlob.blob], 'video.mp4', { type: exportedBlob.blob.type || 'video/mp4' })] }) ? (
                    <button 
                      className="btn btn-primary" 
                      style={{ width: '100%', backgroundColor: '#2ecc71', color: '#000', fontWeight: 'bold', marginBottom: '0.4rem' }}
                      onClick={async () => {
                        try {
                          const ext = exportedBlob.blob.type.includes('webm') ? 'webm' : 'mp4';
                          await navigator.share({
                            files: [new File([exportedBlob.blob], `lyric_motion_${Date.now()}.${ext}`, { type: exportedBlob.blob.type })],
                            title: 'LyricMotion Video'
                          });
                        } catch (err) {
                          console.log('Share cancelled or failed', err);
                        }
                      }}
                    >
                      📱 動画を端末・カメラロールに保存 / 共有
                    </button>
                  ) : (
                    <a 
                      href={exportedBlob.url} 
                      download={`lyric_motion_${Date.now()}.${exportedBlob.blob.type.includes('webm') ? 'webm' : 'mp4'}`}
                      className="btn btn-primary" 
                      style={{ width: '100%', display: 'block', textDecoration: 'none', backgroundColor: '#2ecc71', color: '#000', fontWeight: 'bold', marginBottom: '0.4rem' }}
                    >
                      ⬇️ 動画をダウンロード
                    </a>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', display: 'block' }}>
                    ※ Android等で直接ダウンロードできない場合は、上の動画を長押しして保存してください。
                  </span>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>Lyric Motion Creator</span>
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', backgroundColor: 'var(--primary-color, #3498db)', color: '#fff', borderRadius: '12px', fontWeight: 'bold' }}>
                v2.3.0
              </span>
            </h1>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Android Ready</span>
          </div>

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div className="file-input-wrapper">
                <button className="btn btn-primary" style={{ width: '100%', padding: '0.5rem' }} title={audioFileName || '1. 音源'}><FileAudio size={16}/> 音源選択</button>
                <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac" onChange={handleAudioUpload} />
              </div>
              <div className="file-input-wrapper">
                <button className="btn btn-primary" style={{ width: '100%', padding: '0.5rem' }} title={bgFileName || '2. 単一背景'}><ImageIcon size={16}/> 単一背景</button>
                <input type="file" accept="image/*,video/*,.jpg,.jpeg,.png,.mp4,.mov" onChange={handleBgUpload} />
              </div>
              <div className="file-input-wrapper">
                <button className="btn btn-primary" style={{ width: '100%', padding: '0.5rem', backgroundColor: '#8e44ad' }} title="2. 複数画像スライドショー"><Images size={16}/> 複数画像</button>
                <input type="file" accept="image/*" multiple onChange={handleBgMultipleUpload} />
              </div>
              <div className="file-input-wrapper">
                <button className="btn btn-primary" style={{ width: '100%', padding: '0.5rem' }} title={lrcFileName || '3. 歌詞ファイル'}><FileText size={16}/> 歌詞ファイル</button>
                <input type="file" onChange={handleLrcUpload} />
              </div>
            </div>

            {bgMediaType === 'slideshow' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.8rem', color: '#e0e0e0', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings.kenBurnsEffect ?? true} 
                  onChange={e => setSettings({ ...settings, kenBurnsEffect: e.target.checked })} 
                />
                🎬 ケンバーンズ効果 (ゆっくりズーム＆移動)
              </label>
            )}

            <button
              className="btn"
              onClick={() => setIsFullscreenEditor(true)}
              style={{
                width: '100%',
                padding: '0.5rem',
                marginTop: '0.5rem',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                fontWeight: 'bold'
              }}
            >
              <Expand size={16} /> 歌詞を全画面で集中編集する
            </button>

            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem' }}><Edit3 size={14} style={{display:'inline', verticalAlign:'middle'}}/> 歌詞テキストを簡易編集</summary>
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
              <div className="control-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label><Settings size={14} style={{ display: 'inline', marginRight: '2px', verticalAlign: 'text-bottom' }}/> 画面比率</label>
                  <select 
                    className="select-input"
                    value={settings.aspectRatio}
                    onChange={(e) => setSettings({...settings, aspectRatio: e.target.value as any})}
                  >
                    <option value="16:9">16:9 (横画面)</option>
                    <option value="9:16">9:16 (縦画面)</option>
                  </select>
                </div>
                <div>
                  <label><Settings size={14} style={{ display: 'inline', marginRight: '2px', verticalAlign: 'text-bottom' }}/> 組版 (縦/横)</label>
                  <select 
                    className="select-input"
                    value={settings.writingMode || 'horizontal'}
                    onChange={(e) => setSettings({...settings, writingMode: e.target.value as any})}
                  >
                    <option value="horizontal">横書き (Horizontal)</option>
                    <option value="vertical">縦書き (Vertical・長音回転)</option>
                  </select>
                </div>
              </div>

              <div className="control-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label>縦位置 (Y)</label>
                  <select 
                    className="select-input"
                    value={settings.positionY || 'center'}
                    onChange={(e) => setSettings({...settings, positionY: e.target.value as any})}
                  >
                    <option value="top">上寄せ (Top)</option>
                    <option value="center">中央 (Center)</option>
                    <option value="bottom">下寄せ (Bottom)</option>
                  </select>
                </div>
                <div>
                  <label>横位置 (X)</label>
                  <select 
                    className="select-input"
                    value={settings.positionX || 'center'}
                    onChange={(e) => setSettings({...settings, positionX: e.target.value as any})}
                  >
                    <option value="left">左寄せ (Left)</option>
                    <option value="center">中央 (Center)</option>
                    <option value="right">右寄せ (Right)</option>
                  </select>
                </div>
              </div>

              <div className="control-group">
                <label><Settings size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }}/> モーション (Motion)</label>
                <select 
                  className="select-input"
                  value={settings.motionType}
                  onChange={(e) => setSettings({...settings, motionType: e.target.value as any})}
                >
                  <option value="mix">★ 全自動ミックス (Auto Mix)</option>
                  <option value="telop">番組テロップ風 (Telop)</option>
                  <option value="slide-up">スライドアップ (Slide-Up)</option>
                  <option value="bounce">ポップ＆バウンス (Bounce)</option>
                  <option value="glitch">👾 グリッチ/ノイズ (Glitch)</option>
                  <option value="fade">🌫️ フェードイン/アウト (Fade)</option>
                  <option value="zoom-in">🔍 ズームバウンス (Zoom In)</option>
                  <option value="rotate">🔄 スピン回転 (Rotate)</option>
                  <option value="shake-pop">💥 シェイクバウンス (Shake Pop)</option>
                  <option value="cinematic">シネマティック (Cinematic)</option>
                  <option value="typewriter">タイプライター (Typewriter)</option>
                  <option value="vocaloid">ボカロ風 (Kinetic)</option>
                </select>
              </div>

              <div className="control-group">
                <label><Settings size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }}/> エフェクト (Effect)</label>
                <select 
                  className="select-input"
                  value={settings.effectType}
                  onChange={e => setSettings({...settings, effectType: e.target.value as any})}
                >
                  <option value="none">なし (None)</option>
                  <option value="bloom">🌟 グロウ/発光 (Bloom)</option>
                  <option value="vhs">📼 VHS / レトロ (VHS/Retro)</option>
                  <option value="rgb-shift">🔴 RGBズレ (RGB Shift)</option>
                  <option value="glitch">💥 グリッチ (Glitch)</option>
                  <option value="shake">📳 カメラシェイク (Shake)</option>
                  <option value="flash">⚡ フラッシュ (Flash)</option>
                  <option value="cinema">🎬 シネマティック (Cinematic)</option>
                  <option value="vintage">🎞️ ヴィンテージ (Vintage)</option>
                  <option value="halftone">🔵 ハーフトーン (Halftone)</option>
                  <option value="negative">🔄 反転 (Negative)</option>
                  <option value="rainbow">🌈 レインボー (Rainbow)</option>
                  <option value="lightning">⚡ 稲妻 (Lightning)</option>
                  <option value="fire">🔥 炎 (Fire)</option>
                  <option value="laser">🔆 レーザービーム (Laser)</option>
                  <option value="fireworks">🎆 花火スパーク (Fireworks)</option>
                </select>
              </div>

              <div className="control-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                <label style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={settings.kanjiEmphasis}
                    onChange={e => setSettings({...settings, kanjiEmphasis: e.target.checked})}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  漢字強調 (非漢字を小さく)
                </label>
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
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ビジュアライザー</label>
                <select 
                  className="select-input" 
                  style={{ fontSize: '0.8rem' }}
                  value={settings.visualizerType}
                  onChange={e => setSettings({...settings, visualizerType: e.target.value as any})}
                >
                  <option value="none">なし (None)</option>
                  <option value="bars">バー (Bars)</option>
                  <option value="waveform">波形 (Waveform)</option>
                  <option value="particles">パーティクル (Particles)</option>
                  <option value="circle">サークル波形 (Circle Wave)</option>
                  <option value="grid">サイバーグリッド (Cyber Grid)</option>
                </select>
              </div>

              {settings.visualizerType !== 'none' && (
                <>
                  <div className="control-group" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>発色 (Color)</label>
                      <input 
                        type="color" 
                        className="color-input" 
                        style={{ height: '32px', padding: '0 4px' }}
                        value={settings.visualizerColor}
                        onChange={e => setSettings({...settings, visualizerColor: e.target.value})}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>透明度: {Math.round((settings.visualizerOpacity ?? 0.8) * 100)}%</label>
                      <input 
                        type="range" 
                        className="range-input" 
                        min="0.1" max="1.0" step="0.05"
                        title={`透明度: ${settings.visualizerOpacity}`}
                        value={settings.visualizerOpacity ?? 0.8}
                        onChange={e => setSettings({...settings, visualizerOpacity: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>感度 (Sensitivity)</label>
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
                </>
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

          <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
            <details style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
              <summary>ℹ️ バージョン情報 (v2.3.0)</summary>
              <div style={{ marginTop: '0.4rem', textAlign: 'left', padding: '0.5rem', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontSize: '0.7rem', lineHeight: '1.5' }}>
                <strong>v2.3.0 主な機能・更新点:</strong><br />
                • 🎬 ケンバーンズ効果（スライドショー時のゆっくりズーム＆パン移動アニメーション）機能追加<br />
                • 🖼️ 複数枚画像スライドショー背景レンダリング完全修正<br />
                • 🎛️ 本物リアルタイムEQイコライザー（Web Audio API帯域連動）<br />
                • 🎨 ビジュアライザー100%時の完全ソリッド不透明表示対応<br />
                • 📱 Android端末正式対応 (WebCodecs & MediaRecorder)<br />
                • 📝 全画面歌詞エディタ搭載<br />
                • 🔤 縦書き表示対応 (長音符「ー」90度回転)
              </div>
            </details>
          </div>

        </div>
      </div>

      <FullscreenLyricEditor 
        isOpen={isFullscreenEditor}
        onClose={() => setIsFullscreenEditor(false)}
        rawLrc={rawLrc}
        onSave={(newRawLrc, parsedLyrics) => {
          setRawLrc(newRawLrc);
          setLyrics(parsedLyrics);
        }}
        onSeek={(timeMs) => {
          if (audioRef.current) {
            audioRef.current.currentTime = timeMs / 1000;
            setCurrentTime(timeMs);
          }
        }}
      />
    </div>
  );
}

export default App;
