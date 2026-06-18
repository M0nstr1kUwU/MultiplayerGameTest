import { randomId, randomRange } from '../core/math.js';

export const ENEMY_TYPES = {
  slime: { id: 'slime', name: 'Slime', hp: 42, damage: 8, speed: 2.8, radius: 0.8, score: 12, attackRange: 1.35, cooldown: 1.0, damageType: 'physical', color: '#85e06e' },
  goblin: { id: 'goblin', name: 'Goblin', hp: 55, damage: 12, speed: 3.35, radius: 0.85, score: 16, attackRange: 1.45, cooldown: 0.85, damageType: 'physical', color: '#ffb84d' },
  charger: { id: 'charger', name: 'Horned Charger', hp: 74, damage: 16, speed: 3.9, radius: 0.95, score: 24, attackRange: 1.7, cooldown: 1.15, damageType: 'physical', color: '#c78f5a' },
  shield_bug: { id: 'shield_bug', name: 'Shield Bug', hp: 92, damage: 10, speed: 2.3, radius: 1.0, score: 28, attackRange: 1.45, cooldown: 1.25, damageType: 'physical', armor: 3, color: '#6e8fb0' },
  archer: { id: 'archer', name: 'Bone Archer', hp: 38, damage: 12, speed: 2.25, radius: 0.8, score: 20, attackRange: 9, cooldown: 1.5, ranged: true, projectileSpeed: 14, damageType: 'physical', color: '#d8d4bc' },
  spitter: { id: 'spitter', name: 'Poison Spitter', hp: 45, damage: 9, speed: 2.05, radius: 0.8, score: 22, attackRange: 8, cooldown: 1.35, ranged: true, projectileSpeed: 12, damageType: 'poison', projectileEffect: 'poison', color: '#66d19e' },
  fire_imp: { id: 'fire_imp', name: 'Fire Imp', hp: 48, damage: 11, speed: 2.65, radius: 0.78, score: 26, attackRange: 8.5, cooldown: 1.25, ranged: true, projectileSpeed: 13.5, damageType: 'fire', projectileEffect: 'burn', color: '#ff7a45' },
  toxic_mage: { id: 'toxic_mage', name: 'Toxic Mage', hp: 58, damage: 8, speed: 1.9, radius: 0.82, score: 30, attackRange: 8.2, cooldown: 1.75, ranged: true, projectileSpeed: 10.5, pellets: 3, spread: 0.18, damageType: 'poison', projectileEffect: 'poison', color: '#8affb4' },
  flame_orb: { id: 'flame_orb', name: 'Flame Orb', hp: 62, damage: 14, speed: 2.15, radius: 0.88, score: 34, attackRange: 9, cooldown: 1.65, ranged: true, projectileSpeed: 12, pellets: 5, spread: 0.16, damageType: 'fire', projectileEffect: 'burn', color: '#ffb347' },
  bomber: { id: 'bomber', name: 'Bomber', hp: 70, damage: 20, speed: 2.6, radius: 0.95, score: 28, attackRange: 2.2, cooldown: 1.65, splash: 2.2, damageType: 'fire', color: '#ff5f6d' }
};

export const BOSS_TYPES = {
  necro_cube: {
    id: 'necro_cube', name: 'Necro Cube', hp: 380, damage: 18, speed: 1.75, radius: 1.8, score: 360,
    abilities: ['summon', 'ring', 'jumpNova'], abilityCooldown: 4.8, damageType: 'arcane', color: '#9f7cff'
  },
  ember_golem: {
    id: 'ember_golem', name: 'Ember Golem', hp: 500, damage: 22, speed: 1.45, radius: 2.0, score: 470,
    abilities: ['nova', 'jumpNova', 'flameLines'], abilityCooldown: 4.2, damageType: 'fire', color: '#ff5f6d'
  },
  crystal_warden: {
    id: 'crystal_warden', name: 'Crystal Warden', hp: 560, damage: 25, speed: 1.25, radius: 2.1, score: 590,
    abilities: ['beam', 'crystalFan', 'jumpNova'], abilityCooldown: 3.4, damageType: 'energy', color: '#5fd9ff'
  },
  plague_hydra: {
    id: 'plague_hydra', name: 'Plague Hydra', hp: 620, damage: 20, speed: 1.35, radius: 2.15, score: 640,
    abilities: ['poisonRain', 'summonToxic', 'ring'], abilityCooldown: 4.5, damageType: 'poison', color: '#6fffa1'
  },
  storm_core: {
    id: 'storm_core', name: 'Storm Core', hp: 600, damage: 24, speed: 1.7, radius: 1.9, score: 650,
    abilities: ['beam', 'dashCross', 'crystalFan'], abilityCooldown: 3.2, damageType: 'energy', color: '#8fd8ff'
  }
};

const NORMAL_POOL = ['slime', 'goblin', 'charger', 'archer', 'spitter', 'fire_imp'];
const ELITE_POOL = ['goblin', 'charger', 'shield_bug', 'archer', 'spitter', 'fire_imp', 'toxic_mage', 'flame_orb', 'bomber'];
const BOSS_POOL = Object.keys(BOSS_TYPES);

function scaleValue(value, level, multiplier = 1) {
  return Math.round(value * (1 + (level - 1) * multiplier));
}

export function bossResistsForLevel(level = 1) {
  const bonus = Math.min(1, Math.floor(Math.max(0, level - 1) / 3) * 0.2);
  return { physical: 0, fire: bonus, poison: bonus, arcane: 0, energy: 0 };
}

export function createEnemy(kind, level = 1, room = { center: { x: 0, z: 0 }, width: 34, depth: 24 }) {
  const def = ENEMY_TYPES[kind] ?? ENEMY_TYPES.slime;
  return {
    id: randomId('enemy'),
    type: def.id,
    name: def.name,
    kind: 'enemy',
    x: room.center.x + randomRange(-room.width * 0.32, room.width * 0.32),
    z: room.center.z + randomRange(-room.depth * 0.30, room.depth * 0.30),
    hp: scaleValue(def.hp, level, 0.22),
    maxHp: scaleValue(def.hp, level, 0.22),
    damage: scaleValue(def.damage, level, 0.16),
    speed: def.speed + Math.min(1.2, level * 0.07),
    baseSpeed: def.speed + Math.min(1.2, level * 0.07),
    radius: def.radius,
    score: scaleValue(def.score, level, 0.12),
    attackRange: def.attackRange,
    cooldown: randomRange(0.25, 1.1),
    abilityCooldown: 0,
    ranged: Boolean(def.ranged),
    projectileSpeed: def.projectileSpeed ?? 0,
    pellets: def.pellets ?? 1,
    spread: def.spread ?? 0,
    splash: def.splash ?? 0,
    armor: def.armor ?? 0,
    damageType: def.damageType,
    projectileEffect: def.projectileEffect ?? null,
    color: def.color,
    statusEffects: []
  };
}

export function createBoss(level = 1, room = { center: { x: 0, z: 0 } }) {
  const id = BOSS_POOL[(level - 1) % BOSS_POOL.length];
  const def = BOSS_TYPES[id];
  return {
    id: randomId('boss'),
    type: def.id,
    name: def.name,
    kind: 'boss',
    x: room.center.x,
    z: room.center.z,
    hp: scaleValue(def.hp, level, 0.34),
    maxHp: scaleValue(def.hp, level, 0.34),
    damage: scaleValue(def.damage, level, 0.18),
    speed: def.speed + Math.min(0.8, level * 0.04),
    baseSpeed: def.speed + Math.min(0.8, level * 0.04),
    radius: def.radius,
    score: scaleValue(def.score, level, 0.2),
    attackRange: 2.4,
    cooldown: 1.0,
    abilities: def.abilities,
    ability: def.abilities[0],
    abilityCooldown: def.abilityCooldown,
    abilityTimer: def.abilityCooldown * 0.65,
    stage: 1,
    resists: bossResistsForLevel(level),
    damageType: def.damageType,
    color: def.color,
    statusEffects: []
  };
}

export function randomEnemyKind(roomKind = 'normal') {
  const pool = roomKind === 'elite' ? ELITE_POOL : NORMAL_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}
