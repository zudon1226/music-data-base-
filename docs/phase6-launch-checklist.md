# Phase 6 Launch Checklist

## Security And RLS
- Apply `supabase/migrations/202606080006_phase6_launch_readiness.sql`.
- Confirm `profiles`, `user_roles`, payouts, transactions, subscriptions, storage audit logs, and backup logs have RLS enabled.
- Confirm admin-only policies use `public.is_platform_admin()`.
- Test anonymous, listener, artist, producer, and admin access.

## Roles And Admin Permissions
- Assign platform admins through `profiles.account_type = 'admin'` or `user_roles.role = 'admin'`.
- Confirm payout review, backup logs, storage cleanup logs, and admin dashboard data are admin-readable only.
- Confirm normal users can still access their own subscriptions, purchases, library saves, playlists, and creator data.

## Production Environment
- Set `NEXT_PUBLIC_SITE_URL` to `https://digitalmusicdatabase.com`.
- Set `NEXT_PUBLIC_SUPABASE_URL`.
- Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Set `SUPABASE_SERVICE_ROLE_KEY` only on the server/deployment host.
- Configure Supabase auth redirects for the production domain.

## Storage Buckets
- Verify these buckets exist: `songs`, `videos`, `covers`, `albums`, `producer-beats`, `licenses`, `downloads`.
- Confirm public playback buckets allow read access only where intended.
- Confirm premium/license/download buckets are private or guarded.
- Run cleanup preview before deleting anything.

## Error Handling And Loading States
- Confirm uploads show progress and failure messages.
- Confirm failed save, like, follow, playlist, album, sales, and license actions show visible errors.
- Confirm no red React overlays in normal flows.
- Confirm console only shows real `console.warn` or `console.error` failures.

## Mobile Responsive Polish
- Test home, library, playlists, videos, albums, marketplace, dashboards, and public profile pages.
- Confirm no horizontal scrolling.
- Confirm bottom players do not cover actions.
- Confirm action buttons do not wrap or overlap.

## Public Profiles
- Test `/artist/[id]`.
- Test `/producer/[id]`.
- Confirm profile cover, avatar, bio, verified badge, songs, videos, albums, and beats display correctly.
- Confirm dashboard-only edit/delete controls are not shown on public pages.

## SEO And Social Share
- Confirm default app metadata.
- Confirm public artist metadata.
- Confirm public producer metadata.
- Confirm Open Graph image, title, description, and canonical URL.

## Backup And Export
- Test `/api/platform/backup`.
- Confirm exported JSON contains songs, videos, albums, playlists, library saves, likes, and follows.
- Confirm `backup_exports` receives a log row after the Phase 6 migration is applied.

## Final Launch Validation
- Run `npm run lint`.
- Run `npm run build`.
- Run API checks for launch, sales, licenses, songs, videos, albums, playlists, library saves, and user music state.
- Test upload song, upload video, upload album.
- Test play, pause, next, previous.
- Test save, like, follow, playlist add.
- Test Artist Dashboard, Producer Dashboard, Admin Revenue Dashboard.
