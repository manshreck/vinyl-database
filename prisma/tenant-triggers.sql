-- Tenant change counter.
--
-- Applied after tenant-schema.sql when a tenant is provisioned (lib/provisionTenant.ts).
-- Kept in its own file because `prisma migrate diff` generates tables, not triggers —
-- regenerating tenant-schema.sql will never produce any of this.
--
-- Why a counter and not a timestamp: a client caching the collection needs to know
-- whether its copy is stale, and `max(updated_at)` cannot see a deletion. Moving a
-- wishlist entry into the collection is half a DELETE, so a timestamp-based check
-- would miss exactly the case this exists for.
--
-- Why triggers and not a bump in each service: a service function can be forgotten by
-- whoever writes the next one, and the failure is silent — a client serves stale data
-- and nothing errors. A trigger cannot be forgotten, and it also catches writes made
-- from the web app, the API, a migration or psql alike.

CREATE TABLE IF NOT EXISTS collection_version (
  -- Single-row table: the CHECK plus the primary key make a second row impossible.
  id         boolean     PRIMARY KEY DEFAULT true CHECK (id),
  version    bigint      NOT NULL DEFAULT 1,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Self-seeding rather than pre-inserted: the row is derived state, so a schema with no
-- mutations yet legitimately has none, and getCollectionVersion reports "0". It also
-- keeps the table safe to leave out of exports — nothing has to reconcile a seed row
-- with a restored one.
CREATE OR REPLACE FUNCTION bump_collection_version() RETURNS trigger AS $$
BEGIN
  INSERT INTO collection_version (id, version, changed_at)
  VALUES (true, 1, now())
  ON CONFLICT (id) DO UPDATE
    SET version = collection_version.version + 1, changed_at = now();
  -- AFTER STATEMENT trigger: the return value is ignored.
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- FOR EACH STATEMENT, not FOR EACH ROW: one bump per statement however many rows it
-- touched. The trade is that a statement matching zero rows still bumps, so a client
-- can occasionally refetch when nothing actually changed. That direction is the safe
-- one — a spurious refresh costs one request, a missed change serves wrong data.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pressings', 'wishlist_items', 'releases', 'artists',
    'release_artists', 'release_genres', 'genres', 'formats'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'bump_version_' || t, t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
         FOR EACH STATEMENT EXECUTE FUNCTION bump_collection_version()',
      'bump_version_' || t, t
    );
  END LOOP;
END $$;
