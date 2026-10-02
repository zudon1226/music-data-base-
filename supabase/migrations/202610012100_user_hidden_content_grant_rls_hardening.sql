-- Harden user_hidden_content grant catalog (anon/public must not access; own-row RLS only).

revoke all on table public.user_hidden_content from anon, public;
revoke truncate, references, trigger on table public.user_hidden_content from authenticated;
revoke update on table public.user_hidden_content from authenticated;
grant select, insert, delete on table public.user_hidden_content to authenticated;
grant all on table public.user_hidden_content to service_role;

alter table public.user_hidden_content enable row level security;

drop policy if exists "Users manage own hidden content" on public.user_hidden_content;
drop policy if exists "owners_read" on public.user_hidden_content;
drop policy if exists "owners_insert" on public.user_hidden_content;
drop policy if exists "owners_delete" on public.user_hidden_content;
drop policy if exists "platform_admin_full_access" on public.user_hidden_content;

create policy "owners_read"
on public.user_hidden_content for select
to authenticated
using (user_id = auth.uid());

create policy "owners_insert"
on public.user_hidden_content for insert
to authenticated
with check (user_id = auth.uid());

create policy "owners_delete"
on public.user_hidden_content for delete
to authenticated
using (user_id = auth.uid());

create policy "platform_admin_full_access"
on public.user_hidden_content for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());
