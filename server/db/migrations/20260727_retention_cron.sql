begin;

create extension if not exists pg_cron;

revoke all on schema cron from public, anon, authenticated;
revoke all on all tables in schema cron from public, anon, authenticated;
revoke all on all sequences in schema cron from public, anon, authenticated;
revoke all on all functions in schema cron from public, anon, authenticated;

select cron.schedule(
    'aittention-daily-retention',
    '17 18 * * *',
    'select private.cleanup_aittention_ephemeral_data(7, 30, 60)'
);

commit;
