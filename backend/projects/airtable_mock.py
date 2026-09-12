"""In-memory Airtable test double. Not a substitute for real API calls in demos."""
from __future__ import annotations


class MockAirtableTable:
    def __init__(self, fail_task_ids=None, transient_then_ok_ids=None):
        self.records: dict[str, dict] = {}  # task_id -> fields
        self.fail_task_ids = set(fail_task_ids or [])
        self.transient_then_ok_ids = set(transient_then_ok_ids or [])
        self._attempted: set[str] = set()
        self.create_calls = 0
        self.update_calls = 0
        self.find_calls = 0

    def all(self, formula=None, max_records=None):
        self.find_calls += 1
        # formula like: {Task Id}='uuid'
        task_id = None
        if formula:
            start = formula.find("='")
            end = formula.rfind("'")
            if start != -1 and end > start:
                task_id = formula[start + 2:end]
        if task_id and task_id in self.records:
            return [{'id': f'rec_{task_id}', 'fields': self.records[task_id]}]
        return []

    def create(self, fields):
        task_id = fields['Task Id']
        self._raise_if_needed(task_id)
        self.create_calls += 1
        self.records[task_id] = dict(fields)
        return {'id': f'rec_{task_id}', 'fields': dict(fields)}

    def update(self, record_id, fields):
        task_id = fields['Task Id']
        self._raise_if_needed(task_id)
        self.update_calls += 1
        self.records[task_id] = dict(fields)
        return {'id': record_id, 'fields': dict(fields)}

    def _raise_if_needed(self, task_id):
        if task_id in self.fail_task_ids:
            err = Exception('permanent failure')
            err.status_code = 422  # type: ignore[attr-defined]
            raise err
        if task_id in self.transient_then_ok_ids and task_id not in self._attempted:
            self._attempted.add(task_id)
            err = Exception('rate limited')
            err.status_code = 429  # type: ignore[attr-defined]
            raise err
