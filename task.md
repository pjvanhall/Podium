# Podium App — Build Tasks

Last updated: June 5, 2026

## Phase 1: Backend Foundation
- [x] Initialize Node.js project in `server/`
- [x] Convert backend source to TypeScript
- [x] Set up Express server with middleware
- [x] Configure local SQL database with `sql.js` and `server/podium.db`
- [x] Define database schema (`User`, `Theatre`, `Performance`, `Attendance`, `FriendRequest`)
- [x] Create auth routes (`signup`, `login`, `me`)
- [x] Create auth middleware (JWT verification and optional auth)
- [x] Create user routes
- [x] Create theatre routes
- [x] Create performance routes
- [x] Create attendance routes
- [x] Create connection routes (friend requests)
- [x] Create feed route
- [x] Seed database with Dutch theatres, performances, demo users, friendships, and attendance
- [ ] Add automated backend/API tests

Notes:
- Prisma was planned originally but is not used in the current implementation.
- Current seeded DB contents: 5 users, 15 theatres, 60 performances, 15 attendance records, 4 friend request records.

## Phase 2: Frontend Foundation
- [x] Initialize React + Vite + TypeScript project in `client/`
- [x] Convert frontend source to TypeScript
- [x] Migrate UI to Mantine component library
- [x] Set up Podium theme (typography, colors, component styling)
- [x] Create responsive header layout component
- [ ] Create footer layout component, if still wanted
- [x] Set up React Router with implemented pages
- [x] Create Auth context (login state management)
- [x] Create API service layer
- [x] Fix frontend import paths so production build works

## Phase 3: Auth Pages
- [x] Login page
- [x] Signup page
- [x] Profile page
- [x] Edit profile page

## Phase 4: Theatre & Performance Pages
- [x] Theatres listing page
- [x] Theatre detail page
- [x] Performance agenda page
- [x] Performance detail page
- [ ] Add true calendar grid view, if still wanted
- [ ] Add frontend date-range and theatre filters to agenda

## Phase 5: Social Features
- [x] Attendance (mark/unmark "Ik ga")
- [x] Friend requests (send/accept/reject)
- [x] Friend request inbox page
- [x] Send friend requests from the friend request page
- [x] Friend lists on profiles
- [x] User search
- [x] Activity feed
- [x] Notification badge/count for pending friend requests

## Phase 6: Polish and Verification
- [x] Responsive design
- [x] Animations & transitions
- [x] Loading states and basic error handling
- [x] Frontend TypeScript + Vite production build passes with `npm run build`
- [x] Backend TypeScript build passes with `npm run build`
- [x] Local backend health check passes at `/api/health`
- [x] Local frontend responds on Vite dev server
- [ ] Full manual end-to-end QA
- [ ] Replace placeholder/seed imagery with real assets
- [x] Clean up unused starter Vite files (`main.ts`, `counter.ts`, `style.css`, starter assets)
- [ ] Production deployment configuration

## Implemented Frontend Routes
- [x] `/`
- [x] `/login`
- [x] `/registreren`
- [x] `/theaters`
- [x] `/theater/:id`
- [x] `/agenda`
- [x] `/voorstelling/:id`
- [x] `/profiel/:id`
- [x] `/profiel/:id/bewerken`
- [x] `/feed` redirects to `/vrienden`
- [x] `/vrienden`
- [x] `/zoeken`
- [x] `/vriendschapsverzoeken`

## Current Known Gaps
- [ ] No automated tests yet
- [ ] No broader notification system yet
- [ ] No real theatre-data integration or admin panel yet
- [ ] No production database/ORM migration yet
- [ ] No production deployment setup yet
