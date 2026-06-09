alter table public.library_saves drop constraint if exists library_saves_item_type_check;

alter table public.library_saves
  add constraint library_saves_item_type_check check (item_type in ('song', 'video', 'album'));
