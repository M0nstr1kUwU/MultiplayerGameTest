/**
 * Event-driven replication helper.
 *
 * The server simulates every tick, but clients receive a compact bootstrap once
 * and deltas afterwards. Collections are addressed by stable entity ids.
 */

const COLLECTIONS = ['rooms', 'enemies', 'projectiles', 'telegraphs', 'crates', 'drops'];

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function byId(items) {
  const map = new Map();
  for (const item of items ?? []) {
    if (!item?.id) continue;
    map.set(String(item.id), item);
  }
  return map;
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function diffCollection(previous = new Map(), items = []) {
  const next = byId(items);
  const upsert = [];
  const remove = [];
  const nextHashes = new Map();

  for (const [id, item] of next) {
    const hash = stableStringify(item);
    nextHashes.set(id, hash);
    if (previous.get(id) !== hash) upsert.push(item);
  }

  for (const id of previous.keys()) {
    if (!next.has(id)) remove.push(id);
  }

  return { patch: { upsert, remove }, hashes: nextHashes };
}

function compactModeState(fullMode = {}) {
  const mode = clonePlain(fullMode) ?? {};
  const collections = {};
  for (const name of COLLECTIONS) {
    collections[name] = Array.isArray(mode[name]) ? mode[name] : [];
    delete mode[name];
  }

  // currentRoom duplicates an item from rooms. The client reconstructs it by roomIndex.
  delete mode.currentRoom;
  return { meta: mode, collections };
}

function makeSnapshot({ lobby, players, mode }) {
  const compact = compactModeState(mode);
  return {
    lobby: clonePlain(lobby),
    players: clonePlain(players ?? []),
    mode: compact
  };
}

export class WorldReplicator {
  constructor() {
    this.revision = 0;
    this.previous = null;
  }

  reset() {
    this.revision = 0;
    this.previous = null;
  }

  createBootstrap(world) {
    const snapshot = makeSnapshot(world);
    this.previous = this.#remember(snapshot);
    return {
      protocol: 1,
      revision: this.revision,
      lobby: snapshot.lobby,
      players: snapshot.players,
      mode: this.#expandMode(snapshot.mode)
    };
  }

  createDelta(world) {
    const snapshot = makeSnapshot(world);
    if (!this.previous) return { bootstrap: this.createBootstrap(world) };

    const players = diffCollection(this.previous.players, snapshot.players);
    const modeMetaHash = stableStringify(snapshot.mode.meta);
    const modePatch = modeMetaHash === this.previous.modeMetaHash ? null : snapshot.mode.meta;
    const collections = {};
    let anyCollectionChange = false;

    for (const name of COLLECTIONS) {
      const delta = diffCollection(this.previous.collections[name], snapshot.mode.collections[name]);
      if (delta.patch.upsert.length || delta.patch.remove.length) {
        collections[name] = delta.patch;
        anyCollectionChange = true;
      }
      this.previous.collections[name] = delta.hashes;
    }

    this.previous.players = players.hashes;
    this.previous.modeMetaHash = modeMetaHash;

    const hasPlayerChange = players.patch.upsert.length || players.patch.remove.length;
    const hasMetaChange = Boolean(modePatch);
    if (!hasPlayerChange && !hasMetaChange && !anyCollectionChange) return null;

    this.revision += 1;
    return {
      protocol: 1,
      revision: this.revision,
      players: players.patch,
      mode: {
        meta: modePatch,
        collections
      }
    };
  }

  #remember(snapshot) {
    const collections = {};
    for (const name of COLLECTIONS) {
      const hashes = new Map();
      for (const item of snapshot.mode.collections[name]) hashes.set(String(item.id), stableStringify(item));
      collections[name] = hashes;
    }
    const players = new Map();
    for (const player of snapshot.players) players.set(String(player.id), stableStringify(player));
    return {
      players,
      collections,
      modeMetaHash: stableStringify(snapshot.mode.meta)
    };
  }

  #expandMode(compact) {
    return {
      ...compact.meta,
      ...Object.fromEntries(COLLECTIONS.map((name) => [name, compact.collections[name]])),
      currentRoom: compact.collections.rooms.find((room) => Number(room.index) === Number(compact.meta.roomIndex)) ?? null
    };
  }
}

export const WORLD_COLLECTIONS = COLLECTIONS;
