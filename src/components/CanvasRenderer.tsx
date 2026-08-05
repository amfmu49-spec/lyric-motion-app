import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import type { LyricLine } from '../lib/lrcParser';
import type { AppSettings, CustomConfigMap } from '../types';

interface Props {
  lyrics: LyricLine[];
  currentTime: number; // in ms
  settings: AppSettings;
  customConfigs?: CustomConfigMap;
  getAudioEnergy?: () => number;
  getAudioFrequencyData?: () => Uint8Array;
  bgMediaUrl: string | null;
  bgMediaType: 'image' | 'video' | 'slideshow';
  bgImages?: string[];
}

const KANJI_REGEX = /[一-龯]/;
const KANA_REGEX = /[ぁ-んァ-ン]/;
const DARK_REGEX = /[狂壊殺闇絶毒死罪罰血]/;
const POP_REGEX = /[！？!?笑喜愛恋星]/;
const CHOUON_REGEX = /[ー〜\-―‐]/;
const SMALL_KANA_REGEX = /[っゃゅょッャュョ,、,。.!！?？]/;

// Easing functions
const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);
const easeOutElastic = (x: number): number => {
  const c4 = (2 * Math.PI) / 3;
  return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
};
const easeOutBack = (x: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export interface CanvasRendererRef extends HTMLCanvasElement {
  renderFrame: (timeMs: number) => void;
}

export const CanvasRenderer = forwardRef<CanvasRendererRef, Props>(({
  lyrics, currentTime, settings, customConfigs = {}, getAudioEnergy, getAudioFrequencyData, bgMediaUrl, bgMediaType, bgImages = []
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useImperativeHandle(ref, () => {
    const canvas = canvasRef.current as any;
    if (canvas) {
      canvas.renderFrame = (timeMs: number) => {
        if (drawFrameRef.current) drawFrameRef.current(timeMs);
      };
    }
    return canvas;
  }, []);

  const drawFrameRef = useRef<((timeMs: number) => void) | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgSlideshowImgsRef = useRef<HTMLImageElement[]>([]);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Load background media
  useEffect(() => {
    if (bgMediaType === 'slideshow' && bgImages && bgImages.length > 0) {
      const loadedImgs: HTMLImageElement[] = new Array(bgImages.length);
      let loadedCount = 0;
      bgImages.forEach((url, idx) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          loadedImgs[idx] = img;
          loadedCount++;
          if (loadedCount === bgImages.length || loadedCount >= 1) {
            bgSlideshowImgsRef.current = loadedImgs.filter(Boolean);
          }
        };
      });
      bgSlideshowImgsRef.current = loadedImgs.filter(Boolean);
    } else if (bgMediaUrl) {
      if (bgMediaType === 'video') {
        const vid = document.createElement('video');
        vid.src = bgMediaUrl;
        vid.crossOrigin = "anonymous";
        vid.loop = true;
        vid.muted = true;
        vid.play();
        bgVideoRef.current = vid;
      } else {
        const img = new Image();
        img.src = bgMediaUrl;
        img.onload = () => { bgImageRef.current = img; };
      }
    }
  }, [bgMediaUrl, bgMediaType, bgImages]);

  const drawFrame = useCallback((overrideTimeMs: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const renderTime = overrideTimeMs;
      const width = settings.aspectRatio === '16:9' ? 1920 : 1080;
      const height = settings.aspectRatio === '16:9' ? 1080 : 1920;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const energyBase = getAudioEnergy ? getAudioEnergy() : 0;
      const energy = energyBase * (settings.visualizerSensitivity || 1.0);
      const beatScale = 1 + (energyBase * 0.05 * settings.beatSyncIntensity);
      
      const visHex = settings.visualizerColor || '#ffffff';
      const rgbMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(visHex);
      const visRgb = rgbMatch ? `${parseInt(rgbMatch[1], 16)}, ${parseInt(rgbMatch[2], 16)}, ${parseInt(rgbMatch[3], 16)}` : '255, 255, 255';
      
      ctx.save();
      ctx.translate(width/2, height/2);
      ctx.scale(beatScale, beatScale);
      ctx.globalAlpha = 0.8;

      if (bgMediaType === 'video' && bgVideoRef.current) {
        const vid = bgVideoRef.current;
        const vw = vid.videoWidth;
        const vh = vid.videoHeight;
        if (vw && vh) {
          const iRatio = vw / vh;
          const cRatio = width / height;
          
          // 1. Performance-friendly Zoomed Background (instead of expensive blur)
          let coverW = width * 1.2, coverH = height * 1.2;
          if (iRatio > cRatio) coverW = (height * 1.2) * iRatio;
          else coverH = (width * 1.2) / iRatio;
          
          ctx.save();
          ctx.globalAlpha = 0.3; // Dim it to act as a background
          ctx.drawImage(vid, -coverW/2, -coverH/2, coverW, coverH);
          ctx.restore();

          // 2. Contain Foreground
          let containW = width, containH = height;
          if (iRatio > cRatio) containH = width / iRatio;
          else containW = height * iRatio;
          
          ctx.drawImage(vid, -containW/2, -containH/2, containW, containH);
        }
      } else if (bgMediaType === 'image' && bgImageRef.current) {
        const img = bgImageRef.current;
        const nw = img.naturalWidth || img.width;
        const nh = img.naturalHeight || img.height;
        if (nw && nh) {
          const iRatio = nw / nh;
          const cRatio = width / height;
          
          // 1. Performance-friendly Zoomed Background
          let coverW = width * 1.2, coverH = height * 1.2;
          if (iRatio > cRatio) coverW = (height * 1.2) * iRatio;
          else coverH = (width * 1.2) / iRatio;
          
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.drawImage(img, -coverW/2, -coverH/2, coverW, coverH);
          ctx.restore();

          // 2. Contain Foreground
          let containW = width, containH = height;
          if (iRatio > cRatio) containH = width / iRatio;
          else containW = height * iRatio;
          
          ctx.drawImage(img, -containW/2, -containH/2, containW, containH);
        }
      } else if (bgMediaType === 'slideshow' && bgSlideshowImgsRef.current.length > 0) {
        const imgs = bgSlideshowImgsRef.current;
        const intervalMs = 4000;
        const fadeMs = 800;
        const totalDuration = imgs.length * intervalMs;
        const currentProgressMs = renderTime % totalDuration;
        const index = Math.floor(currentProgressMs / intervalMs) % imgs.length;
        const nextIndex = (index + 1) % imgs.length;
        const timeInCurrentSlide = currentProgressMs % intervalMs;
        const isKenBurns = settings.kenBurnsEffect ?? true;

        const drawSingleImage = (img: HTMLImageElement, alpha: number, imgIdx: number, slideTimeMs: number) => {
          if (!img) return;
          const nw = img.naturalWidth || img.width;
          const nh = img.naturalHeight || img.height;
          if (!nw || !nh) return;
          
          const iRatio = nw / nh;
          const cRatio = width / height;

          let kbScale = 1.0;
          let kbPanX = 0;
          let kbPanY = 0;

          if (isKenBurns) {
            const progress = Math.min(1, Math.max(0, slideTimeMs / intervalMs));
            const isZoomIn = imgIdx % 2 === 0;
            kbScale = isZoomIn ? 1.0 + (progress * 0.15) : 1.15 - (progress * 0.15);
            const panDirection = (imgIdx % 3 === 0) ? 1 : (imgIdx % 3 === 1) ? -1 : 0.5;
            kbPanX = Math.sin(progress * Math.PI * 0.8) * 30 * panDirection * (width / 1920);
            kbPanY = Math.cos(progress * Math.PI * 0.8) * 20 * panDirection * (height / 1080);
          }

          ctx.save();
          ctx.translate(kbPanX, kbPanY);
          ctx.scale(kbScale, kbScale);

          let coverW = width * 1.25, coverH = height * 1.25;
          if (iRatio > cRatio) coverW = (height * 1.25) * iRatio;
          else coverH = (width * 1.25) / iRatio;

          ctx.save();
          ctx.globalAlpha = alpha * 0.3;
          ctx.drawImage(img, -coverW/2, -coverH/2, coverW, coverH);
          ctx.restore();

          let containW = width, containH = height;
          if (iRatio > cRatio) containH = width / iRatio;
          else containW = height * iRatio;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.drawImage(img, -containW/2, -containH/2, containW, containH);
          ctx.restore();

          ctx.restore();
        };

        if (timeInCurrentSlide >= (intervalMs - fadeMs) && imgs[nextIndex]) {
          const fadeProgress = (timeInCurrentSlide - (intervalMs - fadeMs)) / fadeMs;
          drawSingleImage(imgs[index], 1.0 - fadeProgress, index, timeInCurrentSlide);
          const nextSlideTime = (timeInCurrentSlide - (intervalMs - fadeMs));
          drawSingleImage(imgs[nextIndex], fadeProgress, nextIndex, nextSlideTime);
        } else if (imgs[index]) {
          drawSingleImage(imgs[index], 1.0, index, timeInCurrentSlide);
        }
      }
      ctx.restore();

      // 1. Draw Background Visualizer
      const visOpacity = settings.visualizerOpacity ?? 0.8;
      const isSolid = visOpacity >= 0.95;
      const blendMode = isSolid ? 'source-over' : 'screen';

      const freqData = getAudioFrequencyData ? getAudioFrequencyData() : new Uint8Array(0);
      const hasFreq = freqData && freqData.length > 0;
      const sensitivity = settings.visualizerSensitivity || 1.0;

      if (settings.visualizerType === 'particles') {
         ctx.save();
         ctx.globalCompositeOperation = blendMode;
         for (let i=0; i<45; i++) {
           const x = ((Math.sin(renderTime * 0.0005 + i * 4.2) + 1) / 2) * width;
           const y = height - ((renderTime * (0.05 + (i%5)*0.01) + i * 123) % height);
           let pEnergy = energy;
           if (hasFreq) {
             const binIdx = Math.floor((i / 45) * (freqData.length * 0.8));
             pEnergy = (freqData[binIdx] / 255) * sensitivity;
           }
           const r = (3 + Math.abs(Math.cos(i)) * 4 + (pEnergy * 14)) * (width / 1000);
           ctx.beginPath();
           ctx.arc(x, y, r, 0, Math.PI*2);
           const alpha = isSolid ? 1.0 : Math.min(1, (0.2 + pEnergy * 0.8) * visOpacity);
           ctx.fillStyle = `rgba(${visRgb}, ${alpha})`;
           ctx.shadowColor = isSolid ? 'transparent' : visHex;
           ctx.shadowBlur = isSolid ? 0 : 18;
           ctx.fill();
         }
         ctx.restore();
      } else if (settings.visualizerType === 'waveform') {
         ctx.save();
         ctx.globalCompositeOperation = blendMode;
         ctx.beginPath();
         ctx.moveTo(0, height);
         const points = 64;
         const stepX = width / (points - 1);
         for(let i=0; i<points; i++) {
            const x = i * stepX;
            let amp = 0;
            if (hasFreq) {
              const binIdx = Math.floor(Math.pow(i / (points - 1), 1.2) * (freqData.length * 0.75));
              amp = (freqData[binIdx] / 255) * sensitivity;
            } else {
              const spatial = Math.sin(i * 0.2);
              const temporal = Math.sin(renderTime * 0.004);
              amp = Math.abs(spatial * temporal) * energy;
            }
            const h = amp * height * 0.35;
            ctx.lineTo(x, height - h);
         }
         ctx.lineTo(width, height);
         const fillAlpha = isSolid ? 1.0 : Math.min(1, (0.25 + energy * 0.5) * visOpacity);
         const strokeAlpha = isSolid ? 1.0 : Math.min(1, (0.7 + energy * 0.3) * visOpacity);
         ctx.fillStyle = `rgba(${visRgb}, ${fillAlpha})`;
         ctx.fill();
         ctx.strokeStyle = `rgba(${visRgb}, ${strokeAlpha})`;
         ctx.lineWidth = 4;
         ctx.shadowColor = isSolid ? 'transparent' : visHex;
         ctx.shadowBlur = isSolid ? 0 : 12;
         ctx.stroke();
         ctx.restore();
      } else if (settings.visualizerType === 'bars') {
         // 真のイコライザー (EQ) バー
         ctx.save();
         ctx.globalCompositeOperation = blendMode;
         const barCount = 48;
         const gap = 6 * (width / 1920);
         const paddingX = 40 * (width / 1920);
         const availableWidth = width - (paddingX * 2) - (gap * (barCount - 1));
         const barWidth = availableWidth / barCount;

         for(let i=0; i<barCount; i++) {
            let amp = 0;
            if (hasFreq) {
              // 周波数帯域バケット (低音〜高音)
              const binIdx = Math.floor(Math.pow(i / barCount, 1.4) * (freqData.length * 0.75));
              amp = (freqData[binIdx] / 255) * sensitivity;
            } else {
              const pseudoRnd = Math.sin(i * 12.9898);
              const wave = Math.sin(renderTime * 0.005 + pseudoRnd * Math.PI * 2) * 0.5 + 0.5;
              amp = energy * wave;
            }
            const maxBarH = height * 0.45;
            const h = amp * maxBarH;
            const x = paddingX + i * (barWidth + gap);
            const y = height - h;
            const alpha = isSolid ? 1.0 : Math.min(1, (0.35 + amp * 0.65) * visOpacity);
            
            ctx.fillStyle = `rgba(${visRgb}, ${alpha})`;
            ctx.shadowColor = isSolid ? 'transparent' : visHex;
            ctx.shadowBlur = isSolid ? 0 : 12;
            ctx.fillRect(x, y, barWidth, h);
         }
         ctx.restore();
      } else if (settings.visualizerType === 'circle') {
         ctx.save();
         ctx.translate(width/2, height/2);
         ctx.globalCompositeOperation = blendMode;
         const baseRadius = 200 * (width / 1000);
         const numPoints = 64;
         ctx.beginPath();
         for(let i=0; i<=numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            let amp = 0;
            if (hasFreq) {
              const binIdx = Math.floor((i % (numPoints / 2)) / (numPoints / 2) * (freqData.length * 0.75));
              amp = (freqData[binIdx] / 255) * sensitivity;
            } else {
              amp = energy;
            }
            const r = baseRadius + (amp * 160 * (width / 1000));
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
         }
         ctx.closePath();
         const strokeAlpha = isSolid ? 1.0 : Math.min(1, (0.8 + energy * 0.2) * visOpacity);
         const fillAlpha = isSolid ? 0.9 : Math.min(1, (0.08 + energy * 0.15) * visOpacity);
         ctx.strokeStyle = `rgba(${visRgb}, ${strokeAlpha})`;
         ctx.lineWidth = 6 + energy * 5;
         ctx.shadowColor = isSolid ? 'transparent' : visHex;
         ctx.shadowBlur = isSolid ? 0 : 22;
         ctx.stroke();
         
         ctx.fillStyle = `rgba(${visRgb}, ${fillAlpha})`;
         ctx.fill();
         ctx.restore();
      } else if (settings.visualizerType === 'grid') {
         ctx.save();
         ctx.globalCompositeOperation = blendMode;
         const alpha = isSolid ? 1.0 : Math.min(1, (0.3 + energy * 0.6) * visOpacity);
         ctx.strokeStyle = `rgba(${visRgb}, ${alpha})`;
         ctx.lineWidth = 2 + energy * 3;
         ctx.shadowColor = isSolid ? 'transparent' : visHex;
         ctx.shadowBlur = isSolid ? 0 : 12;
         const gridSize = 80;
         const offsetX = (renderTime * 0.05) % gridSize;
         const offsetY = (renderTime * 0.05) % gridSize;
         
         ctx.beginPath();
         for(let i=-gridSize; i<=width; i+=gridSize) {
             ctx.moveTo(i + offsetX, 0);
             ctx.lineTo(i + offsetX, height);
         }
         for(let i=-gridSize; i<=height; i+=gridSize) {
             ctx.moveTo(0, i + offsetY);
             ctx.lineTo(width, i + offsetY);
         }
         ctx.stroke();
         ctx.restore();
      }

      // Find active line
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
        let durationMs = 3000;

        if (activeLine.endTime) {
          durationMs = activeLine.endTime - activeLine.time;
          if (renderTime > activeLine.endTime) isExpired = true;
        } else if (nextLine) {
          durationMs = nextLine.time - activeLine.time;
          if (renderTime > activeLine.time + 10000) isExpired = true; // hide after 10s if no next line
        } else {
          if (renderTime > activeLine.time + 5000) isExpired = true; // hide last line after 5s
        }

        if (!isExpired && activeLine.text) {
          const elapsedMs = renderTime - activeLine.time;

        let motion = settings.motionType;
        let fontName = settings.fontFamily;
        let color = settings.textColor;
        let baseSize = settings.fontSize * (width / 800);
        let isVertical = settings.writingMode === 'vertical';

        const text = activeLine.text;
        const isAutoMotion = settings.motionType === 'auto';
        const isAutoFont = settings.fontFamily === 'auto';
        const isAutoColor = settings.autoColor;
        const isMixMotion = settings.motionType === 'mix';

        const isDark = DARK_REGEX.test(text);
        const isPop = POP_REGEX.test(text);
        const isShort = text.replace(/[ 　\n]/g, '').length <= 4;
        const isPortrait = settings.aspectRatio === '9:16';
        const longCutoff = isPortrait ? 10 : 15;
        const isVeryLong = text.length > longCutoff;

        // Base AI Auto Logic
        if (isAutoMotion || isMixMotion) {
          if (isAutoMotion) {
            if (isShort) motion = 'bounce';
            else if (isDark) motion = 'glitch';
            else if (isPop) motion = 'zoom-in';
            else if (energy > 0.6) motion = 'shake-pop';
            else if (energy < 0.2) motion = 'fade';
            else motion = ['telop', 'slide-up', 'typewriter', 'cinematic', 'glitch', 'zoom-in'][activeIndex % 6] as any;
          } else {
            motion = ['cinematic', 'slide-up', 'bounce', 'vocaloid', 'typewriter', 'glitch', 'fade', 'rotate'][activeIndex % 8] as any;
          }
        }

        if (isAutoFont) {
          if (isDark) fontName = "'Reggae One', sans-serif";
          else if (isPop) fontName = "'Mochiy Pop One', sans-serif";
          else if (energy > 0.6) fontName = "'RocknRoll One', sans-serif";
          else if (energy < 0.2) fontName = "'Shippori Mincho', serif";
          else fontName = "'Noto Sans JP', sans-serif";
        }

        if (isAutoColor) {
          if (isDark) color = '#ff4444';
          else if (isPop) color = '#ffcc00';
          else if (energy > 0.7) color = '#00ffff';
          else color = '#ffffff';
        }

        if (isPortrait) baseSize *= 0.7;
        if (isShort && isAutoMotion) baseSize *= 2.5;
        else if (isVeryLong) baseSize *= Math.max(0.6, longCutoff / text.length);

        if (!settings.writingMode && (isAutoMotion || isMixMotion) && (activeIndex % 4 === 3) && !isShort) {
          isVertical = true;
        }

        if (settings.autoSize) {
          const textLines = text.split('\n');
          let maxLineUnits = 0;
          textLines.forEach(lineText => {
            let lineLen = 0;
            for(let i=0; i<lineText.length; i++) {
                const c = lineText[i];
                let s = 1;
                if (settings.kanjiEmphasis) {
                  if (KANA_REGEX.test(c)) s = 0.5;
                  else if (!KANJI_REGEX.test(c)) s = 0.7;
                }
                lineLen += s;
            }
            maxLineUnits = Math.max(maxLineUnits, lineLen);
          });

          const paddingRatio = 0.85;
          const targetMaxWidth = width * paddingRatio;
          const targetMaxHeight = height * paddingRatio;

          if (isVertical) {
              const totalW = textLines.length * 1.5;
              const maxH = maxLineUnits;
              baseSize = Math.min(targetMaxWidth / totalW, targetMaxHeight / maxH);
          } else {
              const maxW = maxLineUnits;
              const totalH = textLines.length * 1.5;
              baseSize = Math.min(targetMaxWidth / maxW, targetMaxHeight / totalH);
          }
        }

        // Apply Custom Config Overrides (Line level)
        const customLineConf = customConfigs[activeLine.id];
        if (customLineConf) {
          if (customLineConf.motionType) motion = customLineConf.motionType as any;
          if (customLineConf.fontFamily) fontName = customLineConf.fontFamily;
          if (customLineConf.textColor) color = customLineConf.textColor;
          if (customLineConf.fontSize) baseSize *= customLineConf.fontSize;
        }

        ctx.save();

        // Calculate Position X & Y offsets based on settings
        let translateX = width / 2;
        let translateY = height / 2;

        if (settings.positionX === 'left') translateX = width * 0.25;
        else if (settings.positionX === 'right') translateX = width * 0.75;

        if (settings.positionY === 'top') translateY = height * 0.25;
        else if (settings.positionY === 'bottom') translateY = height * 0.75;

        ctx.translate(translateX, translateY);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.shadowColor = `rgba(0,0,0,0.9)`;
        ctx.shadowBlur = 14 * (width/1000);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4 * (width/1000);

        const lines = text.split('\n');
        const lineSpacing = 1.5;
        const lineHeights = lines.map(() => baseSize * lineSpacing);
        const totalHeight = lineHeights.reduce((a,b)=>a+b, 0);
        
        let startY = -totalHeight / 2 + (baseSize * lineSpacing) / 2;
        let startX = isVertical ? (lines.length * baseSize * lineSpacing) / 2 - (baseSize * lineSpacing)/2 : 0;

        let globalCharIndex = 0;

        lines.forEach((lineText, lineIdx) => {
          const chars = lineText.split('');
          
          let lineWidth = 0;
          let lineHeight = 0;
          const charSizes = chars.map((c, i) => {
            const charIdx = globalCharIndex + i;
            let s = baseSize;
            if (settings.kanjiEmphasis) {
              if (KANA_REGEX.test(c)) s = baseSize * 0.5;
              else if (!KANJI_REGEX.test(c)) s = baseSize * 0.7;
            }

            if (customLineConf?.chars?.[charIdx]?.fontSize) {
               s *= customLineConf.chars[charIdx].fontSize!;
            }
            return s;
          });
          
          if (isVertical) {
            lineHeight = charSizes.reduce((a,b)=>a+b, 0);
          } else {
            lineWidth = charSizes.reduce((a,b)=>a+b, 0);
          }

          let charX = isVertical ? startX - lineIdx * baseSize * lineSpacing : -lineWidth / 2 + charSizes[0]/2;
          let charY = isVertical ? startY - totalHeight/2 + (totalHeight/2 - lineHeight/2) : startY + lineIdx * baseSize * lineSpacing;

          chars.forEach((c, cIdx) => {
            const size = charSizes[cIdx];
            
            let charFont = fontName;
            let charColor = color;
            let charMotion = motion;
            
            if (customLineConf?.chars?.[globalCharIndex]) {
               const cc = customLineConf.chars[globalCharIndex];
               if (cc.fontFamily) charFont = cc.fontFamily;
               if (cc.textColor) charColor = cc.textColor;
               if (cc.motionType) charMotion = cc.motionType as any;
            }

            ctx.font = `800 ${size}px ${charFont}`;
            ctx.fillStyle = charColor;

            const totalEntranceTime = Math.min(1000, durationMs * 0.6);
            const stagger = totalEntranceTime / Math.max(1, chars.length);
            const charElapsed = Math.max(0, elapsedMs - (cIdx * stagger));
            const enterProgress = Math.min(1, charElapsed / 400);

            const exitTime = durationMs - 300;
            const isExiting = elapsedMs > exitTime;
            const exitProgress = isExiting ? Math.min(1, (elapsedMs - exitTime) / 300) : 0;

            ctx.save();
            let drawX = charX;
            let drawY = charY;

            const isChouon = CHOUON_REGEX.test(c);
            const isSmallKana = SMALL_KANA_REGEX.test(c);

            // Handle offsets for vertical layout (punctuation and small characters)
            if (isVertical) {
              if (isSmallKana) {
                drawX += size * 0.2;
                drawY -= size * 0.2;
              }
            }

            if (charMotion === 'typewriter') {
              ctx.globalAlpha = enterProgress > 0.5 ? 1 : 0;
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'slide-up') {
              const slideDist = size;
              const p = easeOutBack(enterProgress);
              if (isVertical) drawX += slideDist * (1 - p);
              else drawY += slideDist * (1 - p);
              ctx.globalAlpha = Math.min(1, enterProgress * 2);
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'bounce') {
              const p = easeOutElastic(enterProgress);
              ctx.translate(drawX, drawY);
              ctx.scale(p, p);
              drawX = 0; drawY = 0;
              ctx.globalAlpha = Math.min(1, enterProgress * 2);
              if (exitProgress > 0) {
                 ctx.globalAlpha = 1 - exitProgress;
                 const s = 1 + exitProgress * 0.5;
                 ctx.scale(s, s);
              }
            } else if (charMotion === 'glitch') {
              const p = easeOutQuart(enterProgress);
              const glitchOffset = (Math.random() - 0.5) * size * 0.3 * (1 - p);
              drawX += glitchOffset;
              ctx.globalAlpha = Math.min(1, enterProgress * 2);
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'fade') {
              const p = easeOutQuart(enterProgress);
              ctx.globalAlpha = p;
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'zoom-in') {
              const p = easeOutBack(enterProgress);
              ctx.translate(drawX, drawY);
              const scaleVal = 0.2 + 0.8 * p;
              ctx.scale(scaleVal, scaleVal);
              drawX = 0; drawY = 0;
              ctx.globalAlpha = Math.min(1, enterProgress * 2);
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'rotate') {
              const p = easeOutBack(enterProgress);
              ctx.translate(drawX, drawY);
              ctx.rotate((1 - p) * (Math.PI / 3));
              drawX = 0; drawY = 0;
              ctx.globalAlpha = Math.min(1, enterProgress * 2);
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'shake-pop') {
              const p = easeOutElastic(enterProgress);
              const shakeX = (Math.sin(renderTime * 0.05 + cIdx) * 6) * energy;
              const shakeY = (Math.cos(renderTime * 0.05 + cIdx) * 6) * energy;
              ctx.translate(drawX + shakeX, drawY + shakeY);
              ctx.scale(p, p);
              drawX = 0; drawY = 0;
              ctx.globalAlpha = Math.min(1, enterProgress * 2);
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'vocaloid') {
              const p = easeOutQuart(enterProgress);
              const rX = Math.sin(globalCharIndex * 123) * 200;
              const rY = Math.cos(globalCharIndex * 321) * 200;
              const rRot = Math.sin(globalCharIndex * 555) * Math.PI;
              
              ctx.translate(drawX + rX * (1-p), drawY + rY * (1-p));
              ctx.rotate(rRot * (1-p));
              ctx.scale(0.1 + 0.9 * p, 0.1 + 0.9 * p);
              drawX = 0; drawY = 0;
              ctx.globalAlpha = Math.min(1, enterProgress * 2);
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'cinematic') {
              const enter = easeOutQuart(enterProgress);
              const scale = 0.98 + (elapsedMs / durationMs) * 0.04;
              ctx.translate(drawX, drawY);
              ctx.scale(scale, scale);
              drawX = 0; drawY = 0;
              ctx.globalAlpha = enter;
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else { // telop
              const p = easeOutQuart(enterProgress);
              if (isVertical) drawX -= size * (1-p);
              else drawY -= size * (1-p);
              ctx.globalAlpha = enterProgress;
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            }

            // Robust text stroke + fill for MV style legibility
            ctx.lineJoin = 'round';
            ctx.lineWidth = size * 0.12;
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';

            // If Vertical mode and Chouon (long dash), rotate character 90 degrees
            if (isVertical && isChouon) {
              ctx.save();
              ctx.translate(drawX, drawY);
              ctx.rotate(Math.PI / 2);
              ctx.strokeText(c, 0, 0);
              ctx.fillText(c, 0, 0);
              ctx.restore();
            } else {
              ctx.strokeText(c, drawX, drawY);
              ctx.fillText(c, drawX, drawY);
            }

            if (isVertical) {
               charY += size;
            } else {
               if (cIdx < chars.length - 1) {
                 charX += size/2 + charSizes[cIdx+1]/2;
               }
            }
            
            globalCharIndex++;
            ctx.restore();
          });
        });
        
        ctx.restore();
      }

      // 2. Draw Cinematic Overlays (Titles)
      if (settings.overlayStyle && settings.overlayStyle !== 'none' && (settings.songTitle || settings.artistName)) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        if (settings.overlayStyle === 'corner') {
           const pad = 40 * (width/1000);
           ctx.fillStyle = 'rgba(255,255,255,0.95)';
           ctx.font = `600 ${24 * (width/1000)}px sans-serif`;
           if (settings.songTitle) ctx.fillText(settings.songTitle, pad, height - pad * 2.5);
           
           ctx.fillStyle = 'rgba(255,255,255,0.7)';
           ctx.font = `400 ${18 * (width/1000)}px sans-serif`;
           if (settings.artistName) ctx.fillText(settings.artistName, pad, height - pad * 1.2);
        } else if (settings.overlayStyle === 'intro') {
            if (settings.overlayStyle === 'intro') {
              const alpha = renderTime > 6000 ? (8000 - renderTime) / 2000 : Math.min(1, renderTime / 1000);
              ctx.globalAlpha = alpha;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              ctx.fillStyle = 'rgba(255,255,255,1)';
              ctx.font = `800 ${64 * (width/1000)}px sans-serif`;
              if (settings.songTitle) ctx.fillText(settings.songTitle, width/2, height/2 - 30 * (width/1000));
              
              ctx.fillStyle = 'rgba(255,255,255,0.8)';
              ctx.font = `500 ${32 * (width/1000)}px sans-serif`;
              if (settings.artistName) ctx.fillText(settings.artistName, width/2, height/2 + 40 * (width/1000));
            }
        }
        ctx.restore();
        } // end if (!isExpired && activeLine.text)
      } // end if (activeIndex >= 0)

      // === Post-Processing Effects ===
      if (settings.effectType && settings.effectType !== 'none') {
        if (!offscreenRef.current) {
          offscreenRef.current = document.createElement('canvas');
        }
        const off = offscreenRef.current;
        if (off.width !== width || off.height !== height) {
          off.width = width;
          off.height = height;
        }
        const octx = off.getContext('2d');
        if (octx) {
          // Copy current frame to offscreen
          octx.globalCompositeOperation = 'copy';
          octx.drawImage(canvas, 0, 0);

          // Reset main canvas for compositing
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, width, height);

          switch (settings.effectType) {
            case 'bloom':
              ctx.filter = 'blur(16px) brightness(1.5)';
              ctx.drawImage(off, 0, 0);
              ctx.filter = 'none';
              ctx.globalCompositeOperation = 'screen'; // or lighter
              ctx.drawImage(off, 0, 0);
              ctx.globalCompositeOperation = 'source-over';
              break;

            case 'vhs':
              // Base image with slight color shift
              ctx.globalCompositeOperation = 'source-over';
              ctx.filter = 'contrast(1.2) saturate(1.2)';
              ctx.drawImage(off, 0, 0);
              ctx.filter = 'none';
              // Color shift (RGB Split)
              ctx.globalCompositeOperation = 'screen';
              ctx.fillStyle = 'rgba(255,0,0,0.1)';
              ctx.fillRect(0,0,width,height);
              ctx.drawImage(off, 4, 0);
              ctx.fillStyle = 'rgba(0,255,255,0.1)';
              ctx.fillRect(0,0,width,height);
              ctx.drawImage(off, -4, 0);
              ctx.globalCompositeOperation = 'source-over';
              // Scanlines
              ctx.fillStyle = 'rgba(0,0,0,0.15)';
              for(let y=0; y<height; y+=4) {
                 ctx.fillRect(0, y, width, 2);
              }
              // Noise
              const noiseY = (renderTime * 0.1) % height;
              ctx.fillStyle = 'rgba(255,255,255,0.05)';
              ctx.fillRect(0, noiseY, width, 50);
              break;

            case 'rgb-shift':
              const shiftAmount = 5 + (energy * 15);
              ctx.globalCompositeOperation = 'screen';
              
              // Red channel shift
              ctx.save();
              ctx.translate(shiftAmount, 0);
              ctx.drawImage(off, 0, 0);
              ctx.fillStyle = 'rgba(0, 255, 255, 1)';
              ctx.globalCompositeOperation = 'destination-in';
              ctx.fillRect(0, 0, width, height);
              ctx.restore();

              // Blue/Green channel shift
              ctx.save();
              ctx.translate(-shiftAmount, 0);
              ctx.drawImage(off, 0, 0);
              ctx.fillStyle = 'rgba(255, 0, 0, 1)';
              ctx.globalCompositeOperation = 'destination-in';
              ctx.fillRect(0, 0, width, height);
              ctx.restore();

              // Base image
              ctx.globalCompositeOperation = 'lighten';
              ctx.drawImage(off, 0, 0);
              ctx.globalCompositeOperation = 'source-over';
              break;

            case 'glitch':
              ctx.drawImage(off, 0, 0);
              if (Math.sin(renderTime * 0.01) > 0.8 || energy > 0.8) {
                const sliceH = 20 + Math.random() * 50;
                const sliceY = Math.random() * (height - sliceH);
                const shiftX = (Math.random() - 0.5) * 100 * energy;
                ctx.drawImage(off, 0, sliceY, width, sliceH, shiftX, sliceY, width, sliceH);
                // random color overlay on the glitch
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,0,0,0.2)' : 'rgba(0,255,255,0.2)';
                ctx.fillRect(0, sliceY, width, sliceH);
              }
              break;

            case 'shake':
              const shakeMag = (0.2 + energy) * 20;
              const sx = (Math.random() - 0.5) * shakeMag;
              const sy = (Math.random() - 0.5) * shakeMag;
              ctx.translate(sx, sy);
              ctx.scale(1.05, 1.05); // slight zoom to hide edges
              ctx.drawImage(off, -width*0.025, -height*0.025);
              break;

            case 'flash':
              ctx.drawImage(off, 0, 0);
              if (energy > 0.7) {
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = `rgba(255,255,255,${(energy - 0.7) * 2})`;
                ctx.fillRect(0, 0, width, height);
                ctx.globalCompositeOperation = 'source-over';
              }
              break;

            case 'cinema':
              ctx.filter = 'contrast(1.15) saturate(1.1)';
              ctx.drawImage(off, 0, 0);
              ctx.filter = 'none';
              ctx.fillStyle = '#000000';
              const barHeight = height * 0.12;
              ctx.fillRect(0, 0, width, barHeight);
              ctx.fillRect(0, height - barHeight, width, barHeight);
              break;

            case 'vintage':
              ctx.filter = 'sepia(0.6) contrast(1.2) brightness(0.9)';
              ctx.drawImage(off, 0, 0);
              ctx.filter = 'none';
              // Vignette
              const grad = ctx.createRadialGradient(width/2, height/2, height*0.4, width/2, height/2, height*0.8);
              grad.addColorStop(0, 'rgba(0,0,0,0)');
              grad.addColorStop(1, 'rgba(0,0,0,0.8)');
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, width, height);
              // Noise (pseudo)
              ctx.fillStyle = 'rgba(139, 69, 19, 0.1)';
              if (Math.floor(renderTime / 50) % 2 === 0) {
                 ctx.fillRect(0,0,width,height);
              }
              break;
              
            case 'halftone':
              ctx.filter = 'contrast(1.5) saturate(1.5)';
              ctx.drawImage(off, 0, 0);
              ctx.filter = 'none';
              ctx.globalCompositeOperation = 'multiply';
              // Create pseudo dot pattern
              const dotSize = 6;
              ctx.fillStyle = '#888';
              ctx.beginPath();
              for(let y=0; y<height; y+=dotSize*2) {
                for(let x=0; x<width; x+=dotSize*2) {
                  ctx.arc(x, y, dotSize*0.6, 0, Math.PI*2);
                }
              }
              ctx.fill();
              ctx.globalCompositeOperation = 'source-over';
              break;

            case 'negative':
              ctx.filter = 'invert(100%) hue-rotate(180deg)';
              ctx.drawImage(off, 0, 0);
              ctx.filter = 'none';
              break;

            case 'rainbow': {
              // 虹色オーバーレイが流れる
              ctx.drawImage(off, 0, 0);
              const t = renderTime * 0.002;
              const rainbowGrad = ctx.createLinearGradient(0, 0, width, height);
              rainbowGrad.addColorStop(0,   `hsla(${(t * 60) % 360}, 100%, 60%, 0.35)`);
              rainbowGrad.addColorStop(0.2, `hsla(${(t * 60 + 60) % 360}, 100%, 60%, 0.35)`);
              rainbowGrad.addColorStop(0.4, `hsla(${(t * 60 + 120) % 360}, 100%, 60%, 0.35)`);
              rainbowGrad.addColorStop(0.6, `hsla(${(t * 60 + 200) % 360}, 100%, 60%, 0.35)`);
              rainbowGrad.addColorStop(0.8, `hsla(${(t * 60 + 280) % 360}, 100%, 60%, 0.35)`);
              rainbowGrad.addColorStop(1,   `hsla(${(t * 60 + 360) % 360}, 100%, 60%, 0.35)`);
              ctx.globalCompositeOperation = 'screen';
              ctx.fillStyle = rainbowGrad;
              ctx.fillRect(0, 0, width, height);
              ctx.globalCompositeOperation = 'source-over';
              // 光沢ライン
              ctx.globalCompositeOperation = 'screen';
              const shineX = ((renderTime * 0.5) % (width + 200)) - 100;
              const shineGrad = ctx.createLinearGradient(shineX - 80, 0, shineX + 80, 0);
              shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
              shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
              shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
              ctx.fillStyle = shineGrad;
              ctx.fillRect(0, 0, width, height);
              ctx.globalCompositeOperation = 'source-over';
              break;
            }

            case 'lightning': {
              // 稲妻エフェクト
              ctx.drawImage(off, 0, 0);
              const boltChance = energy > 0.5 ? 0.4 : 0.1;
              if (Math.random() < boltChance || Math.sin(renderTime * 0.03) > 0.85) {
                const boltCount = Math.floor(1 + energy * 3);
                for (let b = 0; b < boltCount; b++) {
                  ctx.save();
                  ctx.strokeStyle = Math.random() > 0.5
                    ? `rgba(180,120,255,${0.6 + Math.random() * 0.4})`
                    : `rgba(100,180,255,${0.6 + Math.random() * 0.4})`;
                  ctx.lineWidth = 1 + Math.random() * 3;
                  ctx.shadowColor = ctx.strokeStyle;
                  ctx.shadowBlur = 20;
                  ctx.globalCompositeOperation = 'screen';
                  ctx.beginPath();
                  let bx = Math.random() * width;
                  let by = 0;
                  ctx.moveTo(bx, by);
                  while (by < height) {
                    bx += (Math.random() - 0.5) * 120;
                    by += 20 + Math.random() * 60;
                    ctx.lineTo(Math.min(Math.max(bx, 0), width), by);
                  }
                  ctx.stroke();
                  ctx.restore();
                }
                // 白フラッシュ
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = `rgba(200,180,255,${energy * 0.3})`;
                ctx.fillRect(0, 0, width, height);
                ctx.globalCompositeOperation = 'source-over';
              }
              break;
            }

            case 'fire': {
              // 炎エフェクト - 下から燃え上がるオレンジ
              ctx.filter = 'contrast(1.1) brightness(1.05)';
              ctx.drawImage(off, 0, 0);
              ctx.filter = 'none';
              const fireT = renderTime * 0.003;
              // 下部に炎グラデーション
              const fireGrad = ctx.createLinearGradient(0, height * 0.5, 0, height);
              fireGrad.addColorStop(0, 'rgba(255, 60, 0, 0)');
              fireGrad.addColorStop(0.5, `rgba(255, 100, 0, ${0.15 + energy * 0.25})`);
              fireGrad.addColorStop(1, `rgba(255, 160, 0, ${0.3 + energy * 0.4})`);
              ctx.globalCompositeOperation = 'screen';
              ctx.fillStyle = fireGrad;
              ctx.fillRect(0, 0, width, height);
              // 揺らぐ炎の粒
              ctx.globalCompositeOperation = 'screen';
              const particleCount = Math.floor(8 + energy * 20);
              for (let i = 0; i < particleCount; i++) {
                const px = (Math.sin(fireT * 2 + i * 1.3) * 0.5 + 0.5) * width;
                const py = height - (((fireT * 80 + i * 137) % height));
                const pr = 3 + Math.random() * (6 + energy * 10);
                const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
                pg.addColorStop(0, `rgba(255,240,80,${0.6 + Math.random()*0.3})`);
                pg.addColorStop(0.5, `rgba(255,80,0,0.4)`);
                pg.addColorStop(1, 'rgba(255,0,0,0)');
                ctx.fillStyle = pg;
                ctx.beginPath();
                ctx.arc(px, py, pr, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.globalCompositeOperation = 'source-over';
              break;
            }

            case 'laser': {
              // ネオンレーザービーム
              ctx.drawImage(off, 0, 0);
              ctx.save();
              ctx.globalCompositeOperation = 'screen';
              const laserT = renderTime * 0.004;
              const laserCount = 4 + Math.floor(energy * 4);
              const laserColors = [
                'rgba(255,0,200,', 'rgba(0,255,200,',
                'rgba(100,100,255,', 'rgba(255,220,0,',
                'rgba(0,200,255,', 'rgba(255,80,80,'
              ];
              for (let i = 0; i < laserCount; i++) {
                const angle = (laserT * (0.5 + i * 0.3) + i * (Math.PI / laserCount)) % (Math.PI * 2);
                const cx2 = width / 2;
                const cy2 = height / 2;
                const endX = cx2 + Math.cos(angle) * width;
                const endY = cy2 + Math.sin(angle) * height;
                const laserGrad = ctx.createLinearGradient(cx2, cy2, endX, endY);
                const col = laserColors[i % laserColors.length];
                laserGrad.addColorStop(0, col + '0.9)');
                laserGrad.addColorStop(0.5, col + '0.4)');
                laserGrad.addColorStop(1, col + '0)');
                ctx.strokeStyle = laserGrad;
                ctx.lineWidth = 1.5 + energy * 3;
                ctx.shadowColor = laserColors[i % laserColors.length] + '1)';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.moveTo(cx2, cy2);
                ctx.lineTo(endX, endY);
                ctx.stroke();
              }
              ctx.restore();
              break;
            }

            case 'fireworks': {
              // 花火・スパークルエフェクト
              ctx.drawImage(off, 0, 0);
              ctx.save();
              ctx.globalCompositeOperation = 'screen';
              const fwT = renderTime * 0.001;
              const sparkCount = Math.floor(6 + energy * 30);
              const fwColors = [
                [255,220,50], [255,100,200], [100,220,255],
                [200,255,100], [255,150,50], [180,100,255]
              ];
              for (let i = 0; i < sparkCount; i++) {
                const seed = i * 7.3 + fwT;
                const spx = (Math.sin(seed * 1.7) * 0.5 + 0.5) * width;
                const spy = (Math.cos(seed * 2.3) * 0.5 + 0.5) * height;
                const spr = 1.5 + Math.random() * (3 + energy * 6);
                const [r, g, b] = fwColors[i % fwColors.length];
                const alpha = 0.5 + Math.random() * 0.5;
                const spg = ctx.createRadialGradient(spx, spy, 0, spx, spy, spr * 2);
                spg.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
                spg.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.5})`);
                spg.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.fillStyle = spg;
                ctx.beginPath();
                ctx.arc(spx, spy, spr * 2, 0, Math.PI * 2);
                ctx.fill();
                // 十字スパーク
                if (Math.random() < 0.3 + energy * 0.4) {
                  ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.8})`;
                  ctx.lineWidth = 0.8;
                  ctx.shadowColor = `rgba(${r},${g},${b},1)`;
                  ctx.shadowBlur = 8;
                  const sl = spr * 3;
                  ctx.beginPath();
                  ctx.moveTo(spx - sl, spy); ctx.lineTo(spx + sl, spy);
                  ctx.moveTo(spx, spy - sl); ctx.lineTo(spx, spy + sl);
                  ctx.stroke();
                }
              }
              // 爆発リング（高エネルギー時）
              if (energy > 0.6) {
                const ringR = 30 + energy * 80;
                const rg = ctx.createRadialGradient(width/2, height/2, ringR * 0.7, width/2, height/2, ringR);
                rg.addColorStop(0, `rgba(255,255,200,${(energy - 0.6) * 0.5})`);
                rg.addColorStop(1, 'rgba(255,200,50,0)');
                ctx.fillStyle = rg;
                ctx.beginPath();
                ctx.arc(width/2, height/2, ringR, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.restore();
              break;
            }

            default:
              ctx.drawImage(off, 0, 0);
          }
          ctx.restore();
        }
      }

  }, [lyrics, settings, customConfigs, bgMediaUrl, bgMediaType, getAudioEnergy]);

  // Store latest drawFrame reference
  useEffect(() => {
    drawFrameRef.current = drawFrame;
  }, [drawFrame]);
  useEffect(() => {
    let reqId: number;
    const loop = () => {
      if (drawFrameRef.current) {
        drawFrameRef.current(currentTime);
      }
      reqId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(reqId);
  }, [currentTime]);

  return (
    <canvas 
      ref={canvasRef} 
      className="canvas-renderer"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: '#000'
      }}
    />
  );
});
