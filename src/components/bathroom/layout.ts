// Browser-safe shared tile layout and interaction rules.
export const TILE_LAYOUT = { width: 1.2, height: 0.6, joint: 0.0036 } as const;

export function tileGridOffset(origin: number, size: number) {
  return ((origin % size) + size) % size - size;
}

export function gridPieces(rect: { u0: number; u1: number; v0: number; v1: number }, offset: readonly [number, number]) {
  const pieces: typeof rect[] = [];
  for (let u = offset[0]; u < rect.u1; u += TILE_LAYOUT.width) {
    for (let v = offset[1]; v < rect.v1; v += TILE_LAYOUT.height) {
      const piece = { u0: Math.max(u, rect.u0), u1: Math.min(u + TILE_LAYOUT.width, rect.u1), v0: Math.max(v, rect.v0), v1: Math.min(v + TILE_LAYOUT.height, rect.v1) };
      if (piece.u1 > piece.u0 + 0.0001 && piece.v1 > piece.v0 + 0.0001) pieces.push(piece);
    }
  }
  return pieces;
}

export function bathFillTarget(manual: boolean, hovered: boolean, finished: boolean) {
  return finished && (manual || hovered) ? 1 : 0;
}

export function nicheLightLevels(enabled: boolean, installed: boolean) {
  return { shower: enabled && installed ? 1 : 0, wc: enabled && installed ? 1 : 0 };
}
