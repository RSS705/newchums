-- UI survey state matrix.
--
-- Everything the 3 Aug 2026 survey learned is baked in: both bugs it found
-- (the orphaned attendee overflow menu, the clipped shout-out placeholder)
-- existed only at the intersection of LONG CONTENT and the NARROWEST width,
-- so the fixtures push both axes on purpose: maximal display names and
-- handles, a long title, a long location, a long DM, plus every plan
-- lifecycle state, a hobby-less plan, and zero/one/many attendee counts.
--
-- Apply only to a throwaway database created by build-db.sh. Idempotent-ish:
-- ON CONFLICT guards on users/interests; re-running against a dirty DB is
-- not supported (drop and rebuild instead, it takes about a minute).
--
-- Notes for extenders (learned the hard way):
--   * event_rsvps.status is 'going' | 'maybe' | 'cant_make_it' (CHECK).
--   * event_invites enforces single identity: user_id XOR email.
--   * users.username_norm must be set or public profiles 404.
--   * in-person plans need location_lat/lng or the copy_from publish path
--     fails client validation ("pick a location from the suggestions").

INSERT INTO newchums.users (id, email, name, username, username_norm, role, email_verified_at, date_of_birth, accepted_legal_at) VALUES
 ('00000000-0000-4000-9100-000000000001','host@uitest.local','Maximilian Featherstonehaugh-Wellesley','maximilian-featherstonehaugh','maximilian-featherstonehaugh','user',NOW(),'1990-01-01',NOW()),
 ('00000000-0000-4000-9100-000000000002','att1@uitest.local','Konstantinos Papadopoulos','konstantinospapadop','konstantinospapadop','user',NOW(),'1991-01-01',NOW()),
 ('00000000-0000-4000-9100-000000000003','att2@uitest.local','Al B','al','al','user',NOW(),'1992-01-01',NOW()),
 ('00000000-0000-4000-9100-000000000004','att3@uitest.local','Priya Chandrasekaran','priya-chandrasekaran','priya-chandrasekaran','user',NOW(),'1993-01-01',NOW()),
 ('00000000-0000-4000-9100-000000000005','att4@uitest.local','Marcus Oduya','marcus-oduya','marcus-oduya','user',NOW(),'1994-01-01',NOW()),
 ('00000000-0000-4000-9100-000000000006','att5@uitest.local','Dani Fischer','dani-fischer','dani-fischer','user',NOW(),'1995-01-01',NOW()),
 ('00000000-0000-4000-9100-000000000007','att6@uitest.local','Sam Whitfield-Okonkwo','sam-whitfield-okonkwo','sam-whitfield-okonkwo','user',NOW(),'1996-01-01',NOW()),
 ('00000000-0000-4000-9100-000000000008','att7@uitest.local','Yuki Tanaka','yuki-tanaka','yuki-tanaka','user',NOW(),'1997-01-01',NOW()),
 ('00000000-0000-4000-9100-000000000009','att8@uitest.local','Rosa Delgado','rosa-delgado','rosa-delgado','user',NOW(),'1998-01-01',NOW()),
 ('00000000-0000-4000-9100-00000000000b','invitee@uitest.local','Ingrid Invited','ingrid-invited','ingrid-invited','user',NOW(),'1990-06-01',NOW()),
 ('00000000-0000-4000-9100-00000000000c','fresh@uitest.local','Fern Fresh','fern-fresh','fern-fresh','user',NOW(),'2000-01-01',NOW()),
 ('00000000-0000-4000-9100-00000000000d','admin@uitest.local','Ada Admin','ada-admin','ada-admin','super_admin',NOW(),'1985-01-01',NOW()),
 -- No username / dob / legal: the (app) layout bounces this user into the
 -- onboarding pages, which is how the harness reaches those states.
 ('00000000-0000-4000-9100-00000000000e','onboard@uitest.local','Ola Onboard',NULL,NULL,'user',NOW(),NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- The migration chain seeds default interests; pin the two we reference to
-- known ids so the event rows below can use them literally.
UPDATE newchums.interests SET id='00000000-0000-4000-9200-000000000001' WHERE slug='board-games';
UPDATE newchums.interests SET id='00000000-0000-4000-9200-000000000002' WHERE slug='pickleball';
INSERT INTO newchums.interests (id, name, slug, category) VALUES
 ('00000000-0000-4000-9200-000000000001','Board games','board-games','Games'),
 ('00000000-0000-4000-9200-000000000002','Pickleball','pickleball','Sport')
ON CONFLICT (slug) DO NOTHING;

-- Plans. Host is Maximilian throughout. Fixed ids ...a100-...01 through 09.
INSERT INTO newchums.events (id, host_user_id, title, description, starts_at, status, location_type, location_name, location_address, location_lat, location_lng, online_link, visibility, interest_id, max_seats, require_reconfirmation, min_confirmed_attendees, confirmation_sent_at, feedback_email_sent_at, run_again_nudge_processed_at, canceled_at, cancellation_reason, created_at) VALUES
 -- 01 confirm: window OPEN now, the widest chip combos, long title + location
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000001','Wednesday Night Board Games Marathon at the Community Hall (Bring Snacks)','<p>Long-running weekly session. All levels welcome.</p>', NOW() + INTERVAL '12 hours','published','in_person','The Old Curiosity Community Hall and Recreation Centre','1234 Wellington Road South, London, ON N6E 2Z2',42.9376,-81.2262,NULL,'public','00000000-0000-4000-9200-000000000001',8,true,3,NOW() - INTERVAL '2 hours',NULL,NOW(),NULL,NULL, NOW() - INTERVAL '20 days'),
 -- 02 one attendee
 ('00000000-0000-4000-a100-000000000002','00000000-0000-4000-9100-000000000001','Quiet chess afternoon',NULL, NOW() + INTERVAL '3 days','published','in_person','Central Library','251 Dundas St, London, ON',42.9849,-81.2453,NULL,'public','00000000-0000-4000-9200-000000000001',NULL,false,NULL,NULL,NULL,NOW(),NULL,NULL, NOW() - INTERVAL '5 days'),
 -- 03 zero attendees
 ('00000000-0000-4000-a100-000000000003','00000000-0000-4000-9100-000000000001','Sunrise pickleball',NULL, NOW() + INTERVAL '5 days','published','in_person','Smash Courts','1040 Wharncliffe Rd S, London, ON',42.9376,-81.2662,NULL,'public','00000000-0000-4000-9200-000000000002',4,false,NULL,NULL,NULL,NOW(),NULL,NULL, NOW() - INTERVAL '4 days'),
 -- 04 past: wrap-up surface live for host and attendee
 ('00000000-0000-4000-a100-000000000004','00000000-0000-4000-9100-000000000001','Last week''s trivia night',NULL, NOW() - INTERVAL '3 days','published','in_person','The Fox and Fiddle','355 Wellington St, London, ON',42.9840,-81.2500,NULL,'public','00000000-0000-4000-9200-000000000001',NULL,false,NULL,NULL,NOW() - INTERVAL '2 days',NOW(),NULL,NULL, NOW() - INTERVAL '12 days'),
 -- 05 cancelled after confirmations issued: didn't-confirm chips
 ('00000000-0000-4000-a100-000000000005','00000000-0000-4000-9100-000000000001','Cancelled kayak trip',NULL, NOW() - INTERVAL '1 day','canceled','in_person','Fanshawe Lake','1424 Clarke Rd, London, ON',43.0300,-81.1900,NULL,'public','00000000-0000-4000-9200-000000000002',6,true,4,NOW() - INTERVAL '2 days',NULL,NOW(),NOW() - INTERVAL '26 hours','min_attendees_not_met', NOW() - INTERVAL '9 days'),
 -- 06 draft (API-only state today; the create UI always publishes)
 ('00000000-0000-4000-a100-000000000006','00000000-0000-4000-9100-000000000001','Draft: maybe a hike?',NULL, NOW() + INTERVAL '10 days','draft','in_person','Komoka Provincial Park','133 Queen St, Komoka, ON',42.9570,-81.4360,NULL,'public','00000000-0000-4000-9200-000000000002',NULL,false,NULL,NULL,NULL,NOW(),NULL,NULL, NOW() - INTERVAL '2 days'),
 -- 07 no hobby (possible since Aug 2026)
 ('00000000-0000-4000-a100-000000000007','00000000-0000-4000-9100-000000000001','Just a casual meetup, no theme',NULL, NOW() + INTERVAL '4 days','published','in_person','Victoria Park','509 Clarence St, London, ON',42.9880,-81.2490,NULL,'public',NULL,NULL,false,NULL,NULL,NULL,NOW(),NULL,NULL, NOW() - INTERVAL '1 day'),
 -- 08 many attendees
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000001','Big potluck in the park',NULL, NOW() + INTERVAL '6 days','published','in_person','Springbank Park','1085 Commissioners Rd W, London, ON',42.9560,-81.3150,NULL,'public','00000000-0000-4000-9200-000000000001',20,false,NULL,NULL,NULL,NOW(),NULL,NULL, NOW() - INTERVAL '3 days'),
 -- 09 online
 ('00000000-0000-4000-a100-000000000009','00000000-0000-4000-9100-000000000001','Online strategy chat','<p>Zoom while we plan the season.</p>', NOW() + INTERVAL '2 days','published','online',NULL,NULL,NULL,NULL,'https://zoom.example.com/j/12345','public','00000000-0000-4000-9200-000000000001',NULL,false,NULL,NULL,NULL,NOW(),NULL,NULL, NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO newchums.event_interests (event_id, interest_id)
SELECT e.id, e.interest_id FROM newchums.events e WHERE e.interest_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO newchums.event_rsvps (event_id, user_id, status) VALUES
 -- 01: chip zoo (confirmed / pending / declined-confirmation / maybe / can't)
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000002','going'),
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000003','going'),
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000004','going'),
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000005','maybe'),
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000006','cant_make_it'),
 ('00000000-0000-4000-a100-000000000002','00000000-0000-4000-9100-000000000002','going'),
 ('00000000-0000-4000-a100-000000000004','00000000-0000-4000-9100-000000000002','going'),
 ('00000000-0000-4000-a100-000000000004','00000000-0000-4000-9100-000000000004','going'),
 ('00000000-0000-4000-a100-000000000005','00000000-0000-4000-9100-000000000002','going'),
 ('00000000-0000-4000-a100-000000000005','00000000-0000-4000-9100-000000000003','going'),
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000002','going'),
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000003','going'),
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000004','going'),
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000005','going'),
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000006','going'),
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000007','going'),
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000008','going'),
 ('00000000-0000-4000-a100-000000000008','00000000-0000-4000-9100-000000000009','going'),
 ('00000000-0000-4000-a100-000000000009','00000000-0000-4000-9100-000000000002','going')
ON CONFLICT DO NOTHING;

INSERT INTO newchums.event_confirmations (event_id, user_id, status, responded_at) VALUES
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000002','confirmed',NOW() - INTERVAL '1 hour'),
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000003','pending',NULL),
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-000000000004','declined',NOW() - INTERVAL '30 minutes'),
 ('00000000-0000-4000-a100-000000000005','00000000-0000-4000-9100-000000000002','pending',NULL),
 ('00000000-0000-4000-a100-000000000005','00000000-0000-4000-9100-000000000003','pending',NULL)
ON CONFLICT DO NOTHING;

-- Invited but not responded (single identity: user_id, no email).
INSERT INTO newchums.event_invites (event_id, user_id, email, invited_by) VALUES
 ('00000000-0000-4000-a100-000000000001','00000000-0000-4000-9100-00000000000b',NULL,'00000000-0000-4000-9100-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO newchums.user_contacts (user_id, type, linked_user_id, contact_name) VALUES
 ('00000000-0000-4000-9100-000000000001','on_newchums','00000000-0000-4000-9100-000000000002','Konstantinos Papadopoulos'),
 ('00000000-0000-4000-9100-000000000001','on_newchums','00000000-0000-4000-9100-000000000003','Al B')
ON CONFLICT DO NOTHING;

INSERT INTO newchums.dm_conversations (id, user_a, user_b, created_by, last_message_at) VALUES
 ('00000000-0000-4000-9300-000000000001','00000000-0000-4000-9100-000000000001','00000000-0000-4000-9100-000000000002','00000000-0000-4000-9100-000000000002',NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO newchums.dm_messages (conversation_id, sender_user_id, body) VALUES
 ('00000000-0000-4000-9300-000000000001','00000000-0000-4000-9100-000000000002','Hey Maximilian, quick heads up that I might be about fifteen minutes late on Wednesday because my train gets in at quarter past, but I am absolutely still coming and I will bring the expansion boxes we talked about last week, plus extra table space organisers.');

INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata) VALUES
 ('00000000-0000-4000-9100-000000000001','event_rsvp','00000000-0000-4000-9100-000000000002','00000000-0000-4000-a100-000000000001','{"eventTitle":"Wednesday Night Board Games Marathon at the Community Hall (Bring Snacks)","rsvpStatus":"Going"}'),
 ('00000000-0000-4000-9100-000000000001','run_it_again',NULL,'00000000-0000-4000-a100-000000000004','{"eventTitle":"Last week''s trivia night"}');
