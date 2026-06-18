import { distance2 } from './math.js';
import { getWeaponDef } from '../data/Weapons.js';

export function applyDamageToPlayer(player, rawAmount, damageType = 'physical') {
  const resist = player.stats?.resist?.[damageType] ?? 0;
  const defense = player.stats?.defense ?? 0;
  const amount = Math.max(1, Math.round(rawAmount * (1 - resist) - defense));
  player.hp = Math.max(0, player.hp - amount);
  if (player.hp <= 0) {
    player.alive = false;
    player.downed = true;
    player.spectator = true;
    player.reviveProgress = 0;
    player.reviveChannel = null;
  }
  return amount;
}

export function healPlayer(player, amount) {
  player.hp = Math.min(player.maxHp, player.hp + amount);
}

export function updatePlayerRegen(player, dt) {
  if (!player.alive) return;
  if ((player.stats?.regen ?? 0) > 0) healPlayer(player, player.stats.regen * dt);
}

export function activeWeapon(player) {
  return player.weapons[player.activeSlot] ?? null;
}

export function consumeShot(player, weapon) {
  const def = getWeaponDef(weapon);
  if (!def || def.kind !== 'gun') return true;
  if ((weapon.magazine ?? 0) <= 0) return false;
  if (Math.random() >= (player.stats.ammoSaveChance ?? 0)) weapon.magazine -= 1;
  return true;
}

export function canHitMelee(attacker, target, def) {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const dist = Math.hypot(dx, dz);
  if (dist > (def.range ?? 2)) return false;
  const angle = Math.atan2(dz, dx);
  let delta = Math.abs(angle - attacker.rot);
  while (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);
  return delta <= (def.arc ?? Math.PI * 0.6) * 0.5;
}

export function nearestDrop(player, drops, type = null, maxDistance = 2.4) {
  let best = null;
  let bestDist = maxDistance * maxDistance;
  for (const drop of drops) {
    if (type && drop.type !== type) continue;
    const d = distance2(player, drop);
    if (d <= bestDist) {
      best = drop;
      bestDist = d;
    }
  }
  return best;
}
