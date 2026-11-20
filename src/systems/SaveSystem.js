/**
 * 저장·불러오기. 브라우저 저장소(localStorage)에 슬롯 2개. 나중에 같은 JSON을 클라우드(Supabase)에 올린다.
 *  - manual(수동): 거점(savePoint — 지금은 제작대, 나중에 마을 등)에 들르면 저장
 *  - auto(자동): 지역 경계의 자동 저장 구역(맵 type=autosave)에 들어가면 저장 (보스 터 앞, 지역 입구 등)
 * 켜면 시작 화면에서 이어하기(최근 슬롯)/불러오기/새로 시작. 쓰러지면 최근 슬롯을 바로 불러온다.
 * 저장 형식은 JSON 한 덩어리 + version (형식이 바뀌면 version을 올리고 변환 코드를 넣는다).
 * 불러오기는 페이지를 새로 불러와 깨끗하게 시작한다 (불러올 슬롯은 sessionStorage로 넘김).
 * Godot: SaveSystem.gd (Autoload) — user://save_manual.json, user://save_auto.json
 */
export const SAVE_VERSION = 1;
export const SLOTS = ['manual', 'auto'];
const KEY = { manual: 'game.save.manual', auto: 'game.save.auto' };
const LEGACY_KEY = 'game.save'; // 슬롯이 하나뿐이던 시절의 저장 → 수동 슬롯으로 옮김
const PENDING_KEY = 'game.pendingLoad';
const NOTICE_KEY = 'game.notice';

const ls = () => window.localStorage;
const ss = () => window.sessionStorage;

export const SaveSystem = {
  /** 예전 1칸 저장을 수동 슬롯으로 옮기기 (한 번만) */
  migrate() {
    try {
      const old = ls().getItem(LEGACY_KEY);
      if (old && !ls().getItem(KEY.manual)) ls().setItem(KEY.manual, old);
      if (old) ls().removeItem(LEGACY_KEY);
    } catch (e) { /* 무시 */ }
  },

  /** @param {'manual'|'auto'} slot @returns {object|null} */
  load(slot) {
    try {
      const raw = ls().getItem(KEY[slot]);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) return null;
      return { ...data, slot };
    } catch (e) {
      console.warn('[Save] 불러오기 실패', slot, e);
      return null;
    }
  },

  /** 두 슬롯 중 더 최근 저장 (없으면 null) */
  latest() {
    const all = SLOTS.map((s) => this.load(s)).filter(Boolean);
    all.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
    return all[0] ?? null;
  },

  /** @returns {boolean} 성공 여부 (비공개 창 등에서는 실패할 수 있음) */
  save(slot, data) {
    try {
      ls().setItem(KEY[slot], JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: new Date().toISOString() }));
      return true;
    } catch (e) {
      console.warn('[Save] 저장 실패', e);
      return false;
    }
  },

  clearAll() {
    try { SLOTS.forEach((s) => ls().removeItem(KEY[s])); ls().removeItem(LEGACY_KEY); } catch (e) { /* 무시 */ }
  },

  /** 브라우저 저장소를 쓸 수 있는가 (비공개 창·차단 시 false) */
  available() {
    try {
      ls().setItem('__t', '1');
      ls().removeItem('__t');
      return true;
    } catch (e) {
      return false;
    }
  },

  // ---------- 페이지를 새로 불러올 때 넘기는 값 ----------
  /** 다음 실행에서 불러올 슬롯 ('new' = 새로 시작) */
  setPending(slot) {
    try { ss().setItem(PENDING_KEY, slot); } catch (e) { /* 무시 */ }
  },

  takePending() {
    try {
      const v = ss().getItem(PENDING_KEY);
      ss().removeItem(PENDING_KEY);
      return v;
    } catch (e) {
      return null;
    }
  },

  /** 다음 실행 때 한 번 보여 줄 안내 (예: 쓰러져서 다시 불러옴) */
  setNotice(text) {
    try { ss().setItem(NOTICE_KEY, text); } catch (e) { /* 무시 */ }
  },

  takeNotice() {
    try {
      const t = ss().getItem(NOTICE_KEY);
      ss().removeItem(NOTICE_KEY);
      return t;
    } catch (e) {
      return null;
    }
  },

  /** 지정한 슬롯(또는 'new')으로 페이지를 새로 불러온다 */
  reloadInto(slot, notice) {
    this.setPending(slot);
    if (notice) this.setNotice(notice);
    window.location.reload();
  },

  /**
   * 지금 게임 상태 → 저장 데이터
   * @param {{player, inventory, collectedPickups:Set<number>, playTimeMs:number, location:string}} s
   */
  snapshot({ player, inventory, collectedPickups, playTimeMs, location }) {
    return {
      location,
      playTimeMs: Math.round(playTimeMs),
      player: {
        x: Math.round(player.x),
        y: Math.round(player.y),
        weapon: player.weaponId,
        ownedWeapons: [...player.ownedWeapons],
        armor: player.armorId,
        ownedArmors: [...player.ownedArmors],
      },
      inventory: inventory.entries(),
      world: {
        collectedPickups: [...collectedPickups], // 맵(Tiled) 오브젝트 id — 한 번 주우면 다시 안 생김 (지금 규칙)
      },
    };
  },

  /** 슬롯 설명 한 줄 (불러오기 화면용) */
  describe(save, weapons) {
    if (!save) return '비어 있음';
    const when = save.savedAt
      ? new Date(save.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const mins = Math.max(1, Math.round((save.playTimeMs ?? 0) / 60000));
    const w = weapons?.[save.player?.weapon]?.name ?? '';
    return `${save.location ?? '?'} · ${when} · 플레이 ${mins}분${w ? ` · ${w}` : ''}`;
  },
};
