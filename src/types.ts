export interface AppSettings {
  motionType: 'telop' | 'vocaloid' | 'cinematic' | 'typewriter' | 'slide-up' | 'bounce' | 'mix' | 'auto';
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
}

export const FONTS = [
  { name: 'Noto Sans JP (標準ゴシック)', value: "'Noto Sans JP', sans-serif" },
  { name: 'Zen Kaku Gothic New (角ゴシック)', value: "'Zen Kaku Gothic New', sans-serif" },
  { name: 'Shippori Mincho (しっぽり明朝)', value: "'Shippori Mincho', serif" },
  { name: 'Noto Serif JP (標準明朝)', value: "'Noto Serif JP', serif" },
  { name: 'M PLUS Rounded 1c (丸ゴシック)', value: "'M PLUS Rounded 1c', sans-serif" },
  { name: 'Mochiy Pop One (ポップ)', value: "'Mochiy Pop One', sans-serif" },
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
