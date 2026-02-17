-- Chunk 15: Seed interests (~35 items across 9 categories)
-- Run after 015_profile_core.sql
-- Uses ON CONFLICT DO NOTHING for idempotency if interests.id were used; slugs are unique.

INSERT INTO interests (name, category, slug, sort_order) VALUES
-- Board Games (1-10)
('Board Games', 'Board Games', 'board-games', 1),
('Strategy Games', 'Board Games', 'strategy-games', 2),
('Party Games', 'Board Games', 'party-games', 3),
('D&D / Tabletop RPG', 'Board Games', 'dnd-tabletop-rpg', 4),
('Card Games', 'Board Games', 'card-games', 5),
('Chess', 'Board Games', 'chess', 6),
-- Video Games (7-12)
('Video Games', 'Video Games', 'video-games', 7),
('Co-op Gaming', 'Video Games', 'co-op-gaming', 8),
('Retro Gaming', 'Video Games', 'retro-gaming', 9),
('Esports', 'Video Games', 'esports', 10),
-- Sports/Fitness (11-16)
('Running', 'Sports/Fitness', 'running', 11),
('Yoga', 'Sports/Fitness', 'yoga', 12),
('Pickup Sports', 'Sports/Fitness', 'pickup-sports', 13),
('Gym & Weights', 'Sports/Fitness', 'gym-weights', 14),
('Swimming', 'Sports/Fitness', 'swimming', 15),
-- Outdoors (17-21)
('Hiking', 'Outdoors', 'hiking', 17),
('Camping', 'Outdoors', 'camping', 18),
('Cycling', 'Outdoors', 'cycling', 19),
('Photography', 'Outdoors', 'photography', 20),
-- Arts (22-25)
('Drawing & Sketching', 'Arts', 'drawing-sketching', 22),
('Painting', 'Arts', 'painting', 23),
('Pottery', 'Arts', 'pottery', 24),
('Crafting', 'Arts', 'crafting', 25),
-- Music (26-29)
('Live Music', 'Music', 'live-music', 26),
('Open Mic', 'Music', 'open-mic', 27),
('Concerts', 'Music', 'concerts', 28),
('Karaoke', 'Music', 'karaoke', 29),
-- Food/Drink (30-33)
('Cooking', 'Food/Drink', 'cooking', 30),
('Coffee & Cafés', 'Food/Drink', 'coffee-cafes', 31),
('Wine Tasting', 'Food/Drink', 'wine-tasting', 32),
('Food Tours', 'Food/Drink', 'food-tours', 33),
-- Learning (34-36)
('Book Clubs', 'Learning', 'book-clubs', 34),
('Language Exchange', 'Learning', 'language-exchange', 35),
('Workshops', 'Learning', 'workshops', 36),
-- Tech (37-39)
('Coding & Dev', 'Tech', 'coding-dev', 37),
('Maker / DIY', 'Tech', 'maker-diy', 38),
('Tech Meetups', 'Tech', 'tech-meetups', 39)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;
