-- Personal content hide + retain paid ringtone purchase rows on account deletion (buyer identity detached).

create table if not exists public.user_hidden_content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (
    content_type in ('song', 'video', 'album', 'podcast_episode', 'podcast_show', 'ringtone')
  ),
  content_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, content_type, content_id)
);

create index if not exists user_hidden_content_user_idx
  on public.user_hidden_content (user_id, created_at desc);

create index if not exists user_hidden_content_lookup_idx
  on public.user_hidden_content (user_id, content_type, content_id);

alter table public.user_hidden_content enable row level security;

drop policy if exists "Users manage own hidden content" on public.user_hidden_content;
create policy "Users manage own hidden content"
on public.user_hidden_content
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, delete on public.user_hidden_content to authenticated;

-- Detach buyer on auth delete instead of deleting purchase ledger rows.
alter table public.ringtone_purchases alter column buyer_id drop not null;

alter table public.ringtone_purchases drop constraint if exists ringtone_purchases_buyer_id_fkey;
alter table public.ringtone_purchases
  add constraint ringtone_purchases_buyer_id_fkey
  foreign key (buyer_id) references auth.users(id) on delete set null;
