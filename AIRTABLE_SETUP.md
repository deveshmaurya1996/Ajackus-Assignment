# Airtable setup (Part 3c)

Do this once before clicking **export to Airtable** or calling `POST /api/projects/:id/export`.

## 1. Create the base and table

1. Sign in at [airtable.com](https://airtable.com).
2. Create a base named e.g. **TaskBoard Export**.
3. Rename the default table to **`Tasks`** (must match `AIRTABLE_TABLE_NAME`).
4. Create these fields (exact names):

| Field | Type |
|-------|------|
| `Task Id` | Single line text |
| `Title` | Single line text |
| `Description` | Long text |
| `Status` | Single line text |
| `Assignee` | Single line text |
| `Project Id` | Single line text |
| `Position` | Number |

You can delete unused default columns (Notes, Attachments, etc.).

## 2. Create a Personal Access Token

1. Open [Airtable Developer hub](https://airtable.com/create/tokens) → **Create new token**.
2. Scopes:
   - `data.records:read`
   - `data.records:write`
   - `schema.bases:read`
3. Access: add the **TaskBoard Export** base.
4. Copy the token (`pat…`).

## 3. Find the Base ID

Open the base → **Help** → **API documentation**, or copy `app…` from the base URL.

## 4. Configure `.env`

In `q-taskboard/.env`:

```
AIRTABLE_API_KEY=patXXXXXXXX
AIRTABLE_BASE_ID=appXXXXXXXX
AIRTABLE_TABLE_NAME=Tasks
```

Restart backend so compose picks up env:

```bash
docker compose up -d --force-recreate backend
```

## 5. Smoke-test

Sign in as `meera@taskboard.dev`, open **Q3 Launch**, click **export to Airtable**. Rows should appear keyed by `Task Id`. Run export again — titles update, no duplicate `Task Id` rows.
