# Soul Knight 3D — multiplayer prototype
```copy
https://multiplayergametest.onrender.com
```

Браузерная кооперативная 3D-игра в духе Soul Knight на **Three.js + Socket.IO + Fastify**.

## Что уже есть

- Авторизация через серверные HttpOnly-сессии.
- Лобби с красивыми кодами, PvE и PvP.
- PvE: процедурная сеть комнат, двери, враги, боссы, портал, прокачки, revive, оружие и дроп.
- PvP: раунды до заданного числа побед.
- PostgreSQL для production-лидерборда; локальная JSON-БД для разработки без Docker.
- Система хуков под будущие моды.
- Репликация мира **bootstrap + delta**, а не полный снимок мира в каждом сетевом пакете.

## Быстрый запуск

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Открой `http://localhost:5173`.

## Production / Render

```env
NODE_ENV=production
SERVE_CLIENT=true
DB_DRIVER=postgres
DATABASE_URL=<Render Internal Database URL>
PG_SSL=true
TICK_RATE=20
NETWORK_RATE=10
```

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

Подробные инструкции: [`docs/wiki/Deployment.md`](docs/wiki/Deployment.md).

## Документация

- [Wiki / начало](docs/wiki/Home.md)
- [Сетевая репликация](docs/wiki/Networking.md)
- [Архитектура](docs/wiki/Architecture.md)
- [Игровые системы](docs/wiki/Gameplay.md)
- [Моды и хуки](docs/wiki/Modding.md)
- [Kanban](docs/KANBAN.md)

## Структура

```text
client/  Three.js, UI и Socket.IO-клиент
server/  Fastify, Socket.IO, авторизация, БД и игровая симуляция
docs/    короткие технические документы и wiki
```
