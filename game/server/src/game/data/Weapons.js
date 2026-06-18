import { randomId } from '../core/math.js';

export const AMMO_TYPES = ['light', 'shell', 'energy', 'heavy'];
export const MAX_WEAPON_LEVEL = 20;
export const WEAPON_LEVEL_DAMAGE_STEP = 0.12;

export const WEAPONS = {
  rusty_pistol: {
    id: 'rusty_pistol', name: 'Rusty Pistol', kind: 'gun', ammoType: 'light', magSize: 12,
    damage: 16, fireRate: 0.32, projectileSpeed: 28, projectileTtl: 1.15, spread: 0.025, pellets: 1, reloadTime: 0.9, rarity: 1,
    icon: '/assets/items/weapons/rusty_pistol.png', groundModel: '/assets/models/items/rusty_pistol.glb', groundTexture: '/assets/items/ground/rusty_pistol.png'
  },
  ranger_rifle: {
    id: 'ranger_rifle', name: 'Ranger Rifle', kind: 'gun', ammoType: 'light', magSize: 24,
    damage: 13, fireRate: 0.12, projectileSpeed: 34, projectileTtl: 1.05, spread: 0.035, pellets: 1, reloadTime: 1.35, rarity: 2,
    icon: '/assets/items/weapons/ranger_rifle.png', groundModel: '/assets/models/items/ranger_rifle.glb', groundTexture: '/assets/items/ground/ranger_rifle.png'
  },
  venom_pistol: {
    id: 'venom_pistol', name: 'Venom Pistol', kind: 'gun', ammoType: 'light', magSize: 14,
    damage: 11, fireRate: 0.25, projectileSpeed: 28, projectileTtl: 1.05, spread: 0.035, pellets: 1, reloadTime: 1.05, rarity: 2,
    debuff: { id: 'poison', name: 'Poison', chance: 0.38, duration: 4.5, dps: 5, damageType: 'poison' },
    icon: '/assets/items/weapons/venom_pistol.png', groundModel: '/assets/models/items/venom_pistol.glb', groundTexture: '/assets/items/ground/venom_pistol.png'
  },
  ember_carbine: {
    id: 'ember_carbine', name: 'Ember Carbine', kind: 'gun', ammoType: 'energy', magSize: 20,
    damage: 15, fireRate: 0.18, projectileSpeed: 33, projectileTtl: 1.0, spread: 0.045, pellets: 1, reloadTime: 1.45, rarity: 3,
    debuff: { id: 'burn', name: 'Burn', chance: 0.34, duration: 3.2, dps: 8, damageType: 'fire' },
    icon: '/assets/items/weapons/ember_carbine.png', groundModel: '/assets/models/items/ember_carbine.glb', groundTexture: '/assets/items/ground/ember_carbine.png'
  },
  frost_shard: {
    id: 'frost_shard', name: 'Frost Shard', kind: 'gun', ammoType: 'energy', magSize: 16,
    damage: 18, fireRate: 0.28, projectileSpeed: 30, projectileTtl: 1.05, spread: 0.02, pellets: 1, reloadTime: 1.35, rarity: 3,
    debuff: { id: 'slow', name: 'Slow', chance: 0.42, duration: 2.4, slowMultiplier: 0.55, damageType: 'energy' },
    icon: '/assets/items/weapons/frost_shard.png', groundModel: '/assets/models/items/frost_shard.glb', groundTexture: '/assets/items/ground/frost_shard.png'
  },
  riot_shotgun: {
    id: 'riot_shotgun', name: 'Riot Shotgun', kind: 'gun', ammoType: 'shell', magSize: 6,
    damage: 8, fireRate: 0.72, projectileSpeed: 26, projectileTtl: 0.75, spread: 0.22, pellets: 7, reloadTime: 1.55, rarity: 2,
    icon: '/assets/items/weapons/riot_shotgun.png', groundModel: '/assets/models/items/riot_shotgun.glb', groundTexture: '/assets/items/ground/riot_shotgun.png'
  },
  spark_smg: {
    id: 'spark_smg', name: 'Spark SMG', kind: 'gun', ammoType: 'light', magSize: 32,
    damage: 9, fireRate: 0.075, projectileSpeed: 30, projectileTtl: 0.95, spread: 0.075, pellets: 1, reloadTime: 1.4, rarity: 2,
    icon: '/assets/items/weapons/spark_smg.png', groundModel: '/assets/models/items/spark_smg.glb', groundTexture: '/assets/items/ground/spark_smg.png'
  },
  prism_laser: {
    id: 'prism_laser', name: 'Prism Laser', kind: 'gun', ammoType: 'energy', magSize: 18,
    damage: 24, fireRate: 0.24, projectileSpeed: 42, projectileTtl: 1.0, spread: 0.01, pellets: 1, reloadTime: 1.65, rarity: 3,
    icon: '/assets/items/weapons/prism_laser.png', groundModel: '/assets/models/items/prism_laser.glb', groundTexture: '/assets/items/ground/prism_laser.png'
  },
  iron_knife: {
    id: 'iron_knife', name: 'Iron Knife', kind: 'melee', damage: 30, fireRate: 0.34, range: 3.6, arc: Math.PI * 1.0, rarity: 1,
    icon: '/assets/items/weapons/iron_knife.png', groundModel: '/assets/models/items/iron_knife.glb', groundTexture: '/assets/items/ground/iron_knife.png'
  },
  knight_sword: {
    id: 'knight_sword', name: 'Knight Sword', kind: 'melee', damage: 46, fireRate: 0.56, range: 4.35, arc: Math.PI * 1.08, rarity: 2,
    icon: '/assets/items/weapons/knight_sword.png', groundModel: '/assets/models/items/knight_sword.glb', groundTexture: '/assets/items/ground/knight_sword.png'
  },
  toxic_sabre: {
    id: 'toxic_sabre', name: 'Toxic Sabre', kind: 'melee', damage: 38, fireRate: 0.48, range: 4.1, arc: Math.PI * 1.12, rarity: 3,
    debuff: { id: 'poison', name: 'Poison', chance: 0.55, duration: 4.2, dps: 6, damageType: 'poison' },
    icon: '/assets/items/weapons/toxic_sabre.png', groundModel: '/assets/models/items/toxic_sabre.glb', groundTexture: '/assets/items/ground/toxic_sabre.png'
  },
  ember_blade: {
    id: 'ember_blade', name: 'Ember Blade', kind: 'melee', damage: 42, fireRate: 0.52, range: 4.25, arc: Math.PI * 1.1, rarity: 3,
    debuff: { id: 'burn', name: 'Burn', chance: 0.48, duration: 3.2, dps: 9, damageType: 'fire' },
    icon: '/assets/items/weapons/ember_blade.png', groundModel: '/assets/models/items/ember_blade.glb', groundTexture: '/assets/items/ground/ember_blade.png'
  },
  thunder_cannon: {
    id: 'thunder_cannon', name: 'Thunder Cannon', kind: 'gun', ammoType: 'heavy', magSize: 4,
    damage: 60, fireRate: 0.9, projectileSpeed: 22, projectileTtl: 1.1, spread: 0.02, pellets: 1, splash: 2.6, reloadTime: 2.1, rarity: 4,
    debuff: { id: 'stagger', name: 'Stagger', chance: 0.35, duration: 1.1, slowMultiplier: 0.35, damageType: 'physical' },
    icon: '/assets/items/weapons/thunder_cannon.png', groundModel: '/assets/models/items/thunder_cannon.glb', groundTexture: '/assets/items/ground/thunder_cannon.png'
  }
};

const STARTER_WEAPONS = ['rusty_pistol', 'iron_knife'];
const WEAPON_POOL = Object.values(WEAPONS);

export function clampWeaponLevel(level = 1) {
  return Math.max(1, Math.min(MAX_WEAPON_LEVEL, Math.floor(Number(level) || 1)));
}

export function weaponDamageMultiplier(weapon) {
  const level = clampWeaponLevel(weapon?.level ?? 1);
  return 1 + (level - 1) * WEAPON_LEVEL_DAMAGE_STEP;
}

export function createWeapon(weaponId = 'rusty_pistol', level = 1) {
  const def = WEAPONS[weaponId] ?? WEAPONS.rusty_pistol;
  return {
    instanceId: randomId('wpn'),
    weaponId: def.id,
    level: clampWeaponLevel(level),
    magazine: def.kind === 'gun' ? def.magSize : null,
    cooldown: 0,
    reloadTimer: 0
  };
}

export function createStarterWeapons() {
  return STARTER_WEAPONS.map((id) => createWeapon(id, 1));
}

export function createMagazine(type, amount) {
  const safeType = AMMO_TYPES.includes(type) ? type : 'light';
  return { id: randomId('mag'), type: safeType, amount: Math.max(1, Math.floor(Number(amount) || 1)) };
}

export function createStarterMagazines() {
  return {
    light: [createMagazine('light', 120)],
    shell: [createMagazine('shell', 52)],
    energy: [createMagazine('energy', 80)],
    heavy: [createMagazine('heavy', 24)]
  };
}

export function getWeaponDef(weapon) {
  if (!weapon) return null;
  return WEAPONS[weapon.weaponId] ?? null;
}

export function randomWeapon({ minRarity = 1, maxRarity = 4, level = 1 } = {}) {
  const candidates = WEAPON_POOL.filter((weapon) => weapon.rarity >= minRarity && weapon.rarity <= maxRarity);
  const picked = candidates[Math.floor(Math.random() * candidates.length)]?.id ?? 'rusty_pistol';
  return createWeapon(picked, level);
}

export function randomMagazine(level = 1, forcedType = null) {
  const type = AMMO_TYPES.includes(forcedType) ? forcedType : AMMO_TYPES[Math.floor(Math.random() * AMMO_TYPES.length)];
  const base = { light: 34, shell: 11, energy: 20, heavy: 5 }[type] ?? 12;
  const amount = Math.max(1, Math.floor(base + Math.random() * base + level * 1.6));
  return createMagazine(type, amount);
}

export function serializeWeapon(weapon) {
  if (!weapon) return null;
  const def = getWeaponDef(weapon);
  return {
    instanceId: weapon.instanceId,
    weaponId: weapon.weaponId,
    level: clampWeaponLevel(weapon.level ?? 1),
    maxLevel: MAX_WEAPON_LEVEL,
    baseName: def?.name ?? weapon.weaponId,
    name: `${def?.name ?? weapon.weaponId} Lv.${clampWeaponLevel(weapon.level ?? 1)}`,
    kind: def?.kind ?? 'gun',
    ammoType: def?.ammoType ?? null,
    magazine: weapon.magazine,
    magSize: def?.magSize ?? null,
    cooldown: Number((weapon.cooldown ?? 0).toFixed(2)),
    reloadTimer: Number((weapon.reloadTimer ?? 0).toFixed(2)),
    debuff: def?.debuff ? { id: def.debuff.id, name: def.debuff.name, chance: def.debuff.chance } : null,
    icon: def?.icon ?? `/assets/items/weapons/${weapon.weaponId}.png`,
    groundModel: def?.groundModel ?? `/assets/models/items/${weapon.weaponId}.glb`,
    groundTexture: def?.groundTexture ?? `/assets/items/ground/${weapon.weaponId}.png`
  };
}
