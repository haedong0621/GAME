import { applyYSort } from '../systems/YSort.js';

/**
 * 마을 사람. 주인공과 같은 층 그림(맨손 동작)을 옷만 바꿔 씀 — data/npcs.json의 outfit.
 * 제자리에서 숨 쉬고, 가까이 오면 플레이어 쪽을 봄. 머리 위에 이름, 퀘스트 표시(! 줄 것 있음 / ? 보고할 것 있음), 말풍선.
 * (x, y) = 발밑. 발밑은 막힘. E로 대화 (상호작용 목록에 들어감).
 * 움직이는 NPC(동료)는 바깥(Companion)이 moveTo로 위치를 옮기고 anim('idle'|'walk'|'run')·facing을 정한다.
 * Godot: Npc.tscn = Node2D(층 Sprite2D들) + StaticBody2D(또는 CharacterBody2D) + Area2D(대화 범위) + Label.
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
    this.anim = 'idle';
    this.moving = false;      // true면 바깥이 facing을 정함 (플레이어 쪽을 안 봄)
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
    this.bubble = null;
    this.blocker = scene.add.zone(x, y - 4, 14, 8);
    this.update(0, null, null);
  }

  /** 발밑 위치 옮기기 (그림·이름·말풍선은 update에서 따라옴) */
  moveTo(x, y) { this.x = x; this.y = y; }

  /** 머리 위 말풍선 (ms 동안) */
  say(text, ms = 3800) {
    this.bubble?.destroy();
    this.bubble = this.scene.add.text(this.x, this.y - 44, text, {
      fontFamily: 'sans-serif', fontSize: '9px', color: '#1b1610', backgroundColor: '#f2e8d0',
      padding: { x: 5, y: 3 }, wordWrap: { width: 150, useAdvancedWrap: true }, align: 'center', resolution: 2,
    }).setOrigin(0.5, 1).setDepth(99990);
    this.bubbleLeft = ms;
  }

  /** @param {number} dt @param {{x,y}} player @param {string} mark '!' | '?' | '' */
  update(dt, player, mark) {
    this.clock += dt;
    if (!this.moving && player && Math.hypot(player.x - this.x, player.y - this.y) < 90) this.facing = Math.atan2(player.y - this.y, player.x - this.x);
    const meta = this.meta;
    const depth = this.y;
    if (meta) {
      const cls = meta.classes.fist;
      const DIR8 = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
      const deg = this.facing * 180 / Math.PI;
      const [view, flip] = meta.dirs[DIR8[((Math.round(deg / 45) % 8) + 8) % 8]];
      const vi = meta.views.indexOf(view);
      const a = cls.anims[this.anim] ?? cls.anims.idle;
      const frameMs = this.anim === 'run' ? 110 : this.anim === 'walk' ? 160 : 600;
      const fi = (a.row + vi) * cls.columns + (Math.floor(this.clock / frameMs) % a.frames);
      meta.layerOrder[view].forEach((k, i) => {
        const img = this.layers[k];
        if (!img) return;
        img.setPosition(this.x, this.y).setFrame(fi).setFlipX(flip).setDepth(depth + i * 0.001);
      });
    } else applyYSort(this);
    this.nameText.setPosition(this.x, this.y - 40).setDepth(depth + 1).setVisible(!this.bubble); // 말하는 동안은 이름 대신 말풍선
    this.mark.setText(mark ?? '').setDepth(depth + 1).setColor(mark === '?' ? '#9fdcff' : '#ffe060');
    this.mark.setPosition(this.x, this.y - 50 + Math.sin(this.clock / 200) * 1.5);
    if (this.bubble) {
      this.bubbleLeft -= dt;
      this.bubble.setPosition(this.x, this.y - (mark ? 54 : 40));
      if (this.bubbleLeft <= 0) { this.bubble.destroy(); this.bubble = null; }
    }
  }
}
