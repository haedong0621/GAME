import { applyYSort } from '../systems/YSort.js';

/**
 * 마을 사람. 주인공과 같은 층 그림(맨손 동작)을 옷만 바꿔 씀 — data/npcs.json의 outfit.
 * 제자리에서 숨 쉬고, 가까이 오면 플레이어 쪽을 봄. 머리 위에 이름, 퀘스트 표시(! 줄 것 있음 / ? 보고할 것 있음).
 * (x, y) = 발밑. 발밑은 막힘. E로 대화 (상호작용 목록에 들어감).
 * Godot: Npc.tscn = Node2D(층 Sprite2D들) + StaticBody2D + Area2D(대화 범위) + Label.
 */
export class Npc {
  /** @param {string} id npcs.json 이름 @param {object} def npcs.json[id] */
  constructor(scene, x, y, id, def) {
    this.scene = scene;
    this.id = id;
    this.def = def;
    this.x = x; this.y = y;
    this.label = `${def.name}와(과) 대화`;
    this.interactRadius = 34;
    this.isNpc = true;
    this.facing = Math.PI / 2;
    this.clock = Math.random() * 1000;
    const meta = scene.registry.get('heroPx');
    this.meta = meta;
    this.layers = {};
    if (meta) {
      for (const k of ['head', 'body', 'armsB', 'armsF', 'legs']) {
        const part = k.startsWith('arms') ? 'arms' : k;
        const key = meta.parts[part][def.outfit]?.fist?.[k] ?? meta.parts[part].rags.fist[k];
        this.layers[k] = scene.add.image(x, y, key, 0).setOrigin(meta.origin.x, meta.origin.y);
      }
    }
    this.nameText = scene.add.text(x, y - 40, def.name, { fontFamily: 'sans-serif', fontSize: '10px', color: '#f2e6c8', stroke: '#14110d', strokeThickness: 3, resolution: 2 })
      .setOrigin(0.5, 1);
    this.mark = scene.add.text(x, y - 50, '', { fontFamily: 'sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffe060', stroke: '#14110d', strokeThickness: 3, resolution: 2 })
      .setOrigin(0.5, 1);
    this.blocker = scene.add.zone(x, y - 4, 14, 8);
    this.update(0, null, null);
  }

  /** @param {number} dt @param {{x,y}} player @param {string} mark '!' | '?' | '' */
  update(dt, player, mark) {
    this.clock += dt;
    if (player && Math.hypot(player.x - this.x, player.y - this.y) < 90) this.facing = Math.atan2(player.y - this.y, player.x - this.x);
    const meta = this.meta;
    const depth = this.y;
    if (meta) {
      const cls = meta.classes.fist;
      const DIR8 = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
      const deg = this.facing * 180 / Math.PI;
      const [view, flip] = meta.dirs[DIR8[((Math.round(deg / 45) % 8) + 8) % 8]];
      const vi = meta.views.indexOf(view);
      const a = cls.anims.idle;
      const fi = (a.row + vi) * cls.columns + (Math.floor(this.clock / 600) % a.frames);
      meta.layerOrder[view].forEach((k, i) => {
        const img = this.layers[k];
        if (!img) return;
        img.setFrame(fi).setFlipX(flip).setDepth(depth + i * 0.001);
      });
    } else applyYSort(this);
    this.nameText.setDepth(depth + 1);
    this.mark.setText(mark ?? '').setDepth(depth + 1).setColor(mark === '?' ? '#9fdcff' : '#ffe060');
    this.mark.y = this.y - 50 + Math.sin(this.clock / 200) * 1.5;
  }
}
