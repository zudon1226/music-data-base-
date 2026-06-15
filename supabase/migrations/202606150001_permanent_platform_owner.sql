-- Music Data Base - permanent owner/admin account.
-- zudon1226@gmail.com remains a normal email/password login while also being
-- recognized by platform-admin RLS helpers and admin review workflows.

create or replace function public.is_platform_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where id = check_user_id
      and lower(email) = 'zudon1226@gmail.com'
  )
  or exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role = 'admin'
      and status = 'active'
  )
  or exists (
    select 1
    from public.profiles
    where (id = check_user_id or user_id = check_user_id)
      and (is_admin = true or account_type = 'admin')
  );
$$;

insert into public.profiles (id, user_id, account_type, is_admin, updated_at)
select id, id, 'admin', true, now()
from auth.users
where lower(email) = 'zudon1226@gmail.com'
on conflict (id) do update
set account_type = 'admin',
    is_admin = true,
    updated_at = now();

insert into public.user_roles (user_id, role, status)
select id, 'admin', 'active'
from auth.users
where lower(email) = 'zudon1226@gmail.com'
on conflict (user_id, role) do update
set status = 'active',
    updated_at = now();

grant execute on function public.is_platform_admin(uuid) to authenticated;
