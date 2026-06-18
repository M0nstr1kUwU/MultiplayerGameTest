import './styles.css';
import { renderAuth } from './ui/authView.js';
import { createLobbyView } from './ui/lobbyView.js';
import { authApi } from './net/api.js';
import { createGameSocket } from './net/socket.js';
import { Renderer3D } from './game/Renderer3D.js';
import { createInput } from './game/input.js';

const root = document.querySelector('#app');
let socket = null;
let renderer = null;
let lobbyView = null;
let input = null;
let inputTimer = null;
let me = null;
let canSendInput = false;
let settingsOpen = false;
let settingsEl = null;

function stopSession() {
  canSendInput = false;
  if (inputTimer) clearInterval(inputTimer);
  inputTimer = null;
  lobbyView?.destroy?.();
  lobbyView = null;
  socket?.disconnect?.();
  socket = null;
  input?.destroy?.();
  input = null;
  renderer?.destroy?.();
  renderer = null;
  settingsEl?.remove?.();
  settingsEl = null;
  me = null;
}

function showAuth() {
  stopSession();
  renderAuth(root, (authData) => startGameSession(authData.user));
}

function setSettingsOpen(value) {
  settingsOpen = Boolean(value);
  input?.setBlocked(settingsOpen);
  if (!settingsOpen) {
    settingsEl?.remove?.();
    settingsEl = null;
    return;
  }
  renderSettings();
}

function toggleSettings() {
  setSettingsOpen(!settingsOpen);
}

function renderSettings() {
  settingsEl?.remove?.();
  settingsEl = document.createElement('div');
  settingsEl.className = 'modal-backdrop';
  const bindings = input?.bindings ?? {};
  const rows = [
    ['up', 'Вверх'], ['down', 'Вниз'], ['left', 'Влево'], ['right', 'Вправо'], ['shoot', 'Стрельба'],
    ['reload', 'Перезарядка'], ['pickup', 'Подобрать/открыть/портал'], ['revive', 'Воскрешение'], ['dropWeapon', 'Выкинуть оружие'], ['ammoDropModifier', 'Модификатор выброса патронов'], ['ability', 'Способность'], ['scoreboard', 'Список игроков'], ['slot1', 'Слот 1 / light'], ['slot2', 'Слот 2 / shell'], ['slot3', 'Слот 3 / energy']
  ];
  settingsEl.innerHTML = `
    <div class="modal">
      <div class="panel-header"><h3>Настройки</h3><button id="resume" class="secondary small">Продолжить</button></div>
      <div class="binds">
        ${rows.map(([key, title]) => `<div class="bind-row"><span>${title}</span><button class="secondary small bind" data-action="${key}">${bindings[key] ?? '—'}</button></div>`).join('')}
      </div>
      <div class="section stack"><h4>Мини-карта</h4><div class="row"><input id="minimap-x" type="number" min="0" max="800" value="${JSON.parse(localStorage.getItem('msk3d-minimap') ?? '{\"x\":16,\"y\":16}').x ?? 16}"><input id="minimap-y" type="number" min="0" max="800" value="${JSON.parse(localStorage.getItem('msk3d-minimap') ?? '{\"x\":16,\"y\":16}').y ?? 16}"></div></div><div class="row"><button id="reset" class="secondary">Сбросить управление</button><button id="leave-game" class="danger">Выйти из игры</button></div>
    </div>
  `;
  root.append(settingsEl);
  settingsEl.querySelector('#resume')?.addEventListener('click', () => setSettingsOpen(false));
  settingsEl.querySelector('#reset')?.addEventListener('click', () => { input?.resetBindings(); renderSettings(); });
  const saveMinimap = () => {
    const next = { x: Number(settingsEl.querySelector('#minimap-x')?.value ?? 16), y: Number(settingsEl.querySelector('#minimap-y')?.value ?? 16) };
    localStorage.setItem('msk3d-minimap', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('minimap:settings', { detail: next }));
  };
  settingsEl.querySelector('#minimap-x')?.addEventListener('input', saveMinimap);
  settingsEl.querySelector('#minimap-y')?.addEventListener('input', saveMinimap);
  settingsEl.querySelector('#leave-game')?.addEventListener('click', () => {
    socket?.emit('lobby:leave', () => {
      canSendInput = false;
      renderer?.setVisible(false);
      renderer?.clearWorld?.();
      lobbyView?.leaveLocal?.();
      setSettingsOpen(false);
    });
  });
  settingsEl.querySelectorAll('.bind').forEach((button) => {
    button.addEventListener('click', () => {
      button.textContent = '...';
      const action = button.dataset.action;
      const listener = (event) => {
        event.preventDefault();
        if (event.code === 'Escape') return;
        input?.updateBinding(action, event.code);
        window.removeEventListener('keydown', listener, true);
        renderSettings();
      };
      window.addEventListener('keydown', listener, true);
    });
  });
}

function startGameSession(user) {
  stopSession();
  root.innerHTML = '';
  me = user;

  renderer = new Renderer3D(root);
  renderer.setVisible(false);
  socket = createGameSocket();
  input = createInput({
    onEscape: toggleSettings,
    onAction(action) {
      if (!canSendInput || !socket?.connected || settingsOpen) return;
      socket.emit('player:action', action);
    },
    onScoreboard(open) {
      lobbyView?.setScoreboardOpen?.(open);
    }
  });
  lobbyView = createLobbyView(root, socket, me, {
    async onLogout() {
      await authApi.logout().catch(() => null);
      showAuth();
    }
  });

  socket.on('me', (serverMe) => { me = serverMe; });
  socket.on('connect_error', () => showAuth());
  socket.on('disconnect', () => { canSendInput = false; });
  socket.on('match:started', () => { canSendInput = true; });
  socket.on('match:finished', () => { canSendInput = false; renderer?.setVisible(false); });

  socket.on('world:state', (state) => {
    const playing = state?.lobby?.status === 'playing';
    canSendInput = playing && !settingsOpen;
    renderer.setVisible(playing);
    if (playing) renderer.setWorldState(state, me.id);
    else renderer.clearWorld?.();
    lobbyView?.setWorldState(state);
  });

  inputTimer = setInterval(() => {
    if (!canSendInput || !socket?.connected || settingsOpen) return;
    const state = renderer.latestState;
    const local = state?.players?.find((p) => p.id === String(me.id));
    if (!local?.alive) return;
    const angle = renderer.getAimAngle(local);
    socket.emit('player:input', input.snapshot(angle));
  }, 1000 / 30);
}

async function bootstrap() {
  try {
    const data = await authApi.me();
    startGameSession(data.user);
  } catch {
    showAuth();
  }
}

bootstrap();
