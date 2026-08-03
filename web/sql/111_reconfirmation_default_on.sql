-- Migration 111: the 24-hour attendance check defaults ON for new plans.
--
-- The check is the product's core "plans actually happen" behaviour, and it
-- was off unless a host found the toggle inside a collapsed section. New
-- plans now get it unless the host turns it off; existing rows keep whatever
-- they have (a column default only applies to new inserts, and the API sends
-- the value explicitly anyway; this keeps the schema honest about intent).

ALTER TABLE newchums.events
  ALTER COLUMN require_reconfirmation SET DEFAULT true;
