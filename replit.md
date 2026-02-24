# Voice Atlas - Application Portal

## Overview

Voice Atlas is a voice talent onboarding/application platform. Users fill out a 19-step application form providing demographics, language proficiency, location data, and voice recordings. The app collects these applications and stores them in a PostgreSQL database with audio files in Replit Object Storage. The frontend is a React SPA with an animated multi-step onboarding flow, and the backend is an Express API server. An admin dashboard at `/admin` allows reviewing all applications and playing back audio recordings.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The project uses a three-folder monorepo pattern:
- **`client/`** — React frontend (SPA)
- **`server/`** — Express backend (API)
- **`shared/`** — Shared code (database schema, types, validation) used by both client and server

### Frontend (`client/`)
- **Framework**: React with TypeScript
- **Bundler**: Vite (config in `vite.config.ts`)
- **Routing**: Wouter (lightweight client-side router)
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives, stored in `client/src/components/ui/`
- **State/Data Fetching**: TanStack React Query for server state management
- **Animations**: Framer Motion for page transitions in the onboarding flow
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`, `@assets/` maps to `attached_assets/`

### Backend (`server/`)
- **Framework**: Express 5 running on Node.js with TypeScript (via tsx)
- **API Pattern**: RESTful JSON API under `/api/` prefix
- **Routes**:
  - `POST /api/applications` — Create a new application (validated with Zod)
  - `GET /api/applications` — List all applications
  - `GET /api/applications/:id` — Get a single application by ID
  - `POST /api/uploads/request-url` — Get presigned URL for object storage upload
  - `GET /objects/*` — Serve uploaded files from object storage
- **Storage Layer**: `server/storage.ts` defines an `IStorage` interface with a `DatabaseStorage` implementation using Drizzle ORM
- **Dev Server**: Vite dev server is integrated as middleware in development mode (`server/vite.ts`)
- **Static Serving**: In production, serves built client files from `dist/public/` with SPA fallback (`server/static.ts`)

### Database
- **Database**: PostgreSQL (required via `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-zod` for schema-to-validation integration
- **Schema Location**: `shared/schema.ts`
- **Tables**:
  - `applications` — id (UUID), firstName, lastName, primaryLanguage, otherLanguages (text array), referralSource, ethnicity, gender, occupation, dateOfBirth, educationLevel, educationInLanguage, accentDescription, accentOrigin, locale, birthplace, birthplaceYears, currentAddress, currentAddressLine2, currentAddressYears, sampleAudioPath, languageAudioPath, createdAt
  - `users` — id (UUID), username (unique), password (for future auth)
- **Migrations**: Drizzle Kit with `drizzle-kit push` command (schema push approach, no migration files needed)

### Build System
- **Dev**: `npm run dev` runs the server with tsx which integrates Vite for HMR
- **Build**: `npm run build` runs a custom build script (`script/build.ts`) that:
  1. Builds the client with Vite (output to `dist/public/`)
  2. Bundles the server with esbuild (output to `dist/index.cjs`)
- **Production**: `npm start` runs the bundled server from `dist/index.cjs`
- **DB Push**: `npm run db:push` pushes schema changes to the database

### Validation
- Zod schemas are auto-generated from Drizzle table definitions using `drizzle-zod`
- The `insertApplicationSchema` omits `id` and `createdAt` (server-generated fields)
- Request validation happens in route handlers using `.safeParse()`

## External Dependencies

### Required Services
- **PostgreSQL Database**: Must be provisioned and accessible via `DATABASE_URL` environment variable. Used for storing applications and user data.

### Key NPM Packages
- **drizzle-orm** + **drizzle-kit**: Database ORM and migration tooling
- **pg**: PostgreSQL client driver
- **express**: HTTP server framework (v5)
- **zod** + **drizzle-zod**: Schema validation
- **@tanstack/react-query**: Client-side data fetching/caching
- **framer-motion**: Animation library for the onboarding flow
- **shadcn/ui ecosystem**: Radix UI primitives, class-variance-authority, clsx, tailwind-merge
- **connect-pg-simple**: PostgreSQL session store (available but not yet wired up)
- **wouter**: Client-side routing

### Replit-Specific Plugins
- `@replit/vite-plugin-runtime-error-modal`: Runtime error overlay in dev
- `@replit/vite-plugin-cartographer`: Dev tooling (dev only)
- `@replit/vite-plugin-dev-banner`: Dev banner (dev only)