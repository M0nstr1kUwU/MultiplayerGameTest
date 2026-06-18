function parseCookies(cookieHeader = '') {
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function getSocketSessionToken(socket) {
  const fromAuth = socket.handshake.auth?.token;
  if (fromAuth) return fromAuth;
  const cookies = parseCookies(socket.handshake.headers.cookie);
  return cookies.sid ?? null;
}

function ok(ack, payload = {}) {
  if (typeof ack === 'function') ack({ ok: true, ...payload });
}

function fail(ack, message = 'Действие недоступно') {
  if (typeof ack === 'function') ack({ ok: false, message });
}

function runSafe(socket, ack, label, action, publicMessage = 'Действие недоступно') {
  try {
    return action();
  } catch (error) {
    socket.server?._gameLogger?.warn?.({ err: error, userId: socket.user?.id, label }, 'socket action failed');
    fail(ack, publicMessage);
    return null;
  }
}

export function registerSocketHandlers(io, { authService, game, logger }) {
  io._gameLogger = logger;

  io.use(async (socket, next) => {
    try {
      const token = getSocketSessionToken(socket);
      const user = await authService.verifySessionToken(token);
      socket.user = { id: String(user.id), username: user.username, socketId: socket.id };
      next();
    } catch (error) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('me', { id: socket.user.id, username: socket.user.username });
    socket.emit('lobbies:update', game.listLobbies());

    socket.on('lobby:list', (ack) => ok(ack, { lobbies: game.listLobbies() }));

    socket.on('lobby:create', (payload, ack) => {
      if (typeof payload === 'function') {
        ack = payload;
        payload = {};
      }
      runSafe(socket, ack, 'lobby:create', () => {
        const previousLobbyId = game.getLobbyIdByUser(socket.user.id);
        if (previousLobbyId) socket.leave(previousLobbyId);
        const lobby = game.createLobby(socket.user, payload?.mode, { color: payload?.color });
        socket.join(lobby.id);
        ok(ack, { lobby: game.serializeLobby(lobby) });
        game.broadcastLobby(lobby);
        game.broadcastLobbyList();
      }, 'Не удалось создать лобби');
    });

    socket.on('lobby:join', (payload, ack) => {
      runSafe(socket, ack, 'lobby:join', () => {
        const lobbyId = String(payload?.lobbyId ?? '').trim();
        const previousLobbyId = game.getLobbyIdByUser(socket.user.id);
        const lobby = game.joinLobby(lobbyId, socket.user, { color: payload?.color });
        if (previousLobbyId && previousLobbyId !== lobby.id) socket.leave(previousLobbyId);
        socket.join(lobby.id);
        ok(ack, { lobby: game.serializeLobby(lobby) });
        game.broadcastLobby(lobby);
        game.broadcastLobbyList();
      }, 'Не удалось войти в лобби');
    });

    socket.on('lobby:leave', (ack) => {
      runSafe(socket, ack, 'lobby:leave', () => {
        const lobbyId = game.getLobbyIdByUser(socket.user.id);
        game.leave(socket.user.id);
        if (lobbyId) socket.leave(lobbyId);
        ok(ack);
        game.broadcastLobbyList();
      }, 'Не удалось выйти из лобби');
    });

    socket.on('lobby:set-mode', (payload, ack) => {
      runSafe(socket, ack, 'lobby:set-mode', () => {
        game.setMode(socket.user.id, payload?.mode);
        ok(ack);
      }, 'Режим может менять только лидер лобби');
    });

    socket.on('lobby:set-settings', (payload, ack) => {
      runSafe(socket, ack, 'lobby:set-settings', () => {
        game.setSettings(socket.user.id, payload ?? {});
        ok(ack);
      }, 'Настройки может менять только лидер лобби');
    });


    socket.on('player:set-style', (payload, ack) => {
      runSafe(socket, ack, 'player:set-style', () => {
        const style = game.setPlayerStyle(socket.user.id, payload ?? {});
        ok(ack, { style });
      }, 'Не удалось обновить стиль');
    });

    socket.on('lobby:kick', (payload, ack) => {
      runSafe(socket, ack, 'lobby:kick', () => {
        game.kickPlayer(socket.user.id, payload?.targetId);
        ok(ack);
      }, 'Кикать может только лидер лобби');
    });

    socket.on('match:start', async (ack) => {
      try {
        await game.start(socket.user.id);
        ok(ack);
      } catch (error) {
        logger?.warn?.({ err: error, userId: socket.user.id }, 'match start failed');
        fail(ack, 'Матч может запустить только лидер готового лобби');
      }
    });

    socket.on('player:input', (input) => {
      try {
        game.handleInput(socket.user.id, input);
      } catch (error) {
        logger?.debug?.({ err: error, userId: socket.user.id }, 'input ignored');
      }
    });

    socket.on('player:action', async (payload, ack) => {
      try {
        const applied = await game.handleAction(socket.user.id, payload ?? {});
        ok(ack, { applied: Boolean(applied) });
      } catch (error) {
        logger?.debug?.({ err: error, userId: socket.user.id }, 'action ignored');
        fail(ack, 'Действие недоступно');
      }
    });

    socket.on('upgrade:choose', async (payload, ack) => {
      try {
        const applied = await game.chooseUpgrade(socket.user.id, payload?.choiceId ?? payload?.id);
        ok(ack, { applied: Boolean(applied) });
      } catch (error) {
        logger?.debug?.({ err: error, userId: socket.user.id }, 'upgrade ignored');
        fail(ack, 'Прокачка недоступна');
      }
    });

    socket.on('disconnect', () => {
      game.leave(socket.user.id);
      game.broadcastLobbyList();
    });
  });
}
