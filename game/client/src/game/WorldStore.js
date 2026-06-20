const COLLECTIONS = ['rooms', 'enemies', 'projectiles', 'telegraphs', 'crates', 'drops'];

function toMap(items = []) {
  const map = new Map();
  for (const item of items) {
    if (item?.id != null) map.set(String(item.id), item);
  }
  return map;
}

function ordered(map, key = 'id') {
  return [...map.values()].sort((a, b) => {
    const aKey = a?.[key] ?? a?.id ?? '';
    const bKey = b?.[key] ?? b?.id ?? '';
    return typeof aKey === 'number' && typeof bKey === 'number'
      ? aKey - bKey
      : String(aKey).localeCompare(String(bKey));
  });
}

function applyCollectionPatch(map, patch) {
  if (!patch) return false;
  let changed = false;
  for (const item of patch.upsert ?? []) {
    if (!item?.id) continue;
    map.set(String(item.id), item);
    changed = true;
  }
  for (const id of patch.remove ?? []) {
    changed = map.delete(String(id)) || changed;
  }
  return changed;
}

export class WorldStore {
  constructor() {
    this.clear();
  }

  clear() {
    this.revision = -1;
    this.lobby = null;
    this.players = new Map();
    this.modeMeta = { type: 'menu' };
    this.collections = Object.fromEntries(COLLECTIONS.map((name) => [name, new Map()]));
  }

  loadBootstrap(payload) {
    if (!payload || payload.protocol !== 1) return false;
    this.revision = Number(payload.revision ?? 0);
    this.lobby = payload.lobby ?? this.lobby;
    this.players = toMap(payload.players ?? []);
    const mode = payload.mode ?? { type: 'menu' };
    this.modeMeta = Object.fromEntries(Object.entries(mode).filter(([key]) => !COLLECTIONS.includes(key) && key !== 'currentRoom'));
    for (const name of COLLECTIONS) this.collections[name] = toMap(mode[name] ?? []);
    return true;
  }

  applyDelta(payload) {
    if (!payload || payload.protocol !== 1 || this.revision < 0) return { applied: false, resync: true };
    const revision = Number(payload.revision ?? -1);
    if (revision <= this.revision) return { applied: false, resync: false };
    if (revision !== this.revision + 1) return { applied: false, resync: true };

    let changed = false;
    changed = applyCollectionPatch(this.players, payload.players) || changed;
    if (payload.mode?.meta) {
      this.modeMeta = payload.mode.meta;
      changed = true;
    }
    for (const name of COLLECTIONS) {
      changed = applyCollectionPatch(this.collections[name], payload.mode?.collections?.[name]) || changed;
    }
    this.revision = revision;
    return { applied: changed, resync: false };
  }

  getState() {
    const rooms = ordered(this.collections.rooms, 'index');
    const roomIndex = Number(this.modeMeta.roomIndex ?? -1);
    const mode = {
      ...this.modeMeta,
      rooms,
      currentRoom: rooms.find((room) => Number(room.index) === roomIndex) ?? null,
      enemies: ordered(this.collections.enemies),
      projectiles: ordered(this.collections.projectiles),
      telegraphs: ordered(this.collections.telegraphs),
      crates: ordered(this.collections.crates),
      drops: ordered(this.collections.drops)
    };
    return {
      lobby: this.lobby,
      players: ordered(this.players),
      mode
    };
  }
}
