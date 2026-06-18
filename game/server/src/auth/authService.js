import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9_А-Яа-яЁё-]{3,24}$/u;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toSqlDate(timestamp) {
  return new Date(timestamp).toISOString();
}

function normalizeUsername(username) {
  return String(username ?? '').trim();
}

function validateCredentials(username, password) {
  const cleanName = normalizeUsername(username);
  const cleanPassword = String(password ?? '');

  if (!USERNAME_RE.test(cleanName)) {
    throw new PublicAuthError('Имя: 3–24 символа, буквы/цифры/_/-');
  }
  if (cleanPassword.length < 6 || cleanPassword.length > 72) {
    throw new PublicAuthError('Пароль: от 6 до 72 символов');
  }

  return { username: cleanName, password: cleanPassword };
}

export class PublicAuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PublicAuthError';
    this.statusCode = statusCode;
  }
}

export function createAuthService(db) {
  async function createSession(userId) {
    await db.query('DELETE FROM sessions WHERE expires_at <= now()');
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await db.query(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [String(userId), hashToken(token), toSqlDate(expiresAt)]
    );
    return { token, expiresAt, maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000) };
  }

  function toPublicUser(user) {
    return { id: String(user.id), username: user.username };
  }

  return {
    async register(username, password) {
      const credentials = validateCredentials(username, password);
      const hash = await bcrypt.hash(credentials.password, 12);

      try {
        const result = await db.query(
          'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
          [credentials.username, hash]
        );
        const user = toPublicUser(result.rows[0]);
        return { user, session: await createSession(user.id) };
      } catch (error) {
        if (error?.code === '23505') throw new PublicAuthError('Такое имя уже занято', 409);
        throw error;
      }
    },

    async login(username, password) {
      const credentials = validateCredentials(username, password);
      const user = await db.one('SELECT * FROM users WHERE username = $1', [credentials.username]);
      if (!user) throw new PublicAuthError('Неверный логин или пароль', 401);

      const ok = await bcrypt.compare(credentials.password, user.password_hash);
      if (!ok) throw new PublicAuthError('Неверный логин или пароль', 401);

      return { user: toPublicUser(user), session: await createSession(user.id) };
    },

    async verifySessionToken(token) {
      if (!token || typeof token !== 'string' || token.length > 256) {
        throw new PublicAuthError('Требуется вход', 401);
      }

      const row = await db.one(`
        SELECT s.id AS session_id, s.user_id, s.expires_at, u.id, u.username, u.created_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()
      `, [hashToken(token)]);
      if (!row) throw new PublicAuthError('Сессия недействительна', 401);
      await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
      return { id: String(row.id), username: row.username, created_at: row.created_at };
    },

    async getUserById(userId) {
      return db.one('SELECT id, username, created_at FROM users WHERE id = $1', [String(userId)]);
    },

    async logout(token) {
      if (token && typeof token === 'string') await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    }
  };
}
