# Podium App — Architecture Reference

> **Purpose**: This document is the canonical architecture reference for the Podium App codebase. It is intended to be consumed by AI agents and developers to understand the system before making any changes.

---

## Overview

**Podium** is a Dutch-language social platform for theatre enthusiasts. Users can discover theatres and upcoming performances, mark attendance, manage a social friend network, and view a social activity feed of their friends' attendance.

The application follows a classic **client/server monorepo structure** with two independently-runnable packages:

```
c:\Code\CodeClan\
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
| Database | **SQLite via sql.js** (in-memory, persisted to `podium.db`) |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| Environment | `dotenv` |

> [!IMPORTANT]
> The database is **sql.js** (a WebAssembly port of SQLite), NOT a native SQLite binding. The database is loaded entirely into memory on startup and saved to disk (`podium.db`) after every write operation. There is no ORM — all queries are raw SQL.

---

## Server Architecture

### Entry Point: `server/src/index.ts`
- Loads env vars via `dotenv`
- Calls `initDb()` to load/create the SQLite file
- Calls `seedDatabase()` to populate initial data if needed
- Registers all route modules under `/api/*`
- Listens on `PORT` (default `3001`)

### Database Layer: `server/src/db.ts`
All database access goes through four exported helper functions:

| Function | Description |
|---|---|
| `initDb()` | Loads `podium.db` from disk (or creates new), runs `CREATE TABLE IF NOT EXISTS` for all tables, creates indexes, saves |
| `queryAll(sql, params)` | Runs SELECT and returns all rows as `object[]` |
| `queryOne(sql, params)` | Runs `queryAll` and returns first row or `null` |
| `runSql(sql, params)` | Runs INSERT/UPDATE/DELETE, calls `saveDb()` after every mutation, returns `last_insert_rowid` |
| `saveDb()` | Exports db to Buffer and writes to `podium.db` |
| `getDb()` | Returns raw db instance (rarely used directly) |

### Database Schema

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
  title TEXT NOT NULL
  description TEXT DEFAULT ''
  genre TEXT DEFAULT ''
  date_time DATETIME NOT NULL
  theatre_id INTEGER NOT NULL → theatres(id) ON DELETE CASCADE
  ticket_url TEXT DEFAULT ''
  image_url TEXT DEFAULT ''

attendance
  id INTEGER PRIMARY KEY AUTOINCREMENT
  user_id INTEGER NOT NULL → users(id) ON DELETE CASCADE
  performance_id INTEGER NOT NULL → performances(id) ON DELETE CASCADE
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

Indexes: `performances(theatre_id)`, `performances(date_time)`, `attendance(user_id)`, `attendance(performance_id)`, `friend_requests(from_user_id)`, `friend_requests(to_user_id)`.

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
| GET | `/:id/attending` | optional | Get performances user is attending |
| GET | `/search?q=` | optional | Search users by name |

#### `/api/theatres`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | none | List all theatres (supports `?city=`, `?province=`) |
| GET | `/:id` | none | Get theatre + its upcoming performances |

#### `/api/performances`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | optional | List performances (supports `?genre=`, `?theatre_id=`, `?upcoming=true`, `?limit=`) |
| GET | `/genres` | none | List distinct genres |
| GET | `/:id` | optional | Get performance detail + attendees |

#### `/api/attendance`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | required | Mark current user as attending `{ performance_id }` |
| DELETE | `/:performanceId` | required | Remove attendance |

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
| GET | `/` | required | Paginated (`?page=`, `?limit=`) attendance activity from accepted friends |

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
| `Theatre` | id, name, city, address, province, image_url?, website?, latitude?, longitude? |
| `Performance` | id, title, genre?, date_time, theatre_id, is_attending?, attendee_count? |
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
3. **No ORM** — all database access is raw SQL via the four helper functions in `db.ts` (`queryAll`, `queryOne`, `runSql`, `saveDb`).
4. **Every write to the database calls `saveDb()`** automatically via `runSql`. Manual calls to `saveDb()` are only needed for batch operations.
5. **Friendship is bidirectional** — the `friend_requests` table stores one row per pair. When querying friends, both `from_user_id` and `to_user_id` directions must be checked.
6. **No test suite exists** — there are no automated tests.
7. **Server errors return `{ error: "..." }` JSON** with appropriate HTTP status codes.
8. **The app is in Dutch** — all UI strings, route names (e.g. `/theaters`, `/vrienden`, `/registreren`), and error messages are in Dutch.
9. **Client runs on port 5173** (Vite default), **server runs on port 3001**.
10. **The `prisma/` directory in the server is empty** — Prisma is not in use; sql.js is used instead.
11. **Custom browser events**: `podium:friend-requests-updated` is dispatched to notify the Header to refresh its badge count.

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

### Environment
Server requires `.env` with at minimum:
```
JWT_SECRET=<secret>
PORT=3001   # optional, defaults to 3001
```
