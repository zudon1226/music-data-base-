# Production Domain DNS

Domain: `digitalmusicdatabase.com`

Production URL:

```env
NEXT_PUBLIC_SITE_URL=https://digitalmusicdatabase.com
```

## DNS Records

Use these records when deploying the Next.js app on Vercel.

| Type | Host/Name | Value/Target | Purpose |
| --- | --- | --- | --- |
| A | `@` | `76.76.21.21` | Routes `digitalmusicdatabase.com` to Vercel |
| CNAME | `www` | `cname.vercel-dns.com` | Routes `www.digitalmusicdatabase.com` to Vercel |

If the deployment host gives different DNS targets, use the host-provided values instead of the Vercel values above.

## Deployment Environment Variables

Set these in the deployment host:

```env
NEXT_PUBLIC_SITE_URL=https://digitalmusicdatabase.com
NEXT_PUBLIC_SUPABASE_URL=<production-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-supabase-anon-key>
NEXT_PUBLIC_MAX_VIDEO_UPLOAD_MB=200
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not expose it in browser/client settings.

## Supabase Auth URL Settings

In Supabase Auth URL configuration:

| Setting | Value |
| --- | --- |
| Site URL | `https://digitalmusicdatabase.com` |
| Redirect URL | `https://digitalmusicdatabase.com` |
| Optional redirect URL | `https://www.digitalmusicdatabase.com` |
| Local development redirect | `http://localhost:3000` |

## Launch Verification

After DNS is active and the deployment is live:

1. Open `https://digitalmusicdatabase.com`.
2. Open `https://digitalmusicdatabase.com/api/launch/status`.
3. Confirm the Production Environment check shows the public site URL as ready.
4. Confirm login redirects return to `https://digitalmusicdatabase.com`.
5. Confirm artist and producer share pages use the production domain.
