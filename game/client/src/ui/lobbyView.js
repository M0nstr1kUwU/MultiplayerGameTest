import { authApi, leaderboardApi } from '../net/api.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function modeTitle(mode) {
  return mode === 'pvp' ? 'PvP' : 'PvE';
}

function statusTitle(status) {
  if (status === 'lobby') return 'ожидание';
  if (status === 'playing') return 'идёт матч';
  if (status === 'finished') return 'завершение';
  return status;
}

function loadLocalStyle() {
  try {
    const style = JSON.parse(localStorage.getItem('msk3d-style') ?? '{}');
    return /^#[0-9a-fA-F]{6}$/.test(style.color) ? style : { color: '#6d7cff' };
  } catch {
    return { color: '#6d7cff' };
  }
}

function saveLocalStyle(style) {
  localStorage.setItem('msk3d-style', JSON.stringify(style));
}


function loadMinimapSettings() {
  try {
    const value = JSON.parse(localStorage.getItem('msk3d-minimap') ?? '{}');
    return { x: Number.isFinite(Number(value.x)) ? Number(value.x) : 16, y: Number.isFinite(Number(value.y)) ? Number(value.y) : 16 };
  } catch {
    return { x: 16, y: 16 };
  }
}

function roomColor(kind) {
  if (kind === 'boss') return '#d94f70';
  if (kind === 'shop') return '#59e08b';
  if (kind === 'crate') return '#ffdc73';
  if (kind === 'elite') return '#9f7cff';
  if (kind === 'start') return '#6d7cff';
  return '#8fd8ff';
}
function weaponLine(weapon, index, active) {
  if (!weapon) return `<div class="slot ${active ? 'active' : ''}">${index + 1}. пусто</div>`;
  const icon = weapon.icon ? `<img class="slot-icon" src="${escapeHtml(weapon.icon)}" alt="">` : '';
  const ammo = weapon.kind === 'gun' ? ` · ${weapon.magazine}/${weapon.magSize} ${weapon.ammoType}` : ' · ближний бой';
  const reload = weapon.reloadTimer > 0 ? ` · reload ${weapon.reloadTimer.toFixed(1)}с` : '';
  return `<div class="slot ${active ? 'active' : ''}">${icon}<span>${index + 1}. ${escapeHtml(weapon.name)}${ammo}${reload}</span></div>`;
}

export function createLobbyView(root, socket, me, options = {}) {
  const panel = document.createElement('div');
  panel.className = 'hud';
  root.append(panel);

  let currentLobby = null;
  let lobbyList = [];
  let latestWorld = null;
  let message = '';
  let leaderboardRows = [];
  let scoreboardOpen = false;
  let style = loadLocalStyle();
  let menuTab = 'lobbies';
  let minimapSettings = loadMinimapSettings();

  const minimapListener = (event) => {
    minimapSettings = event.detail ?? loadMinimapSettings();
    render();
  };
  window.addEventListener('minimap:settings', minimapListener);

  const ackHandler = (response) => {
    if (!response?.ok) message = response?.message ?? 'Действие недоступно';
    else message = '';
    render();
  };

  panel.addEventListener('pointerdown', (event) => {
    const upgradeButton = event.target.closest?.('.upgrade-choice');
    if (!upgradeButton) return;
    event.preventDefault();
    const choiceId = upgradeButton.dataset.choiceId;
    if (!choiceId || upgradeButton.disabled) return;
    upgradeButton.disabled = true;
    socket.emit('upgrade:choose', { choiceId }, ackHandler);
  });

  socket.on('lobbies:update', (lobbies) => {
    lobbyList = Array.isArray(lobbies) ? lobbies : [];
    render();
  });

  socket.on('lobby:state', (lobby) => {
    currentLobby = lobby;
    render();
  });

  socket.on('lobby:kicked', () => {
    currentLobby = null;
    latestWorld = null;
    message = 'Лидер исключил тебя из лобби.';
    render();
  });

  socket.on('match:started', (lobby) => {
    currentLobby = lobby;
    message = '';
    render();
  });

  socket.on('match:finished', ({ result, lobby }) => {
    if (lobby) currentLobby = lobby;
    if (result?.reason === 'pvp-target-wins') message = 'PvP матч завершён. Открыта статистика игроков.';
    else if (result?.reason === 'party-defeated') message = 'Команда погибла. Матч завершён.';
    else message = 'Матч завершён.';
    loadLeaderboard();
    render();
  });

  socket.on('pvp:round-finished', ({ winnerId, round }) => {
    const name = latestWorld?.players?.find((p) => p.id === winnerId)?.username ?? 'никто';
    message = `Раунд ${round} завершён. Победитель: ${name}.`;
    render();
  });

  async function loadLeaderboard() {
    try {
      const data = await leaderboardApi.get();
      leaderboardRows = data.rows ?? [];
      render();
    } catch {
      leaderboardRows = [];
    }
  }

  function render() {
    const status = currentLobby?.status;
    if (!currentLobby) return renderMenu();
    if (status === 'lobby') return renderLobbyOnly();
    return renderGameHud();
  }

  function renderMenu() {
    panel.innerHTML = `
      <div class="panel side-left">
        <div class="panel-header">
          <div><h3>Меню игрока</h3><div class="muted">Ты: ${escapeHtml(me.username)}</div></div>
          <button id="logout" class="secondary small">Выйти</button>
        </div>
        <div class="menu-tabs"><button id="tab-lobbies" class="secondary small ${menuTab === 'lobbies' ? 'active' : ''}">Лобби</button><button id="tab-guide" class="secondary small ${menuTab === 'guide' ? 'active' : ''}">Руководство</button></div>
        ${menuTab === 'lobbies' ? `
        <div class="section stack">
          <h4>Стиль персонажа</h4>
          <label>Цвет игрока</label>
          <input id="player-color" type="color" value="${escapeHtml(style.color)}">
        </div>
        <div class="section stack">
          <h4>Создать лобби</h4>
          <select id="create-mode">
            <option value="pve">PvE: комнаты, снабжение, босс</option>
            <option value="pvp">PvP: арена до побед</option>
          </select>
          <button id="create">Создать лобби</button>
        </div>
        <div class="section stack">
          <h4>Войти по коду</h4>
          <div class="join-code-row"><input id="join-code" placeholder="ABCD-1234" maxlength="9"><button id="join-code-btn" class="secondary">Войти</button></div>
        </div>
        <div class="error">${escapeHtml(message)}</div>
        ` : renderGuide()}
      </div>
      ${menuTab === 'lobbies' ? `
      <div class="panel side-right">
        <div class="panel-header compact"><h3>Список лобби</h3><button id="refresh" class="secondary small">Обновить</button></div>
        <div class="lobbies">${renderLobbyCards()}</div><div class="section"><h4>Глобальный PvE топ-10</h4><div class="players">${renderLeaderboard()}</div></div>
      </div>` : ''}
    `;
    panel.querySelector('#logout')?.addEventListener('click', async () => {
      await authApi.logout().catch(() => null);
      options.onLogout?.();
    });
    panel.querySelector('#tab-lobbies')?.addEventListener('click', () => { menuTab = 'lobbies'; render(); });
    panel.querySelector('#tab-guide')?.addEventListener('click', () => { menuTab = 'guide'; render(); });
    panel.querySelector('#player-color')?.addEventListener('input', (event) => {
      style = { color: event.target.value };
      saveLocalStyle(style);
      socket.emit('player:set-style', style, () => null);
    });
    panel.querySelector('#create')?.addEventListener('click', () => socket.emit('lobby:create', { mode: panel.querySelector('#create-mode').value, ...style }, ackHandler));
    panel.querySelector('#join-code')?.addEventListener('input', (event) => {
      const clean = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      event.target.value = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
    });
    panel.querySelector('#join-code-btn')?.addEventListener('click', () => {
      const lobbyId = panel.querySelector('#join-code')?.value ?? '';
      socket.emit('lobby:join', { lobbyId, ...style }, ackHandler);
    });
    panel.querySelector('#refresh')?.addEventListener('click', () => socket.emit('lobby:list', (response) => {
      if (response?.ok) lobbyList = response.lobbies ?? [];
      ackHandler(response);
    }));
    attachJoinHandlers();
  }

  function renderLobbyOnly() {
    const isLeader = currentLobby.leaderId === String(me.id);
    const canEdit = isLeader && currentLobby.status === 'lobby';
    panel.innerHTML = `
      <div class="panel lobby-center">
        <div class="panel-header">
          <div><h3>Лобби</h3><div class="lobby-code">${escapeHtml(currentLobby.id)}</div><div class="muted">${modeTitle(currentLobby.mode)} · ${statusTitle(currentLobby.status)}</div></div>
          <button id="leave" class="secondary small">Покинуть</button>
        </div>
        <div class="section players">${renderPlayerRows(currentLobby.players, isLeader)}</div>
        <div class="section stack">
          <h4>Режим выбран при создании: ${modeTitle(currentLobby.mode)}</h4>
          ${currentLobby.mode === 'pve' ? renderPveLobbySettings(canEdit) : renderPvpLobbySettings(canEdit)}
          <button id="start" ${canEdit ? '' : 'disabled'}>${currentLobby.mode === 'pvp' && currentLobby.players.length < 2 ? 'Нужно минимум 2 игрока' : 'Старт'}</button>
        </div>
        <div class="error">${escapeHtml(message)}</div>
      </div>
      ${scoreboardOpen ? renderScoreboard() : ''}
    `;
    panel.querySelector('#leave')?.addEventListener('click', () => socket.emit('lobby:leave', (response) => {
      if (response?.ok) currentLobby = null;
      ackHandler(response);
    }));
    const sendSettings = () => socket.emit('lobby:set-settings', currentLobby.mode === 'pve'
      ? { pveRooms: Number(panel.querySelector('#pve-rooms')?.value ?? currentLobby.settings?.pveRooms ?? 8) }
      : { pvpTargetWins: Number(panel.querySelector('#pvp-wins')?.value ?? currentLobby.settings?.pvpTargetWins ?? 5) }, ackHandler);
    panel.querySelector('#pve-rooms')?.addEventListener('input', (e) => { panel.querySelector('#rooms-value').textContent = e.target.value; });
    panel.querySelector('#pve-rooms')?.addEventListener('change', sendSettings);
    panel.querySelector('#pvp-wins')?.addEventListener('input', (e) => { panel.querySelector('#wins-value').textContent = e.target.value; });
    panel.querySelector('#pvp-wins')?.addEventListener('change', sendSettings);
    panel.querySelector('#start')?.addEventListener('click', () => socket.emit('match:start', ackHandler));
    attachKickHandlers();
  }

  function renderPveLobbySettings(canEdit) {
    return `
      <label>PvE комнат: <b id="rooms-value">${currentLobby.settings?.pveRooms ?? 8}</b></label>
      <input id="pve-rooms" type="range" min="5" max="30" value="${currentLobby.settings?.pveRooms ?? 8}" ${canEdit ? '' : 'disabled'}>
    `;
  }

  function renderPvpLobbySettings(canEdit) {
    return `
      <label>PvP побед до: <b id="wins-value">${currentLobby.settings?.pvpTargetWins ?? 5}</b></label>
      <input id="pvp-wins" type="range" min="1" max="10" value="${currentLobby.settings?.pvpTargetWins ?? 5}" ${canEdit ? '' : 'disabled'}>
    `;
  }

  function renderGameHud() {
    const myId = String(me.id);
    const player = latestWorld?.players?.find((p) => p.id === myId);
    const mode = latestWorld?.mode ?? {};
    panel.innerHTML = `
      <div class="game-top">
        <div class="chip">${modeTitle(currentLobby.mode)}</div>
        ${mode.type === 'pve' ? `<div class="chip">Уровень ${mode.level ?? 1}</div><div class="chip">Комната ${(mode.roomIndex ?? 0) + 1}/${mode.rooms?.length ?? currentLobby.settings?.pveRooms ?? '?'}</div><div class="chip">${escapeHtml(mode.currentRoom?.name ?? '')}</div>${renderPortalChip(mode.portal)}` : `<div class="chip">Раунд ${mode.round ?? 1}</div><div class="chip">Побед до ${mode.targetWins ?? 5}</div>`}
      </div>
      <div class="game-bottom">${player ? renderPlayerHud(player) : ''}</div>
      ${mode.type === 'pve' ? renderMinimap(mode) : ''}
      ${player?.pendingUpgrades?.length ? renderUpgradeOverlay(player.pendingUpgrades) : ''}
      ${scoreboardOpen ? renderScoreboard() : ''}
      ${message ? `<div class="toast">${escapeHtml(message)}</div>` : ''}
    `;
    attachKickHandlers();
  }

  function renderMinimap(mode) {
    const rooms = Array.isArray(mode.rooms) ? mode.rooms : [];
    if (!rooms.length) return '';
    const size = 22;
    const minX = Math.min(...rooms.map((room) => room.grid?.x ?? 0));
    const minY = Math.min(...rooms.map((room) => room.grid?.y ?? 0));
    const pos = (room) => ({ x: ((room.grid?.x ?? 0) - minX) * size, y: ((room.grid?.y ?? 0) - minY) * size });
    const links = [];
    for (const room of rooms) {
      const from = pos(room);
      for (const targetIndex of Object.values(room.neighbors ?? {})) {
        const target = rooms.find((candidate) => candidate.index === targetIndex);
        if (!target || target.index < room.index) continue;
        const to = pos(target);
        const x1 = from.x + 6.5;
        const y1 = from.y + 6.5;
        const x2 = to.x + 6.5;
        const y2 = to.y + 6.5;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.max(4, Math.abs(x2 - x1) || 4);
        const height = Math.max(4, Math.abs(y2 - y1) || 4);
        const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
        links.push(`<span class="mini-bridge${room.visited && target.visited ? ' known' : ''}" style="left:${left}px;top:${top}px;width:${horizontal ? width : 4}px;height:${horizontal ? 4 : height}px"></span>`);
      }
    }
    const items = rooms.map((room) => {
      const { x, y } = pos(room);
      const current = room.index === mode.roomIndex;
      const color = room.visited ? roomColor(room.kind) : '#4a5069';
      const lock = room.locked ? ' locked' : '';
      return `<span class="mini-room${current ? ' current' : ''}${lock}" style="left:${x}px;top:${y}px;background:${color}"></span>`;
    }).join('');
    return `<div class="minimap" style="right:${Number(minimapSettings.x ?? 16)}px;top:${Number(minimapSettings.y ?? 16)}px">${links.join('')}${items}</div>`;
  }

  function renderPortalChip(portal) {
    if (!portal?.active) return '';
    const votes = portal.votes?.length ?? 0;
    const required = portal.required?.length ?? '?';
    const timer = portal.countdown != null ? ` · переход через ${Math.ceil(portal.countdown)}с` : '';
    return `<div class="chip portal-chip">Портал: ${votes}/${required}${timer}</div>`;
  }

  function renderPlayerHud(player) {
    const hpPct = Math.max(0, Math.min(100, (player.hp / Math.max(1, player.maxHp)) * 100));
    const reviveLine = player.downed ? 'Ты пал' : `Ресалки: ${player.revives ?? 0}`;
    return `
      <div class="player-hud">
        <div class="hp-big"><span style="width:${hpPct}%"></span></div>
        <div class="row"><b>${player.hp}/${player.maxHp} HP</b><span>${player.ability ? `${escapeHtml(player.ability.name)}: ${player.ability.cooldown.toFixed(1)}с` : 'Способности нет'}</span></div>
        <div class="weapon-slots">${player.weapons.map((weapon, index) => weaponLine(weapon, index, index === player.activeSlot)).join('')}</div>
        <div class="ammo-line">Патроны: light ${player.magazines.light ?? 0} · shell ${player.magazines.shell ?? 0} · energy ${player.magazines.energy ?? 0} · heavy ${player.magazines.heavy ?? 0}</div>
        <div class="hud-note">${escapeHtml(reviveLine)}</div>
      </div>
    `;
  }

  function renderUpgradeOverlay(choices) {
    return `
      <div class="upgrade-overlay">
        <div class="upgrade-card">
          <h3>Выбери прокачку</h3>
          <div class="upgrade-grid">
            ${choices.map((choice) => `<button class="upgrade-choice" data-choice-id="${escapeHtml(choice.choiceId)}"><b>${escapeHtml(choice.name)}</b><span>${escapeHtml(choice.description)}</span></button>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderGuide() {
    return `
      <div class="section stack guide-panel">
        <h4>Руководство</h4>
        <div class="guide-block"><b>Основное</b><span>WASD — движение, мышь — направление взгляда, ЛКМ/Space — атака, R — перезарядка, E — подобрать предмет, открыть ящик, войти в дверь или проголосовать у портала.</span></div>
        <div class="guide-block"><b>Оружие и патроны</b><span>1–3 выбирают слот оружия. R дозаряжает магазин из запаса без выбрасывания обоймы. G выбрасывает текущее оружие. Чтобы поделиться патронами, зажми Q и нажми 1/light, 2/shell, 3/energy или 4/heavy.</span></div>
        <div class="guide-block"><b>PvE</b><span>Команда зачищает комнаты, посещает комнату снабжения/оружейные, открывает босс-комнату и голосует у портала после победы над боссом. После голосования каждый выбирает одну прокачку.</span></div>
        <div class="guide-block"><b>Воскрешение</b><span>У каждого есть 1 ресалка. Подойди к павшему союзнику и удерживай F 5 секунд. Дополнительные ресалки иногда падают с босса.</span></div>
        <div class="guide-block"><b>Меню</b><span>Tab показывает список игроков. У лидера в этом списке есть кик. Esc открывает настройки и переназначение клавиш.</span></div>
      </div>
    `;
  }

  function renderLeaderboard() {
    return leaderboardRows.length
      ? leaderboardRows.slice(0, 10).map((r, i) => `<div class="player-line"><span>${i + 1}. ${escapeHtml(r.username)}</span><span>${r.score} очк. · ${r.wins} уровней</span></div>`).join('')
      : '<div class="muted">Пока пусто</div>';
  }

  function renderLobbyCards() {
    return lobbyList.length ? lobbyList.map((lobby) => {
      const disabled = lobby.canJoin ? '' : 'disabled';
      return `<div class="lobby-card"><div><b>${escapeHtml(lobby.id)}</b><div class="muted">${modeTitle(lobby.mode)} · ${statusTitle(lobby.status)} · ${lobby.playersCount}/${lobby.maxPlayers}</div><div class="muted">Лидер: ${escapeHtml(lobby.leaderName)}</div></div><button class="secondary join-lobby" data-lobby-id="${escapeHtml(lobby.id)}" ${disabled}>${lobby.canJoin ? 'Войти' : 'Закрыто'}</button></div>`;
    }).join('') : '<div class="muted">Открытых лобби нет. Создай первое.</div>';
  }

  function renderPlayerRows(players, canKick) {
    return players.map((p) => `<div class="player-line"><span><span class="color-dot" style="background:${escapeHtml(p.color ?? '#6d7cff')}"></span>${p.isLeader ? '👑 ' : ''}${escapeHtml(p.username)}${p.downed ? ' · пал' : ''}</span><span>${p.hp}/${p.maxHp} HP · ${p.revives ?? 0} рес.</span>${canKick && p.id !== String(me.id) ? `<button class="danger small kick-player" data-target-id="${escapeHtml(p.id)}">Кик</button>` : ''}</div>`).join('');
  }

  function renderScoreboard() {
    const players = latestWorld?.players ?? currentLobby?.players ?? [];
    const isLeader = currentLobby?.leaderId === String(me.id);
    return `
      <div class="scoreboard">
        <h3>Игроки</h3>
        <div class="players">${renderPlayerRows(players, isLeader)}</div>
      </div>
    `;
  }

  function attachJoinHandlers() {
    panel.querySelectorAll('.join-lobby').forEach((button) => button.addEventListener('click', () => socket.emit('lobby:join', { lobbyId: button.dataset.lobbyId, ...style }, ackHandler)));
  }

  function attachKickHandlers() {
    panel.querySelectorAll('.kick-player').forEach((button) => button.addEventListener('click', () => socket.emit('lobby:kick', { targetId: button.dataset.targetId }, ackHandler)));
  }

  socket.emit('lobby:list', (response) => {
    if (response?.ok) lobbyList = response.lobbies ?? [];
    render();
  });
  loadLeaderboard();

  return {
    setWorldState(state) {
      latestWorld = state;
      currentLobby = state?.lobby ?? currentLobby;
      render();
    },
    setScoreboardOpen(value) {
      scoreboardOpen = Boolean(value);
      render();
    },
    destroy: () => { window.removeEventListener('minimap:settings', minimapListener); panel.remove(); }
  };
}
