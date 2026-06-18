import { createStarterMagazines, createStarterWeapons, serializeWeapon } from '../data/Weapons.js';

const DEFAULT_COLOR = '#6d7cff';

function normalizeColor(color) {
  const value = String(color ?? DEFAULT_COLOR).trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : DEFAULT_COLOR;
}

export function createPlayerState(user, socketId) {
  const weapons = createStarterWeapons();
  return {
    id: String(user.id),
    socketId,
    username: user.username,
    color: normalizeColor(user.color),
    isLeader: false,
    x: 0,
    y: 0,
    z: 0,
    rot: 0,
    hp: 100,
    maxHp: 100,
    alive: true,
    downed: false,
    spectator: false,
    reviveProgress: 0,
    revives: 1,
    kills: 0,
    score: 0,
    roundWins: 0,
    input: { up: false, down: false, left: false, right: false, shoot: false, revive: false, angle: 0 },
    stats: {
      damageMultiplier: 1,
      defense: 0,
      speedMultiplier: 1,
      extraBullets: 0,
      vampirism: 0,
      regen: 0,
      ammoSaveChance: 0,
      resist: { physical: 0, fire: 0, poison: 0, arcane: 0, energy: 0 }
    },
    weapons: [weapons[0], weapons[1], null],
    activeSlot: 0,
    magazines: createStarterMagazines(),
    ability: null,
    upgrades: [],
    upgradeStacks: {},
    pendingUpgrades: [],
    actionCooldown: 0,
    swingTimer: 0,
    reviveChannel: null
  };
}

export function applyPlayerStyle(player, style = {}) {
  const next = normalizeColor(style.color ?? player.color);
  player.color = next;
  return { color: next };
}

export function serializePlayerForLobby(player) {
  return {
    id: player.id,
    username: player.username,
    color: player.color,
    hp: Math.ceil(player.hp),
    maxHp: player.maxHp,
    shield: Number(player.stats?.defense ?? 0),
    alive: player.alive,
    downed: Boolean(player.downed),
    spectator: Boolean(player.spectator),
    revives: player.revives ?? 0,
    score: player.score,
    kills: player.kills,
    roundWins: player.roundWins,
    pendingUpgrades: player.pendingUpgrades ?? []
  };
}

export function serializePlayerForWorld(player) {
  return {
    id: player.id,
    username: player.username,
    color: player.color,
    x: player.x,
    y: player.y,
    z: player.z,
    rot: player.rot,
    hp: Math.ceil(player.hp),
    maxHp: player.maxHp,
    shield: Number(player.stats?.defense ?? 0),
    alive: player.alive,
    downed: Boolean(player.downed),
    spectator: Boolean(player.spectator),
    reviveProgress: Number((player.reviveProgress ?? 0).toFixed(2)),
    revives: player.revives ?? 0,
    score: player.score,
    kills: player.kills,
    roundWins: player.roundWins,
    activeSlot: player.activeSlot,
    weapons: player.weapons.map(serializeWeapon),
    magazines: Object.fromEntries(Object.entries(player.magazines).map(([type, mags]) => [type, mags.reduce((sum, mag) => sum + mag.amount, 0)])),
    ability: player.ability ? {
      id: player.ability.id,
      name: player.ability.name,
      cooldown: Number(player.ability.cooldown.toFixed(2)),
      maxCooldown: player.ability.maxCooldown
    } : null,
    pendingUpgrades: player.pendingUpgrades ?? [],
    swingTimer: Number((player.swingTimer ?? 0).toFixed(2)),
    reviveChannel: player.reviveChannel
  };
}
