-- Migration 008: Replace interests seed list with generic base list
-- Run (from web/): psql "$DATABASE_URL" -f sql/008_interests_seed.sql
-- Requires: interests, user_interests tables exist. Safe to run multiple times.

-- Ensure slug has unique constraint for ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_interests_slug_unique ON interests(slug);

-- Add is_seed to distinguish seed vs user-created
ALTER TABLE interests ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT false;

-- Remove legacy seed items (only if not selected by any user; preserves user_interests FK)
DELETE FROM interests
WHERE slug = ANY(ARRAY[
  'esports', 'maker-diy', 'd-and-d-one-shot', 'board-games-casual', 'tech-meetups'
])
AND NOT EXISTS (SELECT 1 FROM user_interests ui WHERE ui.interest_id = interests.id);

-- Insert new generic seed list (ON CONFLICT skips existing slugs, e.g. user-created)
INSERT INTO interests (name, category, slug, sort_order, is_seed) VALUES
  ('Drawing', '', 'drawing', 1, true),
  ('Painting', '', 'painting', 2, true),
  ('Pottery', '', 'pottery', 3, true),
  ('Photography', '', 'photography', 4, true),
  ('Knitting', '', 'knitting', 5, true),
  ('Crafts', '', 'crafts', 6, true),
  ('Board games', '', 'board-games', 7, true),
  ('Card games', '', 'card-games', 8, true),
  ('D&D', '', 'd-and-d', 9, true),
  ('Tabletop RPGs', '', 'tabletop-rpgs', 10, true),
  ('Chess', '', 'chess', 11, true),
  ('Trivia', '', 'trivia', 12, true),
  ('Coffee', '', 'coffee', 13, true),
  ('Cooking', '', 'cooking', 14, true),
  ('Baking', '', 'baking', 15, true),
  ('Restaurants', '', 'restaurants', 16, true),
  ('Wine tasting', '', 'wine-tasting', 17, true),
  ('Breweries', '', 'breweries', 18, true),
  ('Walking', '', 'walking', 19, true),
  ('Hiking', '', 'hiking', 20, true),
  ('Camping', '', 'camping', 21, true),
  ('Cycling', '', 'cycling', 22, true),
  ('Fishing', '', 'fishing', 23, true),
  ('Picnics', '', 'picnics', 24, true),
  ('Gym', '', 'gym', 25, true),
  ('Yoga', '', 'yoga', 26, true),
  ('Running', '', 'running', 27, true),
  ('Swimming', '', 'swimming', 28, true),
  ('Tennis', '', 'tennis', 29, true),
  ('Pickleball', '', 'pickleball', 30, true),
  ('Basketball', '', 'basketball', 31, true),
  ('Soccer', '', 'soccer', 32, true),
  ('Book club', '', 'book-club', 33, true),
  ('Language exchange', '', 'language-exchange', 34, true),
  ('Museums', '', 'museums', 35, true),
  ('Live music', '', 'live-music', 36, true),
  ('Concerts', '', 'concerts', 37, true),
  ('Volunteering', '', 'volunteering', 38, true),
  ('Video games', '', 'video-games', 39, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_seed = true,
  sort_order = EXCLUDED.sort_order;
