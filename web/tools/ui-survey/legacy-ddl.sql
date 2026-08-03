-- Legacy pre-migration tables (interests, user_profile, user_interests).
-- These predate the web/sql migration chain and must exist before it runs.
-- Snapshot generated from the production catalogs on 2026-08-03 via the
-- pg_attribute/format_type/pg_get_constraintdef query in generate-legacy-ddl.sh;
-- regenerate with that script if the live shapes ever change.

CREATE TABLE IF NOT EXISTS newchums.interests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  slug text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_seed boolean DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by_user_id uuid,
  updated_at timestamp with time zone,
  updated_by_user_id uuid,
  deleted_at timestamp with time zone,
  deleted_by_user_id uuid,
  merged_into_interest_id uuid,
  PRIMARY KEY (id),
  UNIQUE (slug)
);
CREATE TABLE IF NOT EXISTS newchums.user_profile (
  user_id uuid NOT NULL,
  home_city text,
  home_lat double precision,
  home_lng double precision,
  home_location geography(Point,4326),
  travel_radius_km integer DEFAULT 25,
  email_chat_digest boolean NOT NULL DEFAULT true,
  email_new_events boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  bio character varying(500),
  notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  chat_digest_sent_at timestamp with time zone,
  event_digest_sent_at timestamp with time zone,
  PRIMARY KEY (user_id),
  CHECK (((travel_radius_km >= 1) AND (travel_radius_km <= 200)))
);
CREATE TABLE IF NOT EXISTS newchums.user_interests (
  user_id uuid NOT NULL,
  interest_id uuid NOT NULL,
  PRIMARY KEY (user_id, interest_id)
);
