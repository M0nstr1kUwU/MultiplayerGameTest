import { applyPlayerStyle, createPlayerState, serializePlayerForLobby, serializePlayerForWorld } from './PlayerState.js';
import { clamp } from './math.js';
import { PvPMode } from '../modes/PvPMode.js';
import { PvEMode } from '../modes/PvEMode.js';

const MODES = new Set(['pvp', 'pve']);
const MAX_PLAYERS = 8;

function normalizeMode(mode) {
  const value = String(mode ?? 'pve').toLowerCase();
  return MODES.has(value) ? value : 'pve';
}


function normalizeLobbyCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^LOBBY/, '');
}

function formatLobbyCode(raw) {
  const clean = normalizeLobbyCode(raw);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}` : clean;
}

function createLobbyCode(existingCodes) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let tries = 0; tries < 64; tries++) {
    let code = '';
    for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const formatted = formatLobbyCode(code);
    if (!existingCodes.has(formatted)) return formatted;
  }
  return formatLobbyCode(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
}

function normalizeSettings(settings = {}) {
  return {
    pveRooms: clamp(Math.round(Number(settings.pveRooms ?? 8)), 5, 30),
    pvpTargetWins: clamp(Math.round(Number(settings.pvpTargetWins ?? 5)), 1, 10)
  };
}

function sanitizeInput(input, fallbackAngle = 0) {
  const rawAngle = Number(input?.angle);
  return {
    up: Boolean(input?.up),
    down: Boolean(input?.down),
    left: Boolean(input?.left),
    right: Boolean(input?.right),
    shoot: Boolean(input?.shoot),
    revive: Boolean(input?.revive),
    angle: Number.isFinite(rawAngle) ? clamp(rawAngle, -Math.PI * 2, Math.PI * 2) : fallbackAngle
  };
}

export class GameManager {
  constructor({ io, db, hooks }) {
    this.io = io;
    this.db = db;
    this.hooks = hooks;
    this.lobbies = new Map();
    this.playerLobby = new Map();
  }

  createLobby(leader, requestedMode = 'pve', options = {}) {
    this.leave(leader.id);
    const lobby = {
      id: createLobbyCode(this.lobbies),
      leaderId: String(leader.id),
      mode: normalizeMode(requestedMode),
      settings: normalizeSettings(),
      status: 'lobby',
      maxPlayers: MAX_PLAYERS,
      players: new Map(),
      modeInstance: null,
      createdAt: Date.now()
    };

    const state = createPlayerState({ ...leader, color: options.color ?? leader.color }, leader.socketId);
    state.isLeader = true;
    lobby.players.set(state.id, state);
    this.lobbies.set(lobby.id, lobby);
    this.playerLobby.set(state.id, lobby.id);
    return lobby;
  }

  joinLobby(lobbyId, user, options = {}) {
    const lobby = this.lobbies.get(formatLobbyCode(lobbyId));
    if (!lobby) throw new Error('not_found');
    if (lobby.status !== 'lobby') throw new Error('already_started');
    if (lobby.players.size >= lobby.maxPlayers) throw new Error('full');

    const currentLobbyId = this.getLobbyIdByUser(user.id);
    if (currentLobbyId === lobby.id) return lobby;
    if (currentLobbyId) this.leave(user.id);

    const state = createPlayerState({ ...user, color: options.color ?? user.color }, user.socketId);
    lobby.players.set(state.id, state);
    this.playerLobby.set(state.id, lobby.id);
    return lobby;
  }

  leave(userId) {
    const normalizedUserId = String(userId);
    const lobbyId = this.playerLobby.get(normalizedUserId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    this.playerLobby.delete(normalizedUserId);
    if (!lobby) return null;

    lobby.players.delete(normalizedUserId);

    if (lobby.players.size === 0) {
      this.lobbies.delete(lobby.id);
      return lobby;
    }

    if (lobby.leaderId === normalizedUserId) {
      const nextLeader = lobby.players.values().next().value;
      lobby.leaderId = nextLeader.id;
      nextLeader.isLeader = true;
    }

    this.broadcastLobby(lobby);
    return lobby;
  }

  setMode(userId, mode) {
    // Режим фиксируется при создании лобби, чтобы игроки не попадали в «сменившиеся правила».
    // Метод оставлен для обратной совместимости старого клиента, но всегда запрещает смену.
    const lobby = this.getLobbyByUser(userId);
    this.assertLeader(lobby, userId);
    throw new Error('mode_locked_after_create');
  }

  setPlayerStyle(userId, style) {
    const lobby = this.findLobbyByUser(userId);
    if (!lobby) return null;
    const player = lobby.players.get(String(userId));
    if (!player) return null;
    const applied = applyPlayerStyle(player, style);
    this.broadcastLobby(lobby);
    return applied;
  }

  kickPlayer(leaderId, targetId) {
    const lobby = this.getLobbyByUser(leaderId);
    this.assertLeader(lobby, leaderId);
    const normalizedTargetId = String(targetId);
    if (normalizedTargetId === String(leaderId)) throw new Error('cannot_kick_self');
    const target = lobby.players.get(normalizedTargetId);
    if (!target) throw new Error('target_not_found');
    this.playerLobby.delete(normalizedTargetId);
    lobby.players.delete(normalizedTargetId);
    this.io.to(target.socketId).emit('lobby:kicked');
    this.io.sockets.sockets.get(target.socketId)?.leave(lobby.id);
    this.broadcastLobby(lobby);
    this.broadcastLobbyList();
    return true;
  }

  setSettings(userId, settings) {
    const lobby = this.getLobbyByUser(userId);
    this.assertLeader(lobby, userId);
    if (lobby.status !== 'lobby') throw new Error('locked');
    lobby.settings = { ...lobby.settings, ...normalizeSettings({ ...lobby.settings, ...settings }) };
    this.broadcastLobby(lobby);
    this.broadcastLobbyList();
  }

  async start(userId) {
    const lobby = this.getLobbyByUser(userId);
    this.assertLeader(lobby, userId);
    if (lobby.status !== 'lobby') throw new Error('already_started');
    if (lobby.mode === 'pvp' && lobby.players.size < 2) throw new Error('pvp_min_players');
    if (lobby.players.size < 1) throw new Error('empty');

    lobby.status = 'playing';
    lobby.modeInstance = lobby.mode === 'pvp'
      ? new PvPMode(this.createMatchFacade(lobby))
      : new PvEMode(this.createMatchFacade(lobby));

    await lobby.modeInstance.start();
    this.io.to(lobby.id).emit('match:started', this.serializeLobby(lobby));
    this.broadcastLobby(lobby);
    this.broadcastLobbyList();
  }

  handleInput(userId, input) {
    const lobby = this.findLobbyByUser(userId);
    if (!lobby || lobby.status !== 'playing') return;
    const player = lobby.players.get(String(userId));
    if (!player) return;
    player.input = sanitizeInput(input, player.rot);
  }

  async handleAction(userId, action) {
    const lobby = this.findLobbyByUser(userId);
    if (!lobby || lobby.status !== 'playing' || !lobby.modeInstance) return false;
    const player = lobby.players.get(String(userId));
    if (!player || !player.alive) return false;
    return lobby.modeInstance.handleAction?.(player, action) ?? false;
  }

  async chooseUpgrade(userId, choiceId) {
    const lobby = this.findLobbyByUser(userId);
    if (!lobby || lobby.status !== 'playing' || !lobby.modeInstance) return false;
    const player = lobby.players.get(String(userId));
    if (!player) return false;
    return lobby.modeInstance.chooseUpgrade?.(player, choiceId) ?? false;
  }

  tick(dt) {
    for (const lobby of this.lobbies.values()) {
      if (lobby.status === 'playing' && lobby.modeInstance) {
        lobby.modeInstance.update(dt).catch((error) => console.error('[mode update]', error));
        this.io.to(lobby.id).emit('world:state', this.serializeWorld(lobby));
      }
    }
  }

  createMatchFacade(lobby) {
    return {
      id: lobby.id,
      mode: lobby.mode,
      settings: lobby.settings,
      players: lobby.players,
      hooks: this.hooks,
      addLeaderboard: (player, mode, delta) => this.addLeaderboard(player, mode, delta),
      emit: (event, payload) => this.io.to(lobby.id).emit(event, payload),
      finish: (result) => this.finishMatch(lobby, result)
    };
  }

  addLeaderboard(player, mode, delta) {
    if (mode !== 'pve') return;
    return this.db.query(`
      INSERT INTO leaderboard (user_id, mode, score, wins, kills, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT(user_id, mode) DO UPDATE SET
        score = leaderboard.score + excluded.score,
        wins = leaderboard.wins + excluded.wins,
        kills = leaderboard.kills + excluded.kills,
        updated_at = now()
    `, [String(player.id), mode, delta.score ?? 0, delta.wins ?? 0, delta.kills ?? 0]);
  }

  finishMatch(lobby, result) {
    lobby.status = 'finished';
    this.io.to(lobby.id).emit('match:finished', {
      result,
      lobby: this.serializeLobby(lobby),
      world: this.serializeWorld(lobby)
    });
    this.broadcastLobbyList();

    setTimeout(() => {
      if (!this.lobbies.has(lobby.id)) return;
      lobby.status = 'lobby';
      lobby.modeInstance = null;
      for (const player of lobby.players.values()) {
        const fresh = createPlayerState(player, player.socketId);
        Object.assign(player, fresh, { id: player.id, username: player.username, socketId: player.socketId, color: player.color });
      }
      this.broadcastLobby(lobby);
      this.broadcastLobbyList();
    }, 8000);
  }

  findLobbyByUser(userId) {
    const lobbyId = this.playerLobby.get(String(userId));
    return lobbyId ? this.lobbies.get(lobbyId) ?? null : null;
  }

  getLobbyByUser(userId) {
    const lobby = this.findLobbyByUser(userId);
    if (!lobby) throw new Error('not_in_lobby');
    return lobby;
  }

  getLobbyIdByUser(userId) {
    return this.playerLobby.get(String(userId)) ?? null;
  }

  assertLeader(lobby, userId) {
    if (lobby.leaderId !== String(userId)) throw new Error('not_leader');
  }

  broadcastLobby(lobby) {
    this.io.to(lobby.id).emit('lobby:state', this.serializeLobby(lobby));
  }

  broadcastLobbyList() {
    this.io.emit('lobbies:update', this.listLobbies());
  }

  listLobbies() {
    return [...this.lobbies.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((lobby) => {
        const leader = lobby.players.get(lobby.leaderId);
        return {
          id: lobby.id,
          leaderId: lobby.leaderId,
          leaderName: leader?.username ?? '—',
          mode: lobby.mode,
          settings: lobby.settings,
          status: lobby.status,
          playersCount: lobby.players.size,
          maxPlayers: lobby.maxPlayers,
          canJoin: lobby.status === 'lobby' && lobby.players.size < lobby.maxPlayers,
          createdAt: lobby.createdAt
        };
      });
  }

  serializeLobby(lobby) {
    return {
      id: lobby.id,
      leaderId: lobby.leaderId,
      mode: lobby.mode,
      settings: lobby.settings,
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
      players: [...lobby.players.values()].map((p) => ({
        ...serializePlayerForLobby(p),
        isLeader: p.id === lobby.leaderId
      }))
    };
  }

  serializeWorld(lobby) {
    return {
      lobby: this.serializeLobby(lobby),
      players: [...lobby.players.values()].map(serializePlayerForWorld),
      mode: lobby.modeInstance?.getState() ?? { type: lobby.mode }
    };
  }
}
