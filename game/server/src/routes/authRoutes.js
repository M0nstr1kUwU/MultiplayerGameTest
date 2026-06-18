import { z } from 'zod';
import { PublicAuthError } from '../auth/authService.js';

const SESSION_COOKIE = 'sid';
const credentialsSchema = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(6).max(72)
});

const authAttempts = new Map();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;

function getClientKey(request) {
  return `${request.ip}:${request.headers['user-agent'] ?? 'unknown'}`;
}

function assertRateLimit(request) {
  const now = Date.now();
  const key = getClientKey(request);
  const bucket = authAttempts.get(key) ?? { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  authAttempts.set(key, bucket);
  if (bucket.count > RATE_LIMIT) throw new PublicAuthError('Слишком много попыток. Попробуйте позже.', 429);
}

function publicError(reply, error, fallback = 'Запрос не выполнен') {
  if (error instanceof PublicAuthError) {
    return reply.code(error.statusCode).send({ ok: false, message: error.message });
  }
  return reply.code(500).send({ ok: false, message: fallback });
}

export function getSessionToken(request) {
  const bearer = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice('Bearer '.length)
    : null;
  return request.cookies?.[SESSION_COOKIE] ?? bearer ?? null;
}

export function setSessionCookie(reply, session) {
  reply.setCookie(SESSION_COOKIE, session.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: session.maxAgeSeconds
  });
}

export function clearSessionCookie(reply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function authRoutes(app, { authService }) {
  app.post('/api/auth/register', async (request, reply) => {
    try {
      assertRateLimit(request);
      const body = credentialsSchema.parse(request.body);
      const { user, session } = await authService.register(body.username, body.password);
      setSessionCookie(reply, session);
      return { ok: true, user };
    } catch (error) {
      request.log.warn({ err: error }, 'register failed');
      if (error?.name === 'ZodError') return reply.code(400).send({ ok: false, message: 'Проверь имя и пароль' });
      return publicError(reply, error, 'Регистрация не выполнена');
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    try {
      assertRateLimit(request);
      const body = credentialsSchema.parse(request.body);
      const { user, session } = await authService.login(body.username, body.password);
      setSessionCookie(reply, session);
      return { ok: true, user };
    } catch (error) {
      request.log.warn({ err: error }, 'login failed');
      if (error?.name === 'ZodError') return reply.code(400).send({ ok: false, message: 'Проверь имя и пароль' });
      return publicError(reply, error, 'Вход не выполнен');
    }
  });

  app.get('/api/auth/me', async (request, reply) => {
    try {
      const user = await authService.verifySessionToken(getSessionToken(request));
      return { ok: true, user };
    } catch (error) {
      return publicError(reply, error, 'Требуется вход');
    }
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await authService.logout(getSessionToken(request));
    clearSessionCookie(reply);
    return { ok: true };
  });
}
