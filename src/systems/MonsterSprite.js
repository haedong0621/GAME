/**
 * 몬스터 도트 시트에서 프레임 고르기 (tools/art/pixel_monsters.py 가 만든 mon_<종류>.png + mon_px.json).
 * 8방향 → 그린 방향 5개 + 좌우 뒤집기. 동작 이름과 프레임 번호를 주면 시트 프레임을 돌려준다.
 * Godot: AnimatedSprite2D + SpriteFrames("동작_방향") + flip_h.
 */
const DIR8 = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];

export class MonsterSprite {
  /**
   * @param {Phaser.GameObjects.Image} image 몬스터 겉모습 이미지
   * @param {object} meta mon_px.json 전체
   * @param {string} kind 'hound' | 'swamp'
   */
  constructor(image, meta, kind) {
    this.image = image;
    this.meta = meta;
    this.k = meta.kinds[kind];
    image.setTexture(this.k.key, 0).setOrigin(this.k.origin.x, this.k.origin.y);
  }

  frames(anim) {
    return this.k.anims[anim]?.frames ?? 1;
  }

  /** @param {{x:number,y:number}} facing 바라보는 방향 */
  show(anim, frame, facing) {
    const a = this.k.anims[anim] ?? this.k.anims.idle;
    const deg = Math.atan2(facing.y, facing.x) * 180 / Math.PI;
    const [view, flip] = this.meta.dirs[DIR8[((Math.round(deg / 45) % 8) + 8) % 8]];
    const vi = this.meta.views.indexOf(view);
    const f = Math.max(0, Math.min(a.frames - 1, frame));
    this.image.setFrame((a.row + vi) * this.k.columns + f).setFlipX(flip).setScale(1).setAngle(0);
  }
}
