-- 051: Add plan-level chum preference overrides
-- Allows hosts to relax their chum preferences for individual plans.
-- NULL = use host's profile defaults (backward compatible).
-- { "disabled": true } = disable all chum preference filtering for this plan.
-- { "disabled_metrics": ["sociability", ...] } = disable specific metrics only.

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS pref_overrides JSONB;
