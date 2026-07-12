export interface LyricLine {
  id: string;
  time: number; // in milliseconds
  endTime?: number; // in milliseconds
  text: string;
}

export function parseLrc(content: string): LyricLine[] {
  // Simple heuristic: if it contains "-->", treat it as SRT
  if (content.includes('-->')) {
    return parseSrt(content);
  }

  const lines = content.split('\n');
  const lyrics: LyricLine[] = [];
  const timeRegEx = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = timeRegEx.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      // Handle both .xx (10ms) and .xxx (1ms) formats
      let milliseconds = parseInt(match[3], 10);
      if (match[3].length === 2) {
        milliseconds *= 10;
      }
      
      const time = (minutes * 60 + seconds) * 1000 + milliseconds;
      const text = line.replace(timeRegEx, '').trim();
      
      lyrics.push({
        id: `lyric-${i}-${time}`,
        time,
        text
      });
    }
  }
  
  return lyrics.sort((a, b) => a.time - b.time);
}

function parseSrt(content: string): LyricLine[] {
  const lyrics: LyricLine[] = [];
  const blocks = content.replace(/\r\n/g, '\n').split('\n\n');
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    
    const lines = block.split('\n');
    if (lines.length >= 2) {
      const timeLineIndex = lines.findIndex(l => l.includes('-->'));
      if (timeLineIndex !== -1) {
        const timeLine = lines[timeLineIndex];
        const match = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->/);
        if (match) {
          const h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const s = parseInt(match[3], 10);
          const ms = parseInt(match[4], 10);
          const time = (h * 3600 + m * 60 + s) * 1000 + ms;
          const text = lines.slice(timeLineIndex + 1).join('\n').trim();
          
          let endTime: number | undefined;
          const endMatch = timeLine.match(/-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
          if (endMatch) {
            const eh = parseInt(endMatch[1], 10);
            const em = parseInt(endMatch[2], 10);
            const es = parseInt(endMatch[3], 10);
            const ems = parseInt(endMatch[4], 10);
            endTime = (eh * 3600 + em * 60 + es) * 1000 + ems;
          }
          
          lyrics.push({
            id: `srt-${i}-${time}`,
            time,
            endTime,
            text
          });
        }
      }
    }
  }
  
  return lyrics.sort((a, b) => a.time - b.time);
}
