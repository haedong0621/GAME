# 3D → 도트 스프라이트 도구 (비주얼 방향 검증용)

게임 실행에는 필요 없는 **에셋 제작 도구**입니다. (Claude가 작업 환경에서 실행)

1. `bl_render.py` — Blender(파이썬 모듈 `bpy`)로 3D 캐릭터를 8방향 × 동작별로 렌더 (정사영 카메라, 내려다보는 각도 50°, 투명 배경, 안티앨리어싱 최소)
   ```
   python bl_render.py <모델.glb> <출력폴더> <프레임px> <ortho_scale> <각도> <회전보정> "idle:Idle:4,walk:Walking_A:8,..."
   ```
2. `sprite_post.py` — 렌더 원본 → 도트 시트: 채도·밝기 낮춤(어두운 판타지 톤), 반투명 가장자리 제거, 공통 팔레트 24색, 1px 외곽선, 메타 JSON(프레임 크기, 발밑 origin, 동작별 행 번호)
   ```
   python3 sprite_post.py <출력폴더> assets/characters/hero3d_s.png assets/characters/hero3d_s.json 24
   ```

시트 배치: 행 = 동작 × 8방향(아래, 오른쪽아래, 오른쪽, 오른쪽위, 위, 왼쪽위, 왼쪽, 왼쪽아래), 열 = 프레임.
