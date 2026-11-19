# GAME — 2D 탑뷰 오픈월드 RPG (토이프로젝트)

*Drova*, *Core Keeper* 같은 느낌의 2D 탑뷰(위에서 내려다보는) 오픈월드 RPG를 만들어 보는 프로젝트입니다.

- **지금 단계:** 웹 브라우저에서 돌아가는 Phaser 3 프로토타입으로 "재미있는지" 확인
- **다음 단계:** 재미있으면 Godot 4로 다시 만들기 (그래서 콘텐츠는 데이터 파일로, 설계는 문서로 따로 정리해 둡니다)

## 플레이하기
- **웹에서:** GitHub Pages 주소 — `https://haedong0621.github.io/GAME/` (저장소 이름과 같이 **대문자** GAME)
  (처음 한 번은 저장소 *Settings → Pages*에서 *Branch: `main` / `(root)`*로 설정해야 열립니다)
- **조작 (키보드):** `W` `A` `S` `D` 이동 · `J` 또는 마우스 왼쪽 공격 (박자 맞춰 연타하면 콤보) · `Space` 또는 `K` 구르기 · `1` `2` 무기 선택 (`Q` 다음 무기)
- **조작 (휴대폰, 가로 화면):** 화면 왼쪽을 누르고 끌어 이동 · 오른쪽 아래 `공격` `구르기` `무기` 버튼
- **충돌 박스 보기:** 주소 끝에 `?debug=1` 을 붙이기

## 내 컴퓨터에서 실행하기
파일을 그냥 더블클릭하면 브라우저 보안 규칙 때문에 안 열립니다. 간단한 서버를 켜야 해요.

```bash
python3 -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000` 을 엽니다.

## 폴더 구조
```
index.html          게임 시작 페이지 (Phaser를 CDN으로 불러옴)
src/
  main.js           게임 설정과 시작
  config.js         공용 상수 (타일 크기 32px 등)
  scenes/           화면 단위 (로딩, 월드, UI)
  entities/         게임 속 물체 (플레이어, 나무, 아이템)
  systems/          공용 기능 (입력, Y-sort, 데이터, 임시 그래픽)
data/               아이템·플레이어 수치 등 콘텐츠 (JSON)
maps/               Tiled로 만든 맵 (.tmj)
assets/             그림·소리 (characters, tiles, ui, audio)
  LICENSES.md       에셋 출처·라이선스 기록
docs/
  DESIGN.md         시스템 설계 요약 (Godot 이식용 지시서)
  ASSETS.md         에셋 규격과 Gemini 이미지 생성 팁
```

## 맵 고치기
`maps/world.tmj` 는 무료 맵 에디터 [Tiled](https://www.mapeditor.org/)로 열어서 고칠 수 있습니다.
나무는 `objects` 레이어에 `type = tree` 인 점(point)으로 찍으면 됩니다.
