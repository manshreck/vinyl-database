-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "condition_grade" AS ENUM ('P', 'FR', 'G', 'G+', 'VG-', 'VG', 'VG+', 'NM', 'M', 'S');

-- CreateTable
CREATE TABLE "artists" (
    "artist_id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "sort_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("artist_id")
);

-- CreateTable
CREATE TABLE "genres" (
    "genre_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("genre_id")
);

-- CreateTable
CREATE TABLE "formats" (
    "format_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "formats_pkey" PRIMARY KEY ("format_id")
);

-- CreateTable
CREATE TABLE "releases" (
    "release_id" SERIAL NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "original_release_year" SMALLINT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("release_id")
);

-- CreateTable
CREATE TABLE "release_artists" (
    "release_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "artist_order" SMALLINT NOT NULL DEFAULT 1,
    "role" VARCHAR(100) NOT NULL DEFAULT 'Primary Artist',

    CONSTRAINT "release_artists_pkey" PRIMARY KEY ("release_id","artist_id")
);

-- CreateTable
CREATE TABLE "release_genres" (
    "release_id" INTEGER NOT NULL,
    "genre_id" INTEGER NOT NULL,
    "genre_order" SMALLINT NOT NULL DEFAULT 1,

    CONSTRAINT "release_genres_pkey" PRIMARY KEY ("release_id","genre_id")
);

-- CreateTable
CREATE TABLE "pressings" (
    "pressing_id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "format_id" INTEGER NOT NULL,
    "pressing_year" SMALLINT,
    "country" VARCHAR(100),
    "label" VARCHAR(255),
    "catalog_number" VARCHAR(100),
    "vinyl_color" VARCHAR(100),
    "disc_count" SMALLINT NOT NULL DEFAULT 1,
    "record_condition" "condition_grade" NOT NULL,
    "sleeve_condition" "condition_grade",
    "notes" TEXT,
    "purchase_price" DECIMAL(10,2),
    "purchase_date" DATE,
    "current_value" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pressings_pkey" PRIMARY KEY ("pressing_id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "wishlist_item_id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "format_id" INTEGER NOT NULL,
    "pressing_year" SMALLINT,
    "country" VARCHAR(100),
    "label" VARCHAR(255),
    "catalog_number" VARCHAR(100),
    "vinyl_color" VARCHAR(100),
    "disc_count" SMALLINT NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("wishlist_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_artist_name" ON "artists"("name");

-- CreateIndex
CREATE INDEX "idx_artists_sort_name" ON "artists"("sort_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_genre_name" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_format_name" ON "formats"("name");

-- CreateIndex
CREATE INDEX "idx_releases_orig_year" ON "releases"("original_release_year");

-- CreateIndex
CREATE INDEX "idx_releases_title" ON "releases"("title");

-- CreateIndex
CREATE INDEX "idx_release_artists_artist" ON "release_artists"("artist_id");

-- CreateIndex
CREATE INDEX "idx_release_genres_genre" ON "release_genres"("genre_id");

-- CreateIndex
CREATE INDEX "idx_pressings_catalog" ON "pressings"("catalog_number");

-- CreateIndex
CREATE INDEX "idx_pressings_format" ON "pressings"("format_id");

-- CreateIndex
CREATE INDEX "idx_pressings_pressing_year" ON "pressings"("pressing_year");

-- CreateIndex
CREATE INDEX "idx_pressings_record_cond" ON "pressings"("record_condition");

-- CreateIndex
CREATE INDEX "idx_pressings_release" ON "pressings"("release_id");

-- CreateIndex
CREATE INDEX "idx_wishlist_items_format" ON "wishlist_items"("format_id");

-- CreateIndex
CREATE INDEX "idx_wishlist_items_release" ON "wishlist_items"("release_id");

-- AddForeignKey
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("artist_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("release_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "release_genres" ADD CONSTRAINT "release_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("genre_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "release_genres" ADD CONSTRAINT "release_genres_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("release_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pressings" ADD CONSTRAINT "pressings_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("format_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pressings" ADD CONSTRAINT "pressings_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("release_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("format_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("release_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

