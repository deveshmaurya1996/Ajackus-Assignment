# Design notes

## Activity feed failure vs original mutation

Activity rows are written inside the same `transaction.atomic()` block as the task create/update or comment create. If the activity insert fails, Postgres rolls back the original change too.

We chose coupling over best-effort logging because this product treats the feed as an engagement audit trail: a silent gap is worse than a failed save for local writes. External Airtable export is intentionally separate and never rolls back task data.
