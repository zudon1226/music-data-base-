create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete cascade,
  account_type text not null default 'listener' check (account_type in ('listener', 'artist', 'producer')),
  avatar_url text,
  banner_url text,
  bio text,
  website text,
  social_links text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.profiles add column if not exists account_type text default 'listener';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists social_links text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles set user_id = id where user_id is null;
update public.profiles set account_type = 'listener' where account_type is null or account_type not in ('listener', 'artist', 'producer');
update public.profiles set created_at = now() where created_at is null;
update public.profiles set updated_at = created_at where updated_at is null;

alter table public.profiles alter column account_type set default 'listener';
alter table public.profiles alter column account_type set not null;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column created_at set not null;
alter table public.profiles alter column updated_at set default now();
alter table public.profiles alter column updated_at set not null;

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check check (account_type in ('listener', 'artist', 'producer'));

create unique index if not exists profiles_user_id_unique_idx on public.profiles (user_id);

create table if not exists public.artist_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  artist_key text unique,
  name text not null,
  avatar_url text,
  banner_url text,
  bio text,
  social_links text,
  monthly_listeners integer not null default 0,
  followers integer not null default 0,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.artist_profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.artist_profiles add column if not exists artist_key text;
alter table public.artist_profiles add column if not exists name text;
alter table public.artist_profiles add column if not exists avatar_url text;
alter table public.artist_profiles add column if not exists banner_url text;
alter table public.artist_profiles add column if not exists bio text;
alter table public.artist_profiles add column if not exists social_links text;
alter table public.artist_profiles add column if not exists monthly_listeners integer default 0;
alter table public.artist_profiles add column if not exists followers integer default 0;
alter table public.artist_profiles add column if not exists verified boolean default false;
alter table public.artist_profiles add column if not exists created_at timestamptz default now();
alter table public.artist_profiles add column if not exists updated_at timestamptz default now();

update public.artist_profiles set name = coalesce(name, artist_key, 'Artist') where name is null or btrim(name) = '';
update public.artist_profiles set monthly_listeners = 0 where monthly_listeners is null;
update public.artist_profiles set followers = 0 where followers is null;
update public.artist_profiles set verified = false where verified is null;
update public.artist_profiles set created_at = now() where created_at is null;
update public.artist_profiles set updated_at = created_at where updated_at is null;

alter table public.artist_profiles alter column name set not null;
alter table public.artist_profiles alter column monthly_listeners set default 0;
alter table public.artist_profiles alter column monthly_listeners set not null;
alter table public.artist_profiles alter column followers set default 0;
alter table public.artist_profiles alter column followers set not null;
alter table public.artist_profiles alter column verified set default false;
alter table public.artist_profiles alter column verified set not null;
alter table public.artist_profiles alter column created_at set default now();
alter table public.artist_profiles alter column created_at set not null;
alter table public.artist_profiles alter column updated_at set default now();
alter table public.artist_profiles alter column updated_at set not null;

create unique index if not exists artist_profiles_artist_key_unique_idx
on public.artist_profiles (artist_key)
where artist_key is not null;
create index if not exists artist_profiles_user_id_idx on public.artist_profiles (user_id);

alter table public.producer_profiles add column if not exists website text;
alter table public.producer_profiles add column if not exists verified boolean not null default false;

create table if not exists public.profile_verifications (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  entity_type text not null check (entity_type in ('artist', 'producer')),
  verified boolean not null default true,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, entity_type)
);

create index if not exists profile_verifications_entity_idx
on public.profile_verifications (entity_type, entity_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  item_id text,
  item_type text check (item_type in ('song', 'video', 'album', 'artist', 'producer', 'playlist')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists id uuid default gen_random_uuid();
alter table public.notifications add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists item_id text;
alter table public.notifications add column if not exists item_type text;
alter table public.notifications add column if not exists read boolean default false;
alter table public.notifications add column if not exists created_at timestamptz default now();

update public.notifications set title = 'Notification' where title is null or btrim(title) = '';
update public.notifications set body = '' where body is null;
update public.notifications set read = false where read is null;
update public.notifications set created_at = now() where created_at is null;

alter table public.notifications alter column id set default gen_random_uuid();
alter table public.notifications alter column title set not null;
alter table public.notifications alter column body set not null;
alter table public.notifications alter column read set default false;
alter table public.notifications alter column read set not null;
alter table public.notifications alter column created_at set default now();
alter table public.notifications alter column created_at set not null;

alter table public.notifications drop constraint if exists notifications_item_type_check;
alter table public.notifications
  add constraint notifications_item_type_check check (item_type in ('song', 'video', 'album', 'artist', 'producer', 'playlist'));

create index if not exists notifications_user_read_idx on public.notifications (user_id, read, created_at desc);

create table if not exists public.content_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('song', 'video', 'album')),
  author_name text not null default 'Music Fan',
  body text not null,
  likes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_comments add column if not exists id uuid default gen_random_uuid();
alter table public.content_comments add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.content_comments add column if not exists item_id text;
alter table public.content_comments add column if not exists item_type text;
alter table public.content_comments add column if not exists author_name text default 'Music Fan';
alter table public.content_comments add column if not exists body text;
alter table public.content_comments add column if not exists likes integer default 0;
alter table public.content_comments add column if not exists created_at timestamptz default now();
alter table public.content_comments add column if not exists updated_at timestamptz default now();

update public.content_comments set author_name = 'Music Fan' where author_name is null or btrim(author_name) = '';
update public.content_comments set body = '' where body is null;
update public.content_comments set likes = 0 where likes is null;
update public.content_comments set created_at = now() where created_at is null;
update public.content_comments set updated_at = created_at where updated_at is null;

delete from public.content_comments
where user_id is null
   or item_id is null
   or item_type not in ('song', 'video', 'album');

alter table public.content_comments alter column id set default gen_random_uuid();
alter table public.content_comments alter column user_id set not null;
alter table public.content_comments alter column item_id set not null;
alter table public.content_comments alter column item_type set not null;
alter table public.content_comments alter column author_name set default 'Music Fan';
alter table public.content_comments alter column author_name set not null;
alter table public.content_comments alter column body set not null;
alter table public.content_comments alter column likes set default 0;
alter table public.content_comments alter column likes set not null;
alter table public.content_comments alter column created_at set default now();
alter table public.content_comments alter column created_at set not null;
alter table public.content_comments alter column updated_at set default now();
alter table public.content_comments alter column updated_at set not null;

alter table public.content_comments drop constraint if exists content_comments_item_type_check;
alter table public.content_comments
  add constraint content_comments_item_type_check check (item_type in ('song', 'video', 'album'));

create index if not exists content_comments_item_idx on public.content_comments (item_type, item_id, created_at desc);
create index if not exists content_comments_user_id_idx on public.content_comments (user_id);

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.content_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

alter table public.comment_likes add column if not exists id uuid default gen_random_uuid();
alter table public.comment_likes add column if not exists comment_id uuid references public.content_comments(id) on delete cascade;
alter table public.comment_likes add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.comment_likes add column if not exists created_at timestamptz default now();

delete from public.comment_likes where comment_id is null or user_id is null;
update public.comment_likes set created_at = now() where created_at is null;

alter table public.comment_likes alter column id set default gen_random_uuid();
alter table public.comment_likes alter column comment_id set not null;
alter table public.comment_likes alter column user_id set not null;
alter table public.comment_likes alter column created_at set default now();
alter table public.comment_likes alter column created_at set not null;

alter table public.comment_likes drop constraint if exists comment_likes_comment_user_key;
alter table public.comment_likes
  add constraint comment_likes_comment_user_key unique (comment_id, user_id);

create index if not exists comment_likes_comment_id_idx on public.comment_likes (comment_id);
create index if not exists comment_likes_user_id_idx on public.comment_likes (user_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_name text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'canceled', 'expired')),
  price_cents integer not null default 0,
  currency text not null default 'USD',
  started_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists id uuid default gen_random_uuid();
alter table public.subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.subscriptions add column if not exists plan_name text;
alter table public.subscriptions add column if not exists status text default 'pending';
alter table public.subscriptions add column if not exists price_cents integer default 0;
alter table public.subscriptions add column if not exists currency text default 'USD';
alter table public.subscriptions add column if not exists started_at timestamptz;
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions add column if not exists created_at timestamptz default now();
alter table public.subscriptions add column if not exists updated_at timestamptz default now();

update public.subscriptions set plan_name = 'Platform Plan' where plan_name is null or btrim(plan_name) = '';
update public.subscriptions set status = 'pending' where status is null or status not in ('pending', 'active', 'paused', 'canceled', 'expired');
update public.subscriptions set price_cents = 0 where price_cents is null;
update public.subscriptions set currency = 'USD' where currency is null or btrim(currency) = '';
update public.subscriptions set created_at = now() where created_at is null;
update public.subscriptions set updated_at = created_at where updated_at is null;

alter table public.subscriptions alter column id set default gen_random_uuid();
alter table public.subscriptions alter column plan_name set not null;
alter table public.subscriptions alter column status set default 'pending';
alter table public.subscriptions alter column status set not null;
alter table public.subscriptions alter column price_cents set default 0;
alter table public.subscriptions alter column price_cents set not null;
alter table public.subscriptions alter column currency set default 'USD';
alter table public.subscriptions alter column currency set not null;
alter table public.subscriptions alter column created_at set default now();
alter table public.subscriptions alter column created_at set not null;
alter table public.subscriptions alter column updated_at set default now();
alter table public.subscriptions alter column updated_at set not null;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check check (status in ('pending', 'active', 'paused', 'canceled', 'expired'));

create index if not exists subscriptions_user_status_idx on public.subscriptions (user_id, status);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  item_id text,
  item_type text check (item_type in ('song', 'video', 'album', 'beat', 'subscription', 'playlist')),
  amount_cents integer not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  transaction_type text not null default 'purchase',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.transactions add column if not exists id uuid default gen_random_uuid();
alter table public.transactions add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.transactions add column if not exists item_id text;
alter table public.transactions add column if not exists item_type text;
alter table public.transactions add column if not exists amount_cents integer default 0;
alter table public.transactions add column if not exists currency text default 'USD';
alter table public.transactions add column if not exists status text default 'pending';
alter table public.transactions add column if not exists transaction_type text default 'purchase';
alter table public.transactions add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.transactions add column if not exists created_at timestamptz default now();

update public.transactions set amount_cents = 0 where amount_cents is null;
update public.transactions set currency = 'USD' where currency is null or btrim(currency) = '';
update public.transactions set status = 'pending' where status is null or status not in ('pending', 'succeeded', 'failed', 'refunded');
update public.transactions set transaction_type = 'purchase' where transaction_type is null or btrim(transaction_type) = '';
update public.transactions set metadata = '{}'::jsonb where metadata is null;
update public.transactions set created_at = now() where created_at is null;

alter table public.transactions alter column id set default gen_random_uuid();
alter table public.transactions alter column amount_cents set default 0;
alter table public.transactions alter column amount_cents set not null;
alter table public.transactions alter column currency set default 'USD';
alter table public.transactions alter column currency set not null;
alter table public.transactions alter column status set default 'pending';
alter table public.transactions alter column status set not null;
alter table public.transactions alter column transaction_type set default 'purchase';
alter table public.transactions alter column transaction_type set not null;
alter table public.transactions alter column metadata set default '{}'::jsonb;
alter table public.transactions alter column metadata set not null;
alter table public.transactions alter column created_at set default now();
alter table public.transactions alter column created_at set not null;

alter table public.transactions drop constraint if exists transactions_item_type_check;
alter table public.transactions
  add constraint transactions_item_type_check check (item_type in ('song', 'video', 'album', 'beat', 'subscription', 'playlist'));

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions
  add constraint transactions_status_check check (status in ('pending', 'succeeded', 'failed', 'refunded'));

create index if not exists transactions_user_id_idx on public.transactions (user_id, created_at desc);
create index if not exists transactions_item_idx on public.transactions (item_type, item_id);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  producer_id uuid references public.producer_profiles(id) on delete set null,
  amount_cents integer not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed', 'canceled')),
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payouts add column if not exists id uuid default gen_random_uuid();
alter table public.payouts add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.payouts add column if not exists producer_id uuid references public.producer_profiles(id) on delete set null;
alter table public.payouts add column if not exists amount_cents integer default 0;
alter table public.payouts add column if not exists currency text default 'USD';
alter table public.payouts add column if not exists status text default 'pending';
alter table public.payouts add column if not exists requested_at timestamptz default now();
alter table public.payouts add column if not exists paid_at timestamptz;
alter table public.payouts add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.payouts add column if not exists created_at timestamptz default now();
alter table public.payouts add column if not exists updated_at timestamptz default now();

update public.payouts set amount_cents = 0 where amount_cents is null;
update public.payouts set currency = 'USD' where currency is null or btrim(currency) = '';
update public.payouts set status = 'pending' where status is null or status not in ('pending', 'processing', 'paid', 'failed', 'canceled');
update public.payouts set requested_at = now() where requested_at is null;
update public.payouts set metadata = '{}'::jsonb where metadata is null;
update public.payouts set created_at = now() where created_at is null;
update public.payouts set updated_at = created_at where updated_at is null;

alter table public.payouts alter column id set default gen_random_uuid();
alter table public.payouts alter column amount_cents set default 0;
alter table public.payouts alter column amount_cents set not null;
alter table public.payouts alter column currency set default 'USD';
alter table public.payouts alter column currency set not null;
alter table public.payouts alter column status set default 'pending';
alter table public.payouts alter column status set not null;
alter table public.payouts alter column requested_at set default now();
alter table public.payouts alter column requested_at set not null;
alter table public.payouts alter column metadata set default '{}'::jsonb;
alter table public.payouts alter column metadata set not null;
alter table public.payouts alter column created_at set default now();
alter table public.payouts alter column created_at set not null;
alter table public.payouts alter column updated_at set default now();
alter table public.payouts alter column updated_at set not null;

alter table public.payouts drop constraint if exists payouts_status_check;
alter table public.payouts
  add constraint payouts_status_check check (status in ('pending', 'processing', 'paid', 'failed', 'canceled'));

create index if not exists payouts_user_status_idx on public.payouts (user_id, status);
create index if not exists payouts_producer_status_idx on public.payouts (producer_id, status);

alter table public.profiles enable row level security;
alter table public.artist_profiles enable row level security;
alter table public.profile_verifications enable row level security;
alter table public.notifications enable row level security;
alter table public.content_comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.subscriptions enable row level security;
alter table public.transactions enable row level security;
alter table public.payouts enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
using (auth.uid() = user_id or auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id or auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id or auth.uid() = id)
with check (auth.uid() = user_id or auth.uid() = id);

drop policy if exists "Artist profiles are readable" on public.artist_profiles;
drop policy if exists "Users can insert own artist profile" on public.artist_profiles;
drop policy if exists "Users can update own artist profile" on public.artist_profiles;
drop policy if exists "Users can delete own artist profile" on public.artist_profiles;

create policy "Artist profiles are readable"
on public.artist_profiles
for select
using (true);

create policy "Users can insert own artist profile"
on public.artist_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own artist profile"
on public.artist_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own artist profile"
on public.artist_profiles
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Verifications are readable" on public.profile_verifications;
create policy "Verifications are readable"
on public.profile_verifications
for select
using (true);

drop policy if exists "Users can read own notifications" on public.notifications;
drop policy if exists "Users can insert own notifications" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;
drop policy if exists "Users can delete own notifications" on public.notifications;

create policy "Users can read own notifications"
on public.notifications
for select
using (auth.uid() = user_id);

create policy "Users can insert own notifications"
on public.notifications
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own notifications"
on public.notifications
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Comments are readable" on public.content_comments;
drop policy if exists "Users can insert own comments" on public.content_comments;
drop policy if exists "Users can update own comments" on public.content_comments;
drop policy if exists "Users can delete own comments" on public.content_comments;

create policy "Comments are readable"
on public.content_comments
for select
using (true);

create policy "Users can insert own comments"
on public.content_comments
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own comments"
on public.content_comments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own comments"
on public.content_comments
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Comment likes are readable" on public.comment_likes;
drop policy if exists "Users can insert own comment likes" on public.comment_likes;
drop policy if exists "Users can delete own comment likes" on public.comment_likes;

create policy "Comment likes are readable"
on public.comment_likes
for select
using (true);

create policy "Users can insert own comment likes"
on public.comment_likes
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own comment likes"
on public.comment_likes
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions"
on public.subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own transactions" on public.transactions;
create policy "Users can read own transactions"
on public.transactions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own payouts" on public.payouts;
create policy "Users can read own payouts"
on public.payouts
for select
using (auth.uid() = user_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.artist_profiles to authenticated;
grant select on public.profile_verifications to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.content_comments to authenticated;
grant select, insert, delete on public.comment_likes to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.transactions to authenticated;
grant select on public.payouts to authenticated;
