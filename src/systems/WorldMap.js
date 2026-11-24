/**
 * 지도: 작은 맵 그림(바닥 조각을 1/8로 줄여 한 장) + 안개(가 본 곳만 밝혀짐) + 장소 이름.
 * 미니맵(UI 오른쪽 위)과 큰 지도(M)가 같은 그림·안개를 쓴다.
 *   안개: 칸마다 "가 봄" 기록 → 안개 그림에서 그 둘레를 지움. 저장은 칸 기록을 줄여 쓴 글자(RLE).
 * Godot: WorldMap.gd — Image로 축소 지도, 안개는 Image + ImageTexture(가 본 칸을 투명하게), 미니맵은 SubViewport 또는 TextureRect 일부.
 */
export const MAP_SCALE = 1 / 8;          // 월드 1px → 지도 1/8px (32px 칸 = 지도 4px)
const REVEAL_TILES = 9;                   // 이 반경(칸) 안을 밝힘

export class WorldMap {
  /**
   * @param {Phaser.Scene} scene 월드 씬
   * @param {{chunks:Array}} terrainData 굽기 결과 (바닥 조각 목록)
   * @param {number} tilesW @param {number} tilesH @param {number} tile
   * @param {{name:string,x:number,y:number,kind:string}[]} places
   */
  constructor(scene, terrainData, tilesW, tilesH, tile, places) {
    this.scene = scene;
    this.tw = tilesW; this.th = tilesH; this.tile = tile;
    this.w = Math.ceil(tilesW * tile * MAP_SCALE); this.h = Math.ceil(tilesH * tile * MAP_SCALE);
    this.places = places;
    this.explored = new Uint8Array(tilesW * tilesH);
    const tex = scene.textures;
    // 지도 그림 (한 번만 만듦)
    if (tex.exists('map-land')) tex.remove('map-land');
    const land = tex.createCanvas('map-land', this.w, this.h);
    const ctx = land.getContext();
    ctx.imageSmoothingEnabled = true;
    for (const c of terrainData?.chunks ?? []) {
      const src = tex.get(c.key).getSourceImage();
      ctx.drawImage(src, c.x * MAP_SCALE, c.y * MAP_SCALE, src.width * MAP_SCALE, src.height * MAP_SCALE);
    }
    land.refresh();
    // 안개
    if (tex.exists('map-fog')) tex.remove('map-fog');
    this.fog = tex.createCanvas('map-fog', this.w, this.h);
    const f = this.fog.getContext();
    f.fillStyle = 'rgb(12, 12, 16)';
    f.fillRect(0, 0, this.w, this.h);
    this.fog.refresh();
    this.lastTile = null;
  }

  /** 플레이어가 움직이면 둘레를 밝힘 (칸이 바뀔 때만) */
  update(x, y) {
    const tx = Math.floor(x / this.tile), ty = Math.floor(y / this.tile);
    if (this.lastTile && this.lastTile[0] === tx && this.lastTile[1] === ty) return;
    this.lastTile = [tx, ty];
    let changed = false;
    const R = REVEAL_TILES;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const X = tx + dx, Y = ty + dy;
        if (X < 0 || Y < 0 || X >= this.tw || Y >= this.th) continue;
        const i = Y * this.tw + X;
        if (!this.explored[i]) { this.explored[i] = 1; changed = true; }
      }
    }
    if (changed) this.revealAround(x * MAP_SCALE, y * MAP_SCALE, R * this.tile * MAP_SCALE);
  }

  /** 안개 그림에서 둥글게 지움 (가장자리는 부드럽게) */
  revealAround(mx, my, r) {
    const f = this.fog.getContext();
    f.save();
    f.globalCompositeOperation = 'destination-out';
    const g = f.createRadialGradient(mx, my, r * 0.6, mx, my, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g;
    f.beginPath(); f.arc(mx, my, r, 0, Math.PI * 2); f.fill();
    f.restore();
    this.fog.refresh();
  }

  isExplored(x, y) {
    const tx = Math.floor(x / this.tile), ty = Math.floor(y / this.tile);
    return !!this.explored[ty * this.tw + tx];
  }

  /** 저장: 0·1 줄을 "개수,개수,…" (0부터 번갈아) */
  toJSON() {
    const runs = [];
    let cur = 0, n = 0;
    for (const v of this.explored) { if (v === cur) n++; else { runs.push(n); cur = v; n = 1; } }
    runs.push(n);
    return { w: this.tw, h: this.th, runs: runs.join(',') };
  }

  load(d) {
    if (!d?.runs || d.w !== this.tw || d.h !== this.th) return;
    let i = 0, v = 0;
    for (const s of d.runs.split(',')) { const n = Number(s); this.explored.fill(v, i, i + n); i += n; v ^= 1; }
    // 안개 다시 그리기: 가 본 칸마다 작게 지움
    const f = this.fog.getContext();
    f.save();
    f.globalCompositeOperation = 'destination-out';
    const s = this.tile * MAP_SCALE;
    for (let y = 0; y < this.th; y++) for (let x = 0; x < this.tw; x++) {
      if (this.explored[y * this.tw + x]) { f.fillRect(x * s - 1, y * s - 1, s + 2, s + 2); }
    }
    f.restore();
    this.fog.refresh();
  }
}
