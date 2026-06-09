# Phase 6 Production Environment

Set these before public launch.

## Required Environment Variables
- `NEXT_PUBLIC_SITE_URL`: `https://digitalmusicdatabase.com`.
- `NEXT_PUBLIC_SUPABASE_URL`: production Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: production Supabase anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: production service role key. Server only. Never expose this in the browser.

## Supabase Auth Settings
- Add the production domain to Site URL.
- Add production callback URLs.
- Add local development callback URLs only for development.
- Confirm email login and session refresh work after deployment.

Production values:
- Site URL: `https://digitalmusicdatabase.com`
- Redirect URL: `https://digitalmusicdatabase.com`
- Optional www redirect URL: `https://www.digitalmusicdatabase.com`

## Required SQL
Run these in Supabase SQL Editor, in order:
1. `supabase/migrations/202606080006_phase6_launch_readiness.sql`
2. `supabase/migrations/202606080007_phase6_storage_buckets.sql`

## Launch Health Checks
- `/api/launch/status`
- `/api/launch/checklist`
- `/api/launch/admin?userId=<admin-user-id>`
- `/api/sales`
- `/api/licenses`
- `/api/songs`
- `/api/videos`
- `/api/albums`
- `/api/playlists`
- `/api/library-saves?userId=<user-id>`

## Admin Setup
To make a user an admin after running Phase 6 SQL:

```sql
update public.profiles
set account_type = 'admin',
    is_admin = true,
    updated_at = now()
where user_id = '<USER_ID>' or id = '<USER_ID>';

insert into public.user_roles (user_id, role, status)
values ('<USER_ID>', 'admin', 'active')
on conflict (user_id, role)
do update set status = 'active', updated_at = now();
```

## Storage Buckets
Expected buckets:
- `songs`
- `videos`
- `covers`
- `albums`
- `producer-beats`
- `licenses`
- `downloads`

Use `/api/launch/status` to confirm they exist.
