<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# `getTenantPrisma` is for request handling only

`lib/prisma.ts` caches a `PrismaClient` per tenant on `globalThis`, held open by a
30-minute idle-eviction timer. That is deliberate for a long-running server serving
requests, and wrong for anything else.

**Code that runs outside a request — exports, scripts, migrations, one-shot jobs —
must open its own short-lived `pg` `Client` and close it in a `finally`.** See
`lib/exportTenant.ts` and `lib/exportCollectionCsv.ts` for the shape.

Reaching for `getTenantPrisma` in that kind of code appears to work and then hangs the
process: the pending timer and open pool keep Node alive with nothing left to do. It
surfaces as a Jest run that finishes its assertions and never exits, which reads like a
test problem and isn't.
