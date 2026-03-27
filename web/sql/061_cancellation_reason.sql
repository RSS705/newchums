-- Add cancellation reason to events
-- Values: 'host_canceled', 'min_attendees_not_met', 'no_attendees', NULL (legacy/unknown)
ALTER TABLE newchums.events ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL;
