/**
 * 저장·불러오기. 지금은 브라우저 저장소(localStorage) 1칸. 나중에 같은 JSON을 클라우드(Supabase)에 올린다.
 * 규칙: 거점(savePoint인 오브젝트 — 지금은 제작대, 나중에 마을 등)에서만 저장한다.
 *       다시 켜거나 쓰러지면 마지막 저장 시점을 불러온다 (저장 이후 얻은 것은 사라짐).
 * 저장 형식은 JSON 한 덩어리 + version (형식이 바뀌면 version을 올리고 변환 코드를 넣는다).
 * Godot: SaveSystem.gd (Autoload) — FileAccess로 user://save.json 에 같은 JSON.
 */
const KEY = 'game.save';
export const SAVE_VERSION = 1;

export const SaveSystem = {
  /** @returns {object|null} 저장 데이터 (없거나 깨졌으면 null) */
  load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) return null; // 형식이 다르면 무시 (나중엔 변환)
      return data;
    } catch (e) {
      console.warn('[Save] 불러오기 실패', e);
      return null;
    }
  },

  /** @returns {boolean} 성공 여부 (비공개 창 등에서는 실패할 수 있음) */
  save(data) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: new Date().toISOString() }));
      return true;
    } catch (e) {
      console.warn('[Save] 저장 실패', e);
      return false;
    }
  },

  /** 브라우저 저장소를 쓸 수 있는가 (비공개 창·차단 시 false) */
  available() {
    try {
      window.localStorage.setItem('__t', '1');
      window.localStorage.removeItem('__t');
      return true;
    } catch (e) {
      return false;
    }
  },

  /** 다음 실행 때 한 번 보여 줄 안내 (예: 쓰러져서 다시 불러옴) */
  setNotice(text) {
    try { window.sessionStorage.setItem('game.notice', text); } catch (e) { /* 무시 */ }
  },

  takeNotice() {
    try {
      const t = window.sessionStorage.getItem('game.notice');
      window.sessionStorage.removeItem('game.notice');
      return t;
    } catch (e) {
      return null;
    }
  },

  clear() {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
  },

  /**
   * 지금 게임 상태 → 저장 데이터
   * @param {{player, inventory, collectedPickups:Set<number>, playTimeMs:number}} s
   */
  snapshot({ player, inventory, collectedPickups, playTimeMs }) {
    return {
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
};
