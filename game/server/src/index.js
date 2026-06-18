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

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.tick(dt);
}, 1000 / 30);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client-dist');

if (process.env.SERVE_CLIENT !== 'false' && fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: '/',
    decorateReply: false
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/') || request.raw.url?.startsWith('/socket.io/')) {
      return reply.code(404).send({ ok: false, message: 'Не найдено' });
    }
    return reply.sendFile('index.html');
  });
}

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`Server is running on http://localhost:${port}`);
