-- Chunk 15: Profile Core (interests, user_profile, user_interests)
-- Run against Neon with search_path including newchums, public.
-- Ensure PostGIS is enabled: CREATE EXTENSION IF NOT EXISTS postgis;

-- Interests catalog (seeded separately)
CREATE TABLE IF NOT EXISTS interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User interests junction
CREATE TABLE IF NOT EXISTS user_interests (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest_id UUID NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, interest_id)
);
CREATE INDEX IF NOT EXISTS idx_user_interests_user_id ON user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_interest_id ON user_interests(interest_id);

-- User profile (location, radius, email prefs)
CREATE TABLE IF NOT EXISTS user_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  home_city TEXT,
  home_lat DOUBLE PRECISION,
  home_lng DOUBLE PRECISION,
  home_location GEOGRAPHY(POINT, 4326),
  travel_radius_km INT NOT NULL DEFAULT 25 CHECK (travel_radius_km BETWEEN 1 AND 200),
  email_chat_digest BOOLEAN NOT NULL DEFAULT true,
  email_new_events BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_profile_home_location ON user_profile USING GIST (home_location);

-- Trigger to set updated_at on user_profile update
CREATE OR REPLACE FUNCTION set_user_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profile_updated_at ON user_profile;
CREATE TRIGGER trg_user_profile_updated_at
  BEFORE UPDATE ON user_profile
  FOR EACH ROW
  EXECUTE PROCEDURE set_user_profile_updated_at();
