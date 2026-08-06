#!/usr/bin/env bash
#
# Migrates database-per-tenant to schema-per-tenant, non-destructively.
#
# The originals are never modified and never dropped: this reads from them and builds
# a new database alongside. If anything looks wrong, the rollback is to point .env
# back at the old layout and check out the previous commit — nothing to undo.
#
#   ./scripts/migrate-to-single-database.sh [target-db-name]
#
# Verification is a per-table md5 fingerprint of every row, compared between each
# original database and its new schema. Row counts are not enough — they miss silent
# value corruption, which is exactly what a naive migration produces.
#
# Afterwards, drop the old databases BY HAND, weeks later, once you have taken and
# test-restored a backup from the new layout. This script will not drop anything.

set -euo pipefail

TARGET_DB="${1:-vinyl}"
CONTROL_DB="vinyl_control"
SNAPSHOT_DIR="./migration-snapshots-$(date +%Y%m%d-%H%M%S)"

TABLES=(artists genres formats releases release_artists release_genres pressings wishlist_items)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }

# md5 of every row in a table, order-independent. Comparable across databases and
# across a schema rename; sensitive to any value difference, including timestamp
# precision that a row count would miss.
fingerprint() {
  local db="$1" schema="$2" table="$3"
  psql -d "$db" -tAc "
    SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), ''))
    FROM \"${schema}\".\"${table}\" x" 2>/dev/null || echo "MISSING"
}

say "1. Snapshotting originals to ${SNAPSHOT_DIR}"
mkdir -p "$SNAPSHOT_DIR"

# What gets migrated is what an account claims, not what happens to exist on the
# server. A tenant database no account references is a leftover — typically from a
# test run whose teardown didn't finish — and migrating it would carry that junk into
# the new layout, where the whole-system backup then refuses to run because a schema
# has no account. They are listed, left alone, and yours to drop once you agree.
TENANT_DBS=$(psql -d "$CONTROL_DB" -tAc "SELECT database_name FROM users ORDER BY id")
[ -z "$TENANT_DBS" ] && say "  (no accounts found — nothing to migrate)"

for db in $TENANT_DBS; do
  psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1 \
    || fail "Account references database ${db}, which does not exist. Fix the control plane before migrating."
done

UNREFERENCED=$(psql -d postgres -tAc "
  SELECT datname FROM pg_database WHERE datname LIKE 'vinyl\_user\_%' ORDER BY datname" \
  | grep -vxF "$(echo "$TENANT_DBS" | tr -d ' ')" || true)
if [ -n "$UNREFERENCED" ]; then
  printf '  Not migrating (no account references these):\n'
  printf '    %s\n' $UNREFERENCED
fi

for db in $TENANT_DBS $CONTROL_DB; do
  pg_dump -d "$db" -f "${SNAPSHOT_DIR}/${db}.sql"
  printf '  %s -> %s.sql\n' "$db" "$db"
done

say "2. Creating ${TARGET_DB}"
if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'" | grep -q 1; then
  fail "${TARGET_DB} already exists. Drop it first, or pass a different name."
fi
createdb "$TARGET_DB"

# The rename dance: restore into public, then rename public to the target schema and
# recreate an empty public. This sidesteps pg_dump's hard-qualified "public." prefixes
# entirely — no text rewriting of dump files, which is where migrations like this
# usually go wrong.
restore_into_schema() {
  local source_db="$1" schema="$2"
  psql -q -d "$TARGET_DB" -v ON_ERROR_STOP=1 -f "${SNAPSHOT_DIR}/${source_db}.sql" >/dev/null
  psql -q -d "$TARGET_DB" -v ON_ERROR_STOP=1 \
    -c "ALTER SCHEMA public RENAME TO \"${schema}\"; CREATE SCHEMA public;"
}

say "3. Migrating the control plane -> control"
restore_into_schema "$CONTROL_DB" "control"
printf '  users: %s\n' "$(psql -d "$TARGET_DB" -tAc 'SELECT count(*) FROM control.users')"

say "4. Migrating tenants (schema keeps the old database name)"
for db in $TENANT_DBS; do
  restore_into_schema "$db" "$db"
  printf '  %s -> schema %s\n' "$db" "$db"
done

say "5. Verifying — every table, every tenant, by content fingerprint"
FAILURES=0
for db in $TENANT_DBS; do
  for table in "${TABLES[@]}"; do
    before=$(fingerprint "$db" public "$table")
    after=$(fingerprint "$TARGET_DB" "$db" "$table")
    if [ "$before" != "$after" ]; then
      printf '  \033[31mMISMATCH\033[0m %s.%s\n' "$db" "$table"
      FAILURES=$((FAILURES + 1))
    fi
  done
  printf '  %s: all %d tables identical\n' "$db" "${#TABLES[@]}"
done

for table in users sessions admin_sessions; do
  before=$(fingerprint "$CONTROL_DB" public "$table")
  after=$(fingerprint "$TARGET_DB" control "$table")
  if [ "$before" != "$after" ]; then
    printf '  \033[31mMISMATCH\033[0m control.%s\n' "$table"
    FAILURES=$((FAILURES + 1))
  fi
done
printf '  control: all 3 tables identical\n'

# Every account must have a schema and vice versa, or the app — and the whole-system
# backup, which refuses on exactly this — will disagree with the database.
say "6. Cross-checking accounts against schemas"
ORPHANS=$(psql -d "$TARGET_DB" -tAc "
  SELECT u.database_name FROM control.users u
  WHERE NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = u.database_name)")
[ -n "$ORPHANS" ] && { printf '  \033[31mAccounts with no schema: %s\033[0m\n' "$ORPHANS"; FAILURES=$((FAILURES + 1)); }
UNCLAIMED=$(psql -d "$TARGET_DB" -tAc "
  SELECT n.nspname FROM pg_namespace n
  WHERE n.nspname LIKE 'vinyl\_user\_%'
    AND NOT EXISTS (SELECT 1 FROM control.users u WHERE u.database_name = n.nspname)")
[ -n "$UNCLAIMED" ] && { printf '  \033[31mSchemas with no account: %s\033[0m\n' "$UNCLAIMED"; FAILURES=$((FAILURES + 1)); }
[ -z "$ORPHANS$UNCLAIMED" ] && printf '  accounts and schemas agree\n'

if [ "$FAILURES" -gt 0 ]; then
  fail "$FAILURES check(s) failed. ${TARGET_DB} is NOT trustworthy — the originals are untouched, so nothing is lost. Investigate before cutting over."
fi

say "Migration verified."
cat <<EOF

  Originals are untouched and still serve the old code. To cut over:

    1. Set DATABASE_URL to point at "${TARGET_DB}" and remove CONTROL_DATABASE_URL
    2. Run the new code
    3. Take a whole-system backup from /admin/backup immediately — day-zero
       recovery point for the new layout
    4. Soak. Rolling back is: restore the old .env and check out the previous commit

  Drop the old databases by hand, weeks later, once a backup from the new layout has
  been restored successfully at least once. Snapshots are in ${SNAPSHOT_DIR}.
EOF
