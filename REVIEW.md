# Code Review — TaskBoard

Prioritized by **business impact**. Line numbers refer to the template as of the initial clone (`master` @ `5ae6587`), unless noted.

---

## Top 4 — Critical

### 1. Critical — IDOR on `PATCH /api/tasks/:id` (no membership / role check)

| | |
|---|---|
| **File** | `backend/projects/views.py` — `TaskDetailView.patch` (~165–185) |
| **Category** | Security |
| **Severity** | Critical |

`PATCH /api/tasks/:id` loaded a task by UUID and mutated title/description/status/assignee with **no** membership check and **no** role check. The sibling `delete` method correctly required membership and `_can_edit_tasks`. Any authenticated user (non-member or viewer) who knew a task id could rewrite work across projects — full board takeover.

**Recommended fix:** Mirror `delete`: resolve membership on `task.project_id`, require `_can_edit_tasks`, return 403 otherwise.

**Part 2 status:** Fixed in commit `0a5a8bc` (tests + before/after curl).

#### Proof (running app — before fix)

Non-member `lina@example.com` (Onboarding only) mutated a **Q3 Launch** task:

```bash
curl -s -X PATCH http://localhost:8000/api/tasks/<task_id> \
  -H "Authorization: Bearer <lina_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"HACKED BY NON-MEMBER","status":"done"}'
```

**Response (HTTP 200) — bug in action:**

```json
{"task":{"id":"e91bac59-a0c2-42bd-ba55-5bd512fc8659","title":"HACKED BY NON-MEMBER","status":"done", ...}}
```

**After fix:** HTTP 403 `{"error":"forbidden"}`.

---

### 2. Critical — SQL injection in task search (`?q=`)

| | |
|---|---|
| **File** | `backend/projects/views.py` — `TaskListCreateView.get` (~110–120) |
| **Category** | Security |
| **Severity** | Critical |

When `q` was present, the handler built SQL with an f-string and `cursor.execute(sql)`, interpolating `project_id` and `q`. Any project member could inject via search and read or alter arbitrary data. The non-search path correctly used the ORM — classic planted asymmetry.

**Recommended fix:** Use ORM `Q(title__icontains=q) | Q(description__icontains=q)` (or parameterized SQL only). Always return `TaskSerializer` shape.

**Status:** Hardened to ORM filtering in the working tree (follow-up to Part 2).

---

### 3. Critical — Weak default JWT secret + 30-day access tokens

| | |
|---|---|
| **File** | `backend/taskboard/settings.py` (~7, ~51–54); `.env.example` |
| **Category** | Security |
| **Severity** | Critical |

`SECRET_KEY` defaults to a predictable string (`dev-secret-change-me-in-production`). SimpleJWT signs access tokens with that key, and access lifetime is **30 days** with no refresh/rotation/blacklist. Anyone who knows the shipped default can forge tokens for arbitrary `user_id` and fully impersonate any account.

**Recommended fix:** Fail boot if the default secret is used outside local/dev; require a strong `DJANGO_SECRET_KEY`; shorten access (e.g. 15m) + refresh tokens with rotation.

---

### 4. Critical — Deleting a user CASCADE-deletes every task they created

| | |
|---|---|
| **File** | `backend/projects/models.py` — `Task.created_by` (~51–55) |
| **Category** | Data Integrity |
| **Severity** | Critical |

`created_by` uses `on_delete=models.CASCADE`. Removing (or hard-deleting) a user permanently deletes **all tasks they created**, even if the project still exists and other members rely on that work. Combined with no soft-delete / trash, this is irreversible production data loss from a routine user offboarding.

**Recommended fix:** `PROTECT` or `SET_NULL` on `created_by` (and reconsider `Project.owner` CASCADE); prefer soft-delete / deactivate users.

---

## Additional issues (still important)

### 5. High — Assignee UI/API contract mismatch clears assignees on save

| | |
|---|---|
| **Files** | `backend/projects/serializers.py` (`assignee_id`) · `frontend/src/types/index.ts` (`assigneeId`) · `frontend/src/components/TaskDetail.tsx` |
| **Category** | Data Integrity |
| **Severity** | High |

API returns snake_case (`assignee_id`); UI expects camelCase (`assigneeId`). The edit modal initializes from `task.assigneeId` (always `undefined`), shows “unassigned”, and saving often sends `assigneeId: null`, wiping a real assignee. Not an admin-role bug.

**Recommended fix:** One contract end-to-end (camelCase serializers or client mapping). Client now falls back to `assignee_id` / nested `assignee.id`.

---

### 6. High — Stale JWT on login/register blocks authentication

| | |
|---|---|
| **Files** | `frontend/src/lib/api-client.ts` · login/register pages · SimpleJWT auth |
| **Category** | Architecture / Security |
| **Severity** | High |

`apiFetch` attached `Authorization: Bearer <token>` to **every** request, including `/api/auth/login`. After a DB re-seed, localStorage still held a JWT for a deleted user id. SimpleJWT authenticated the request first, failed with `user_not_found`, and returned **401 before** the `AllowAny` login handler ran — users could not sign in even with correct credentials.

**Proof:**

```bash
# Same body works without Authorization; fails with a stale Bearer token
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <stale_token>" \
  -d '{"email":"meera@taskboard.dev","password":"password123"}'
# → 401 {"detail":"User not found","code":"user_not_found"}
```

**Recommended / applied fix:** Do not send Authorization on login/register; clear session before auth attempts.

---

### 7. High — Unvalidated `assigneeId` (any user UUID)

| | |
|---|---|
| **File** | `backend/projects/views.py` — task create/patch |
| **Category** | Data Integrity |
| **Severity** | High |

Create/PATCH accepted any `assigneeId` without checking project membership (or valid FK), allowing outsiders to be assigned or causing IntegrityError 500s.

**Recommended fix:** Require `Membership` for that project (or null). Applied in working-tree hardening.

---

### 8. Medium — CORS allow-all + DEBUG / ALLOWED_HOSTS `*`

| | |
|---|---|
| **File** | `backend/taskboard/settings.py` (~8–9, ~56) |
| **Category** | Security |
| **Severity** | Medium–High |

`CORS_ALLOW_ALL_ORIGINS = True`, `ALLOWED_HOSTS = ['*']`, `DEBUG` defaults true. Any origin can call the API; combined with XSS or token theft, impact is full account use.

**Recommended fix:** Explicit `CORS_ALLOWED_ORIGINS`; lock hosts; `DEBUG=False` in prod.

---

### 9. Medium — Task `position` race on concurrent creates

| | |
|---|---|
| **File** | `backend/projects/views.py` — task create |
| **Category** | Data Integrity |
| **Severity** | Medium |

`order_by('-position').first()` then `+ 1` without `select_for_update` / unique constraint → duplicate positions under concurrent creates → broken column ordering.

**Recommended fix:** `transaction.atomic()` + `select_for_update()`, or unique `(project, status, position)` with retry.

---

### 10. Medium — PATCH could empty task/project names

| | |
|---|---|
| **File** | `backend/projects/views.py` |
| **Category** | Data Integrity |
| **Severity** | Medium |

Create required a non-empty title/name; PATCH originally did not, so clients could blank critical fields.

**Recommended fix:** Same validation on PATCH (applied in working-tree hardening).
