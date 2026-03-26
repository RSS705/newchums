-- Migration 058: Make travel_radius_km nullable
--
-- When a user skips the location step during signup (or clears their
-- location later), travel_radius_km should be NULL rather than an
-- arbitrary default.  The column currently has a NOT NULL constraint
-- which causes a 500 on signup when no location is provided.
--
-- Run: psql "$DATABASE_URL" -f web/sql/058_nullable_travel_radius.sql

ALTER TABLE user_profile ALTER COLUMN travel_radius_km DROP NOT NULL;
