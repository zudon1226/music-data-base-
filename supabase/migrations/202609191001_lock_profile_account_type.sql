-- Lock profiles.account_type against authenticated-client updates.
-- Signup activation, founding approval, and owner tools use service_role.

create or replace function public.prevent_client_account_type_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.account_type is distinct from old.account_type
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'account_type cannot be changed by client update';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_client_account_type_change on public.profiles;
create trigger prevent_client_account_type_change
  before update on public.profiles
  for each row
  execute function public.prevent_client_account_type_change();
