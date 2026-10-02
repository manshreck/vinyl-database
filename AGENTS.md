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

# Start the dev server detached, or it will be killed

A dev server launched as an agent's tracked background task does not survive. When the
harness tears the task down it sends SIGTERM to the launcher, and the whole process group
goes with it — including a server that was healthy and serving requests.

**Start it detached, so it reparents to launchd and outlives the session:**

```bash
mkdir -p .logs && nohup ./scripts/dev-with-diagnostics.sh > .logs/dev-stdout.log 2>&1 &
```

Keep the `mkdir`: `.logs/` is gitignored and absent in a fresh clone, and the shell opens
that redirect before the script can create the directory — without it you get `no such
file or directory` and no server.

Stop it with `pkill -f dev-with-diagnostics`. Confirm it detached by checking that its
`ppid` is 1 (`ps -o pid,ppid,command -p <pid>`); if the ppid is anything else, it is
still inside the session's tree and will die with it.

**Do not diagnose a vanished dev server from the request log.** Next.js logs requests,
not its own death, so a clean signal shutdown and a hard kill look identical there —
both just stop writing. `.logs/dev-server.log` is what records the death;
`lib/devDiagnostics.ts` holds the table mapping its signatures to causes.

A `launcher_signal` SIGTERM line in that log is this problem, not an application fault.
Confirmed twice on 2026-10-02, the second time with the server at 30 MB RSS, 57 minutes'
uptime, and a 37 ms request served thirty seconds before it was killed. Tom runs this app
from his own terminal for weeks at a time without incident; the variable is process
ownership, not the app, so don't go looking for a leak or a database problem.
