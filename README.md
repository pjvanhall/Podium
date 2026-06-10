# Podium App

Podium is a Dutch social web app for theatre-goers. Users can discover performances across Dutch theatres, mark attendance, send and manage friend requests, and see what friends are planning to attend.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Database: `sql.js`, persisted locally to `Podium App/server/podium.db`
- Auth: JWT + bcryptjs
- UI: Mantine + custom Podium theme

## Project Structure

```text
.
├── Podium App/
│   ├── client/
│   └── server/
├── implementation_plan.md
└── task.md
```

## Setup

Install backend dependencies:

```bash
cd "Podium App/server"
npm install
```

Create the backend environment file:

```bash
cp .env.example .env
```

Install frontend dependencies:

```bash
cd "../client"
npm install
```

## Run Locally

Start the API server:

```bash
cd "Podium App/server"
npm run dev
```

Start the frontend:

```bash
cd "Podium App/client"
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend health check: `http://localhost:3001/api/health`

The server creates/seeds the local database on startup if needed.

Production backend build:

```bash
cd "Podium App/server"
npm run build
```

Demo login:

```text
lisa@example.com / welkom123
```

## Verification

Frontend TypeScript + Vite build:

```bash
cd "Podium App/client"
npm run build
```

Backend TypeScript build:

```bash
cd "Podium App/server"
npm run build
```

Backend tests are not implemented yet; `npm test` is currently a placeholder.

## Deployment Notes

Recommended domains:

- Frontend: `https://theatervriend.nl`
- Frontend alias: `https://www.theatervriend.nl`
- API: `https://api.theatervriend.nl`
- Redirect: `https://theaterbuddy.nl` -> `https://theatervriend.nl`

Frontend production environment variable:

```text
VITE_API_URL=https://api.theatervriend.nl/api
```

Backend production environment variables:

```text
JWT_SECRET=<generate-a-long-random-secret>
CORS_ORIGIN=https://theatervriend.nl,https://www.theatervriend.nl
```

If the backend is deployed with persistent disk storage, set `DB_PATH` to the mounted database path. Without persistent storage, the `sql.js` database is suitable for demos only because local files can be reset by the host.

For TransIP DNS, add the records requested by the frontend/backend hosts:

- `theatervriend.nl` (`@`) -> frontend host apex/root record
- `www.theatervriend.nl` -> frontend host `CNAME`
- `api.theatervriend.nl` -> backend host `CNAME`
