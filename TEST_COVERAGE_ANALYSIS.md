# Test Coverage Analysis

**Date:** 2026-03-05
**Current Coverage:** 0% — No test framework, no test files, no test scripts.

---

## Priority 1 — Critical (Security & Data Integrity)

### 1. Authentication & Authorization Middleware (`server/auth.ts`)
- **What to test:** `requireAuth`, `requireApproved`, `requireAdmin` guards; bcrypt password hashing/comparison in Passport strategy; `userToSession` field mapping.
- **Why critical:** A regression exposes admin endpoints to unauthenticated users or lets unapproved users access paid features.
- **Test cases:**
  - Unauthenticated request → 401
  - Authenticated but unapproved user on `requireApproved` route → 403
  - Non-admin on `requireAdmin` route → 403
  - Valid credentials → login succeeds, session populated correctly
  - Invalid password → 401 with generic message (no username leakage)

### 2. Registration Flow (`server/routes.ts:20–108`)
- **What to test:** Blocked email rejection, duplicate username, referral code linking, automatic task session partner linking on registration.
- **Why critical:** Most complex single endpoint with ~5 branching paths, handles user creation and cross-entity updates.
- **Test cases:**
  - Blocked email → 403
  - Duplicate username → 409
  - Valid referral code → user linked + notification created for referrer
  - Invalid referral code → silently ignored
  - Pending partner task sessions updated on registration
  - Invalid body → 400 with Zod error

### 3. Admin Destructive Actions (`server/routes.ts:917–1006`)
- **What to test:** `approve` (triggers partner task session updates), `reject-retry` (deletes samples, resets user), `reject-block` (deletes user + blocks email).
- **Why critical:** Destructive, irreversible operations affecting user data.
- **Test cases:**
  - Approve user → `updateTaskSessionsForApprovedPartner` called, notifications sent
  - Reject-retry → onboarding samples deleted, `samplesCompletedAt` reset to null
  - Reject-block → user deleted, email added to block list
  - Non-admin access → 403
  - Non-existent user → 404

---

## Priority 2 — High (Core Business Logic)

### 4. Task Session State Machine (`server/routes.ts:648–875`)
- **What to test:** State transitions (`inviting_partner` → `waiting_approval` → `ready_to_record` → `room_created` → `in_progress` → `pending_review` → `completed`/`cancelled`), duplicate session prevention, dynamic partner status recomputation.
- **Test cases:**
  - Cannot create duplicate active session for same user+taskType
  - Existing active session returned instead of creating new one
  - GET dynamically recomputes partner status (registered but not linked → links partner)
  - Cancel blocked for `pending_review` and `completed` statuses
  - Only owner or partner can mark as complete
  - Access denied for non-owner on GET

### 5. Audio Processing Pipeline (`server/process-recording.ts`)
- **What to test:** `processRecording` folder-naming logic (sibling reuse, short-key resolution, sequential numbering), `processOnboardingSample` WebM→WAV conversion, temp file cleanup.
- **Test cases (with mocked S3/ffmpeg):**
  - Already-processed recording short-circuits and returns existing
  - Sibling folder reuse: second recording in same room uses same folder
  - Folder number increments correctly from max
  - Short keys from both participants included in folder name
  - Temp files cleaned up on success and on failure
  - ffmpeg error → meaningful error propagated

### 6. Room Invitation Flow (`server/routes.ts:505–598`)
- **What to test:** Authorization (only room creator can invite), validation (user exists, approved, not self), invitation acceptance triggers task session update.
- **Test cases:**
  - Non-creator → 403
  - Unregistered email → 404
  - Unapproved user → 400
  - Self-invite → 400
  - Accept → linked task sessions transition to `in_progress`
  - Decline → no state change

---

## Priority 3 — Medium (Utilities & Integrations)

### 7. Daily.co Utilities (`server/daily.ts`)
- **What to test:** `sanitizeRoomName` (pure function), `generateRoomName` format, `createDailyRoom`/`createMeetingToken` API calls.
- **Test cases:**
  - `sanitizeRoomName`: special characters stripped, consecutive dashes collapsed, leading/trailing dashes removed
  - `createDailyRoom`: correct API payload, error handling for non-OK responses
  - `createMeetingToken`: correct payload structure, token extracted from response

### 8. S3 Utilities (`server/s3.ts`)
- **What to test:** Correct bucket/key construction, signed URL generation, error propagation.
- **Test cases (mocked AWS SDK):**
  - `generateUploadUrl` uses correct ContentType and Metadata
  - `generateDownloadUrl` uses correct Key
  - `copyInS3` uses correct CopySource format (`bucket/key`)
  - `downloadFromS3` assembles stream chunks into Buffer

### 9. Zod Validation Schemas (`shared/schema.ts:335–368`)
- **What to test:** Input validation for all schemas.
- **Test cases:**
  - `loginSchema`: valid email required, password 6–100 chars
  - `onboardingSchema`: age 13–120, all required fields, gender enum
  - `createRoomSchema`: optional name, max 100 chars
  - `inviteToRoomSchema`: valid email required
  - `createTaskSessionSchema`: taskType required, partnerEmail optional but must be valid email

---

## Priority 4 — Medium (Frontend)

### 10. `ProtectedRoute` Component (`client/src/components/protected-route.tsx`)
- Loading state → spinner; unauthenticated → redirect to `/login`; authenticated → renders children.

### 11. `AuthProvider` / `useAuthContext` (`client/src/lib/auth-context.tsx`)
- Throws error when used outside provider.

### 12. Page-Level Integration Tests
- Login → onboarding → sample upload → dashboard flow
- Admin panel: approve user, reject+block user, manage task sessions

---

## Recommended Test Infrastructure

### Framework Setup
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom supertest @types/supertest jsdom
```

### Test Structure
```
server/__tests__/auth.test.ts                # Auth middleware unit tests
server/__tests__/routes-auth.test.ts         # Registration/login integration tests
server/__tests__/routes-tasks.test.ts        # Task session integration tests
server/__tests__/routes-admin.test.ts        # Admin endpoint integration tests
server/__tests__/process-recording.test.ts   # Audio pipeline tests
server/__tests__/daily.test.ts               # Daily.co utility tests
shared/__tests__/schema.test.ts              # Zod validation tests
client/src/__tests__/protected-route.test.tsx # Component tests
```

### Mock Strategy
- **`IStorage` interface** (`server/storage.ts:6–79`) is already well-defined — create an in-memory mock for route tests without needing a database.
- **S3/Daily.co** — mock at the module level with `vi.mock()`.
- **ffmpeg** — mock `child_process.spawn` for audio processing tests.

---

## Effort-to-Value Summary

| Area | Risk | Effort | Priority |
|------|------|--------|----------|
| Auth middleware | Critical | Low | **P1** |
| Registration flow | Critical | Medium | **P1** |
| Admin destructive actions | Critical | Medium | **P1** |
| Task session state machine | High | High | **P2** |
| Audio processing pipeline | High | Medium | **P2** |
| Room invitation flow | High | Medium | **P2** |
| Daily.co utilities | Medium | Low | **P3** |
| S3 utilities | Medium | Low | **P3** |
| Zod schemas | Medium | Very Low | **P3** |
| React components | Medium | Medium | **P4** |

### Quickest Wins
1. Zod schema tests — pure validation, trivial to write
2. `sanitizeRoomName` — pure function
3. Auth middleware — small surface, critical security value
4. Registration route — complex but highest-risk endpoint
