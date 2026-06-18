import { clamp, distance2, randomId, randomRange } from '../core/math.js';
import { activeWeapon, applyDamageToPlayer, canHitMelee, consumeShot, nearestDrop } from '../core/combat.js';
import { getWeaponDef, randomMagazine, randomWeapon, serializeWeapon, weaponDamageMultiplier } from '../data/Weapons.js';
import { createUpgradeChoices, applyUpgrade } from '../data/Upgrades.js';

const ARENA_SIZE = 42;
const ROUND_RESTART_DELAY = 3.2;

function removeById(list, id) {
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) return list.splice(index, 1)[0];
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

function weaponDamage(def, weapon, player) {
  return Math.round((def.damage ?? 1) * weaponDamageMultiplier(weapon) * (player?.stats?.damageMultiplier ?? 1));
}

export class PvPMode {
  constructor(match) {
    this.match = match;
    this.id = 'pvp';
    this.projectiles = [];
    this.crates = [];
    this.drops = [];
    this.finished = false;
    this.round = 1;
    this.roundTimer = 0;
    this.stats = new Map();
  }

  async start() {
    for (const player of this.match.players.values()) {
      player.roundWins = 0;
      player.kills = 0;
      player.score = 0;
      player.pendingUpgrades = [];
      this.stats.set(player.id, { username: player.username, wins: 0, kills: 0, deaths: 0 });
    }
    this.startRound();
    await this.match.hooks.emit('match:start', { mode: 'pvp', match: this.match });
  }

  startRound() {
    const spawns = [
      { x: -15, z: -15 }, { x: 15, z: -15 }, { x: -15, z: 15 }, { x: 15, z: 15 },
      { x: 0, z: -17 }, { x: 0, z: 17 }, { x: -17, z: 0 }, { x: 17, z: 0 }
    ];
    [...this.match.players.values()].forEach((player, index) => {
      const spawn = spawns[index % spawns.length];
      Object.assign(player, { x: spawn.x, y: 0, z: spawn.z, hp: player.maxHp, alive: true, downed: false, spectator: false, reviveProgress: 0, reviveChannel: null, swingTimer: 0 });
      player.input = { up: false, down: false, left: false, right: false, shoot: false, angle: 0 };
      player.pendingUpgrades = [];
      for (const weapon of player.weapons) {
        const def = getWeaponDef(weapon);
        if (weapon && def?.kind === 'gun') weapon.magazine = def.magSize;
      }
    });
    this.projectiles = [];
    this.drops = [];
    this.crates = [];
    for (let i = 0; i < 7; i++) {
      const roll = Math.random();
      const kind = roll < 0.18 ? 'weapon' : roll < 0.38 ? 'ability' : 'ammo';
      this.crates.push({ id: randomId('pvpcrate'), kind, x: randomRange(-16, 16), z: randomRange(-16, 16), opened: false });
    }
  }

  async update(dt) {
    if (this.finished) return;
    if (this.roundTimer > 0) {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) this.startRound();
      return;
    }

    this.updatePlayers(dt);
    this.updateWeapons(dt);
    await this.updateProjectiles(dt);

    const alive = [...this.match.players.values()].filter((p) => p.alive);
    if (alive.length <= 1 && this.match.players.size > 1) {
      const winner = alive[0] ?? null;
      this.finishRound(winner);
    }
  }

  finishRound(winner) {
    if (winner) {
      winner.roundWins += 1;
      winner.score += 100 + winner.kills * 10;
      const stat = this.stats.get(winner.id);
      if (stat) stat.wins += 1;
    }
    for (const player of this.match.players.values()) if (!player.alive) this.stats.get(player.id).deaths += 1;

    const targetWins = Number(this.match.settings.pvpTargetWins ?? 5);
    if (winner && winner.roundWins >= targetWins) {
      this.finished = true;
      this.match.finish({ winnerId: winner.id, reason: 'pvp-target-wins', targetWins, stats: [...this.stats.values()] });
      return;
    }

    for (const player of this.match.players.values()) {
      if (!player.alive) continue;
      player.pendingUpgrades = createUpgradeChoices(player);
    }
    this.round += 1;
    this.roundTimer = ROUND_RESTART_DELAY;
    this.match.emit('pvp:round-finished', { winnerId: winner?.id ?? null, round: this.round - 1, targetWins, stats: [...this.stats.values()] });
  }

  updatePlayers(dt) {
    const limit = ARENA_SIZE / 2 - 1;
    for (const player of this.match.players.values()) {
      player.swingTimer = Math.max(0, (player.swingTimer ?? 0) - dt);
      if (!player.alive) continue;
      if (player.ability) player.ability.cooldown = Math.max(0, player.ability.cooldown - dt);
      const input = player.input;
      const dx = Number(input.right) - Number(input.left);
      const dz = Number(input.down) - Number(input.up);
      const length = Math.hypot(dx, dz) || 1;
      const speed = 8 * (player.stats.speedMultiplier ?? 1);
      player.x = clamp(player.x + (dx / length) * speed * dt, -limit, limit);
      player.z = clamp(player.z + (dz / length) * speed * dt, -limit, limit);
      player.rot = input.angle ?? player.rot;
      if (input.shoot) this.tryAttack(player);
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

  tryAttack(player) {
    const weapon = activeWeapon(player);
    const def = getWeaponDef(weapon);
    if (!weapon || !def || weapon.cooldown > 0 || weapon.reloadTimer > 0) return;
    weapon.cooldown = def.fireRate;

    if (def.kind === 'melee') {
      player.swingTimer = 0.22;
      for (const target of this.match.players.values()) {
        if (!target.alive || target.id === player.id) continue;
        if (canHitMelee(player, target, def)) this.damagePlayer(target, weaponDamage(def, weapon, player), player.id, def.debuff?.damageType ?? 'physical');
      }
      return;
    }

    if (!consumeShot(player, weapon)) return;
    const bullets = Math.max(1, (def.pellets ?? 1) + (player.stats.extraBullets ?? 0));
    for (let i = 0; i < bullets; i++) {
      const centered = i - (bullets - 1) / 2;
      const angle = player.rot + centered * (def.spread ?? 0) + randomRange(-(def.spread ?? 0), def.spread ?? 0) * 0.25;
      this.projectiles.push({ id: randomId('shot'), ownerId: player.id, x: player.x, z: player.z, vx: Math.cos(angle) * def.projectileSpeed, vz: Math.sin(angle) * def.projectileSpeed, ttl: def.projectileTtl, damage: weaponDamage(def, weapon, player), damageType: def.debuff?.damageType ?? (def.ammoType === 'energy' ? 'energy' : 'physical') });
    }
  }

  async updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.z += projectile.vz * dt;
      projectile.ttl -= dt;
      for (const target of this.match.players.values()) {
        if (!target.alive || target.id === projectile.ownerId) continue;
        if (distance2(projectile, target) <= 1.4) {
          projectile.ttl = 0;
          this.damagePlayer(target, projectile.damage, projectile.ownerId, projectile.damageType);
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.ttl > 0 && Math.abs(p.x) < ARENA_SIZE / 2 + 5 && Math.abs(p.z) < ARENA_SIZE / 2 + 5);
  }

  damagePlayer(target, amount, attackerId, damageType) {
    applyDamageToPlayer(target, amount, damageType);
    if (target.alive) return;
    const attacker = this.match.players.get(String(attackerId));
    if (attacker) {
      attacker.kills += 1;
      attacker.score += 25;
      const stat = this.stats.get(attacker.id);
      if (stat) stat.kills += 1;
    }
  }

  handleAction(player, action) {
    const type = String(action?.type ?? '');
    if (type === 'switch-slot') {
      player.activeSlot = clamp(Math.round(Number(action.slot)), 0, 2);
      return true;
    }
    if (type === 'reload') return this.reload(player);
    if (type === 'pickup') return this.pickup(player);
    if (type === 'drop-weapon') return this.dropWeapon(player);
    if (type === 'drop-magazine') return this.dropMagazine(player, action.ammoType);
    if (type === 'ability') return this.useAbility(player);
    return false;
  }

  chooseUpgrade(player, choiceId) {
    const choice = player.pendingUpgrades.find((candidate) => candidate.choiceId === choiceId || candidate.id === choiceId);
    if (!choice) return false;
    const ok = applyUpgrade(player, choice.id);
    if (ok) player.pendingUpgrades = [];
    return ok;
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
    const crate = this.crates.find((candidate) => !candidate.opened && distance2(player, candidate) <= 5.5);
    if (crate) {
      crate.opened = true;
      if (crate.kind === 'ability') player.pendingUpgrades = createUpgradeChoices(player);
      else if (crate.kind === 'ammo') this.drops.push({ id: randomId('magdrop'), type: 'magazine', magazine: randomMagazine(2), x: crate.x, z: crate.z });
      else this.drops.push({ id: randomId('weaponDrop'), type: 'weapon', weapon: randomWeapon({ minRarity: 1, maxRarity: 4, level: 1 + Math.floor(Math.random() * 3) }), x: crate.x, z: crate.z });
      return true;
    }
    const drop = nearestDrop(player, this.drops, null, 2.7);
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
    this.drops.push({ id: randomId('magdrop'), type: 'magazine', magazine: mag, x: player.x + Math.cos(player.rot) * 1.4, z: player.z + Math.sin(player.rot) * 1.4 });
    return true;
  }

  useAbility(player) {
    if (!player.ability || player.ability.cooldown > 0) return false;
    if (player.ability.id === 'dash') {
      player.x = clamp(player.x + Math.cos(player.rot) * 5.5, -ARENA_SIZE / 2 + 1, ARENA_SIZE / 2 - 1);
      player.z = clamp(player.z + Math.sin(player.rot) * 5.5, -ARENA_SIZE / 2 + 1, ARENA_SIZE / 2 - 1);
      player.ability.cooldown = player.ability.maxCooldown;
      return true;
    }
    return false;
  }

  getState() {
    return {
      type: 'pvp',
      arena: { size: ARENA_SIZE },
      round: this.round,
      targetWins: Number(this.match.settings.pvpTargetWins ?? 5),
      roundTimer: Number(Math.max(0, this.roundTimer).toFixed(2)),
      projectiles: this.projectiles,
      crates: this.crates,
      drops: this.drops.map((drop) => ({ ...drop, weapon: serializeWeapon(drop.weapon) })),
      stats: [...this.stats.values()]
    };
  }
}
