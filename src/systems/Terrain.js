/**
 * 높낮이 (2단: 낮은 땅 / 고지대). tools/art/terrain_bake.py가 구운 격자(maps/<맵>_terrain.json)를 읽는다.
 *   격자 칸(8px): '.' 낮은 땅  '^' 고지대  'C' 절벽 벽면  'L' 낮은 턱 벽면  '#' 고지대 경계띠  'R' 계단
 *   C·L·# 는 막힘 (구불구불한 경계를 8px 계단으로 근사). 그림은 같은 모양으로 구운 큰 이미지 조각.
 * 덩굴(climb 사각형)이 덮인 절벽 벽면만 기어오를 수 있고, 낮은 턱 벽면은 위에서 아래로 뛰어내릴 수 있다.
 * Godot: 같은 격자에서 충돌 사각형(StaticBody2D)을 만들고, 그림 조각은 Sprite2D.
 */
const SOLID = new Set(['C', 'L', '#']);

export class Terrain {
  /** @param {{cell:number, cols:number, rows:number, grid:string[], climb:object[]}} data */
  constructor(data) {
    this.cell = data?.cell ?? 8;
    this.cols = data?.cols ?? 0;
    this.rows = data?.rows ?? 0;
    this.grid = data?.grid ?? [];
    this.climbRects = data?.climb ?? [];
  }

  at(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return '.';
    return this.grid[cy][cx];
  }

  cellOf(x, y) { return [Math.floor(x / this.cell), Math.floor(y / this.cell)]; }

  isHigh(x, y) {
    const [cx, cy] = this.cellOf(x, y);
    const c = this.at(cx, cy);
    return c === '^' || (c === '#' && this.at(cx, cy - 1) === '^');
  }

  /** 막힌 칸들을 큰 사각형으로 합쳐 돌려준다 (가로로 잇고, 같은 폭이 아래로 이어지면 합침) */
  solidRects() {
    const out = [];
    const open = new Map(); // "x0,x1" → 위에서부터 이어지는 사각형
    for (let cy = 0; cy < this.rows; cy++) {
      const runs = [];
      let start = -1;
      for (let cx = 0; cx <= this.cols; cx++) {
        const s = cx < this.cols && SOLID.has(this.grid[cy][cx]);
        if (s && start < 0) start = cx;
        if (!s && start >= 0) { runs.push(`${start},${cx}`); start = -1; }
      }
      const next = new Map();
      for (const k of runs) {
        const r = open.get(k);
        if (r) { r.h += 1; next.set(k, r); open.delete(k); }
        else { const [a, b] = k.split(',').map(Number); next.set(k, { x: a, y: cy, w: b - a, h: 1 }); }
      }
      for (const r of open.values()) out.push(r);
      open.clear();
      for (const [k, r] of next) open.set(k, r);
    }
    for (const r of open.values()) out.push(r);
    const c = this.cell;
    return out.map((r) => ({ x: r.x * c, y: r.y * c, width: r.w * c, height: r.h * c }));
  }

  /** 덩굴이 덮인 절벽 벽면인가 */
  climbableAt(x, y) {
    const [cx, cy] = this.cellOf(x, y);
    const c = this.at(cx, cy);
    if (c !== 'C' && c !== '#') return false;
    // 굽힌 벽면은 위치마다 높이가 달라 사각형보다 조금 길 수 있음 → 위아래로 넉넉히
    return this.climbRects.some((r) => x >= r.x && x <= r.x + r.width && y >= r.y - 32 && y <= r.y + r.height + 32);
  }

  /** 낮은 턱 위에서 아래로 뛰어내려 닿는 자리. 발 폭(세 열) 모두 낮은 턱 벽면 아래 빈 땅이 있어야 함. 절벽(C)이면 null */
  ledgeLanding(x, y) {
    const [, cy0] = this.cellOf(x, y);
    let land = -1;
    for (const dx of [-6, 0, 6]) {
      const cx = Math.floor((x + dx) / this.cell);
      let sawLedge = false, found = -1;
      for (let cy = cy0; cy < cy0 + 14 && found < 0; cy++) {
        const c = this.at(cx, cy);
        if (c === 'C') return null;
        if (c === 'L') sawLedge = true;
        if ((c === '.' || c === 'R') && sawLedge) found = cy;
      }
      if (dx === 0 && found < 0) return null;
      if (found >= 0) land = Math.max(land, found);
    }
    if (land < 0) return null;
    return { x, y: (land + 1) * this.cell + 4 };
  }

  /** 덩굴 타고 오르내릴 목표 지점. dir = -1 위로(고지대로), +1 아래로(낮은 땅으로) */
  climbTarget(x, y, dir) {
    const [cx, cy0] = this.cellOf(x, y);
    for (let i = 0, cy = cy0; i < 20; i++, cy += dir) {
      const c = this.at(cx, cy);
      if (dir < 0 && c === '^') return { x, y: (cy + 1) * this.cell - 1 };
      if (dir > 0 && c === '.') return { x, y: cy * this.cell + 11 };
    }
    return null;
  }
}
