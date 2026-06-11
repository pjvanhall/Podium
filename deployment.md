# Current Cloud Deployment

Last reviewed: 2026-06-11

This document describes the current deployment shape that is represented in the repository. It separates confirmed repository configuration from cloud-provider details that are not checked in.

## Overview

Podium is deployed as two separate services:

- Frontend: React + Vite static web app from `Podium App/client`.
- Backend: Node.js + Express API from `Podium App/server`, deployed on Render.com.

The intended production domains are:

- Frontend: `https://theatervriend.nl`
- Frontend alias: `https://www.theatervriend.nl`
- API: `https://api.theatervriend.nl`
- Render API service URL: `https://theatervriend-api.onrender.com`
- Planned redirect, not yet configured: `https://theaterbuddy.nl` to `https://theatervriend.nl`

## Frontend

The frontend has checked-in Vercel configuration at `Podium App/client/vercel.json`.

Current Vercel behavior:

- The app is a single-page application.
- All paths are rewritten to `/index.html` so React Router routes work on refresh.

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Build configuration:

- App directory: `Podium App/client`
- Install command: `npm install`
- Build command: `npm run build`
- Build output: `dist`
- Build script: `tsc && vite build`

Production frontend environment:

```text
VITE_API_URL=https://api.theatervriend.nl/api
```

The frontend API client reads `VITE_API_URL` and falls back to `http://localhost:3001/api` only for local development.

## Backend

The backend is deployed on Render.com. It is an Express API compiled from TypeScript and started with Node.

Build configuration:

- Host: Render.com
- Render service URL: `https://theatervriend-api.onrender.com`
- Public API domain: `https://api.theatervriend.nl`
- App directory: `Podium App/server`
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`
- Build script: `tsc`
- Start script: `node dist/index.js`
- Production health check: `https://api.theatervriend.nl/api/health`
- Health check path: `/api/health`

Production backend environment:

```text
DATA_BACKEND=split
DATABASE_URL=postgresql://postgres.adyuzzvybpzejlclfawr:<YOUR_SUPABASE_PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
MONGODB_URI=mongodb+srv://<db_username>:<db_password>@theatervriendcluster.lllljqs.mongodb.net/?retryWrites=true&w=majority&appName=TheaterVriendCluster
NOSQL_DB_NAME=podium
POSTGRES_SSL=true
JWT_SECRET=<long-random-secret>
CORS_ORIGIN=https://theatervriend.nl,https://www.theatervriend.nl
ALLOWED_IPS=<your-public-ip-or-cidr-range>
ADMIN_TASK_TOKEN=<long-random-one-time-admin-token>
PORT=<provided-by-host>
```

`PORT` is optional in local development because the server defaults to `3001`. In production, the cloud host normally provides it.

`ALLOWED_IPS` is optional. When empty, the API accepts traffic normally. When set, the API returns `403 Forbidden` for requests that do not come from one of the listed public IPv4 addresses or CIDR ranges. Use a comma-separated value such as:

```text
ALLOWED_IPS=203.0.113.42/32,198.51.100.0/24
```

`ADMIN_TASK_TOKEN` is optional. When empty, maintenance endpoints are hidden. Set it only when a one-off maintenance action is needed, then remove or rotate it afterward.

## Database Persistence

The backend uses a **split database architecture** in production:
- Relational social data (Users, Friends, Attendance) lives in Supabase PostgreSQL.
- Document catalog data (Theatres, Shows, Scrape jobs) lives in MongoDB Atlas.

(Note: The backend also contains a legacy SQLite fallback mode using `sql.js` that can be toggled by removing `DATA_BACKEND=split`, but this is intended for local offline development rather than production).

By default, the database file is:

```text
Podium App/server/podium.db
```

For cloud deployment, `DB_PATH` should point to a persistent mounted disk path. If the backend runs on ephemeral storage without `DB_PATH` mapped to persistent storage, user data can be lost when the host restarts, rebuilds, or replaces the container.

The server also runs `seedDatabase()` on startup, so initial theatre, performance, and demo data are loaded if needed.

## DNS

The domains are registered through TransIP, but authoritative DNS is delegated to Vercel DNS.

Current nameservers:

```text
ns1.vercel-dns.com
ns2.vercel-dns.com
```

The exact DNS target values are managed in Vercel DNS and are not stored in this repository.

Expected DNS setup:

- `theatervriend.nl` apex/root record points to the Vercel frontend.
- `www.theatervriend.nl` points to the Vercel frontend.
- `api.theatervriend.nl` points to the Render.com backend at `theatervriend-api.onrender.com`.
- `theaterbuddy.nl` is intended to redirect to `https://theatervriend.nl`, but this redirect is not configured yet.

Current Vercel DNS record for the API:

| Name | Type | Value | TTL |
|---|---|---|---|
| `api` | `CNAME` | `theatervriend-api.onrender.com.` | `60` |

## Private Access

For now, the application is intended to be accessible only from the owner's private network. Because the app is hosted on Vercel and Render, the providers see the network's public exit IP, not the internal LAN address such as `192.168.x.x`.

Backend API protection:

- Set `ALLOWED_IPS` in the Render service environment to the trusted public IP or CIDR range.
- Example for one public IP: `ALLOWED_IPS=203.0.113.42/32`
- Restart or redeploy the Render service after changing the environment variable.
- Verify from the trusted network with `https://api.theatervriend.nl/api/health`.
- Verify from another network that the API returns `403 Forbidden`.

Frontend protection:

- Protect the Vercel project in the Vercel dashboard.
- Current state: Vercel Authentication / Standard Protection is enabled, but the public custom domain can still be opened in an incognito browser.
- This means Standard Protection is not sufficient for making `https://theatervriend.nl` private on the current Vercel plan.
- Trusted IPs would be a closer match for private-network-only access, but it requires an Enterprise plan.
- Password Protection also requires Enterprise or the Advanced Deployment Protection add-on for Pro, so it is not the default option for this setup.
- With the current plan, the React app uses an app-level access gate before rendering the real routes. It calls `GET /api/health`; if the API cannot confirm access, the app shows a restricted-access screen.
- The frontend gate depends on the Render `ALLOWED_IPS` setting. If `ALLOWED_IPS` is empty, `/api/health` returns success for everyone and the frontend gate allows the app to load.

Important limitation:

- DNS at TransIP or Vercel DNS cannot enforce private-network-only access. DNS only resolves names to hosts. Access control must happen at Vercel, Render, or in the application.

## Maintenance Tasks

### Reset Performances

The API exposes a protected maintenance endpoint for clearing all performances and reloading them from `Podium App/server/theatre_shows.json`.

This endpoint also clears `attendance`, because attendance records point to old performance IDs. It does not clear users, theatres, friendships, or profiles.

Render setup:

- Set `ADMIN_TASK_TOKEN` to a long random value in the Render service environment.
- Redeploy or restart the Render service so the token is loaded.
- Keep `ALLOWED_IPS` enabled if the API should only accept the maintenance call from the trusted network.

Trigger from PowerShell:

```powershell
$headers = @{ "x-admin-task-token" = "<ADMIN_TASK_TOKEN>" }
Invoke-RestMethod -Method Post -Uri "https://api.theatervriend.nl/api/admin/reset-performances" -Headers $headers
```

After the reset:

- Verify `https://api.theatervriend.nl/api/health`.
- Open the app and confirm events are visible again.
- Remove or rotate `ADMIN_TASK_TOKEN` in Render.

## Repository Notes

The deployment works without checked-in provider blueprints because the cloud settings are managed in the provider dashboards.

- Render service settings are managed in the Render dashboard. There is no checked-in `render.yaml`.
- Frontend project settings are managed in Vercel. There is no checked-in Vercel project metadata directory.
- DNS records are managed in Vercel DNS. The API record is documented above.
- Production environment variables are managed in Vercel and Render dashboards. Secret values should not be committed to the repository.
- GitHub Actions deployment workflows are not required if Vercel and Render are connected directly to the Git repository.

The main operational detail to verify in the dashboards is the deploy trigger for each service, for example whether deployments run automatically on pushes to the main branch.

## Verification Checklist

After deploying or reviewing the cloud setup, verify:

- `https://theatervriend.nl` loads the frontend.
- `https://www.theatervriend.nl` loads or redirects to the frontend.
- `https://api.theatervriend.nl/api/health` returns JSON with `status: "ok"`.
- Browser requests from the frontend go to `https://api.theatervriend.nl/api`.
- Authenticated routes work after signup or login.
- Backend storage survives a service restart.
- CORS allows `https://theatervriend.nl` and `https://www.theatervriend.nl`.
