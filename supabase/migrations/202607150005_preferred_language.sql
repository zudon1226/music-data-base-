-- Preferred display language for profiles.
-- Additive only. Does not weaken existing RLS policies.

alter table public.profiles
  add column if not exists preferred_language text not null default 'en';

create index if not exists profiles_preferred_language_idx
  on public.profiles (preferred_language);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_preferred_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_language_check
      check (char_length(preferred_language) between 2 and 12);
  end if;
end $$;
