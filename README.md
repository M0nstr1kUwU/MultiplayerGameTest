# Soul Knight 3D — multiplayer prototype

Браузерная кооперативная 3D-игра в духе Soul Knight. Проект построен на **Three.js**, **Socket.IO** и **Fastify**.

Игра запускается в браузере. Сервер хранит аккаунты, лобби, ход матча, здоровье игроков, врагов, предметы и PvE-лидерборд. Клиент отвечает за интерфейс, управление и 3D-картинку.

## Что уже реализовано

- Регистрация, вход и серверные HttpOnly-сессии.
- Создание лобби, вход по коду, лидер лобби, PvE и PvP.
- PvE с комнатами, дверями, врагами, боссами, дропом, порталом, прокачками и воскрешением союзников.
- PvP с раундами до нужного числа побед.
- Оружие, уровни оружия, патроны, предметы на земле и базовые эффекты.
- PostgreSQL для опубликованной версии и локальная JSON-база для разработки без Docker.
- Хуки, на которые позже смогут подписываться моды.
- Оптимизированная передача состояния: при входе клиент получает мир целиком один раз, затем сервер отправляет только то, что изменилось.

## Быстрый локальный запуск

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

После запуска открой:

```text
http://localhost:5173
```

Локально проект по умолчанию использует файл `server/.data/local-db.json`. Docker и PostgreSQL для этого запуска не нужны.

## Запуск опубликованной версии на Render

Для Render используются PostgreSQL и переменные окружения:

```env
NODE_ENV=production
SERVE_CLIENT=true
DB_DRIVER=postgres
DATABASE_URL=<внутренний адрес базы Render>
PG_SSL=true
TICK_RATE=20
NETWORK_RATE=10
CLIENT_ORIGIN=https://<адрес-сервиса>.onrender.com
CLIENT_ORIGINS=https://<адрес-сервиса>.onrender.com
```

Команды Render:

```bash
npm install && npm run build
```

```bash
npm start
```

Полное руководство: [`Deployment.md`](wiki/Deployment.md).

## Документация

- [Начало работы и карта Wiki](wiki/Home.md)
- [Как сервер и клиент обмениваются данными](wiki/Networking.md)
- [Как устроен проект](wiki/Architecture.md)
- [Игровые системы](wiki/Gameplay.md)
- [Пользователи, сессии и база данных](wiki/Data.md)
- [Будущие моды и хуки](wiki/Modding.md)
- [Публикация на Render](wiki/Deployment.md)
- [Иконки, модели и анимации](wiki/Assets-and-Animation.md)
- [План работ](KANBAN.md)

## Структура проекта

```text
client/   Three.js, интерфейс, управление и Socket.IO-клиент
server/   Fastify, Socket.IO, авторизация, база данных и правила игры
```
