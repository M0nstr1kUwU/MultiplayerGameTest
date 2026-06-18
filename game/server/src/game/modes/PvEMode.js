import { clamp, distance2, randomId, randomRange } from '../core/math.js';
import { activeWeapon, applyDamageToPlayer, canHitMelee, consumeShot, healPlayer, nearestDrop, updatePlayerRegen } from '../core/combat.js';
import { createEnemy, createBoss, randomEnemyKind } from '../data/Enemies.js';
import { createUpgradeChoices, applyUpgrade } from '../data/Upgrades.js';
import { getWeaponDef, randomMagazine, randomWeapon, serializeWeapon, weaponDamageMultiplier } from '../data/Weapons.js';

const ROOM_W = 34;
const ROOM_D = 24;
const ROOM_GAP = 48;
const PLAYER_RADIUS = 0.6;
const REVIVE_HOLD_TIME = 5;
const PORTAL_VOTE_TIME = 3;

const DIRECTIONS = {
  north: { x: 0, y: -1, opposite: 'south' },
  south: { x: 0, y: 1, opposite: 'north' },
  west: { x: -1, y: 0, opposite: 'east' },
  east: { x: 1, y: 0, opposite: 'west' }
};

const THEMES = [
  { id: 'dungeon', name: 'Stone Dungeon', floorTexture: '/assets/textures/rooms/dungeon/floor.png', wallTexture: '/assets/textures/rooms/dungeon/wall.png', doorTexture: '/assets/textures/rooms/dungeon/door.png', floorColor: '#252a42', wallColor: '#343b60', doorColor: '#8a6f4d' },
  { id: 'sewer', name: 'Toxic Sewers', floorTexture: '/assets/textures/rooms/sewer/floor.png', wallTexture: '/assets/textures/rooms/sewer/wall.png', doorTexture: '/assets/textures/rooms/sewer/door.png', floorColor: '#20382c', wallColor: '#2f5b48', doorColor: '#5b835c' },
  { id: 'crystal', name: 'Crystal Caves', floorTexture: '/assets/textures/rooms/crystal/floor.png', wallTexture: '/assets/textures/rooms/crystal/wall.png', doorTexture: '/assets/textures/rooms/crystal/door.png', floorColor: '#202b44', wallColor: '#31506f', doorColor: '#5fd9ff' },
  { id: 'forge', name: 'Ash Forge', floorTexture: '/assets/textures/rooms/forge/floor.png', wallTexture: '/assets/textures/rooms/forge/wall.png', doorTexture: '/assets/textures/rooms/forge/door.png', floorColor: '#332033', wallColor: '#593040', doorColor: '#ff7a45' }
];

function removeById(list, id) {
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) return list.splice(index, 1)[0];
  return null;
}

function key(x, y) {
  return `${x}:${y}`;
}

function isActiveEnemy(enemy) {
  return enemy && Number.isFinite(Number(enemy.hp)) && Number(enemy.hp) > 0 && Number.isFinite(Number(enemy.maxHp)) && Number(enemy.maxHp) > 0;
}

function roomName(kind) {
  if (kind === 'start') return 'Стартовая комната';
  if (kind === 'boss') return 'Запечатанная комната босса';
  if (kind === 'shop') return 'Комната снабжения';
  if (kind === 'crate') return 'Оружейная';
  if (kind === 'elite') return 'Элитная комната';
  return 'Комната врагов';
}

function randomRoomKind(index, total, shopIndex, crateIndexes) {
  if (index === 0) return 'start';
  if (index === shopIndex) return 'shop';
  if (crateIndexes.has(index)) return 'crate';
  if (index > 2 && Math.random() < 0.25) return 'elite';
  return 'normal';
}

function alivePlayers(players) {
  return [...players.values()].filter((player) => player.alive && !player.downed);
}

function weaponDamage(def, weapon, player) {
  return Math.round((def.damage ?? 1) * weaponDamageMultiplier(weapon) * (player?.stats?.damageMultiplier ?? 1));
}

function addStatusEffect(target, debuff, sourceLevel = 1) {
  if (!target || !debuff || Math.random() > (debuff.chance ?? 1)) return;
  target.statusEffects ??= [];
  const existing = target.statusEffects.find((effect) => effect.id === debuff.id);
  const effect = {
    id: debuff.id,
    name: debuff.name ?? debuff.id,
    duration: debuff.duration ?? 2,
    remaining: debuff.duration ?? 2,
    dps: debuff.dps ? Math.round(debuff.dps * (1 + (sourceLevel - 1) * 0.08)) : 0,
    slowMultiplier: debuff.slowMultiplier ?? null,
    damageType: debuff.damageType ?? 'physical'
  };
  if (existing) Object.assign(existing, effect, { remaining: Math.max(existing.remaining ?? 0, effect.remaining) });
  else target.statusEffects.push(effect);
}

function effectDebuff(effectId) {
  if (effectId === 'poison') return { id: 'poison', name: 'Poison', chance: 1, duration: 4, dps: 5, damageType: 'poison' };
  if (effectId === 'burn') return { id: 'burn', name: 'Burn', chance: 1, duration: 3, dps: 7, damageType: 'fire' };
  return null;
}

function reduceMagazinePool(mags, amount) {
  let remaining = Math.max(0, Math.floor(Number(amount) || 0));
  for (const mag of mags) {
    if (remaining <= 0) break;
    const used = Math.min(mag.amount, remaining);
    mag.amount -= used;
    remaining -= used;
  }
  for (let i = mags.length - 1; i >= 0; i--) if (mags[i].amount <= 0) mags.splice(i, 1);
  return amount - remaining;
}

function stageByHp(enemy) {
  const ratio = enemy.hp / Math.max(1, enemy.maxHp);
  if (ratio <= 0.33) return 3;
  if (ratio <= 0.66) return 2;
  return 1;
}

export class PvEMode {
  constructor(match) {
    this.match = match;
    this.id = 'pve';
    this.level = 1;
    this.roomIndex = 0;
    this.rooms = [];
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.crates = [];
    this.drops = [];
    this.doorTransition = null;
    this.telegraphs = [];
    this.portal = null;
    this.finished = false;
    this.transitionLock = 0;
    this.transitionPhase = null;
    this.doorTransition = null;
  }

  async start() {
    this.level = 1;
    this.generateLevel();
    for (const player of this.match.players.values()) {
      Object.assign(player, {
        hp: player.maxHp,
        alive: true,
        downed: false,
        spectator: false,
        reviveProgress: 0,
        reviveChannel: null,
        revives: 1,
        kills: 0,
        score: 0,
        roundWins: 0,
        swingTimer: 0
      });
      player.pendingUpgrades = [];
    }
    await this.enterRoom(0, null);
    await this.match.hooks.emit('match:start', { mode: 'pve', match: this.match });
  }

  generateLevel() {
    const count = clamp(Number(this.match.settings.pveRooms ?? 8), 5, 30);
    const theme = THEMES[(this.level - 1) % THEMES.length];
    const rooms = [];
    const occupied = new Map();

    const addRoom = (x, y) => {
      const room = {
        id: randomId('room'),
        index: rooms.length,
        grid: { x, y },
        level: this.level,
        kind: 'normal',
        name: 'Комната врагов',
        center: { x: x * ROOM_GAP, z: y * ROOM_GAP },
        width: ROOM_W + Math.floor(Math.random() * 9),
        depth: ROOM_D + Math.floor(Math.random() * 9),
        cleared: false,
        visited: false,
        spawned: false,
        doorOpen: false,
        locked: false,
        neighbors: {},
        theme
      };
      occupied.set(key(x, y), room);
      rooms.push(room);
      return room;
    };

    addRoom(0, 0);
    const nonBossCount = count - 1;
    while (rooms.length < nonBossCount) {
      const base = rooms[Math.floor(Math.random() * rooms.length)];
      const dirs = Object.entries(DIRECTIONS).sort(() => Math.random() - 0.5);
      let placed = false;
      for (const [dir, step] of dirs) {
        const nx = base.grid.x + step.x;
        const ny = base.grid.y + step.y;
        if (occupied.has(key(nx, ny))) continue;
        const room = addRoom(nx, ny);
        base.neighbors[dir] = room.index;
        room.neighbors[step.opposite] = base.index;
        placed = true;
        break;
      }
      if (!placed) break;
    }

    // Подключаем соседние клетки, чтобы карта стала похожа не на линию, а на сеть комнат.
    for (const room of rooms) {
      for (const [dir, step] of Object.entries(DIRECTIONS)) {
        const other = occupied.get(key(room.grid.x + step.x, room.grid.y + step.y));
        if (other) room.neighbors[dir] = other.index;
      }
    }

    const shopIndex = Math.min(nonBossCount - 1, Math.max(2, Math.floor(nonBossCount * 0.55)));
    const crateIndexes = new Set([Math.min(nonBossCount - 1, Math.max(1, Math.floor(nonBossCount * 0.32)))]);
    if (nonBossCount > 9) crateIndexes.add(Math.min(nonBossCount - 1, Math.floor(nonBossCount * 0.78)));

    for (const room of rooms) {
      room.kind = randomRoomKind(room.index, count, shopIndex, crateIndexes);
      room.name = roomName(room.kind);
      room.cleared = room.kind === 'start' || room.kind === 'shop';
      room.doorOpen = room.cleared;
    }

    const farthest = rooms.slice(1).sort((a, b) => (Math.abs(b.grid.x) + Math.abs(b.grid.y)) - (Math.abs(a.grid.x) + Math.abs(a.grid.y)))[0] ?? rooms[0];
    let bossGrid = null;
    for (const [dir, step] of Object.entries(DIRECTIONS).sort(() => Math.random() - 0.5)) {
      const nx = farthest.grid.x + step.x;
      const ny = farthest.grid.y + step.y;
      if (!occupied.has(key(nx, ny))) {
        bossGrid = { x: nx, y: ny, dir, opposite: step.opposite };
        break;
      }
    }
    bossGrid ??= { x: farthest.grid.x + 1, y: farthest.grid.y, dir: 'east', opposite: 'west' };

    const boss = addRoom(bossGrid.x, bossGrid.y);
    boss.kind = 'boss';
    boss.name = roomName('boss');
    boss.width = ROOM_W + 10;
    boss.depth = ROOM_D + 8;
    boss.locked = true;
    boss.cleared = false;
    boss.doorOpen = false;
    farthest.neighbors[bossGrid.dir] = boss.index;
    boss.neighbors[bossGrid.opposite] = farthest.index;

    this.rooms = rooms;
    this.roomIndex = 0;
    this.portal = null;
    this.telegraphs = [];
    this.transitionPhase = null;
    this.doorTransition = null;
  }

  async enterRoom(index, fromIndex = null) {
    const room = this.rooms[index];
    if (!room || room.locked) return false;
    this.roomIndex = index;
    room.visited = true;
    room.doorOpen = Boolean(room.cleared || room.kind === 'shop' || room.kind === 'start');
    this.portal = null;
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.crates = [];
    this.drops = [];
    this.doorTransition = null;

    const spawn = this.spawnPointForRoom(room, fromIndex);
    let offset = -2;
    for (const player of this.match.players.values()) {
      // В новую комнату переносятся все: живые играют, павшие наблюдают рядом с дверью.
      player.x = spawn.x;
      player.z = spawn.z + offset;
      player.rot = spawn.rot;
      offset += 2;
      player.reviveProgress = 0;
      player.reviveChannel = null;
    }

    if (!room.spawned && !room.cleared) {
      room.spawned = true;
      if (room.kind === 'boss') {
        room.doorOpen = false;
        this.enemies.push(createBoss(this.level, room));
      } else {
        room.doorOpen = false;
        const base = room.kind === 'elite' ? 5 : room.kind === 'crate' ? 3 : 4;
        const count = Math.min(24, base + Math.floor(this.level * 1.4) + Math.floor(Math.random() * 4));
        for (let i = 0; i < count; i++) this.enemies.push(createEnemy(randomEnemyKind(room.kind), this.level, room));
        if (room.kind === 'crate') this.spawnWeaponCrates(room, 2);
        else this.spawnWeaponCrates(room, Math.random() < 0.08 ? 1 : 0);
      }
    } else if (room.kind === 'shop') {
      this.spawnShop(room);
    }

    await this.match.hooks.emit('pve:room-enter', { match: this.match, room, enemies: this.enemies });
    return true;
  }

  spawnPointForRoom(room, fromIndex) {
    if (fromIndex == null) return { x: room.center.x - room.width / 2 + 4, z: room.center.z, rot: 0 };
    const side = Object.entries(room.neighbors).find(([, idx]) => idx === fromIndex)?.[0] ?? 'west';
    if (side === 'west') return { x: room.center.x - room.width / 2 + 4, z: room.center.z, rot: 0 };
    if (side === 'east') return { x: room.center.x + room.width / 2 - 4, z: room.center.z, rot: Math.PI };
    if (side === 'north') return { x: room.center.x, z: room.center.z - room.depth / 2 + 4, rot: Math.PI / 2 };
    return { x: room.center.x, z: room.center.z + room.depth / 2 - 4, rot: -Math.PI / 2 };
  }

  spawnShop(room) {
    this.spawnWeaponCrates(room, 2, 'shop');
    this.drops.push({ id: randomId('heal'), type: 'heal', amount: 40 + this.level * 5, x: room.center.x, z: room.center.z - 4, icon: '/assets/items/consumables/heal.png', groundTexture: '/assets/items/ground/heal.png' });
    this.drops.push({ id: randomId('magdrop'), type: 'magazine', magazine: randomMagazine(this.level), x: room.center.x + 2, z: room.center.z + 4, icon: '/assets/items/consumables/magazine.png', groundTexture: '/assets/items/ground/magazine.png' });
  }

  spawnWeaponCrates(room, count, source = 'room') {
    for (let i = 0; i < count; i++) {
      this.crates.push({
        id: randomId('crate'),
        kind: source === 'shop' ? 'shop_weapon' : 'weapon',
        x: room.center.x + randomRange(-room.width * 0.25, room.width * 0.25),
        z: room.center.z + randomRange(-room.depth * 0.22, room.depth * 0.22),
        opened: false,
        icon: '/assets/items/containers/weapon_crate.png',
        groundTexture: '/assets/items/ground/weapon_crate.png'
      });
    }
  }

  async update(dt) {
    if (this.finished) return;
    this.transitionLock = Math.max(0, this.transitionLock - dt);
    this.cleanEnemies();

    if (this.transitionPhase === 'upgrades') {
      this.checkUpgradeGate();
      return;
    }

    this.updatePlayers(dt);
    this.updateWeapons(dt);
    this.updateStatusEffects(dt);
    this.updateTelegraphs(dt);
    this.updateEnemies(dt);
    await this.updatePlayerProjectiles(dt);
    this.updateEnemyProjectiles(dt);
    this.updatePortal(dt);
    await this.checkRoomProgress();

    if (alivePlayers(this.match.players).length === 0) {
      this.finished = true;
      this.match.finish({ winnerId: null, reason: 'party-defeated', level: this.level });
    }
  }

  cleanEnemies() {
    this.enemies = this.enemies.filter(isActiveEnemy);
  }

  updatePlayers(dt) {
    const room = this.rooms[this.roomIndex];
    const minX = room.center.x - room.width / 2 + PLAYER_RADIUS;
    const maxX = room.center.x + room.width / 2 - PLAYER_RADIUS;
    const minZ = room.center.z - room.depth / 2 + PLAYER_RADIUS;
    const maxZ = room.center.z + room.depth / 2 - PLAYER_RADIUS;

    for (const player of this.match.players.values()) {
      player.swingTimer = Math.max(0, (player.swingTimer ?? 0) - dt);
      if (!player.alive) continue;
      updatePlayerRegen(player, dt);
      if (player.ability) player.ability.cooldown = Math.max(0, player.ability.cooldown - dt);
      player.actionCooldown = Math.max(0, player.actionCooldown - dt);
      const input = player.input;
      const dx = Number(input.right) - Number(input.left);
      const dz = Number(input.down) - Number(input.up);
      const length = Math.hypot(dx, dz) || 1;
      const speed = 7 * (player.stats.speedMultiplier ?? 1);
      player.x = clamp(player.x + (dx / length) * speed * dt, minX, maxX);
      player.z = clamp(player.z + (dz / length) * speed * dt, minZ, maxZ);
      player.rot = input.angle ?? player.rot;
      this.updateRevive(player, dt);
      if (input.shoot) this.tryAttack(player);
    }

    this.updateDoorTransition(room, dt);
  }

  updateRevive(player, dt) {
    if (!player.input?.revive) {
      if (player.reviveChannel) {
        const oldTarget = this.match.players.get(player.reviveChannel);
        if (oldTarget) oldTarget.reviveProgress = 0;
      }
      player.reviveChannel = null;
      return;
    }
    const target = [...this.match.players.values()]
      .filter((candidate) => candidate.id !== player.id && candidate.downed)
      .sort((a, b) => distance2(player, a) - distance2(player, b))[0];
    if (!target || distance2(player, target) > 3.2 ** 2) {
      player.reviveChannel = null;
      return;
    }
    if ((player.revives ?? 0) <= 0) {
      target.reviveProgress = 0;
      player.reviveChannel = null;
      return;
    }
    player.reviveChannel = target.id;
    target.reviveProgress = Math.min(REVIVE_HOLD_TIME, (target.reviveProgress ?? 0) + dt);
    if (target.reviveProgress >= REVIVE_HOLD_TIME) {
      target.alive = true;
      target.downed = false;
      target.spectator = false;
      target.hp = Math.max(1, Math.round(target.maxHp * 0.45));
      target.reviveProgress = 0;
      target.reviveChannel = null;
      player.reviveChannel = null;
      player.revives = Math.max(0, (player.revives ?? 0) - 1);
    }
  }

  updateStatusEffects(dt) {
    for (const enemy of this.enemies) {
      enemy.statusEffects ??= [];
      let slow = 1;
      for (const effect of enemy.statusEffects) {
        effect.remaining -= dt;
        if (effect.dps) this.damageEnemy(enemy, effect.dps * dt, null, effect.damageType ?? 'physical', null, { fromDot: true });
        if (effect.slowMultiplier) slow = Math.min(slow, effect.slowMultiplier);
      }
      enemy.statusEffects = enemy.statusEffects.filter((effect) => effect.remaining > 0);
      enemy.speed = (enemy.baseSpeed ?? enemy.speed) * slow;
    }
    this.cleanEnemies();
  }

  updateTelegraphs(dt) {
    for (const telegraph of this.telegraphs) {
      telegraph.delay -= dt;
      if (telegraph.delay > 0) continue;
      telegraph.done = true;
      this.executeTelegraph(telegraph);
    }
    this.telegraphs = this.telegraphs.filter((telegraph) => !telegraph.done);
  }

  scheduleTelegraph(data) {
    this.telegraphs.push({ id: randomId('telegraph'), delay: 0.75, ttl: 0.75, color: '#ff4f70', ...data });
  }

  executeTelegraph(telegraph) {
    if (telegraph.type === 'circle') {
      for (const player of alivePlayers(this.match.players)) {
        if (distance2(player, telegraph) <= (telegraph.radius ?? 3) ** 2) applyDamageToPlayer(player, telegraph.damage, telegraph.damageType);
      }
      if (telegraph.spawnNova) this.spawnNova({ x: telegraph.x, z: telegraph.z }, telegraph.ownerId, telegraph.damage, telegraph.damageType, telegraph.spawnNova);
      return;
    }
    if (telegraph.type === 'jump') {
      const boss = this.enemies.find((enemy) => enemy.id === telegraph.ownerId);
      if (boss) {
        boss.x = telegraph.x;
        boss.z = telegraph.z;
        boss.cooldown = 0.7;
      }
      for (const player of alivePlayers(this.match.players)) {
        if (distance2(player, telegraph) <= (telegraph.radius ?? 3.4) ** 2) applyDamageToPlayer(player, telegraph.damage, telegraph.damageType);
      }
      this.spawnNova(telegraph, telegraph.ownerId, Math.round(telegraph.damage * 0.7), telegraph.damageType, telegraph.novaCount ?? 10);
      return;
    }
    if (telegraph.type === 'line') {
      const length = telegraph.length ?? 18;
      const width = telegraph.width ?? 2.3;
      const ax = Math.cos(telegraph.angle);
      const az = Math.sin(telegraph.angle);
      for (const player of alivePlayers(this.match.players)) {
        const px = player.x - telegraph.x;
        const pz = player.z - telegraph.z;
        const forward = px * ax + pz * az;
        const side = Math.abs(px * -az + pz * ax);
        if (forward >= 0 && forward <= length && side <= width) applyDamageToPlayer(player, telegraph.damage, telegraph.damageType);
      }
      this.enemyProjectiles.push({ id: randomId('beam'), ownerId: telegraph.ownerId, x: telegraph.x, z: telegraph.z, vx: Math.cos(telegraph.angle) * 34, vz: Math.sin(telegraph.angle) * 34, ttl: 0.85, damage: Math.round(telegraph.damage * 0.45), damageType: telegraph.damageType, radius: 0.8 });
    }
  }

  spawnNova(origin, ownerId, damage, damageType = 'fire', count = 12, speed = 13) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      this.enemyProjectiles.push({ id: randomId('nova'), ownerId, x: origin.x, z: origin.z, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, ttl: 1.35, damage, damageType, radius: 0.55 });
    }
  }

  updateWeapons(dt) {
    for (const player of this.match.players.values()) {
      for (const weapon of player.weapons) {
        if (!weapon) continue;
        weapon.cooldown = Math.max(0, (weapon.cooldown ?? 0) - dt);
        weapon.reloadTimer = Math.max(0, (weapon.reloadTimer ?? 0) - dt);
      }
    }
  }

  isPlayerAtDoor(player, room, side) {
    const near = 2.15;
    const gap = 4.0;
    const cx = room.center.x;
    const cz = room.center.z;
    const halfW = room.width / 2;
    const halfD = room.depth / 2;
    if (side === 'east') return player.x >= cx + halfW - near && Math.abs(player.z - cz) <= gap;
    if (side === 'west') return player.x <= cx - halfW + near && Math.abs(player.z - cz) <= gap;
    if (side === 'south') return player.z >= cz + halfD - near && Math.abs(player.x - cx) <= gap;
    if (side === 'north') return player.z <= cz - halfD + near && Math.abs(player.x - cx) <= gap;
    return false;
  }

  updateDoorTransition(room, dt) {
    if (this.transitionLock > 0 || !room?.doorOpen || this.transitionPhase) {
      this.doorTransition = null;
      return;
    }

    const living = alivePlayers(this.match.players);
    if (!living.length) {
      this.doorTransition = null;
      return;
    }

    let ready = null;
    for (const side of ['east', 'west', 'south', 'north']) {
      const nextIndex = room.neighbors?.[side];
      if (nextIndex == null) continue;
      const next = this.rooms[nextIndex];
      if (!next || next.locked) continue;
      if (living.every((player) => this.isPlayerAtDoor(player, room, side))) {
        ready = { side, targetIndex: next.index };
        break;
      }
    }

    if (!ready) {
      this.doorTransition = null;
      return;
    }

    if (!this.doorTransition || this.doorTransition.side !== ready.side || this.doorTransition.targetIndex !== ready.targetIndex) {
      this.doorTransition = {
        side: ready.side,
        targetIndex: ready.targetIndex,
        fromIndex: room.index,
        countdown: 1.0,
        required: living.map((player) => player.id)
      };
      return;
    }

    this.doorTransition.countdown = Math.max(0, this.doorTransition.countdown - dt);
    if (this.doorTransition.countdown > 0) return;

    const transition = this.doorTransition;
    this.doorTransition = null;
    this.transitionLock = 0.85;
    this.enterRoom(transition.targetIndex, transition.fromIndex);
  }

  allRequiredRoomsCleared() {
    return this.rooms.filter((room) => !['boss', 'shop', 'start'].includes(room.kind)).every((room) => room.cleared);
  }

  tryAttack(player) {
    const weapon = activeWeapon(player);
    const def = getWeaponDef(weapon);
    if (!weapon || !def || weapon.cooldown > 0 || weapon.reloadTimer > 0) return;
    weapon.cooldown = def.fireRate;

    if (def.kind === 'melee') {
      player.swingTimer = 0.22;
      for (const enemy of this.enemies) {
        if (!isActiveEnemy(enemy)) continue;
        if (!canHitMelee(player, enemy, def)) continue;
        this.damageEnemy(enemy, weaponDamage(def, weapon, player), player, 'physical', def.debuff);
      }
      this.cleanEnemies();
      return;
    }

    if (!consumeShot(player, weapon)) return;
    const bullets = Math.max(1, (def.pellets ?? 1) + (player.stats.extraBullets ?? 0));
    for (let i = 0; i < bullets; i++) {
      const centered = i - (bullets - 1) / 2;
      const angle = player.rot + centered * (def.spread ?? 0) + randomRange(-(def.spread ?? 0), def.spread ?? 0) * 0.35;
      this.projectiles.push({
        id: randomId('shot'), ownerId: player.id, x: player.x, z: player.z,
        vx: Math.cos(angle) * def.projectileSpeed, vz: Math.sin(angle) * def.projectileSpeed,
        ttl: def.projectileTtl, damage: weaponDamage(def, weapon, player), damageType: def.debuff?.damageType ?? (def.ammoType === 'energy' ? 'energy' : 'physical'), splash: def.splash ?? 0, debuff: def.debuff ?? null, weaponLevel: weapon.level ?? 1
      });
    }
  }

  updateEnemies(dt) {
    const livingPlayers = alivePlayers(this.match.players);
    for (const enemy of this.enemies) {
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      enemy.abilityTimer = Math.max(0, (enemy.abilityTimer ?? 0) - dt);
      if (livingPlayers.length === 0) return;
      const target = [...livingPlayers].sort((a, b) => distance2(enemy, a) - distance2(enemy, b))[0];
      const dx = target.x - enemy.x;
      const dz = target.z - enemy.z;
      const dist = Math.hypot(dx, dz) || 1;
      enemy.rot = Math.atan2(dz, dx);

      if (enemy.kind === 'boss') this.updateBossStage(enemy);
      if (enemy.abilities && enemy.abilityTimer <= 0) this.useBossAbility(enemy, target);

      if (enemy.ranged && dist <= enemy.attackRange) {
        if (enemy.cooldown <= 0) {
          enemy.cooldown = enemy.kind === 'boss' ? 1.1 : 1.2 + Math.random() * 0.25;
          const pellets = Math.max(1, enemy.pellets ?? 1);
          for (let i = 0; i < pellets; i++) {
            const centered = i - (pellets - 1) / 2;
            const angle = enemy.rot + centered * (enemy.spread ?? 0);
            this.enemyProjectiles.push({
              id: randomId('eshot'), ownerId: enemy.id, x: enemy.x, z: enemy.z,
              vx: Math.cos(angle) * enemy.projectileSpeed,
              vz: Math.sin(angle) * enemy.projectileSpeed,
              ttl: 1.5, damage: enemy.damage, damageType: enemy.damageType, effect: enemy.projectileEffect ?? null, radius: 0.45,
              color: enemy.damageType === 'fire' ? '#ff7a45' : enemy.damageType === 'poison' ? '#66d19e' : '#ff6d8c'
            });
          }
        }
      } else if (dist > enemy.attackRange) {
        enemy.x += (dx / dist) * enemy.speed * dt;
        enemy.z += (dz / dist) * enemy.speed * dt;
      } else if (enemy.cooldown <= 0) {
        enemy.cooldown = enemy.kind === 'boss' ? 0.9 : 1.0;
        if (enemy.splash) {
          for (const player of livingPlayers) if (distance2(enemy, player) <= enemy.splash * enemy.splash) applyDamageToPlayer(player, enemy.damage, enemy.damageType);
        } else applyDamageToPlayer(target, enemy.damage, enemy.damageType);
      }
    }
  }

  updateBossStage(enemy) {
    const nextStage = stageByHp(enemy);
    if (nextStage <= (enemy.stage ?? 1)) return;
    enemy.stage = nextStage;
    enemy.abilityTimer = Math.min(enemy.abilityTimer ?? 0, 0.65);
    enemy.speed = (enemy.baseSpeed ?? enemy.speed) + nextStage * 0.18;
    enemy.cooldown = Math.min(enemy.cooldown ?? 1, 0.45);
  }

  useBossAbility(enemy, target) {
    const abilities = enemy.abilities?.length ? enemy.abilities : [enemy.ability].filter(Boolean);
    const stage = enemy.stage ?? 1;
    const index = Math.floor(Math.random() * Math.min(abilities.length, Math.max(1, stage + 1)));
    const ability = abilities[index] ?? abilities[0];
    enemy.ability = ability;
    enemy.abilityTimer = Math.max(1.8, (enemy.abilityCooldown ?? 4) - stage * 0.35);

    if (ability === 'summon' || ability === 'summonToxic') {
      const room = this.rooms[this.roomIndex];
      const kind = ability === 'summonToxic' ? 'toxic_mage' : 'slime';
      for (let i = 0; i < 2 + Math.min(5, this.level + stage); i++) this.enemies.push(createEnemy(kind, this.level, room));
      if (stage >= 2) this.scheduleTelegraph({ type: 'circle', ownerId: enemy.id, x: enemy.x, z: enemy.z, radius: 4.5, damage: Math.round(enemy.damage * 0.7), damageType: enemy.damageType });
      return;
    }

    if (ability === 'nova') {
      this.scheduleTelegraph({ type: 'circle', ownerId: enemy.id, x: enemy.x, z: enemy.z, radius: 5.0 + stage * 0.8, damage: enemy.damage, damageType: 'fire', spawnNova: 12 + stage * 4 });
      return;
    }

    if (ability === 'ring') {
      this.spawnNova(enemy, enemy.id, Math.round(enemy.damage * 0.8), enemy.damageType, 10 + stage * 4, 11 + stage * 1.3);
      return;
    }

    if (ability === 'jumpNova') {
      this.scheduleTelegraph({ type: 'jump', ownerId: enemy.id, x: target.x, z: target.z, radius: 3.2 + stage * 0.45, damage: Math.round(enemy.damage * 1.15), damageType: enemy.damageType, novaCount: 8 + stage * 4 });
      return;
    }

    if (ability === 'beam') {
      const angle = Math.atan2(target.z - enemy.z, target.x - enemy.x);
      enemy.rot = angle;
      this.scheduleTelegraph({ type: 'line', ownerId: enemy.id, x: enemy.x, z: enemy.z, angle, length: 24 + stage * 4, width: 1.5 + stage * 0.35, damage: Math.round(enemy.damage * 1.45), damageType: 'arcane' });
      if (stage >= 2) {
        this.scheduleTelegraph({ type: 'circle', ownerId: enemy.id, x: target.x, z: target.z, radius: 2.6 + stage * 0.35, damage: Math.round(enemy.damage * 0.8), damageType: 'energy' });
      }
      return;
    }

    if (ability === 'crystalFan') {
      for (let i = -2 - stage; i <= 2 + stage; i++) {
        const angle = enemy.rot + i * 0.18;
        this.enemyProjectiles.push({ id: randomId('crystal'), ownerId: enemy.id, x: enemy.x, z: enemy.z, vx: Math.cos(angle) * 17, vz: Math.sin(angle) * 17, ttl: 1.5, damage: Math.round(enemy.damage * 0.8), damageType: 'energy', radius: 0.48 });
      }
      return;
    }

    if (ability === 'flameLines') {
      for (let i = -1; i <= 1; i++) {
        this.scheduleTelegraph({ type: 'line', ownerId: enemy.id, x: enemy.x, z: enemy.z, angle: enemy.rot + i * 0.34, length: 18 + stage * 2, width: 1.2, damage: Math.round(enemy.damage * 1.05), damageType: 'fire' });
      }
      return;
    }

    if (ability === 'poisonRain') {
      for (let i = 0; i < 4 + stage * 2; i++) {
        this.scheduleTelegraph({ type: 'circle', ownerId: enemy.id, x: target.x + randomRange(-7, 7), z: target.z + randomRange(-5, 5), radius: 2.0 + stage * 0.25, damage: Math.round(enemy.damage * 0.75), damageType: 'poison' });
      }
      return;
    }

    if (ability === 'dashCross') {
      for (let i = 0; i < 4; i++) this.scheduleTelegraph({ type: 'line', ownerId: enemy.id, x: enemy.x, z: enemy.z, angle: (Math.PI / 2) * i, length: 19 + stage * 3, width: 1.25, damage: Math.round(enemy.damage * 1.1), damageType: 'energy' });
    }
  }

  async updatePlayerProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.z += projectile.vz * dt;
      projectile.ttl -= dt;
      for (const enemy of this.enemies) {
        if (!isActiveEnemy(enemy)) continue;
        if (distance2(projectile, enemy) <= (enemy.radius + 0.35) ** 2) {
          projectile.ttl = 0;
          const owner = this.match.players.get(String(projectile.ownerId));
          this.damageEnemy(enemy, projectile.damage, owner, projectile.damageType, projectile.debuff, { weaponLevel: projectile.weaponLevel ?? 1 });
          if (projectile.splash) {
            for (const other of this.enemies) if (other.id !== enemy.id && distance2(other, enemy) <= projectile.splash ** 2) this.damageEnemy(other, Math.round(projectile.damage * 0.55), owner, projectile.damageType, projectile.debuff, { weaponLevel: projectile.weaponLevel ?? 1 });
          }
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.ttl > 0);
    this.cleanEnemies();
  }

  damageEnemy(enemy, amount, owner, damageType = 'physical', debuff = null, meta = {}) {
    const resist = enemy.resists?.[damageType] ?? 0;
    const armor = enemy.armor ?? 0;
    const finalAmount = Math.max(meta.fromDot ? 0 : 1, Math.round(Number(amount) * (1 - resist) - (meta.fromDot ? 0 : armor)));
    enemy.hp = Math.max(0, enemy.hp - finalAmount);
    if (enemy.hp > 0 && debuff) addStatusEffect(enemy, debuff, meta.weaponLevel ?? 1);
    if (enemy.hp > 0) return;
    if (owner) {
      owner.kills += 1;
      owner.score += enemy.score ?? 10;
      if ((owner.stats.vampirism ?? 0) > 0) healPlayer(owner, owner.maxHp * owner.stats.vampirism);
    }
  }

  updateEnemyProjectiles(dt) {
    for (const projectile of this.enemyProjectiles) {
      projectile.x += projectile.vx * dt;
      projectile.z += projectile.vz * dt;
      projectile.ttl -= dt;
      for (const player of alivePlayers(this.match.players)) {
        if (distance2(projectile, player) <= (projectile.radius ?? 0.5) ** 2 + 0.7) {
          projectile.ttl = 0;
          applyDamageToPlayer(player, projectile.damage, projectile.damageType);
          if (projectile.effect === 'burn') applyDamageToPlayer(player, 2, 'fire');
          if (projectile.effect === 'poison') applyDamageToPlayer(player, 2, 'poison');
          break;
        }
      }
    }
    this.enemyProjectiles = this.enemyProjectiles.filter((p) => p.ttl > 0);
  }

  updatePortal(dt) {
    if (!this.portal?.active || this.transitionPhase) return;
    const required = alivePlayers(this.match.players).map((p) => p.id);
    if (!required.length) return;
    const voted = new Set(this.portal.votes ?? []);
    const ready = required.every((id) => voted.has(id));
    if (!ready) {
      this.portal.countdown = null;
      return;
    }
    this.portal.countdown = Math.max(0, (this.portal.countdown ?? PORTAL_VOTE_TIME) - dt);
    if (this.portal.countdown <= 0) this.prepareNextLevelUpgrades();
  }

  async checkRoomProgress() {
    this.cleanEnemies();
    const room = this.rooms[this.roomIndex];
    if (this.enemies.length > 0 || room.cleared) return;
    room.cleared = true;
    room.doorOpen = true;
    if (this.allRequiredRoomsCleared()) {
      const boss = this.rooms.find((candidate) => candidate.kind === 'boss');
      if (boss) boss.locked = false;
    }

    if (room.kind === 'boss') {
      for (const player of alivePlayers(this.match.players)) {
        player.score += 300 + this.level * 120;
        await this.match.addLeaderboard(player, 'pve', { score: player.score, wins: 1, kills: player.kills });
      }
      this.portal = { id: 'portal', x: room.center.x, z: room.center.z, active: true, level: this.level, votes: [], countdown: null, required: alivePlayers(this.match.players).map((p) => p.id) };
      if (Math.random() < 0.6) this.drops.push({ id: randomId('reviveDrop'), type: 'revive', amount: Math.floor(randomRange(1, 6)), x: room.center.x + 2.5, z: room.center.z, icon: '/assets/items/consumables/revive.png', groundTexture: '/assets/items/ground/revive.png' });
    } else if (room.kind !== 'start' && room.kind !== 'shop') {
      this.rewardRoomClear(room);
    }
    await this.match.hooks.emit('pve:room-cleared', { match: this.match, room });
  }

  rewardRoomClear(room) {
    for (const player of alivePlayers(this.match.players)) {
      const rolls = 2 + (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0; i < rolls; i++) {
        const mag = randomMagazine(this.level);
        player.magazines[mag.type] ??= [];
        player.magazines[mag.type].push(mag);
      }
    }
    const weaponChance = room.kind === 'elite' ? 0.24 : room.kind === 'crate' ? 0.36 : 0.10;
    if (Math.random() < weaponChance) this.drops.push({ id: randomId('weaponDrop'), type: 'weapon', weapon: randomWeapon({ minRarity: 1, maxRarity: Math.min(4, 1 + Math.ceil(this.level / 2)), level: Math.min(20, 1 + Math.floor(this.level / 2)) }), x: room.center.x + randomRange(-3, 3), z: room.center.z + randomRange(-3, 3) });
  }

  votePortal(player) {
    if (!this.portal?.active || distance2(player, this.portal) > 4.5 ** 2) return false;
    this.portal.votes ??= [];
    if (!this.portal.votes.includes(player.id)) this.portal.votes.push(player.id);
    this.portal.required = alivePlayers(this.match.players).map((p) => p.id);
    return true;
  }

  prepareNextLevelUpgrades() {
    if (this.transitionPhase === 'upgrades') return;
    this.transitionPhase = 'upgrades';
    for (const player of alivePlayers(this.match.players)) player.pendingUpgrades = createUpgradeChoices(player);
    this.projectiles = [];
    this.enemyProjectiles = [];
  }

  checkUpgradeGate() {
    const waiting = alivePlayers(this.match.players).some((player) => (player.pendingUpgrades ?? []).length > 0);
    if (!waiting) this.advanceToNextLevel();
  }

  advanceToNextLevel() {
    this.level += 1;
    this.generateLevel();
    this.enterRoom(0, null);
  }

  chooseUpgrade(player, choiceId) {
    const choice = player.pendingUpgrades.find((candidate) => candidate.choiceId === choiceId || candidate.id === choiceId);
    if (!choice) return false;
    const ok = applyUpgrade(player, choice.id);
    if (ok) player.pendingUpgrades = [];
    this.checkUpgradeGate();
    return ok;
  }

  handleAction(player, action) {
    const type = String(action?.type ?? '');
    if (type === 'switch-slot') {
      const slot = clamp(Math.round(Number(action.slot)), 0, 2);
      player.activeSlot = slot;
      return true;
    }
    if (type === 'reload') return this.reload(player);
    if (type === 'pickup') return this.pickup(player);
    if (type === 'drop-weapon') return this.dropWeapon(player);
    if (type === 'drop-magazine') return this.dropMagazine(player, action.ammoType);
    if (type === 'ability') return this.useAbility(player);
    return false;
  }

  reload(player) {
    const weapon = activeWeapon(player);
    const def = getWeaponDef(weapon);
    if (!weapon || !def || def.kind !== 'gun' || weapon.reloadTimer > 0) return false;
    const current = weapon.magazine ?? 0;
    const need = Math.max(0, def.magSize - current);
    if (need <= 0) return false;
    const mags = player.magazines[def.ammoType] ?? [];
    const available = mags.reduce((sum, mag) => sum + mag.amount, 0);
    if (available <= 0) return false;
    const taken = reduceMagazinePool(mags, Math.min(need, available));
    weapon.magazine = current + taken;
    weapon.reloadTimer = def.reloadTime;
    return taken > 0;
  }

  pickup(player) {
    if (this.votePortal(player)) return true;
    const crate = this.crates.find((candidate) => !candidate.opened && distance2(player, candidate) <= 5.5);
    if (crate) {
      crate.opened = true;
      this.drops.push({ id: randomId('weaponDrop'), type: 'weapon', weapon: randomWeapon({ minRarity: crate.kind === 'shop_weapon' ? 2 : 1, maxRarity: 4, level: Math.min(20, 1 + Math.floor(this.level / 2)) }), x: crate.x, z: crate.z });
      return true;
    }
    const drop = nearestDrop(player, this.drops, 'revive', 5.4) ?? nearestDrop(player, this.drops, null, 2.9);
    if (!drop) return false;
    if (drop.type === 'weapon') {
      const emptyIndex = player.weapons.findIndex((slot) => !slot);
      const slot = emptyIndex >= 0 ? emptyIndex : player.activeSlot;
      const current = player.weapons[slot];
      if (current) this.drops.push({ id: randomId('weaponDrop'), type: 'weapon', weapon: current, x: player.x, z: player.z });
      player.weapons[slot] = drop.weapon;
      player.activeSlot = slot;
    } else if (drop.type === 'magazine') {
      player.magazines[drop.magazine.type] ??= [];
      player.magazines[drop.magazine.type].push(drop.magazine);
    } else if (drop.type === 'heal') {
      healPlayer(player, drop.amount);
    } else if (drop.type === 'revive') {
      player.revives = (player.revives ?? 0) + Math.max(1, Math.floor(Number(drop.amount) || 1));
    }
    removeById(this.drops, drop.id);
    return true;
  }

  dropWeapon(player) {
    const weapon = activeWeapon(player);
    if (!weapon) return false;
    player.weapons[player.activeSlot] = null;
    this.drops.push({ id: randomId('weaponDrop'), type: 'weapon', weapon, x: player.x + Math.cos(player.rot) * 1.4, z: player.z + Math.sin(player.rot) * 1.4 });
    return true;
  }

  dropMagazine(player, ammoType = null) {
    const weapon = activeWeapon(player);
    const def = getWeaponDef(weapon);
    const type = String(ammoType ?? def?.ammoType ?? 'light');
    const mags = player.magazines[type] ?? [];
    if (!mags.length) return false;
    const mag = mags.sort((a, b) => b.amount - a.amount).shift();
    this.drops.push({ id: randomId('magdrop'), type: 'magazine', magazine: mag, x: player.x + Math.cos(player.rot) * 1.4, z: player.z + Math.sin(player.rot) * 1.4, icon: '/assets/items/consumables/magazine.png', groundTexture: '/assets/items/ground/magazine.png' });
    return true;
  }

  useAbility(player) {
    if (!player.ability || player.ability.cooldown > 0) return false;
    if (player.ability.id === 'dash') {
      player.x += Math.cos(player.rot) * 5.5;
      player.z += Math.sin(player.rot) * 5.5;
      player.ability.cooldown = player.ability.maxCooldown;
      return true;
    }
    return false;
  }

  serializableRooms() {
    return this.rooms.map((room) => ({
      id: room.id,
      index: room.index,
      level: room.level,
      kind: room.kind,
      name: room.name,
      center: room.center,
      grid: room.grid,
      width: room.width,
      depth: room.depth,
      cleared: room.cleared,
      visited: room.visited,
      doorOpen: room.doorOpen,
      locked: room.locked,
      neighbors: room.neighbors,
      theme: room.theme,
      doors: Object.fromEntries(Object.entries(room.neighbors ?? {}).map(([side, idx]) => {
        const target = this.rooms[idx];
        return [side, { target: idx, open: room.doorOpen && !target?.locked, locked: Boolean(target?.locked) }];
      }))
    }));
  }

  getState() {
    this.cleanEnemies();
    const rooms = this.serializableRooms();
    return {
      type: 'pve',
      level: this.level,
      roomIndex: this.roomIndex,
      rooms,
      currentRoom: rooms[this.roomIndex],
      enemies: this.enemies.map((enemy) => ({ ...enemy, rot: Number(enemy.rot ?? 0), hp: Math.ceil(enemy.hp), maxHp: Math.ceil(enemy.maxHp), stage: enemy.stage ?? 1, resists: enemy.resists ?? null, statusEffects: enemy.statusEffects ?? [], abilityCooldown: Number((enemy.abilityTimer ?? 0).toFixed(2)) })),
      projectiles: [...this.projectiles, ...this.enemyProjectiles.map((p) => ({ ...p, enemy: true }))],
      telegraphs: this.telegraphs.map((t) => ({ ...t, delay: Number(Math.max(0, t.delay).toFixed(2)), ttl: Number((t.ttl ?? 1).toFixed(2)) })),
      crates: this.crates,
      drops: this.drops.map((drop) => ({ ...drop, weapon: serializeWeapon(drop.weapon) })),
      portal: this.portal,
      doorTransition: this.doorTransition ? { ...this.doorTransition, countdown: Number(Math.max(0, this.doorTransition.countdown).toFixed(2)) } : null,
      transitionPhase: this.transitionPhase
    };
  }
}
