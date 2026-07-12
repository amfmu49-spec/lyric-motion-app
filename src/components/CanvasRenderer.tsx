import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import type { LyricLine } from '../lib/lrcParser';
import type { AppSettings, CustomConfigMap } from '../types';

interface Props {
  lyrics: LyricLine[];
  currentTime: number; // in ms
  settings: AppSettings;
  customConfigs?: CustomConfigMap;
  getAudioEnergy?: () => number;
  bgMediaUrl: string | null;
  bgMediaType: 'image' | 'video';
}

const KANJI_REGEX = /[一-龯]/;
const KANA_REGEX = /[ぁ-んァ-ン]/;
const DARK_REGEX = /[狂壊殺闇絶毒死罪罰血]/;
const POP_REGEX = /[！？!?笑喜愛恋星]/;

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
  lyrics, currentTime, settings, customConfigs = {}, getAudioEnergy, bgMediaUrl, bgMediaType
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

  // Load background media
  useEffect(() => {
    if (!bgMediaUrl) return;
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
  }, [bgMediaUrl, bgMediaType]);

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
      }
      ctx.restore();

      // 1. Draw Background Visualizer
      if (settings.visualizerType === 'particles') {
         ctx.save();
         ctx.globalCompositeOperation = 'screen';
         for (let i=0; i<40; i++) {
           const x = ((Math.sin(renderTime * 0.0005 + i * 4.2) + 1) / 2) * width;
           const y = height - ((renderTime * (0.05 + (i%5)*0.01) + i * 123) % height);
           const r = 2 + Math.abs(Math.cos(i)) * 4 + (energy * 8);
           ctx.beginPath();
           ctx.arc(x, y, r, 0, Math.PI*2);
           ctx.fillStyle = `rgba(${visRgb}, ${0.1 + energy * 0.6})`;
           ctx.shadowColor = visHex;
           ctx.shadowBlur = 15;
           ctx.fill();
         }
         ctx.restore();
      } else if (settings.visualizerType === 'waveform') {
         ctx.save();
         ctx.globalCompositeOperation = 'screen';
         ctx.beginPath();
         ctx.moveTo(0, height);
         for(let i=0; i<=width; i+=15) {
            // Standing wave: no horizontal scrolling, just up and down
            const spatial = Math.sin(i * 0.015) + Math.cos(i * 0.025);
            const temporal = Math.sin(renderTime * 0.004) * 0.5 + Math.cos(renderTime * 0.006) * 0.5;
            const wave = Math.abs(spatial * temporal);
            const h = energy * 250 * (0.1 + wave);
            ctx.lineTo(i, height - h);
         }
         ctx.lineTo(width, height);
         ctx.fillStyle = `rgba(${visRgb}, 0.1)`;
         ctx.fill();
         ctx.strokeStyle = `rgba(${visRgb}, 0.4)`;
         ctx.lineWidth = 2;
         ctx.stroke();
         ctx.restore();
      } else if (settings.visualizerType === 'bars') {
         ctx.save();
         ctx.globalCompositeOperation = 'screen';
         const barWidth = 16;
         const gap = 8;
         for(let i=0; i<=width; i+=barWidth+gap) {
            // Pseudo random phase per bar, no scrolling
            const pseudoRnd = Math.sin(i * 12.9898);
            const wave = Math.sin(renderTime * 0.005 + pseudoRnd * Math.PI * 2) * 0.5 + 0.5;
            const h = energy * 300 * (0.05 + wave * 0.95);
            ctx.fillStyle = `rgba(${visRgb}, ${0.1 + wave * 0.5})`;
            ctx.shadowColor = visHex;
            ctx.shadowBlur = 10;
            ctx.fillRect(i, height - h, barWidth, h);
         }
         ctx.restore();
      } else if (settings.visualizerType === 'circle') {
         ctx.save();
         ctx.translate(width/2, height/2);
         ctx.globalCompositeOperation = 'screen';
         const radius = 200 + Math.pow(energy, 2) * 150;
         ctx.beginPath();
         for(let i=0; i<=Math.PI*2; i+=0.05) {
            // Standing wave on circle
            const spatial = Math.sin(i * 12);
            const temporal = Math.sin(renderTime * 0.005);
            const wave = spatial * temporal;
            const r = radius + wave * 40 * energy;
            const x = Math.cos(i) * r;
            const y = Math.sin(i) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
         }
         ctx.closePath();
         ctx.strokeStyle = `rgba(${visRgb}, 0.6)`;
         ctx.lineWidth = 4 + energy * 4;
         ctx.shadowColor = visHex;
         ctx.shadowBlur = 20;
         ctx.stroke();
         
         ctx.fillStyle = `rgba(${visRgb}, ${0.02 + energy * 0.08})`;
         ctx.fill();
         ctx.restore();
      } else if (settings.visualizerType === 'grid') {
         ctx.save();
         ctx.globalCompositeOperation = 'screen';
         ctx.strokeStyle = `rgba(${visRgb}, ${0.1 + energy * 0.4})`;
         ctx.lineWidth = 1 + energy * 3;
         ctx.shadowColor = visHex;
         ctx.shadowBlur = energy * 10;
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
        let isVertical = false;

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
            else if (isDark) motion = 'vocaloid';
            else if (isPop) motion = 'slide-up';
            else if (energy > 0.6) motion = 'slide-up';
            else if (energy < 0.2) motion = 'cinematic';
            else motion = ['telop', 'slide-up', 'typewriter', 'cinematic'][activeIndex % 4] as any;
          } else {
            motion = ['cinematic', 'slide-up', 'bounce', 'vocaloid', 'typewriter'][activeIndex % 5] as any;
          }
        }

        if (isAutoFont) {
          if (isDark) fontName = "'Reggae One', sans-serif";
          else if (isPop) fontName = "'Mochiy Pop One', sans-serif";
          else if (energy > 0.6) fontName = "'Rampart One', sans-serif";
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

        if ((isAutoMotion || isMixMotion) && (activeIndex % 4 === 3) && !isShort) {
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
                if (KANA_REGEX.test(c)) s = 0.5;
                else if (!KANJI_REGEX.test(c)) s = 0.7;
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
          if (customLineConf.fontSize) baseSize *= customLineConf.fontSize; // multiply by ratio
        }

        ctx.save();
        ctx.translate(width/2, height/2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Enhanced shadows similar to Assam
        ctx.shadowColor = `rgba(0,0,0,0.9)`;
        ctx.shadowBlur = 14 * (width/1000);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4 * (width/1000);

        const lines = text.split('\n');
        const lineSpacing = 1.5;
        const lineHeights = lines.map(() => baseSize * lineSpacing); // basic estimation, will be overridden by char sizes
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
            if (KANA_REGEX.test(c)) s = baseSize * 0.5;
            else if (!KANJI_REGEX.test(c)) s = baseSize * 0.7;

            // Char level override
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
            
            // Apply Custom Config Overrides (Char level)
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

            if (charMotion === 'typewriter') {
              ctx.globalAlpha = enterProgress > 0.5 ? 1 : 0;
              if (exitProgress > 0) ctx.globalAlpha = 1 - exitProgress;
            } else if (charMotion === 'slide-up') {
              const slideDist = isVertical ? size : size;
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
            ctx.strokeText(c, drawX, drawY);
            ctx.fillText(c, drawX, drawY);

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
