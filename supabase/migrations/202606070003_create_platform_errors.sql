create table if not exists public.platform_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('upload', 'media_url', 'save', 'like', 'playlist', 'album', 'storage', 'backup', 'follow', 'unknown')),
  action text not null default 'unknown',
  item_id text,
  item_type text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists platform_errors_user_id_idx on public.platform_errors (user_id);
create index if not exists platform_errors_category_idx on public.platform_errors (category);
create index if not exists platform_errors_status_idx on public.platform_errors (status);
create index if not exists platform_errors_created_at_idx on public.platform_errors (created_at desc);

alter table public.platform_errors enable row level security;

drop policy if exists "Users can read own platform errors" on public.platform_errors;
drop policy if exists "Users can insert own platform errors" on public.platform_errors;
drop policy if exists "Users can update own platform errors" on public.platform_errors;

create policy "Users can read own platform errors"
on public.platform_errors
for select
using (auth.uid() = user_id);

create policy "Users can insert own platform errors"
on public.platform_errors
for insert
with check (auth.uid() = user_id);

create policy "Users can update own platform errors"
on public.platform_errors
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
