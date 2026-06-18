export async function leaderboardRoutes(app, { db }) {
  app.get('/api/leaderboard/pve', async () => {
    const rows = await db.many(`
      SELECT u.username, l.mode, l.score, l.wins, l.kills, l.updated_at
      FROM leaderboard l
      JOIN users u ON u.id = l.user_id
      WHERE l.mode = 'pve'
      ORDER BY l.score DESC, l.wins DESC, l.kills DESC
      LIMIT 10
    `);

    return { mode: 'pve', rows };
  });

  app.get('/api/leaderboard/pvp', async (request, reply) => {
    return reply.code(410).send({ ok: false, message: 'PvP лидерборд отключён: результат легко накручивать договорными боями.' });
  });
}
