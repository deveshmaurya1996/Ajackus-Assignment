"""Airtable export via pyairtable: retry transient errors, per-record isolation, upsert by Task Id."""
from __future__ import annotations

import os
import time
from typing import Any

from pyairtable import Api


TRANSIENT_STATUS = {429, 500, 502, 503, 504}
MAX_RETRIES = 3
BACKOFF_SECONDS = 0.5

MISSING_SCHEMA_MSG = (
    'Airtable table is missing required columns. Create exactly: '
    'Task Id, Title, Description, Status, Assignee, Project Id, Position '
    '(see AIRTABLE_SETUP.md).'
)



class PermanentAirtableError(Exception):
    pass


def _status_code(exc: Exception) -> int | None:
    for attr in ('status_code', 'status'):
        val = getattr(exc, attr, None)
        if isinstance(val, int):
            return val
    response = getattr(exc, 'response', None)
    if response is not None:
        code = getattr(response, 'status_code', None)
        if isinstance(code, int):
            return code
    return None


def _is_transient(exc: Exception) -> bool:
    code = _status_code(exc)
    if code in TRANSIENT_STATUS:
        return True
    if code is None and not isinstance(exc, PermanentAirtableError):
        return isinstance(exc, (TimeoutError, ConnectionError, OSError))
    return False


def _call_with_retry(fn, *args, **kwargs):
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            code = _status_code(exc)
            if code is not None and code < 500 and code != 429:
                raise PermanentAirtableError(str(exc)) from exc
            if not _is_transient(exc) or attempt == MAX_RETRIES - 1:
                raise
            time.sleep(BACKOFF_SECONDS * (2 ** attempt))
    raise last_exc


def _task_fields(task, project_id: str) -> dict[str, Any]:
    return {
        'Task Id': str(task.id),
        'Title': task.title,
        'Description': task.description or '',
        'Status': task.status,
        'Assignee': task.assignee.name if task.assignee else '',
        'Project Id': project_id,
        'Position': task.position,
    }


def assert_task_id_field(table) -> None:
    try:
        table.all(formula="{Task Id}='__taskboard_probe__'", max_records=1)
    except Exception as exc:
        text = str(exc).lower()
        if 'unknown field' in text or 'invalid_filter_by_formula' in text:
            raise PermanentAirtableError(MISSING_SCHEMA_MSG) from exc
        raise PermanentAirtableError(str(exc)) from exc


def get_table():
    api_key = os.environ.get('AIRTABLE_API_KEY') or ''
    base_id = os.environ.get('AIRTABLE_BASE_ID') or ''
    table_name = os.environ.get('AIRTABLE_TABLE_NAME') or 'Tasks'
    if not api_key or not base_id:
        raise PermanentAirtableError('AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required')
    return Api(api_key).table(base_id, table_name)


def upsert_task(table, task, project_id: str) -> str:
    fields = _task_fields(task, project_id)
    formula = f"{{Task Id}}='{task.id}'"

    def find():
        return table.all(formula=formula, max_records=1)

    existing = _call_with_retry(find)
    if existing:
        record_id = existing[0]['id']

        def update():
            return table.update(record_id, fields)

        _call_with_retry(update)
        return 'updated'

    def create():
        return table.create(fields)

    _call_with_retry(create)
    return 'created'


def export_tasks_to_airtable(tasks, project_id: str, table=None) -> dict[str, Any]:
    if table is None:
        table = get_table()

    assert_task_id_field(table)

    created = 0
    updated = 0
    failed = 0
    errors: list[dict[str, str]] = []

    for task in tasks:
        try:
            outcome = upsert_task(table, task, project_id)
            if outcome == 'created':
                created += 1
            else:
                updated += 1
        except Exception as exc:
            failed += 1
            errors.append({'taskId': str(task.id), 'error': str(exc)})

    return {
        'exported': created + updated,
        'created': created,
        'updated': updated,
        'failed': failed,
        'errors': errors,
    }
