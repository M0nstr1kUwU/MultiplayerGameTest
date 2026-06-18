import { z } from 'zod';
import { getSessionToken } from './authRoutes.js';

const designSchema = z.object({
  name: z.string().trim().min(3).max(40),
  data: z.object({
    rooms: z.array(z.object({
      kind: z.enum(['normal', 'elite', 'crate', 'shop', 'boss']).default('normal'),
      width: z.number().min(16).max(64).default(34),
      depth: z.number().min(16).max(64).default(24),
      props: z.array(z.object({
        type: z.string().min(1).max(32),
        x: z.number().min(-128).max(128),
        z: z.number().min(-128).max(128),
        rot: z.number().min(-6.29).max(6.29).default(0)
      })).max(200).default([])
    })).min(1).max(30)
  })
});

export async function designRoutes(app, { db, authService }) {
  const list = db.prepare('SELECT id, name, data, created_at, updated_at FROM level_designs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20');
  const insert = db.prepare('INSERT INTO level_designs (user_id, name, data) VALUES (?, ?, ?)');

  function requireUser(request, reply) {
    try {
      return authService.verifySessionToken(getSessionToken(request));
    } catch {
      reply.code(401).send({ ok: false, message: 'Требуется вход' });
      return null;
    }
  }

  app.get('/api/designs', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    return { ok: true, designs: list.all(user.id).map((row) => ({ ...row, data: JSON.parse(row.data) })) };
  });

  app.post('/api/designs', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const parsed = designSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, message: 'Проверь структуру дизайна уровня' });
    const result = insert.run(user.id, parsed.data.name, JSON.stringify(parsed.data.data));
    return { ok: true, id: Number(result.lastInsertRowid) };
  });
}
