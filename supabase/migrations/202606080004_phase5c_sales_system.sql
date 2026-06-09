create extension if not exists pgcrypto;

create table if not exists public.sales_cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('song', 'album', 'beat')),
  title text not null default 'Untitled',
  creator_name text not null default '',
  cover_url text not null default '',
  download_url text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, item_type)
);

create table if not exists public.purchase_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('song', 'album', 'beat')),
  title text not null default 'Untitled',
  creator_name text not null default '',
  cover_url text not null default '',
  download_url text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'completed' check (status in ('pending', 'completed', 'refunded')),
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.download_vault (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid references public.purchase_history(id) on delete set null,
  item_id text not null,
  item_type text not null check (item_type in ('song', 'album', 'beat')),
  title text not null default 'Untitled',
  creator_name text not null default '',
  cover_url text not null default '',
  download_url text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, item_id, item_type)
);

create index if not exists sales_cart_items_user_id_idx on public.sales_cart_items(user_id);
create index if not exists sales_cart_items_item_idx on public.sales_cart_items(item_id, item_type);
create index if not exists purchase_history_user_id_idx on public.purchase_history(user_id);
create index if not exists purchase_history_item_idx on public.purchase_history(item_id, item_type);
create index if not exists purchase_history_purchased_at_idx on public.purchase_history(purchased_at desc);
create index if not exists download_vault_user_id_idx on public.download_vault(user_id);
create index if not exists download_vault_item_idx on public.download_vault(item_id, item_type);

alter table public.sales_cart_items enable row level security;
alter table public.purchase_history enable row level security;
alter table public.download_vault enable row level security;

drop policy if exists "Users can read own sales cart" on public.sales_cart_items;
create policy "Users can read own sales cart"
on public.sales_cart_items for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own sales cart" on public.sales_cart_items;
create policy "Users can insert own sales cart"
on public.sales_cart_items for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own sales cart" on public.sales_cart_items;
create policy "Users can update own sales cart"
on public.sales_cart_items for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own sales cart" on public.sales_cart_items;
create policy "Users can delete own sales cart"
on public.sales_cart_items for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own purchase history" on public.purchase_history;
create policy "Users can read own purchase history"
on public.purchase_history for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own purchase history" on public.purchase_history;
create policy "Users can insert own purchase history"
on public.purchase_history for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can read own download vault" on public.download_vault;
create policy "Users can read own download vault"
on public.download_vault for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own download vault" on public.download_vault;
create policy "Users can insert own download vault"
on public.download_vault for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own download vault" on public.download_vault;
create policy "Users can update own download vault"
on public.download_vault for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.sales_cart_items to authenticated;
grant select, insert on public.purchase_history to authenticated;
grant select, insert, update on public.download_vault to authenticated;
