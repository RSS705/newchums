-- 072: Add private flag to roadmap items.
--
-- Until now, the only way to keep a feedback/suggestion private was to leave
-- it in the "received" status — once a super admin updated the status to e.g.
-- "planned", the item became visible to everyone. This made it hard to keep
-- items containing personal information out of public view while still
-- progressing them through the workflow.
--
-- The new `is_private` flag lets a super admin keep an item visible only to
-- the original author and other super admins, regardless of its status. The
-- existing "received status hides from non-author non-admin" rule still
-- applies; the two gates are OR'd together.

ALTER TABLE newchums.roadmap_items
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
