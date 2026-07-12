import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LyricLine } from '../lib/lrcParser';
import type { AppSettings } from '../types';
import './LyricDisplay.css';

interface Props {
  lyrics: LyricLine[];
  currentTime: number;
  settings: AppSettings;
  getAudioEnergy?: () => number;
}

const KANJI_REGEX = /[一-龯]/;
const KANA_REGEX = /[ぁ-んァ-ン]/;
const DARK_REGEX = /[狂壊殺闇絶毒死罪罰血]/;
const POP_REGEX = /[！？!?笑喜愛恋星]/;

export const LyricDisplay: React.FC<Props> = ({ lyrics, currentTime, settings, getAudioEnergy }) => {
  const activeIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) {
        return i;
      }
    }
    return -1;
  }, [lyrics, currentTime]);

  const activeLine = activeIndex >= 0 ? lyrics[activeIndex] : null;
  const nextLine = activeIndex >= 0 && activeIndex + 1 < lyrics.length ? lyrics[activeIndex + 1] : null;

  // Compute config dynamically per-line (Audio/Semantic reactivity)
  const lineConfig = useMemo(() => {
    if (!activeLine) return null;
    
    let motion = settings.motionType;
    let font = settings.fontFamily;
    let color = settings.textColor;
    let size = settings.fontSize;
    let isVertical = false;

    const text = activeLine.text;
    const energy = getAudioEnergy ? getAudioEnergy() : 0;
    
    const isAutoMotion = settings.motionType === 'auto';
    const isAutoFont = settings.fontFamily === 'auto';
    const isAutoColor = settings.autoColor;
    const isMixMotion = settings.motionType === 'mix';

    const isDark = DARK_REGEX.test(text);
    const isPop = POP_REGEX.test(text);
    const isShort = text.replace(/[ 　]/g, '').length <= 4;
    
    const isPortrait = settings.aspectRatio === '9:16';
    const longCutoff = isPortrait ? 10 : 15;
    const isVeryLong = text.length > longCutoff;

    // AI Auto Motion Logic
    if (isAutoMotion || isMixMotion) {
      if (isAutoMotion) {
        if (isShort) motion = 'bounce';
        else if (isDark) motion = 'vocaloid';
        else if (isPop) motion = 'slide-up';
        else if (energy > 0.6) motion = 'slide-up';
        else if (energy < 0.2) motion = 'cinematic';
        else {
          const motions = ['telop', 'slide-up', 'typewriter', 'cinematic'];
          motion = motions[activeIndex % motions.length] as any;
        }
      } else {
        const motions: any[] = ['cinematic', 'slide-up', 'bounce', 'vocaloid', 'typewriter'];
        motion = motions[activeIndex % motions.length];
      }
    }

    // AI Auto Font Logic
    if (isAutoFont) {
      if (isDark) font = "'Reggae One', sans-serif";
      else if (isPop) font = "'Mochiy Pop One', sans-serif";
      else if (energy > 0.6) font = "'Rampart One', sans-serif";
      else if (energy < 0.2) font = "'Shippori Mincho', serif";
      else font = "'Noto Sans JP', sans-serif";
    }

    // AI Auto Color Logic
    if (isAutoColor) {
      if (isDark) color = '#ff4444'; // Red
      else if (isPop) color = '#ffcc00'; // Yellow
      else if (energy > 0.7) color = '#00ffff'; // Cyan
      else color = '#ffffff'; // White
    }

    // Size adjustment
    // Base font scaling for portrait to ensure it fits the narrower width
    let baseSize = isPortrait ? settings.fontSize * 0.7 : settings.fontSize;

    if (isShort && isAutoMotion) {
      size = baseSize * 2.5; // Giant text for short shouts
    } else if (isVeryLong) {
      size = baseSize * Math.max(0.6, longCutoff / text.length);
    } else {
      size = baseSize;
    }

    if ((isAutoMotion || isMixMotion) && (activeIndex % 4 === 3) && !isShort) {
      isVertical = true;
    }

    return { motion, font, color, size, isVertical };
  }, [activeIndex, activeLine, settings.motionType, settings.fontFamily, settings.autoColor, settings.fontSize, settings.textColor]);

  if (!activeLine || !activeLine.text || !lineConfig) return null;

  const durationSec = nextLine ? (nextLine.time - activeLine.time) / 1000 : 3.0;
  const { motion: currentMotion, font: currentFont, color: currentColor, size: dynamicFontSize, isVertical } = lineConfig;

  const baseStyle: React.CSSProperties = {
    fontFamily: currentFont,
    color: currentColor,
    position: 'absolute',
    width: isVertical ? 'auto' : '100%',
    height: isVertical ? '90%' : 'auto',
    left: '50%',
    top: '50%',
    writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
    wordBreak: 'auto-phrase',
    lineBreak: 'strict',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    alignContent: 'center',
    // Add text shadow matching color to pop
    textShadow: `0 4px 20px rgba(0,0,0,0.8), 0 0 10px ${currentColor}88`
  };

  const getCharStyle = (char: string): React.CSSProperties => {
    let size = dynamicFontSize;
    if (KANA_REGEX.test(char)) {
      size = dynamicFontSize * 0.5;
    } else if (!KANJI_REGEX.test(char)) {
      size = dynamicFontSize * 0.7;
    }
    return {
      fontSize: `${size}px`,
      display: 'inline-block',
      lineHeight: '1.2',
    };
  };

  const renderTextWithWords = (
    renderChar: (char: string, index: number) => React.ReactNode
  ) => {
    const words = activeLine.text.split(/([ 　]+)/);
    let globalCharIndex = 0;

    return words.map((word, wordIdx) => {
      const isSpace = /^[ 　]+$/.test(word);
      if (isSpace) {
        return <span key={`space-${wordIdx}`} style={{ width: isVertical ? '100%' : '10px', height: isVertical ? '10px' : 'auto' }} />;
      }
      
      return (
        <span key={`word-${wordIdx}`} style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'baseline' }}>
          {word.split('').map((char) => {
            const node = renderChar(char, globalCharIndex);
            globalCharIndex++;
            return node;
          })}
        </span>
      );
    });
  };

  // 1. Telop
  const renderTelop = () => {
    return (
      <AnimatePresence>
        <motion.div
          key={activeLine.id}
          initial={{ opacity: 0, x: '-50%', y: '-40%' }}
          animate={{ opacity: 1, x: '-50%', y: '-50%' }}
          exit={{ opacity: 0, x: '-50%', y: '-60%', filter: 'blur(5px)', transition: { duration: 0.3 } }}
          transition={{ duration: Math.min(0.5, durationSec * 0.3) }}
          className="lyric-line telop"
          style={baseStyle}
        >
          {renderTextWithWords((char, i) => (
            <span key={i} style={getCharStyle(char)}>{char}</span>
          ))}
        </motion.div>
      </AnimatePresence>
    );
  };

  // 2. Cinematic
  const renderCinematic = () => (
    <AnimatePresence>
      <motion.div
        key={activeLine.id}
        initial={{ opacity: 0, scale: 0.98, x: '-50%', y: '-50%', filter: 'blur(15px)' }}
        animate={{ opacity: 1, scale: 1.02, x: '-50%', y: '-50%', filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 1.04, x: '-50%', y: '-50%', filter: 'blur(10px)', transition: { duration: 0.4 } }}
        transition={{ duration: durationSec * 0.8, ease: "easeOut" }}
        className="lyric-line cinematic"
        style={baseStyle}
      >
        {renderTextWithWords((char, i) => (
          <span key={i} style={getCharStyle(char)}>{char}</span>
        ))}
      </motion.div>
    </AnimatePresence>
  );

  // Helper for character-by-character animations
  const renderChars = () => {
    const totalChars = activeLine.text.replace(/[ 　]/g, '').length;
    const maxTotalDelay = durationSec * 0.6;
    const staggerDelay = Math.min(0.15, maxTotalDelay / Math.max(1, totalChars));

    return (
      <AnimatePresence>
        <motion.div
          key={activeLine.id}
          className={`lyric-line ${currentMotion}`}
          style={{...baseStyle, gap: currentMotion === 'vocaloid' || currentMotion === 'bounce' ? '2px' : '0px'}}
          initial={{ x: '-50%', y: '-50%' }}
          animate={{ x: '-50%', y: '-50%' }}
          exit={{ opacity: 0, x: '-50%', y: '-50%', filter: 'blur(8px)', transition: { duration: 0.3 } }}
        >
          {renderTextWithWords((char, index) => {
            const delay = index * staggerDelay;
            let initial: any, animate: any, transition: any;

            if (currentMotion === 'typewriter') {
              initial = { opacity: 0 };
              animate = { opacity: 1 };
              transition = { duration: 0.01, delay };
            } else if (currentMotion === 'slide-up') {
              initial = { opacity: 0, [isVertical ? 'x' : 'y']: isVertical ? dynamicFontSize : dynamicFontSize };
              animate = { opacity: 1, [isVertical ? 'x' : 'y']: 0 };
              transition = { duration: 0.4, ease: "backOut", delay };
            } else if (currentMotion === 'bounce') {
              initial = { opacity: 0, scale: 0, [isVertical ? 'x' : 'y']: 20 };
              animate = { opacity: 1, scale: 1, [isVertical ? 'x' : 'y']: 0 };
              transition = { type: 'spring', damping: 8, stiffness: 200, delay };
            } else {
              // vocaloid
              initial = { opacity: 0, scale: 0.1, y: Math.random() * 100 - 50, x: Math.random() * 100 - 50, rotate: Math.random() * 90 - 45 };
              animate = { opacity: 1, scale: 1, y: 0, x: 0, rotate: 0 };
              transition = { type: 'spring', damping: 12, stiffness: 100, delay };
            }

            return (
              <motion.span
                key={`${activeLine.id}-${index}`}
                initial={initial}
                animate={animate}
                transition={transition}
                style={getCharStyle(char)}
              >
                {char}
              </motion.span>
            );
          })}
        </motion.div>
      </AnimatePresence>
    );
  };

  const renderContent = () => {
    switch (currentMotion) {
      case 'cinematic': return renderCinematic();
      case 'telop': return renderTelop();
      default: return renderChars(); // Handles typewriter, slide-up, bounce, vocaloid
    }
  };

  return (
    <div className="lyric-display-container">
      {renderContent()}
    </div>
  );
};
