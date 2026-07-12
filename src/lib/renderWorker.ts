import './documentPolyfill';
import * as THREE from 'three';
// @ts-ignore
import { Text } from 'troika-three-text';
import * as Mp4Muxer from 'mp4-muxer';

self.onmessage = async (e) => {
  if (e.data.type === 'START_RENDER') {
    try {
      await runRenderPipeline(e.data);
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err.message });
    }
  }
};

async function runRenderPipeline(data: any) {
  const { canvas, audioData, lyrics, settings } = data;
  const width = settings.width || 1920;
  const height = settings.height || 1080;
  const fps = settings.fps || 30;

  // 1. Three.js Setup
  const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    alpha: true, 
    antialias: false,
    preserveDrawingBuffer: true
  });
  // Pass false to avoid setting style since we're in a Worker
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
  camera.position.z = 10;

  const msdfText = new (Text as any)();
  scene.add(msdfText);
  msdfText.text = "テスト";  // 初期テキストでフォントをプリロード
  msdfText.fontSize = settings.fontSize ? settings.fontSize * (width / 800) : 80;
  msdfText.color = settings.textColor || 0xffffff;
  msdfText.anchorX = 'center';
  msdfText.anchorY = 'middle';
  
  // Wait for initial font load (troika loads fonts async)
  await new Promise<void>((resolve) => {
    msdfText.sync(() => resolve());
    // Timeout fallback in case sync callback never fires
    setTimeout(() => resolve(), 5000);
  });
  
  // Report that init is done
  self.postMessage({ type: 'PROGRESS', progress: 0 });

  // 2. Output Target Setup (OPFS or ArrayBuffer fallback for HTTP)
  const fileName = `lyric_motion_export_${Date.now()}.mp4`;
  let accessHandle: any = null;
  let muxerTarget: any = null;

  if (navigator.storage && navigator.storage.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(fileName, { create: true });
      accessHandle = await (fileHandle as any).createSyncAccessHandle();
      accessHandle.truncate(0);

      muxerTarget = new Mp4Muxer.StreamTarget({
        onData: (data: Uint8Array, position: number) => {
          accessHandle.write(data, { at: position });
        },
        chunked: true,
        chunkSize: 1024 * 1024 // 1MB chunks
      });
    } catch (e) {
      console.warn("OPFS createSyncAccessHandle failed, falling back to ArrayBufferTarget", e);
    }
  }

  if (!muxerTarget) {
    muxerTarget = new Mp4Muxer.ArrayBufferTarget();
  }

  const muxer = new Mp4Muxer.Muxer({
    target: muxerTarget,
    video: { codec: 'avc', width, height },
    audio: audioData ? {
      codec: 'aac',
      numberOfChannels: audioData.channels.length,
      sampleRate: audioData.sampleRate
    } : undefined,
    fastStart: false
  });

  const baseConfig = {
    width,
    height,
    bitrate: 5_000_000,
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware' as const
  };

  // List of codecs to try (High -> Main -> Baseline -> HEVC)
  const codecsToTry = [
    'avc1.640028', // High Profile Level 4.0 (1080p)
    'avc1.4d0028', // Main Profile Level 4.0
    'avc1.420028', // Baseline Profile Level 4.0
    'avc1.64002a', // High Profile Level 4.2
    'avc1.4d002a', // Main Profile Level 4.2
    'hvc1.1.6.L93.B0' // HEVC
  ];

  let selectedCodec = codecsToTry[0];
  let isSupported = false;

  for (const codec of codecsToTry) {
    try {
      const support = await VideoEncoder.isConfigSupported({ ...baseConfig, codec });
      if (support.supported) {
        selectedCodec = codec;
        isSupported = true;
        break;
      }
    } catch (e) {
      // Ignore and try next
    }
  }

  if (!isSupported) {
    throw new Error("VideoEncoder Error: この端末のブラウザは指定された解像度での動画エンコードに対応していません。解像度を下げるか、別のブラウザをお試しください。");
  }

  let videoChunksProcessed = 0;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      videoChunksProcessed++;
      const finalMeta: any = { ...meta };
      if (meta && meta.decoderConfig) {
        finalMeta.decoderConfig = { ...meta.decoderConfig };
        if (!finalMeta.decoderConfig.colorSpace) {
          finalMeta.decoderConfig.colorSpace = {
            primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false
          };
        }
      } else {
        // Mock fallback for standard AVC
        const isHevc = selectedCodec.startsWith('hvc');
        finalMeta.decoderConfig = {
          codec: selectedCodec,
          description: new Uint8Array(isHevc ? [0x01, 0x01, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] : [0x01, 0x42, 0x00, 0x28, 0xff, 0xe1, 0x00, 0x00, 0x01, 0x00, 0x00]).buffer,
          colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }
        };
      } // Restore closing brace
      
      let duration = chunk.duration;
      if (typeof duration !== 'number' || duration < 0 || isNaN(duration)) {
        duration = Math.floor(1_000_000 / fps);
      }
      
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      
      muxer.addVideoChunkRaw(
        data,
        chunk.type,
        chunk.timestamp,
        duration,
        finalMeta
      );
    },
    error: (e) => { console.error("Encoder Error:", e); }
  });

  videoEncoder.configure({ ...baseConfig, codec: selectedCodec });

  let audioEncoder: AudioEncoder | null = null;
  if (audioData) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        let duration = chunk.duration;
        if (typeof duration !== 'number' || duration < 0 || isNaN(duration)) {
          // Fallback duration: length of a 1-second chunk is 1,000,000 microseconds
          duration = 1_000_000;
        }
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        muxer.addAudioChunkRaw(data, chunk.type, chunk.timestamp, duration, meta);
      },
      error: (e) => { console.error("AudioEncoder Error:", e); }
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: audioData.channels.length,
      sampleRate: audioData.sampleRate,
      bitrate: 128_000
    });
  }

  // Encode Audio Data
  if (audioEncoder && audioData) {
    const channelData = audioData.channels;
    const sampleRate = audioData.sampleRate;
    const totalSamples = audioData.length;
    const numChannels = channelData.length;
    
    // Create AudioData chunks of 1 second each
    const chunkSize = sampleRate; 
    let currentSample = 0;
    while (currentSample < totalSamples) {
      const endSample = Math.min(currentSample + chunkSize, totalSamples);
      const frameCount = endSample - currentSample;
      
      const chunkOptions: AudioDataInit = {
        format: 'f32-planar',
        sampleRate: sampleRate,
        numberOfFrames: frameCount,
        numberOfChannels: numChannels,
        timestamp: (currentSample / sampleRate) * 1_000_000, // microseconds
        data: new Float32Array(frameCount * numChannels)
      };

      const buffer = new Float32Array(frameCount * numChannels);
      for (let c = 0; c < numChannels; c++) {
        buffer.set(channelData[c].subarray(currentSample, endSample), c * frameCount);
      }
      chunkOptions.data = buffer;

      const audioFrame = new AudioData(chunkOptions);
      audioEncoder.encode(audioFrame);
      audioFrame.close();
      currentSample += chunkSize;

      if (audioEncoder.encodeQueueSize > 30) {
        await new Promise(resolve => {
          const checkQueue = () => {
            if (audioEncoder!.encodeQueueSize < 10) resolve(null);
            else setTimeout(checkQueue, 10);
          };
          checkQueue();
        });
      }
    }
  }

  const durationMs = audioData ? audioData.duration * 1000 : 3000;
  const totalFrames = Math.floor((durationMs / 1000) * fps);
  const YIELD_INTERVAL = fps * 2;

  // 4. Render Loop
  for (let frame = 0; frame <= totalFrames; frame++) {
    const timeMs = frame * (1000 / fps);
    const timestampUs = frame * (1_000_000 / fps);

    const activeLyric = getActiveLyric(lyrics, timeMs);
    if (msdfText.text !== activeLyric) {
      msdfText.text = activeLyric;
      await new Promise<void>((resolve) => {
        msdfText.sync(() => resolve());
        setTimeout(() => resolve(), 500);
      });
    }

    renderer.render(scene, camera);
    // 確実なバッファ描画の完了を待機（SafariのBuffer has no frameバグ対策）
    const gl = renderer.getContext();
    if (gl && gl.flush) {
      gl.flush();
    }

    const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs });
    videoEncoder.encode(videoFrame);
    videoFrame.close();

    // Throttle if queue gets too large (avoid OOM)
    if (videoEncoder.encodeQueueSize > 30) {
      await new Promise(resolve => {
        const checkQueue = () => {
          if (videoEncoder.encodeQueueSize < 10) resolve(null);
          else setTimeout(checkQueue, 10);
        };
        checkQueue();
      });
    }

    if (frame % YIELD_INTERVAL === 0) {
      const progress = Math.floor((frame / totalFrames) * 100);
      self.postMessage({ type: 'PROGRESS', progress });
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  // 5. Cleanup
  await videoEncoder.flush();
  if (audioEncoder) {
    await audioEncoder.flush();
  }
  
  if (videoChunksProcessed === 0) {
    throw new Error("VideoEncoder Error: 1フレームも映像が書き出されませんでした。端末がこの動画設定に対応していないか、メモリ不足でエンコーダーが停止した可能性があります。");
  }

  muxer.finalize();

  if (accessHandle) {
    accessHandle.flush();
    accessHandle.close();
    self.postMessage({ type: 'COMPLETE', fileName });
  } else {
    // Fallback mode: send ArrayBuffer directly
    const buffer = muxerTarget.buffer;
    (self as any).postMessage({ type: 'COMPLETE', buffer, isFallback: true }, [buffer]);
  }
}

function getActiveLyric(lyrics: any[], renderTime: number): string {
  if (!lyrics || lyrics.length === 0) return "";
  
  let activeIndex = -1;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (renderTime >= lyrics[i].time) {
      activeIndex = i;
      break;
    }
  }

  if (activeIndex >= 0) {
    const activeLine = lyrics[activeIndex];
    const nextLine = activeIndex + 1 < lyrics.length ? lyrics[activeIndex + 1] : null;
    let isExpired = false;

    if (activeLine.endTime) {
      if (renderTime > activeLine.endTime) isExpired = true;
    } else if (nextLine) {
      if (renderTime > activeLine.time + 10000) isExpired = true;
    } else {
      if (renderTime > activeLine.time + 5000) isExpired = true;
    }

    if (!isExpired && activeLine.text) {
      return activeLine.text;
    }
  }
  return "";
}
