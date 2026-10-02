#!/bin/bash
#
# Launches `next dev` and records how it ended, into the same log the in-process
# recorder writes (lib/devDiagnostics.ts — read its header for how to interpret a run).
#
# Why a wrapper at all: a process cannot log its own SIGKILL. Nothing runs in a process
# after SIGKILL — no handler, no exit hook — so from inside, a hard kill and a power cut
# are indistinguishable. The parent shell, however, outlives the child and is told
# exactly how it died via the wait status. That makes this script the only place a hard
# kill can be positively identified rather than inferred.
#
# The two logs answer different questions, and the pairing is the point:
#
#   server_start / signal / exit     — what the server itself saw
#   launcher_*                       — what the OS reported about the server's death
#
# A `launcher_child_exit` with `signalName: SIGKILL` and no matching server-side `signal`
# line is the unambiguous hard-kill fingerprint.

set -u

repo="$(cd "$(dirname "$0")/.." && pwd)"
log="${VINYL_DEV_LOG:-$repo/.logs/dev-server.log}"
mkdir -p "$(dirname "$log")"

# Exported so the Next.js process writes to the same file as this script.
export VINYL_DEV_LOG="$log"

emit() {
  event="$1"
  extra="${2:-}"
  [ -n "$extra" ] && extra=",$extra"
  printf '{"ts":"%s","event":"%s","source":"launcher","pid":%s,"ppid":%s%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$event" "$$" "$PPID" "$extra" >> "$log"
}

# macOS signal numbers. Only the ones a dev server plausibly dies of.
signal_name() {
  case "$1" in
    1) echo SIGHUP ;;    2) echo SIGINT ;;   3) echo SIGQUIT ;;  6) echo SIGABRT ;;
    9) echo SIGKILL ;;  11) echo SIGSEGV ;; 13) echo SIGPIPE ;; 15) echo SIGTERM ;;
    *) echo "SIG$1" ;;
  esac
}

if [ -t 1 ]; then tty=true; else tty=false; fi
emit launcher_start "\"tty\":$tty,\"log\":\"$log\",\"args\":\"$*\""

child=""

# A signal sent to the foreground process group reaches the child directly, so this
# forwarding is belt-and-braces for the case where only this script is signaled (a
# supervisor killing the launcher by pid). Logging it distinguishes "the launcher was
# told to stop" from "the server died on its own".
on_signal() {
  emit launcher_signal "\"signal\":\"SIG$1\""
  if [ -n "$child" ]; then kill -"$1" "$child" 2>/dev/null || true; fi
}
for s in INT TERM HUP QUIT; do
  # shellcheck disable=SC2064  # expand $s now, at trap definition
  trap "on_signal $s" "$s"
done

"$repo/node_modules/.bin/next" dev "$@" &
child=$!
emit launcher_child_start "\"childPid\":$child"

# A trapped signal interrupts `wait`, which then returns 128+signum rather than the
# child's status. When that happens and the child is still alive, go back to waiting —
# otherwise this script would report its own interruption as the child's fate.
while :; do
  wait "$child"
  status=$?
  if [ "$status" -gt 128 ] && kill -0 "$child" 2>/dev/null; then continue; fi
  break
done

if [ "$status" -gt 128 ]; then
  signum=$((status - 128))
  emit launcher_child_exit \
    "\"status\":$status,\"signal\":$signum,\"signalName\":\"$(signal_name "$signum")\""
else
  emit launcher_child_exit "\"status\":$status"
fi

exit "$status"
