/**
 * 진짜 에셋이 오기 전까지 쓰는 임시 그래픽을 코드로 그린다.
 * 진짜 에셋이 생기면 BootScene에서 같은 텍스처 키('player', 'tree', 'item-<id>')로 불러오고
 * 여기서 해당 부분만 빼면 된다. (Godot 이식 대상 아님)
 */
export function createPlaceholderArt(scene, items, weapons) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // ---- 플레이어 32×32, 발은 맨 아래 가운데
  g.clear();
  g.fillStyle(0x000000, 0.25).fillEllipse(16, 30, 18, 6);   // 그림자
  g.fillStyle(0x3b4a6b).fillRect(11, 22, 4, 8).fillRect(17, 22, 4, 8); // 다리
  g.fillStyle(0x2f7a5a).fillRoundedRect(9, 12, 14, 12, 3);  // 몸통(망토)
  g.fillStyle(0xf1c9a5).fillCircle(16, 9, 6);               // 얼굴
  g.fillStyle(0x5a3a22).fillRect(10, 3, 12, 4);             // 머리
  g.fillStyle(0x1b1f24).fillRect(17, 8, 2, 2);              // 눈(오른쪽을 봄)
  g.generateTexture('player', 32, 32);

  // ---- 나무 48×72, 밑동은 맨 아래 가운데
  g.clear();
  g.fillStyle(0x000000, 0.25).fillEllipse(24, 69, 30, 8);
  g.fillStyle(0x6b4a2b).fillRect(19, 44, 10, 26);           // 줄기
  g.fillStyle(0x2e6b34).fillCircle(24, 26, 20);             // 잎(어두운)
  g.fillStyle(0x3f8a45).fillCircle(20, 22, 15);
  g.fillStyle(0x5aa85c).fillCircle(17, 17, 7);              // 하이라이트
  g.generateTexture('tree', 48, 72);

  // ---- 연습용 허수아비 32×40, 발은 맨 아래 가운데
  g.clear();
  g.fillStyle(0x000000, 0.25).fillEllipse(16, 38, 18, 5);
  g.fillStyle(0x4a3826).fillRect(14, 14, 4, 26);             // 기둥
  g.fillStyle(0x4a3826).fillRect(4, 16, 24, 3);              // 팔 막대
  g.fillStyle(0x8a7448).fillRoundedRect(8, 12, 16, 16, 3);   // 짚 몸통
  g.fillStyle(0x6e5a36).fillRect(8, 20, 16, 2);              // 묶은 끈
  g.fillStyle(0x9a8656).fillCircle(16, 7, 6);                // 머리
  g.fillStyle(0x3a2a1a).fillRect(13, 6, 2, 2).fillRect(18, 6, 2, 2);
  g.generateTexture('dummy', 32, 40);

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

  g.destroy();
}
