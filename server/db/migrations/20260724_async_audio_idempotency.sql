alter table public.async_segments
    add column if not exists client_chunk_id text;

create unique index if not exists async_segments_group_client_chunk_idx
    on public.async_segments (async_group_id, client_chunk_id)
    where client_chunk_id is not null;
