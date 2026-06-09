create extension if not exists pgcrypto;

create table if not exists public.library_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  item_type text not null check (item_type in ('song', 'video')),
  created_at timestamptz not null default now(),
  unique (user_id, item_id, item_type)
);

alter table public.library_saves add column if not exists id uuid default gen_random_uuid();
alter table public.library_saves add column if not exists user_id uuid;
alter table public.library_saves add column if not exists item_id uuid;
alter table public.library_saves add column if not exists item_type text;
alter table public.library_saves add column if not exists created_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_saves'
      and column_name = 'user_id'
      and udt_name <> 'uuid'
  ) then
    delete from public.library_saves
    where user_id is null
       or user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    alter table public.library_saves
      alter column user_id type uuid using user_id::uuid;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_saves'
      and column_name = 'item_id'
      and udt_name <> 'uuid'
  ) then
    delete from public.library_saves
    where item_id is null
       or item_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    alter table public.library_saves
      alter column item_id type uuid using item_id::uuid;
  end if;
end $$;

update public.library_saves
set id = gen_random_uuid()
where id is null;

update public.library_saves
set created_at = now()
where created_at is null;

delete from public.library_saves
where user_id is null
   or item_id is null
   or item_type not in ('song', 'video');

alter table public.library_saves alter column id set default gen_random_uuid();
alter table public.library_saves alter column id set not null;
alter table public.library_saves alter column user_id set not null;
alter table public.library_saves alter column item_id set not null;
alter table public.library_saves alter column item_type set not null;
alter table public.library_saves alter column created_at set default now();
alter table public.library_saves alter column created_at set not null;

alter table public.library_saves drop constraint if exists library_saves_item_type_check;
alter table public.library_saves
  add constraint library_saves_item_type_check check (item_type in ('song', 'video'));

alter table public.library_saves drop constraint if exists library_saves_user_id_fkey;
alter table public.library_saves
  add constraint library_saves_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.library_saves'::regclass
      and contype = 'p'
  ) then
    alter table public.library_saves
      add constraint library_saves_pkey primary key (id);
  end if;
end $$;

with ranked_saves as (
  select
    ctid,
    row_number() over (
      partition by user_id, item_id, item_type
      order by created_at desc, id desc
    ) as row_number
  from public.library_saves
)
delete from public.library_saves
using ranked_saves
where public.library_saves.ctid = ranked_saves.ctid
  and ranked_saves.row_number > 1;

alter table public.library_saves drop constraint if exists library_saves_user_item_type_key;
drop index if exists public.library_saves_unique_item_idx;
drop index if exists public.library_saves_unique_item_uuid_idx;

alter table public.library_saves
  add constraint library_saves_user_item_type_key unique (user_id, item_id, item_type);

create index if not exists library_saves_user_type_idx
on public.library_saves (user_id, item_type);

alter table public.library_saves enable row level security;

drop policy if exists "Users can read own library saves" on public.library_saves;
drop policy if exists "Users can insert own library saves" on public.library_saves;
drop policy if exists "Users can delete own library saves" on public.library_saves;

create policy "Users can read own library saves"
on public.library_saves
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own library saves"
on public.library_saves
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own library saves"
on public.library_saves
for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on public.library_saves to authenticated;
