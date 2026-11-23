import { TILE_SIZE as T } from '../config.js';

/**
 * 높낮이 (2단: 낮은 땅 / 고지대). 맵의 height 레이어를 읽는다 — tools/art/pixel_world.py --remap 과 같은 규칙.
 *   높이값 0 낮은 땅, 1 절벽 고지대(벽면 2칸), 2 낮은 턱 고지대(벽면 1칸, 뛰어내리기 가능), 3 오르막(계단)
 * 벽면 타일은 타일 충돌(collides)로 막고, 고지대의 북·동·서 가장자리는 여기서 얇은 벽을 만들어 막는다.
 * 덩굴(맵 오브젝트 type=climb 사각형)이 덮인 절벽 벽면만 기어오를 수 있다.
 * Godot: TileMap 높이 레이어 + 가장자리 StaticBody2D(세그먼트), 덩굴은 Area2D.
 */
export class Terrain {
  constructor(map, climbRects) {
    this.w = map.width;
    this.h = map.height;
    const hl = map.getLayer('height');
    const ts = map.tilesets.find((t) => t.name === 'height_marks');
    /** @type {number[][]} */
    this.H = [];
    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) {
        const idx = hl && ts ? hl.data[y][x].index : -1;
        row.push(idx >= ts?.firstgid ? idx - ts.firstgid + 1 : 0);
      }
      this.H.push(row);
    }
    /** 벽면 칸: "x,y" → 'top' | 'bot' | 'ledge' | 'ramp_top' | 'ramp_bot' | 'ramp_ledge' */
    this.face = new Map();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.isHighTile(x, y) || this.isHighTile(x, y + 1)) continue;
        const rows = this.H[y][x] === 1 ? ['top', 'bot'] : ['ledge'];
        for (let k = 0; k < rows.length; k++) {
          const Y = y + 1 + k;
          if (Y >= this.h || this.isHighTile(x, Y)) break;
          this.face.set(`${x},${Y}`, this.H[Y][x] === 3 ? `ramp_${rows[k]}` : rows[k]);
        }
      }
    }
    this.climbRects = climbRects;
  }

  isHighTile(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && (this.H[ty][tx] === 1 || this.H[ty][tx] === 2);
  }

  isHigh(x, y) { return this.isHighTile(Math.floor(x / T), Math.floor(y / T)); }

  faceAt(x, y) { return this.face.get(`${Math.floor(x / T)},${Math.floor(y / T)}`) ?? null; }

  /** 덩굴이 덮인 절벽 벽면인가 */
  climbableAt(x, y) {
    const f = this.faceAt(x, y);
    if (f !== 'top' && f !== 'bot') return false;
    return this.climbRects.some((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
  }

  /** 고지대 가장자리 얇은 벽 (북·동·서). 이어지는 구간은 하나로 합친다. @returns {{x,y,width,height}[]} */
  edgeWalls() {
    const walls = [];
    const low = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && !this.isHighTile(x, y) && !this.face.has(`${x},${y}`);
    const TH = 4;
    // 북쪽 가장자리 (가로)
    for (let y = 0; y < this.h; y++) {
      let run = null;
      for (let x = 0; x <= this.w; x++) {
        const on = x < this.w && this.isHighTile(x, y) && low(x, y - 1);
        if (on && !run) run = x;
        if (!on && run !== null) { walls.push({ x: run * T, y: y * T - TH / 2, width: (x - run) * T, height: TH }); run = null; }
      }
    }
    // 동·서 가장자리 (세로)
    for (const side of [-1, 1]) {
      for (let x = 0; x < this.w; x++) {
        let run = null;
        for (let y = 0; y <= this.h; y++) {
          const on = y < this.h && this.isHighTile(x, y) && low(x + side, y);
          if (on && run === null) run = y;
          if (!on && run !== null) {
            const bx = side < 0 ? x * T : (x + 1) * T;
            walls.push({ x: bx - TH / 2, y: run * T, width: TH, height: (y - run) * T });
            run = null;
          }
        }
      }
    }
    return walls;
  }

  /** 벽면 위 고지대에서 아래로 뛰어내려 닿는 자리 (낮은 턱만). 없으면 null */
  ledgeLanding(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (!this.isHighTile(tx, ty) || this.face.get(`${tx},${ty + 1}`) !== 'ledge') return null;
    return { x, y: (ty + 2) * T + 14 }; // 발 상자(높이 10)가 벽면 칸에 걸리지 않게
  }

  /** 덩굴 타고 오르내릴 목표 지점. dir = -1 위로, +1 아래로 */
  climbTarget(x, y, dir) {
    const tx = Math.floor(x / T);
    let ty = Math.floor(y / T);
    if (dir < 0) {
      // 아래 땅 → 벽면 위로 지나 고지대 맨 아래 칸
      ty -= 1;
      while (ty >= 0 && this.face.has(`${tx},${ty}`)) ty--;
      return this.isHighTile(tx, ty) ? { x, y: ty * T + T - 6 } : null;
    }
    ty += 1;
    while (ty < this.h && this.face.has(`${tx},${ty}`)) ty++;
    return ty < this.h && !this.isHighTile(tx, ty) ? { x, y: ty * T + 10 } : null;
  }
}
