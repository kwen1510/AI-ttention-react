# Production inventory before the secure re-spin

Captured read-only through the configured Supabase server credential on 2026-07-20. No record values were printed or changed. This is a planning inventory, not the authoritative archive; the archive is incomplete until `pg_dump`, manifest verification, and protected-schema verification succeed.

| Table | Rows |
|---|---:|
| sessions | 219 |
| groups | 192 |
| session_prompts | 49 |
| session_logs | 190 |
| transcripts | 150 |
| summaries | 120 |
| summary_snapshots | 850 |
| mindmap_sessions | 30 |
| mindmap_archives | 0 |
| checkbox_sessions | 54 |
| checkbox_criteria | 111 |
| checkbox_progress | 25 |
| async_sessions / groups / segments / reports | 0 |
| prompt_library | 0 |
| teacher_prompts | 10 |
| teacher_access | 2 |
| Supabase Auth users | 13 |

`checkbox_results` and `transcriptions` were reachable but did not return a reliable exact count through the Data API head request. The direct Postgres archive script inventories them authoritatively.

## Migration classification

- Preserve in the immutable archive: every current application table and the complete database dump.
- Migrate into the new live question library: all 10 `teacher_prompts` records, retaining title, description, content, mode, category, tags, author/publication metadata, usage counters, and timestamps. `prompt_library` is currently empty but remains part of the preservation set.
- Archive-only after verified cutover: sessions, groups, per-session prompts, logs, transcripts, summaries/snapshots, mindmap history, checkbox activity, asynchronous activity, and legacy transcription records.
- Security configuration requiring explicit cutover review: two `teacher_access` records and 13 Auth users. Approved teachers must not be accidentally removed; anonymous/stale Auth users need a separately verified retention cleanup after the new login works.

## Hard gate

The project currently has API keys but no `DATABASE_URL`/`SUPABASE_DB_URL`. Therefore a complete dump has not yet been created. Do not run any reset/truncation or deactivate legacy keys until:

1. `npm run db:archive:production` succeeds using the direct Supabase Postgres connection string.
2. `npm run db:archive:verify -- archives/<batch>` verifies the dump checksum and restorable objects.
3. `server/db/archive/verify_archive.sql` passes for the same batch.
4. A test restore into a separate empty database succeeds and its row counts match the manifest.
