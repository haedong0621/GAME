/**
 * 진짜 에셋이 오기 전까지 쓰는 임시 그래픽을 코드로 그린다.
 * 진짜 에셋이 생기면 BootScene에서 같은 텍스처 키('player', 'item-<id>' 등)로 불러오고
 * (나무·풀숲·제작대·허수아비는 이미 도트 PNG로 교체됨: tools/art/pixel_world.py)
 * 여기서 해당 부분만 빼면 된다. (Godot 이식 대상 아님)
 */
export function createPlaceholderArt(scene, items, weapons) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // ---- 플레이어 32×32, 발은 맨 아래 가운데. 갑옷마다 텍스처가 따로 있다 (armors.json의 texture)
  // 기본: 누더기 옷
  g.clear();
  g.fillStyle(0x000000, 0.25).fillEllipse(16, 30, 18, 6);   // 그림자
  g.fillStyle(0x3b4a6b).fillRect(11, 22, 4, 8).fillRect(17, 22, 4, 8); // 다리
  g.fillStyle(0x2f7a5a).fillRoundedRect(9, 12, 14, 12, 3);  // 몸통(망토)
  g.fillStyle(0xf1c9a5).fillCircle(16, 9, 6);               // 얼굴
  g.fillStyle(0x5a3a22).fillRect(10, 3, 12, 4);             // 머리
  g.fillStyle(0x1b1f24).fillRect(17, 8, 2, 2);              // 눈(오른쪽을 봄)
  g.generateTexture('player', 32, 32);

  // 늪짐승 가죽 갑옷: 보스의 이끼색 가죽 + 등뼈 판(어깨·두건) + 노란 눈빛이 녹아 있음
  g.clear();
  g.fillStyle(0x000000, 0.25).fillEllipse(16, 30, 18, 6);
  g.fillStyle(0x2a3020).fillRect(11, 22, 4, 8).fillRect(17, 22, 4, 8);       // 가죽 다리
  g.fillStyle(0x1e2416).fillRect(10, 28, 6, 2).fillRect(16, 28, 6, 2);       // 발톱 장화
  g.fillStyle(0x3a4529).fillRoundedRect(8, 12, 16, 13, 3);                   // 가죽 몸통
  g.fillStyle(0x2b3320).fillRect(8, 19, 16, 2);                              // 허리띠
  g.fillStyle(0xc9bd98).fillTriangle(6, 15, 9, 9, 12, 14).fillTriangle(20, 14, 23, 9, 26, 15); // 어깨 뼈판
  g.fillStyle(0xf1c9a5).fillCircle(17, 10, 5);                               // 얼굴(두건 아래)
  g.fillStyle(0x45512f).fillRoundedRect(9, 2, 14, 7, 3).fillRect(9, 6, 4, 7); // 가죽 두건
  g.fillStyle(0xc9bd98).fillTriangle(11, 3, 13, -2, 15, 3).fillTriangle(16, 3, 18, -1, 20, 3); // 두건 뼈 돌기
  g.fillStyle(0xd8e36a).fillRect(18, 9, 2, 2);                               // 노란 눈빛
  g.generateTexture('player-swamp', 32, 32);

  // ---- 보스: 늪지 짐승 64×56, 오른쪽을 봄, 발은 맨 아래 가운데
  g.clear();
  g.fillStyle(0x000000, 0.3).fillEllipse(32, 52, 50, 10);                       // 그림자
  g.fillStyle(0x2b3320).fillTriangle(4, 30, 14, 22, 16, 36);                   // 꼬리
  g.fillStyle(0x3a4529).fillEllipse(30, 34, 44, 30);                           // 몸통
  g.fillStyle(0x2f3a22).fillRect(16, 42, 7, 12).fillRect(36, 42, 7, 12);       // 다리
  g.fillStyle(0xc9bd98);                                                       // 등뼈 판
  g.fillTriangle(16, 24, 21, 12, 25, 23).fillTriangle(25, 21, 30, 9, 34, 21).fillTriangle(34, 22, 39, 12, 42, 24);
  g.fillStyle(0x45512f).fillEllipse(49, 32, 20, 18);                           // 머리
  g.fillStyle(0xd8e36a).fillRect(52, 28, 3, 3);                                // 눈
  g.fillStyle(0xe8dcb8).fillTriangle(56, 36, 60, 40, 55, 41).fillTriangle(50, 38, 53, 43, 49, 42); // 송곳니
  g.fillStyle(0x1e2416).fillTriangle(42, 46, 48, 52, 40, 52);                  // 앞발톱
  g.generateTexture('boss_swamp', 64, 56);

  // ---- 굶주린 들개 28×20, 오른쪽을 봄, 발은 맨 아래 가운데
  g.clear();
  g.fillStyle(0x000000, 0.28).fillEllipse(14, 18, 22, 5);
  g.fillStyle(0x4a3a2c).fillTriangle(1, 7, 6, 9, 3, 12);                       // 꼬리
  g.fillStyle(0x5e4a36).fillEllipse(12, 11, 18, 9);                            // 몸통
  g.fillStyle(0x4a3a2c).fillRect(6, 13, 3, 6).fillRect(15, 13, 3, 6);          // 다리
  g.fillStyle(0x6a5440).fillEllipse(21, 8, 10, 8);                             // 머리
  g.fillStyle(0x3a2c20).fillTriangle(19, 5, 21, 0, 23, 5);                     // 귀
  g.fillStyle(0x6a5440).fillRect(24, 8, 4, 3);                                 // 주둥이
  g.fillStyle(0xe0c050).fillRect(22, 6, 2, 1);                                 // 눈
  g.fillStyle(0x8a7a6a).fillRect(9, 7, 6, 1);                                  // 갈비뼈 드러난 털
  g.generateTexture('hound', 28, 20);

  // ---- 무기: weapons.json의 view 값으로 칼 모양. 손잡이가 왼쪽, 칼끝이 오른쪽(0도 방향)
  const hex = (s) => window.Phaser.Display.Color.HexStringToColor(s).color;
  for (const [id, w] of Object.entries(weapons)) {
    if (!w.view) continue;
    const { bladeLength: L, bladeWidth: W, bladeColor, hiltColor } = w.view;
    const hilt = Math.round(L * 0.25) + 2;
    const width = hilt + L + 2, height = W + 6;
    const cy = height / 2;
    g.clear();
    g.fillStyle(hex(hiltColor)).fillRect(0, cy - 1, hilt, 3);                 // 손잡이
    g.fillStyle(0x2a2420).fillRect(hilt - 2, cy - W / 2 - 2, 3, W + 4);      // 코등이
    g.fillStyle(hex(bladeColor)).fillRect(hilt + 1, cy - W / 2, L - 3, W);   // 칼날
    g.fillTriangle(hilt + L - 2, cy - W / 2, hilt + L + 2, cy, hilt + L - 2, cy + W / 2); // 칼끝
    g.fillStyle(0xffffff, 0.35).fillRect(hilt + 1, cy - W / 2, L - 3, 1);    // 날 하이라이트
    if (w.view.style === 'fang') {
      // 송곳니 톱날: 아래쪽 날에 이빨, 위쪽 날에 독 빛
      g.fillStyle(hex(bladeColor));
      for (let tx = hilt + 3; tx < hilt + L - 4; tx += 4) g.fillTriangle(tx, cy + W / 2, tx + 3, cy + W / 2, tx + 1, cy + W / 2 + 2);
      g.fillStyle(hex(w.view.glowColor ?? '#9adf5a'), 0.9).fillRect(hilt + 2, cy - W / 2, L - 5, 1);
    }
    g.generateTexture(`blade-${id}`, width, height);
  }

  // ---- 아이템: items.json의 placeholderColor로 작은 보석 모양 14×16
  for (const id of items.ids()) {
    const color = window.Phaser.Display.Color.HexStringToColor(items.get(id).placeholderColor ?? '#ffffff').color;
    g.clear();
    g.fillStyle(0x000000, 0.25).fillEllipse(7, 15, 10, 3);
    g.fillStyle(color).fillTriangle(7, 1, 13, 7, 1, 7).fillTriangle(1, 7, 13, 7, 7, 13);
    g.fillStyle(0xffffff, 0.6).fillRect(5, 4, 2, 2);
    g.generateTexture(`item-${id}`, 14, 16);
  }

  // ---- 장신구·장비 아이콘 (가방·바닥 아이템용 임시 그림)
  g.clear();
  g.lineStyle(3, 0xd8dce4).strokeCircle(12, 14, 7); g.fillStyle(0x9adfff).fillCircle(12, 6, 3);
  g.generateTexture('icon-ring', 24, 24); g.clear();
  g.lineStyle(2, 0xb09070).beginPath(); g.arc(12, 6, 9, 0.2, Math.PI - 0.2); g.strokePath();
  g.fillStyle(0xe8dcb8); for (const [x, y] of [[5, 12], [9, 15], [12, 17], [15, 15], [19, 12]]) g.fillTriangle(x - 2, y, x + 2, y, x, y + 5);
  g.generateTexture('icon-necklace', 24, 24); g.clear();
  g.fillStyle(0x8a6a48).fillRoundedRect(4, 4, 16, 16, 3); g.fillStyle(0xc8a870).fillRect(7, 7, 10, 3);
  g.generateTexture('icon-gear', 24, 24);

  g.destroy();
}
