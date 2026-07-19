<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Responsive UI stability lock

Desktop and mobile chrome layouts are frozen. Do not change shared breakpoints, sidebar, topbar, search, language selector, Grid/List toggle, hero, Home recommendation card geometry, or global player height/behavior for feature work. Isolate feature UI to that component only.

- Contract: `lib/ui/responsive-stability-lock.ts`
- Policy: `docs/responsive-ui-stability-lock.md`
- Verify: `npm run verify:layout` (or `npm run verify:ui-all`)
