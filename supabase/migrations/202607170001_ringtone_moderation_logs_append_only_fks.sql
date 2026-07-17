-- Keep ringtone_moderation_logs append-only: never cascade-delete or null-out log rows.
-- Product/revision lifecycle must not mutate existing audit history.

do $$
declare
  ringtone_fk text;
  revision_fk text;
begin
  select conname into ringtone_fk
  from pg_constraint
  where conrelid = 'public.ringtone_moderation_logs'::regclass
    and contype = 'f'
    and confrelid = 'public.ringtone_products'::regclass
  limit 1;

  if ringtone_fk is not null then
    execute format('alter table public.ringtone_moderation_logs drop constraint %I', ringtone_fk);
  end if;

  select conname into revision_fk
  from pg_constraint
  where conrelid = 'public.ringtone_moderation_logs'::regclass
    and contype = 'f'
    and confrelid = 'public.ringtone_revisions'::regclass
  limit 1;

  if revision_fk is not null then
    execute format('alter table public.ringtone_moderation_logs drop constraint %I', revision_fk);
  end if;
end $$;

alter table public.ringtone_moderation_logs
  add constraint ringtone_moderation_logs_ringtone_id_fkey
  foreign key (ringtone_id)
  references public.ringtone_products(id)
  on delete restrict;

alter table public.ringtone_moderation_logs
  add constraint ringtone_moderation_logs_revision_id_fkey
  foreign key (revision_id)
  references public.ringtone_revisions(id)
  on delete restrict;

-- Immutability trigger remains authoritative for UPDATE/DELETE on log rows.
create or replace function public.forbid_ringtone_moderation_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ringtone_moderation_logs is immutable';
end;
$$;
