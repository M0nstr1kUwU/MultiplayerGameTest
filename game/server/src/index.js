import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { createDatabase } from './db/database.js';
import { createAuthService } from './auth/authService.js';
import { authRoutes } from './routes/authRoutes.js';
import { leaderboardRoutes } from './routes/leaderboardRoutes.js';
import { HookBus } from './hooks/HookBus.js';
import { installExampleMod } from './hooks/exampleMod.js';
import { GameManager } from './game/core/GameManager.js';
import { registerSocketHandlers } from './socket/socketHandlers.js';

const app = Fastify({
  logger: true,
  bodyLimit: 32 * 1024
});

const allowedOrigins = (process.env.CLIENT_ORIGINS ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

await app.register(cors, {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true
});
await app.register(cookie);

app.addHook('onRequest', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
});

const db = await createDatabase();
const authService = createAuthService(db);
const hooks = new HookBus();
installExampleMod(hooks);

const io = new Server(app.server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  maxHttpBufferSize: 16 * 1024
});

const game = new GameManager({ io, db, hooks });
registerSocketHandlers(io, { authService, game, logger: app.log });

await app.register(authRoutes, { authService });
await app.register(leaderboardRoutes, { db });

app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

const tickRate = Math.max(10, Math.min(30, Number(process.env.TICK_RATE ?? 20)));
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;
  void game.tick(dt).catch((error) => app.log.error({ err: error }, 'game tick failed'));
}, 1000 / tickRate);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistCandidates = [
  // Production build copies the Vite bundle here: game/server/client-dist
  path.resolve(__dirname, '../client-dist'),
  // Backward compatibility for older local builds.
  path.resolve(__dirname, '../../client-dist')
];
const clientDist = clientDistCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html')));

if (process.env.SERVE_CLIENT !== 'false' && clientDist) {
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: '/',
    index: ['index.html'],
    decorateReply: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
  });

  const sendIndex = (reply) => {
    const indexPath = path.join(clientDist, 'index.html');
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(indexPath));
  };

  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? '';
    if (url.startsWith('/api/') || url.startsWith('/socket.io/')) {
      return reply.code(404).send({ ok: false, message: 'Не найдено' });
    }
    // Missing optional game assets must stay cheap 404s.
    // Previously they fell through to the SPA fallback and caused 500 spam on Render.
    if (url.startsWith('/assets/')) {
      return reply.code(404).type('text/plain; charset=utf-8').send('');
    }
    return sendIndex(reply);
  });
} else if (process.env.SERVE_CLIENT !== 'false') {
  app.log.warn({ clientDistCandidates }, 'Client build was not found. Only API routes will be available.');
}

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`Server is running on http://localhost:${port}`);
