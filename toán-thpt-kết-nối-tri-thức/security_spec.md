# MathNova AI Firestore Security Specification

## Phase 0: Data Invariants & Access Model

### Collections & PII Isolation
1. `/users/{userId}` (`UserWorkspace`) — **Owner-Only Private Workspace**
   - Contains user email/identifier (PII), learning progress, AI tutor chat history, drawn 2D/3D shape history, and wrong-answer notebook.
   - `get`, `create`, `update`, `delete`: Strictly allowed ONLY when `request.auth != null && request.auth.uid == userId && isValidId(userId)`.
   - `list`: Explicitly denied (`if false;`) so no user can enumerate or scrape other students' private records or emails.
2. `/leaderboard/{userId}` (`LeaderboardProfile`) — **Public Zero-PII Ranking Document**
   - Contains ONLY public ranking fields: `uid`, `displayName`, `avatar`, `grade`, `xp`, `streak`, `createdAt`, `updatedAt`.
   - Zero PII (`email`, `chatHistory`, `wrongNotebook` are never stored or permitted here).
   - `get`, `list`: Allowed for public viewing so guests and logged-in students see real registered learners on the Leaderboard. `list` queries are bounded via `request.query.limit == null || request.query.limit <= 100`.
   - `create`, `update`: Strictly owner-only (`request.auth != null && request.auth.uid == userId`) with server timestamp checks (`createdAt == request.time`, `updatedAt == request.time`), immutable `uid`/`createdAt` on update, and field/type/range checks (`xp >= 0 && xp <= 10000000`, `streak >= 0 && streak <= 36500`, `grade in ['10', '11', '12', 'thpt']`).
   - `delete`: Owner-only (`isSignedIn() && isOwner(userId)`).
3. `/test/connection` — **Startup Connectivity Probe**
   - Read-only `get: if true;` for `getDocFromServer(doc(db, 'test', 'connection'))` connectivity check; `list, write: if false;`.

### Dirty Dozen Adversarial Payloads (Verified Denied)
1. Unauthenticated `create`/`update`/`delete` on `/leaderboard/{userId}` or `/users/{userId}`.
2. Cross-user write (`uidA` attempting to overwrite `/leaderboard/uidB` or `/users/uidB`).
3. Cross-user read or `list` on `/users`.
4. Injecting PII (`email`, `phone`) into `/leaderboard/{userId}` (`keys().hasOnly(...)` blocks extra fields).
5. Forged negative or astronomical XP/streak (`xp: -500`, `xp: 999999999`, `streak: -1`).
6. Invalid grade enum (`grade: "99"`) or oversized `displayName` (`> 60` chars) or empty `displayName`.
7. Spoofed `uid` mismatch (`request.resource.data.uid != userId`).
8. Backdated/spoofed `createdAt` or `updatedAt` timestamps (`!= request.time`).
9. Mutating immutable `uid` or `createdAt` on update.
10. Oversized arrays in `/users/{userId}` (`chatHistory.size() > 60`, `drawnHistory.size() > 30`, `wrongNotebook.size() > 100`).
11. Malformed path ID (`userId` containing whitespace or exceeding 128 chars).
12. Unmatched subcollections or arbitrary root paths (blocked by global `match /{document=**} { allow read, write: if false; }`).
