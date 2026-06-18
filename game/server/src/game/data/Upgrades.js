import { randomId } from '../core/math.js';

export const UPGRADES = {
  damage: { id: 'damage', name: '+15% урон', description: 'Все атаки становятся сильнее.', stackable: true },
  max_hp: { id: 'max_hp', name: '+25 максимального HP', description: 'Увеличивает здоровье и слегка лечит.', stackable: true },
  defense: { id: 'defense', name: '+2 защита', description: 'Срезает входящий урон.', stackable: true },
  speed: { id: 'speed', name: '+8% скорость', description: 'Быстрее движение и удобнее уходить от атак.', stackable: true },
  spread: { id: 'spread', name: 'Двойной разброс', description: 'Оружие выпускает дополнительный снаряд с разбросом.', stackable: true },
  vampire: { id: 'vampire', name: 'Вампиризм', description: 'Убийства немного лечат игрока.', stackable: true },
  regen: { id: 'regen', name: 'Регенерация', description: 'Медленно восстанавливает HP вне зависимости от боя.', stackable: false },
  fire_resist: { id: 'fire_resist', name: 'Огнестойкость', description: '+20% сопротивления огню.', stackable: true },
  poison_resist: { id: 'poison_resist', name: 'Антитоксин', description: '+20% сопротивления яду.', stackable: true },
  arcane_resist: { id: 'arcane_resist', name: 'Магический барьер', description: '+20% сопротивления магии.', stackable: true },
  dash: { id: 'dash', name: 'Рывок', description: 'Добавляет способность рывка на Shift.', stackable: false },
  ammo_saver: { id: 'ammo_saver', name: 'Экономия патронов', description: 'Шанс не потратить патрон при выстреле.', stackable: true }
};

export function createUpgradeChoices(player) {
  const all = Object.values(UPGRADES).filter((upgrade) => upgrade.stackable || !player.upgrades.includes(upgrade.id));
  const choices = [];
  while (choices.length < 3 && all.length) {
    const index = Math.floor(Math.random() * all.length);
    choices.push({ choiceId: randomId('upg'), ...all.splice(index, 1)[0] });
  }
  return choices;
}

export function applyUpgrade(player, upgradeId) {
  if (!UPGRADES[upgradeId]) return false;
  const upgrade = UPGRADES[upgradeId];
  if (!upgrade.stackable && player.upgrades.includes(upgrade.id)) return false;

  player.upgrades.push(upgrade.id);
  player.upgradeStacks[upgrade.id] = (player.upgradeStacks[upgrade.id] ?? 0) + 1;

  switch (upgrade.id) {
    case 'damage': player.stats.damageMultiplier += 0.15; break;
    case 'max_hp': player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); break;
    case 'defense': player.stats.defense += 2; break;
    case 'speed': player.stats.speedMultiplier += 0.08; break;
    case 'spread': player.stats.extraBullets += 1; break;
    case 'vampire': player.stats.vampirism += 0.06; break;
    case 'regen': player.stats.regen += 1.2; break;
    case 'fire_resist': player.stats.resist.fire = Math.min(0.8, player.stats.resist.fire + 0.2); break;
    case 'poison_resist': player.stats.resist.poison = Math.min(0.8, player.stats.resist.poison + 0.2); break;
    case 'arcane_resist': player.stats.resist.arcane = Math.min(0.8, player.stats.resist.arcane + 0.2); break;
    case 'dash': player.ability = { id: 'dash', name: 'Рывок', cooldown: 0, maxCooldown: 4.5 }; break;
    case 'ammo_saver': player.stats.ammoSaveChance = Math.min(0.55, player.stats.ammoSaveChance + 0.12); break;
  }
  return true;
}
