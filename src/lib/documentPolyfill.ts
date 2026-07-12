if (typeof self !== 'undefined' && typeof document === 'undefined') {
  (self as any).window = self;
  (self as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return new OffscreenCanvas(1, 1);
      }
      if (tag === 'a') return { href: '' };
      return { style: {} };
    },
    createElementNS: () => {
      return new OffscreenCanvas(1, 1);
    },
    getElementById: () => null,
    head: { appendChild: () => {} },
    querySelector: () => null
  };
}
