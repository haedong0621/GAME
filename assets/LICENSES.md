# 에셋 출처·라이선스 기록

새 에셋을 넣을 때마다 한 줄씩 추가합니다. 기록이 없는 에셋은 커밋하지 않습니다.

| 파일 | 출처 (주소 / 생성 도구) | 작가 | 라이선스 | 비고 |
|---|---|---|---|---|
| `assets/characters/hero3d_s.png`, `hero3d_l.png` (+ `.json`) | KayKit Adventurers Character Pack 1.0 — Rogue_Hooded 3D 모델·애니메이션을 Blender로 렌더 후 도트 가공 (`tools/art/`) — https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | Kay Lousberg (kaylousberg.com) | CC0 1.0 | 비주얼 방향 검증용 시험 에셋 |
| `assets/characters/hero_<층>_<갑옷>_<무기종류>.png`(부위별 층: 머리·몸·팔 앞뒤·다리 × 갑옷 3 × 검·대검·맨손), `hero_wpnB/F_<무기>.png`(무기 8종: 보스 대검·건틀릿 포함), `hero_px.json` | `tools/art/pixel_hero.py`로 Claude가 부위별 도트와 규칙 기반 무기·잔상을 생성 | 이 프로젝트 | 자체 제작 (제한 없음) | 3/4 탑뷰 8방향, 칼 포함 공격 모션 |
| `assets/characters/mon_hound.png`, `mon_swamp.png`, `mon_px.json` | `tools/art/pixel_monsters.py`로 Claude가 네 발 관절 뼈대·도형으로 생성 | 이 프로젝트 | 자체 제작 (제한 없음) | 들개, 늪지 짐승 (5방향 + 뒤집기) |
| `assets/characters/mon_hunter.png` (+ `mon_px.json`의 hunter) | `tools/art/pixel_hunter.py`로 Claude가 공·관 덩어리 3D 배치 + 셀 셰이딩으로 생성 | 이 프로젝트 | 자체 제작 (제한 없음) | 두 번째 보스 뒤엉킨 사냥꾼 |
| `assets/tiles/world_tiles.png`, `tree0~2.png`, `bush.png`, `workbench.png`, `dummy.png` | `tools/art/pixel_world.py`로 Claude가 생성 (바닥 타일 76종: 풀 4 + 흙길 경계 16 + 물 경계 16 + 풀 추가 8 + 절벽 벽면·계단·가장자리 32, 소품) | 이 프로젝트 | 자체 제작 (제한 없음) | 배경 도트 |
| `assets/tiles/rock0~1.png`, `rock_rubble.png`, `stump.png`, `herb.png`, `herb_picked.png` | `tools/art/pixel_world.py`로 Claude가 생성 (셀 셰이딩) | 이 프로젝트 | 자체 제작 (제한 없음) | 채집 대상 (바위·그루터기·약초) |
| `assets/tiles/height_marks.png`, `region_marks.png` | `tools/art/pixel_world.py`로 Claude가 생성 | 이 프로젝트 | 자체 제작 (제한 없음) | Tiled 높이 표시용 (게임에선 안 씀) |
| `assets/maps/world_land_*.png` | `tools/art/terrain_bake.py`가 맵(ground·region·height 레이어)으로 구운 바닥 그림 (Claude 작성 도구) | 이 프로젝트 | 자체 제작 (제한 없음) | 지역별 바닥·흙길·물·절벽·계단·덩굴 |
| `assets/tiles/pine0~1.png`, `deadtree0.png`, `decor_*.png` | `tools/art/pixel_world.py`로 Claude가 생성 | 이 프로젝트 | 자체 제작 (제한 없음) | 지역별 나무(침엽수·죽은 나무)와 깔개 소품(버섯·마른 풀·갈대·뼈·모닥불 자리·천막) |
| `assets/tiles/house0~1.png`, `house_burned0~1.png`, `well.png`, `fence_h/v.png`, `watermill.png`, `ruin_tower.png`, `ruin_altar.png`, `fallen_tree.png`, `bridge_h.png` | `tools/art/pixel_world.py`로 Claude가 생성 | 이 프로젝트 | 자체 제작 (제한 없음) | 마을·거점·랜드마크 건물 |
| `docs/maps/region1_plan.png` | `tools/art/region_plan.py`로 Claude가 그림 (글꼴: WenQuanYi Zen Hei, GPL+FE — 그림 안 글자만) | 이 프로젝트 | 자체 제작 | 첫 지역 설계도 |
