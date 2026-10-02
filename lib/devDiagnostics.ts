import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Records how and why this server process ends, so that "the dev server was gone when I
 * came back" becomes a diagnosable event instead of a guess.
 *
 * The problem this solves: a process that dies leaves nothing behind. Next.js logs
 * requests, not its own death, so a server that exits cleanly on a signal and one that
 * is killed outright look identical afterwards — both just stop writing to the log.
 *
 * ## Reading the log
 *
 * One JSON object per line, in `.logs/dev-server.log` (override with `VINYL_DEV_LOG`).
 * The `heartbeat` line every 60s is what makes the rest interpretable: it brackets the
 * moment of death even when nothing else gets written. Match what you see against
 * these signatures:
 *
 * | What the tail of the log shows                      | What happened                        |
 * |-----------------------------------------------------|--------------------------------------|
 * | `signal` (SIGINT) then `exit` code 0                | Ctrl-C, or a deliberate stop         |
 * | `signal` (SIGTERM) then `exit`                      | something asked it to stop — a       |
 * |                                                     | supervisor, a harness, `kill`        |
 * | `signal` (SIGHUP) then `exit`                       | the controlling terminal went away   |
 * | `uncaughtException` / `unhandledRejection`          | an application bug killed it         |
 * | `heartbeat` and then nothing at all                 | SIGKILL, OOM, or power loss: no      |
 * |                                                     | handler ran, so nothing could log    |
 * | `heartbeat` with a large `gapSec`                   | the machine slept, or the event loop |
 * |                                                     | stalled, for that long               |
 *
 * The second-to-last row is the one that matters most. The absence of a shutdown record
 * is itself evidence — it rules out every graceful path and leaves only an unblockable
 * kill. To turn that inference into a fact, `scripts/dev-with-diagnostics.sh` logs the
 * wait status the OS reports for this process, under `source: "launcher"`; a
 * `launcher_child_exit` naming SIGKILL with no server-side `signal` line beside it is
 * the hard-kill fingerprint.
 *
 * `ppid` on each line is the other half of the story: if it reads 1, the process was
 * orphaned before it died, meaning whatever launched it exited first.
 *
 * ## Constraints this code works under
 *
 * - **Writes are synchronous.** On SIGTERM there may be only milliseconds before the
 *   process is gone, and a queued async write would never land.
 * - **Diagnostics never break the server.** Every write is wrapped; a failure to log is
 *   silently dropped, because a broken log file is not worth a broken dev server.
 * - **Default signal behavior is preserved.** Merely registering a listener for a
 *   signal stops Node from terminating on it, which would turn this logger into a
 *   server that can't be stopped. See `watchSignal` for how that is avoided.
 * - **The heartbeat timer is unref'd.** Per AGENTS.md, a pending timer keeps Node alive
 *   with nothing left to do; an unref'd timer cannot hold the process open.
 */

const HEARTBEAT_MS = 60_000

/**
 * Signals worth recording. Deliberately excludes SIGUSR1 (Node's debugger listens on
 * it) and SIGPIPE (routinely ignored, and noisy).
 */
const WATCHED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const

/**
 * Environment variables copied into the startup record, chosen to answer "what launched
 * this?" after the fact — an agent harness, a plain terminal, tmux, or an SSH session
 * all leave a different fingerprint here.
 *
 * An allowlist rather than a dump of `process.env`: this file holds a database URL and
 * a Discogs token, and neither belongs in a log.
 */
const CONTEXT_ENV_VARS = [
  'TERM_PROGRAM',
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'TMUX',
  'SSH_TTY',
  'NODE_ENV',
  'NEXT_RUNTIME',
]

let installed = false

function logFilePath(): string {
  return process.env.VINYL_DEV_LOG || join(process.cwd(), '.logs', 'dev-server.log')
}

function write(event: string, fields: Record<string, unknown> = {}): void {
  try {
    const path = logFilePath()
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(
      path,
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        source: 'server',
        pid: process.pid,
        ppid: process.ppid,
        ...fields,
      }) + '\n',
    )
  } catch {
    // A diagnostics failure must never take the server down with it.
  }
}

function rssMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024)
}

/**
 * Logs a signal without changing what the signal does.
 *
 * Node's rule: a signal with no listener terminates the process; a signal with any
 * listener does not. So this handler has to decide, at the moment it fires, whether
 * anyone else is handling the signal:
 *
 * - **Someone else is listening** (Next.js installs its own cleanup handlers) — log and
 *   return, leaving their shutdown untouched.
 * - **Nobody else is listening** — this listener is the only reason the process is still
 *   alive, so remove it and re-raise the signal, which now hits the default behavior.
 *
 * The count is checked at signal time, not at install time, because Next.js may add its
 * handlers after `register()` runs. `prependListener` guarantees this logs first either
 * way, so a record exists even if another handler exits immediately.
 */
function watchSignal(signal: (typeof WATCHED_SIGNALS)[number]): void {
  const handler = () => {
    const otherListeners = process.listenerCount(signal) - 1
    write('signal', {
      signal,
      otherListeners,
      uptimeSec: Math.round(process.uptime()),
      rssMb: rssMb(),
    })

    if (otherListeners === 0) {
      process.removeListener(signal, handler)
      process.kill(process.pid, signal)
    }
  }

  process.prependListener(signal, handler)
}

/**
 * Installs the shutdown recorder. Safe to call more than once; only the first call does
 * anything, because Next.js can initialize more than one server instance in a process.
 */
export function installDevDiagnostics(): void {
  if (installed) return
  installed = true

  const context: Record<string, string> = {}
  for (const name of CONTEXT_ENV_VARS) {
    const value = process.env[name]
    if (value) context[name] = value
  }

  write('server_start', {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cwd: process.cwd(),
    argv: process.argv.slice(1).join(' '),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    context,
  })

  for (const signal of WATCHED_SIGNALS) watchSignal(signal)

  // Registering these suppresses Node's default crash behavior, so when nothing else is
  // listening this restores it by hand: print the error and exit non-zero, exactly as an
  // uninstrumented process would. When Next.js is listening (its dev error overlay does
  // listen), defer — swallowing the error here would hide it from the browser.
  process.on('uncaughtException', (error, origin) => {
    write('uncaughtException', {
      origin,
      message: error.message,
      stack: error.stack,
      uptimeSec: Math.round(process.uptime()),
    })
    if (process.listenerCount('uncaughtException') === 1) {
      console.error(error)
      process.exit(1)
    }
  })

  process.on('unhandledRejection', (reason) => {
    write('unhandledRejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      uptimeSec: Math.round(process.uptime()),
    })
    if (process.listenerCount('unhandledRejection') === 1) {
      console.error(reason)
      process.exit(1)
    }
  })

  // Fires for every orderly exit — including ones no signal preceded, such as the event
  // loop emptying. Cannot fire on SIGKILL, which is what makes its absence meaningful.
  process.on('exit', (code) => {
    write('exit', { code, uptimeSec: Math.round(process.uptime()), rssMb: rssMb() })
  })

  // The heartbeat is the only record a hard kill leaves behind: the last one written
  // puts the death inside a 60-second window. `gapSec` appears when a beat arrives late,
  // which is how a sleeping machine or a stalled event loop shows up here.
  let lastBeat = Date.now()
  const heartbeat = setInterval(() => {
    const now = Date.now()
    const elapsed = now - lastBeat
    lastBeat = now
    write('heartbeat', {
      uptimeSec: Math.round(process.uptime()),
      rssMb: rssMb(),
      ...(elapsed > HEARTBEAT_MS * 2 ? { gapSec: Math.round(elapsed / 1000) } : {}),
    })
  }, HEARTBEAT_MS)

  // AGENTS.md: a pending timer keeps Node alive with nothing left to do. Unref'd, this
  // timer ticks while the server runs and never delays its exit.
  heartbeat.unref()
}
