export interface AppSettings {
  motionType: 'telop' | 'vocaloid' | 'cinematic' | 'typewriter' | 'slide-up' | 'bounce' | 'glitch' | 'fade' | 'zoom-in' | 'rotate' | 'shake-pop' | 'mix' | 'auto';
  fontFamily: string;
  fontSize: number;
  autoSize: boolean;
  textColor: string;
  autoColor: boolean;
  beatSyncIntensity: number;
  aspectRatio: '16:9' | '9:16';
  songTitle: string;
  artistName: string;
  overlayStyle: 'none' | 'intro' | 'corner';
  visualizerType: 'none' | 'particles' | 'waveform' | 'bars' | 'circle' | 'grid';
  visualizerColor: string;
  visualizerSensitivity: number;
  visualizerOpacity?: number;
  effectType: 'none' | 'vhs' | 'rgb-shift' | 'glitch' | 'shake' | 'bloom' | 'flash' | 'cinema' | 'vintage' | 'halftone' | 'negative' | 'rainbow' | 'lightning' | 'fire' | 'laser' | 'fireworks';
  kanjiEmphasis: boolean;
  writingMode?: 'horizontal' | 'vertical';
  positionX?: 'left' | 'center' | 'right';
  positionY?: 'top' | 'center' | 'bottom';
}

export const FONTS = [
  { name: 'Noto Sans JP (標準ゴシック)', value: "'Noto Sans JP', sans-serif" },
  { name: 'Zen Kaku Gothic New (角ゴシック)', value: "'Zen Kaku Gothic New', sans-serif" },
  { name: 'Shippori Mincho (しっぽり明朝)', value: "'Shippori Mincho', serif" },
  { name: 'Noto Serif JP (標準明朝)', value: "'Noto Serif JP', serif" },
  { name: 'Kaisei Tokumin (魁星特民・力強明朝)', value: "'Kaisei Tokumin', serif" },
  { name: 'M PLUS Rounded 1c (丸ゴシック)', value: "'M PLUS Rounded 1c', sans-serif" },
  { name: 'Yomogi (よもぎ・手書きペン)', value: "'Yomogi', cursive" },
  { name: 'Yusei Magic (油性マジック手書き)', value: "'Yusei Magic', sans-serif" },
  { name: 'Mochiy Pop One (ポップ)', value: "'Mochiy Pop One', sans-serif" },
  { name: 'Potta One (極太インパクト)', value: "'Potta One', display" },
  { name: 'RocknRoll One (ロック・ノリ系)', value: "'RocknRoll One', sans-serif" },
  { name: 'Dela Gothic One (極太ゴシック)', value: "'Dela Gothic One', sans-serif" },
  { name: 'Rampart One (ブロック極太)', value: "'Rampart One', sans-serif" },
  { name: 'Reggae One (トゲトゲ病み系)', value: "'Reggae One', sans-serif" },
  { name: 'DotGothic16 (ピクセル風)', value: "'DotGothic16', sans-serif" }
];

export interface CharacterConfig {
  fontFamily?: string;
  textColor?: string;
  fontSize?: number;
  motionType?: string;
}

export interface LineConfig {
  fontFamily?: string;
  textColor?: string;
  fontSize?: number;
  motionType?: string;
  chars?: Record<number, CharacterConfig>;
}

export type CustomConfigMap = Record<string, LineConfig>;
