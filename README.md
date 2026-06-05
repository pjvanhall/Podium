# Podium App

Podium is a Dutch social web app for theatre-goers. Users can discover performances across Dutch theatres, mark attendance, send and manage friend requests, and see what friends are planning to attend.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: `sql.js`, persisted locally to `Podium App/server/podium.db`
- Auth: JWT + bcryptjs
- Styling: vanilla CSS

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

Demo login:

```text
lisa@example.com / welkom123
```

## Verification

Frontend build:

```bash
cd "Podium App/client"
npm run build
```

Backend tests are not implemented yet; `npm test` is currently a placeholder.
