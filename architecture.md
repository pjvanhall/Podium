# Podium App — Architecture Reference

> **Purpose**: This document is the canonical architecture reference for the Podium App codebase. It is intended to be consumed by AI agents and developers to understand the system before making any changes.

---

## Overview

**Podium** is a Dutch-language social platform for theatre enthusiasts. Users can discover theatres and upcoming performances, mark attendance, manage a social friend network, and view a social activity feed of their friends' attendance.

The application follows a classic **client/server monorepo structure** with two independently-runnable packages:

```
c:\Code\Podium\
├── Podium App/
│   ├── client/          # React SPA (Vite + TypeScript)
│   └── server/          # Express REST API (Node.js + TypeScript)
├── README.md
└── implementation_plan.md
```

---

## Tech Stack

### Client (`Podium App/client/`)
| Concern | Technology |
|---|---|
| Framework | React 19 |
| Build tool | Vite 5 |
| Language | TypeScript 6 |
| UI component library | **Mantine 9** (core, hooks, notifications) |
| Icons | Lucide React |
| Routing | React Router DOM v7 |
| HTTP layer | Native `fetch` (via `services/api.ts`) |
| Auth state | React Context (`AuthContext`) |

### Server (`Podium App/server/`)
| Concern | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| Language | TypeScript 6 (compiled via `tsx` in dev) |
| Local database | **SQLite via sql.js** (in-memory, persisted to `podium.db`) |
| Split production database | PostgreSQL (`pg`) for users/social/attendance + MongoDB/Cosmos Mongo API (`mongodb`) for theatres/shows |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| Environment | `dotenv` |

> [!IMPORTANT]
> The local fallback database is **sql.js** (a WebAssembly port of SQLite), NOT a native SQLite binding. The database is loaded entirely into memory on startup and saved to disk (`podium.db`) after every write operation. There is no ORM.
>
> With `DATA_BACKEND=split`, the app initializes PostgreSQL and MongoDB/Cosmos instead of SQLite. Users, friendship, and attendance are relational in PostgreSQL; theatres, shows, scrape runs, and change events are documents in NoSQL.
> 
> **Cloud Provider Quirks:**
> - **Supabase**: Requires the IPv4 **Transaction Pooler** connection string (`.pooler.supabase.com`) locally instead of the direct `db.*.supabase.co` string (which is IPv6-only and fails on Node/Windows).
> - **MongoDB Atlas**: Requires the `mongodb+srv://` connection string due to SNI proxying on modern clusters. Because Node.js on Windows often fails to resolve SRV records (`querySrv ECONNREFUSED`), local development supports setting `MONGODB_URI=memory` to bypass the network and spin up an automated local `mongodb-memory-server` instance.

---

## Server Architecture

### Entry Point: `server/src/index.ts`
- Loads env vars via `dotenv`
- Calls `initDb()` to initialize either SQLite or split PostgreSQL/NoSQL storage
- Calls `seedDatabase()` to populate data if the DB is empty. In production, it seeds real scraped performances from `theatre_shows.json` (or via the import script in split mode). In development, it populates demo data (generating mock performances and users across both SQLite and split Postgres/Mongo setups).
- Registers all route modules under `/api/*`
- Listens on `PORT` (default `3001`)

### Database and Repository Layer

`server/src/db.ts` owns SQLite fallback initialization and delegates split startup to `server/src/storage/splitDb.ts` when `DATA_BACKEND=split`.

New route code should use repositories instead of direct SQL:

| File | Responsibility |
|---|---|
| `repositories/socialRepository.ts` | Users, auth lookup, friendships, attendance rows, feed attendance base rows |
| `repositories/catalogRepository.ts` | Theatres, shows, genres, performance detail, profile-attending composition, feed composition |
| `storage/splitDb.ts` | PostgreSQL pool, Mongo/Cosmos client, split-store schema/index creation |
| `storage/config.ts` | Backend selection and connection-string env parsing |

SQLite fallback still exposes these helpers for local mode and SQLite-only scripts:

| Function | Description |
|---|---|
| `initDb()` | Loads `podium.db` from disk (or creates new), runs `CREATE TABLE IF NOT EXISTS`, applies additive schema migrations/backfills, creates indexes, saves |
| `queryAll(sql, params)` | Runs SELECT and returns all rows as `object[]` |
| `queryOne(sql, params)` | Runs `queryAll` and returns first row or `null` |
| `runSql(sql, params)` | Runs INSERT/UPDATE/DELETE, calls `saveDb()` after every mutation, returns `last_insert_rowid` |
| `saveDb()` | Exports db to Buffer and writes to `podium.db` |
| `getDb()` | Returns raw db instance (rarely used directly) |

### SQLite Fallback Schema

```
users
  id INTEGER PRIMARY KEY AUTOINCREMENT
  email TEXT UNIQUE NOT NULL
  password_hash TEXT NOT NULL
  name TEXT NOT NULL
  avatar TEXT DEFAULT ''
  bio TEXT DEFAULT ''
  city TEXT DEFAULT ''
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

theatres
  id INTEGER PRIMARY KEY AUTOINCREMENT
  stable_id TEXT                         # hash(name + city), API-facing ID
  osm_id TEXT DEFAULT ''                 # external OpenStreetMap ID when known
  name TEXT NOT NULL
  city TEXT NOT NULL
  address TEXT NOT NULL
  province TEXT NOT NULL
  image_url TEXT DEFAULT ''
  website TEXT DEFAULT ''
  description TEXT DEFAULT ''
  latitude REAL
  longitude REAL

performances
  id INTEGER PRIMARY KEY AUTOINCREMENT
  show_id TEXT                           # stable API-facing show occurrence ID
  title TEXT NOT NULL
  description TEXT DEFAULT ''
  genre TEXT DEFAULT ''
  date_time DATETIME NOT NULL
  theatre_id INTEGER NOT NULL → theatres(id) ON DELETE CASCADE
  ticket_url TEXT DEFAULT ''
  image_url TEXT DEFAULT ''
  source_event_id TEXT DEFAULT ''
  source_url TEXT DEFAULT ''
  content_hash TEXT DEFAULT ''
  status TEXT DEFAULT 'active'           # active | changed | removed | cancelled
  removed INTEGER DEFAULT 0
  removed_when DATETIME
  changed_at DATETIME
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
  last_seen_at DATETIME
  missing_since DATETIME
  missing_count INTEGER DEFAULT 0

attendance
  id INTEGER PRIMARY KEY AUTOINCREMENT
  user_id INTEGER NOT NULL → users(id) ON DELETE CASCADE
  performance_id INTEGER NOT NULL → performances(id) ON DELETE CASCADE
  show_id TEXT                           # copy of performances.show_id
  title_snapshot TEXT DEFAULT ''
  date_time_snapshot DATETIME
  theatre_name_snapshot TEXT DEFAULT ''
  theatre_city_snapshot TEXT DEFAULT ''
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  UNIQUE(user_id, performance_id)

friend_requests
  id INTEGER PRIMARY KEY AUTOINCREMENT
  from_user_id INTEGER NOT NULL → users(id) ON DELETE CASCADE
  to_user_id INTEGER NOT NULL → users(id) ON DELETE CASCADE
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected'))
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  UNIQUE(from_user_id, to_user_id)
```

Indexes: `theatres(stable_id)`, `theatres(osm_id)`, `performances(theatre_id)`, `performances(date_time)`, `performances(show_id)`, `performances(removed)`, `performances(status)`, `attendance(user_id)`, `attendance(performance_id)`, `attendance(show_id)`, `friend_requests(from_user_id)`, `friend_requests(to_user_id)`.

### Split Production Schema

PostgreSQL tables:

```
users
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
  email TEXT UNIQUE NOT NULL
  password_hash TEXT NOT NULL
  name TEXT NOT NULL
  avatar TEXT DEFAULT ''
  bio TEXT DEFAULT ''
  city TEXT DEFAULT ''
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP

attendance
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
  user_id INTEGER NOT NULL → users(id) ON DELETE CASCADE
  performance_id INTEGER                     # legacy numeric ID when migrated from SQLite
  show_id TEXT NOT NULL                      # NoSQL show document ID
  title_snapshot TEXT DEFAULT ''
  date_time_snapshot TIMESTAMPTZ
  theatre_name_snapshot TEXT DEFAULT ''
  theatre_city_snapshot TEXT DEFAULT ''
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  UNIQUE(user_id, show_id)

friend_requests
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
  from_user_id INTEGER NOT NULL → users(id) ON DELETE CASCADE
  to_user_id INTEGER NOT NULL → users(id) ON DELETE CASCADE
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected'))
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  UNIQUE(from_user_id, to_user_id)
```

NoSQL collections:

```
theatres
  _id / id / stable_id
  numeric_id?            # legacy SQLite id after migration
  osm_id
  name, city, address, province
  image_url, website, description
  latitude, longitude

shows
  _id / id / show_id
  numeric_id?            # legacy SQLite performance id after migration
  title, description, genre, date_time
  theatre_id             # theatre stable_id
  theatre_numeric_id?
  theatre_name, theatre_city, theatre_address, theatre_province
  ticket_url, image_url
  source_event_id, source_url, content_hash
  status, removed, removed_when, changed_at
  first_seen_at, last_seen_at, missing_since, missing_count

scrape_runs
  started_at, finished_at, counters

show_change_events
  show_id, type, previous_content_hash?, content_hash?, created_at
```

### Scraped Data Identity and Lifecycle

Scraped theatre/show rows are modeled like documents in both backends:

- Theatre public IDs are `stable_id = hash(normalized name + normalized city)`.
- `osm_id` is retained as external metadata and matching help, not as the only primary key.
- Show public IDs are `show_id`, built in this order:
  1. `theatre_stable_id + source_event_id` when a ticket/site event ID is available.
  2. `theatre_stable_id + canonical source_url` when the source URL is show-specific.
  3. `theatre_stable_id + normalized title + date_time` as fallback.
- `content_hash` detects meaningful scraped changes. Ticket URL churn is not part of the fingerprint.
- Missing scraped shows are not deleted. The importer increments `missing_count`, sets `missing_since`, and only sets `removed = 1`, `status = 'removed'`, and `removed_when` after the configured missing threshold.
- Public agenda/theatre/feed queries hide removed shows. User profile attendance keeps showing selected shows, using attendance snapshots as fallback display data.

### Scraper Import Flow

`scripts/scrape-shows.js` writes raw scraped events to `Podium App/server/theatre_shows.json`.

`scripts/import-shows.js` reads that file and performs the lifecycle update:

- In SQLite mode, ensures scrape-related columns/indexes exist and writes to `performances`.
- In split mode, writes theatres/shows to MongoDB/Cosmos collections.
- Backfills or upserts theatre `stable_id`/`osm_id`.
- Upserts performances by `show_id`.
- Resets `removed`, `removed_when`, `missing_since`, and `missing_count` when a show reappears.
- Marks changed rows with `status = 'changed'` and `changed_at`.
- Soft-removes missing future shows after `--missing-threshold=N` misses; default is `2`.

`scripts/migrate-sqlite-to-split.js` migrates the current SQLite data to split stores:

- PostgreSQL: `users`, `friend_requests`, `attendance`.
- NoSQL: `theatres`, `shows`.
- Preserves legacy numeric IDs as `numeric_id`/`performance_id` where useful.
- Supports `--dry-run`.

Useful commands:

```powershell
node scripts\import-shows.js --dry-run
node scripts\import-shows.js --missing-threshold=1
node scripts\migrate-sqlite-to-split.js --dry-run
```

### Authentication Middleware: `server/src/middleware/auth.ts`

Two middleware functions:
- **`authenticateToken`** — required auth. Reads `Authorization: Bearer <token>`, verifies with `JWT_SECRET`. Sets `req.user = { id, email, name }`. Returns 401/403 on failure.
- **`optionalAuth`** — optional auth. Does the same but calls `next()` regardless; `req.user` may be undefined.

JWT tokens expire in **7 days**.

### API Routes

All routes are mounted under `/api`:

| Mount | File | Auth |
|---|---|---|
| `/api/auth` | `routes/auth.ts` | mixed |
| `/api/users` | `routes/users.ts` | mixed |
| `/api/theatres` | `routes/theatres.ts` | public |
| `/api/performances` | `routes/performances.ts` | mixed |
| `/api/attendance` | `routes/attendance.ts` | required |
| `/api/connections` | `routes/connections.ts` | mixed |
| `/api/feed` | `routes/feed.ts` | required |
| `/api/health` | inline | public |

#### `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signup` | none | Register new user, returns JWT + user |
| POST | `/login` | none | Login, returns JWT + user |
| GET | `/me` | required | Returns current user from token |

#### `/api/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/:id` | optional | Get user profile (with friend/attendance counts) |
| PUT | `/:id` | required | Update user profile (name, bio, city, avatar) |
| GET | `/:id/attending` | optional | Get performances user is attending, including removed/changed saved shows with attendance snapshots |
| GET | `/search?q=` | optional | Search users by name |

#### `/api/theatres`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | none | List all theatres (supports `?city=`, `?province=`, `?q=`); returns stable public IDs |
| GET | `/:id` | none | Get theatre + active upcoming performances; accepts numeric ID or `stable_id` |

#### `/api/performances`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | optional | List active, non-removed performances (supports `?genre=`, `?theatre_id=`, `?city=`, `?province=`, `?date_from=`, `?date_to=`, `?q=`, `?page=`, `?limit=`) |
| GET | `/genres` | none | List distinct genres from active, non-removed performances |
| GET | `/:id` | optional | Get performance detail + attendees; accepts numeric ID or `show_id` |

#### `/api/attendance`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | required | Mark current user as attending `{ performance_id }` or `{ show_id }`; stores `show_id` and display snapshots |
| DELETE | `/:performanceId` | required | Remove attendance by numeric ID or `show_id` |

#### `/api/connections`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/:userId/request` | required | Send friend request |
| PUT | `/:requestId/accept` | required | Accept incoming request |
| PUT | `/:requestId/reject` | required | Reject incoming request |
| DELETE | `/:userId/unfriend` | required | Remove friendship |
| GET | `/requests` | required | Get incoming + outgoing pending requests |
| GET | `/:userId/friends` | public | Get user's accepted friends |
| GET | `/:userId/status` | required | Get connection status with current user |

#### `/api/feed`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | required | Paginated (`?page=`, `?limit=`) attendance activity from accepted friends; removed shows are hidden |

---

## Client Architecture

### Entry Point: `client/src/main.tsx`
Bootstraps React into `#root`, wraps the app in `MantineProvider`.

### App Root: `client/src/App.tsx`
- Wraps everything in `<AuthProvider>` then `<BrowserRouter>`
- Renders `<Header />` globally
- Declares all routes

### Routing Table

| Path | Component | Notes |
|---|---|---|
| `/` | `HomePage` | Landing/home |
| `/login` | `LoginPage` | Login form |
| `/registreren` | `SignupPage` | Registration form |
| `/theaters` | `TheatresPage` | Theatre list |
| `/theater/:id` | `TheatreDetailPage` | Theatre + performances |
| `/agenda` | `AgendaPage` | All upcoming performances |
| `/voorstelling/:id` | `PerformanceDetailPage` | Performance detail + attendees |
| `/profiel/:id` | `ProfilePage` | User profile |
| `/profiel/:id/bewerken` | `EditProfilePage` | Edit own profile |
| `/vrienden` | `FeedPage` | Social activity feed |
| `/feed` | redirect → `/vrienden` | Legacy redirect |
| `/vriendschapsverzoeken` | `FriendRequestsPage` | Friend request management |
| `/zoeken` | `SearchPage` | User search |

### Auth Context: `client/src/context/AuthContext.tsx`

Global auth state via React Context. Provides:
- `user: User | null` — currently logged-in user
- `loading: boolean` — initial auth check in progress
- `login(email, password)` — calls API, stores JWT in `localStorage` as `podium_token`
- `signup(email, password, name)` — calls API, stores JWT
- `logout()` — clears token from `localStorage`, nulls user
- `updateUser(updatedUser)` — updates local user state without API call

On mount, reads `podium_token` from `localStorage` and validates it via `GET /api/auth/me`.

### API Service Layer: `client/src/services/api.ts`
Single file exporting domain-namespaced API objects:
- `authApi` — signup, login, me
- `usersApi` — getProfile, updateProfile, getAttending, search
- `theatresApi` — getAll, getById
- `performancesApi` — getAll, getById, getGenres
- `attendanceApi` — markAttending, removeAttending
- `connectionsApi` — sendRequest, acceptRequest, rejectRequest, unfriend, getRequests, getFriends, getStatus
- `feedApi` — getFeed

All calls target `http://localhost:3001/api`. Auth token is read from `localStorage` and injected as `Authorization: Bearer <token>` on every request.

### Shared Types: `client/src/types.ts`
| Type | Key fields |
|---|---|
| `User` | id, email?, name, avatar?, bio?, city?, friendCount?, upcomingCount? |
| `Theatre` | id, numeric_id?, stable_id?, osm_id?, name, city, address, province, image_url?, website?, latitude?, longitude? |
| `Performance` | id, numeric_id?, show_id?, title, genre?, date_time, theatre_id, theatre_numeric_id?, status?, removed?, removed_when?, changed_at?, is_attending?, attendee_count? |
| `FriendRequest` | extends User + request_id, created_at |
| `ConnectionStatus` | status ('self'\|'none'\|'pending'\|'accepted'\|'rejected'\|'unknown'), requestId?, direction? |
| `FeedItem` | activity_date, user_id/name/avatar, performance_id/title/date/genre, theatre_id/name/city |

### Layout: `client/src/components/Layout/Header.tsx`
Fixed glassmorphism header (72px height, `position: fixed`). Features:
- Brand logo linking to `/`
- Nav items: Home, Theaters, Agenda (always visible), + Vrienden, Verzoeken (when logged in)
- Friend request badge counter refreshed on mount and on route change
- Listens to custom window event `podium:friend-requests-updated` to re-fetch count
- Responsive: collapses to hamburger/Drawer on mobile (`hiddenFrom="md"`)
- Logout clears auth and navigates to `/`

### Theme: `client/src/theme.ts`
Mantine theme configuration (dark theme). Primary colors: `gold` and `wine`.

---

## Key Conventions

1. **All API routes are prefixed `/api`**. The health check is at `/api/health`.
2. **Authentication is JWT-based**, stored client-side in `localStorage` under the key `podium_token`. Tokens expire in 7 days.
3. **No ORM** — SQLite uses raw SQL helpers; split mode uses `pg` and the official MongoDB driver through repositories.
4. **New route code should use repositories** — avoid adding direct `queryAll`/`queryOne` calls in routes unless the code is explicitly SQLite-only tooling.
5. **Friendship is bidirectional** — the `friend_requests` table stores one row per pair. When querying friends, both `from_user_id` and `to_user_id` directions must be checked.
6. **Public theatre/show IDs are stable strings** — APIs expose `theatres.stable_id` and `performances.show_id` as `id` where available. Numeric IDs remain internal/backward-compatible.
7. **Scraped shows are soft-removed, not deleted** — agenda/theatre/feed queries hide `removed = 1`; profile attendance keeps showing saved shows with warnings.
8. **Attendance stores snapshots** — each attendance row stores `show_id`, title/date/theatre snapshots, and still references the relational `performance_id`.
9. **No test suite exists** — there are no automated tests.
10. **Server errors return `{ error: "..." }` JSON** with appropriate HTTP status codes.
11. **The app is in Dutch** — all UI strings, route names (e.g. `/theaters`, `/vrienden`, `/registreren`), and error messages are in Dutch.
12. **Client runs on port 5173** (Vite default), **server runs on port 3001**.
13. **The `prisma/` directory in the server is empty** — Prisma is not in use.
14. **Custom browser events**: `podium:friend-requests-updated` is dispatched to notify the Header to refresh its badge count.

---

## Dev Commands

### Server
```powershell
cd "Podium App/server"
npm run dev   # tsx watch src/index.ts — hot reload
npm run build # tsc
npm start     # node dist/index.js
```

### Client
```powershell
cd "Podium App/client"
npm run dev   # vite
npm run build # tsc && vite build
```

### Scraper and Importer
```powershell
npm run update-theatres
npm run scrape-shows
npm run import-shows
npm run migrate-sqlite-to-split -- --dry-run
npm run migrate-sqlite-to-split
node scripts\import-shows.js --dry-run
node scripts\import-shows.js --missing-threshold=1
```

### Environment
Server requires `.env` with at minimum:
```
JWT_SECRET=<secret>
PORT=3001   # optional, defaults to 3001
```

SQLite fallback:

```
DB_PATH=<persistent sqlite file path>
```

Split backend:

```
DATA_BACKEND=split
DATABASE_URL=<postgres connection string>
MONGODB_URI=<mongodb/cosmos mongo connection string, OR 'memory' for local dev>
NOSQL_DB_NAME=podium
POSTGRES_SSL=true   # only when required by the provider (e.g. Supabase)
```

> [!TIP]
> If your local network or Windows DNS blocks `mongodb+srv://` lookups, set `MONGODB_URI=memory`. The server will automatically install and run an isolated in-memory MongoDB instance for local testing without requiring Atlas.
