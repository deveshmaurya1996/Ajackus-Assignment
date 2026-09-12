# Code Review — TaskBoard

Prioritized by business impact. Line numbers refer to the template as of the initial clone (`master` @ `5ae6587`).

---

## 1. Critical — IDOR on `PATCH /api/tasks/:id` (no membership / role check)

| | |
|---|---|
| **File** | `backend/projects/views.py` — `TaskDetailView.patch` (~165–185) |
| **Category** | Security |
| **Severity** | Critical |

`PATCH /api/tasks/:id` loads a task by UUID and mutates title/description/status/assignee with **no** membership check and **no** role check. The sibling `delete` method on the same view correctly requires membership and `_can_edit_tasks`. Any authenticated user (including a non-member or a viewer) who knows a task id can rewrite work across projects.

**Recommended fix:** Mirror `delete`: resolve membership on `task.project_id`, require `_can_edit_tasks`, return 403 otherwise.

### Proof (running app)

Non-member `lina@example.com` (member of Onboarding only) successfully mutated a **Q3 Launch** task owned by Meera:

```bash
# Login as Meera, resolve Q3 Launch task id, then:
curl -s -X PATCH http://localhost:8000/api/tasks/e91bac59-a0c2-42bd-ba55-5bd512fc8659 \
  -H "Authorization: Bearer <lina_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"HACKED BY NON-MEMBER","status":"done"}'
```

**Response (HTTP 200) — bug in action:**

```json
{"task":{"id":"e91bac59-a0c2-42bd-ba55-5bd512fc8659","project_id":"97c6468a-e36b-4d9a-9ff4-19d528dc971b","title":"HACKED BY NON-MEMBER","description":"Detail for: Finalize launch date with marketing","status":"done","assignee_id":"1873a1b9-e666-434d-aaa0-63c04e20bc30","created_by_id":"1873a1b9-e666-434d-aaa0-63c04e20bc30","position":0,"created_at":"2026-09-12T14:19:33.768576Z","updated_at":"2026-09-12T14:20:06.700939Z","assignee":{"id":"1873a1b9-e666-434d-aaa0-63c04e20bc30","email":"meera@taskboard.dev","name":"Meera Iyer"}}}
```

Expected after fix: HTTP 403 `{"error":"forbidden"}`.

---

## 2. Critical — SQL injection in task search (`?q=`)

| | |
|---|---|
| **File** | `backend/projects/views.py` — `TaskListCreateView.get` (~110–120) |
| **Category** | Security |
| **Severity** | Critical |

When `q` is present, the handler builds SQL with an f-string and `cursor.execute(sql)`, interpolating both `project_id` and `q`. Any project member can inject via the search box / query string. The non-search path correctly uses the ORM.

**Recommended fix:** Drop raw SQL; filter with `Q(title__icontains=q) | Q(description__icontains=q)`. If raw SQL is required, use parameterized queries only.

---

## 3. High — Assignee UI/API contract mismatch clears assignees on save

| | |
|---|---|
| **Files** | `backend/projects/serializers.py` (`assignee_id`, snake_case) · `frontend/src/types/index.ts` (`assigneeId`) · `frontend/src/components/TaskDetail.tsx` (~19, ~51) |
| **Category** | Data Integrity |
| **Severity** | High |

The API returns snake_case (`assignee_id`); the React types and edit modal expect camelCase (`assigneeId`). The assignee `<select>` initializes from `task.assigneeId`, which is always `undefined`, so the UI shows “unassigned” even when nested `assignee` is set. Saving then often sends `assigneeId: null` and **wipes** a real assignee. This is unrelated to Meera’s admin role — it affects every editor.

**Recommended fix:** Emit camelCase from serializers (or a single response transform), **or** map `assignee_id` → `assigneeId` (and peers) in the client. Prefer one contract end-to-end.

---

## 4. High — Weak default JWT secret + 30-day access tokens

| | |
|---|---|
| **File** | `backend/taskboard/settings.py` (~7, ~51–54); `.env.example` |
| **Category** | Security |
| **Severity** | High |

`SECRET_KEY` defaults to a predictable string (`dev-secret-change-me-in-production`). SimpleJWT signs access tokens with that key, and access lifetime is **30 days** with no refresh/rotation. Anyone who knows the shipped default can forge tokens for arbitrary user ids.

**Recommended fix:** Fail boot if the default secret is used outside local/dev; shorten access lifetime; issue refresh tokens with rotation/blacklist for production.
