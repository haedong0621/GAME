/**
 * 큰 지도 (UI 씬 위, M키 / 휴대폰은 미니맵 누르기). 열려 있는 동안 월드는 멈춘다.
 * 지역 전체 그림 + 안개(가 본 곳만) + 내 위치·방향 + 가 본 장소 이름. 닫기: M / Esc / 아무 데나 누르기.
 * Godot: MapPanel.tscn (Control) — TextureRect 두 장(지도·안개) + 표시 아이콘 Label.
 */
import { MAP_SCALE } from './WorldMap.js';

const KIND = { village: { color: '#ffe08a', mark: '■' }, base: { color: '#9adf5a', mark: '⌂' }, landmark: { color: '#e8e8e8', mark: '▲' },
  danger: { color: '#ff9a80', mark: '×' }, area: { color: '#d8ccb0', mark: '' } };

export class MapPanel {
  /** @param {{map:import('./WorldMap.js').WorldMap, player, onClose:Function}} ctx */
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    const { map, player } = ctx;
    const sw = scene.scale.width, sh = scene.scale.height;
    const scale = Math.min((sw - 80) / map.w, (sh - 90) / map.h);
    const w = map.w * scale, h = map.h * scale;
    const x0 = (sw - w) / 2, y0 = (sh - h) / 2 + 10;
    this.root = scene.add.container(0, 0).setDepth(220); // 지역 이름 알림(200)보다 위
    const dim = scene.add.rectangle(sw / 2, sh / 2, sw, sh, 0x000000, 0.75).setInteractive();
    dim.on('pointerdown', () => this.close());
    this.root.add(dim);
    this.root.add(scene.add.rectangle(sw / 2, y0 + h / 2, w + 8, h + 8, 0x16130f).setStrokeStyle(2, 0x8a7450));
    this.root.add(scene.add.image(x0, y0, 'map-land').setOrigin(0, 0).setScale(scale));
    this.root.add(scene.add.image(x0, y0, 'map-fog').setOrigin(0, 0).setScale(scale));
    const toScreen = (wx, wy) => [x0 + wx * MAP_SCALE * scale, y0 + wy * MAP_SCALE * scale];
    // 가 본 장소 이름
    for (const p of map.places) {
      if (!map.isExplored(p.x, p.y)) continue;
      const k = KIND[p.kind] ?? KIND.area;
      const [sx, sy] = toScreen(p.x, p.y);
      const label = `${k.mark ? k.mark + ' ' : ''}${p.name}`;
      this.root.add(scene.add.text(sx, sy, label, {
        fontFamily: 'sans-serif', fontSize: p.kind === 'area' ? '12px' : '13px', fontStyle: p.kind === 'area' ? 'italic' : 'bold',
        color: k.color, stroke: '#14110d', strokeThickness: 3,
      }).setOrigin(0.5));
    }
    // 내 위치·방향 (깜빡임)
    const [px, py] = toScreen(player.x, player.y);
    const g = scene.add.graphics();
    const a = player.facingAngle ?? 0;
    g.fillStyle(0x6ec8ff, 1).lineStyle(2, 0x0a1a2a, 1);
    const tri = [0, -1, 1].map((k, i) => {
      const ang = a + (i === 0 ? 0 : k * 2.5);
      const r = i === 0 ? 9 : 6;
      return { x: px + Math.cos(ang) * r, y: py + Math.sin(ang) * r };
    });
    g.fillPoints(tri, true).strokePoints(tri, true);
    this.root.add(g);
    scene.tweens.add({ targets: g, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    // 제목·안내
    const clock = scene.registry.get('clock');
    this.root.add(scene.add.text(x0, y0 - 28, '지도', { fontFamily: 'serif', fontSize: '20px', fontStyle: 'bold', color: '#e8c860' }));
    this.root.add(scene.add.text(x0 + w, y0 - 24, `${clock?.label() ?? ''}   ·   M / Esc 닫기`, { fontFamily: 'sans-serif', fontSize: '12px', color: '#a89a80' }).setOrigin(1, 0));
    this.root.add(scene.add.text(x0, y0 + h + 8, '■ 마을   ⌂ 거점   ▲ 랜드마크   × 위험   — 가 본 곳만 밝혀져요', { fontFamily: 'sans-serif', fontSize: '12px', color: '#a89a80' }));

    this.onKey = (e) => { if (['KeyM', 'Escape'].includes(e.code)) { e.preventDefault(); this.close(); } };
    this.keyTimer = setTimeout(() => window.addEventListener('keydown', this.onKey), 0);
  }

  close() {
    clearTimeout(this.keyTimer);
    window.removeEventListener('keydown', this.onKey);
    this.scene.tweens.killTweensOf(this.root.list);
    this.root.destroy(true);
    this.ctx.onClose?.();
  }
}
