-- 052: Attendance trust model
-- Adds confidence, trust, and dispute columns to attendance_issues.
--
-- is_host_report: whether the reporter was the plan host (higher trust)
-- confidence:     0.00–1.00 multiplier applied to the raw penalty
-- applied_penalty: the actual score deduction stored for clean reversal
-- status:         active / disputed / dismissed / confirmed

ALTER TABLE newchums.attendance_issues
  ADD COLUMN IF NOT EXISTS is_host_report BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE newchums.attendance_issues
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00;

ALTER TABLE newchums.attendance_issues
  ADD COLUMN IF NOT EXISTS applied_penalty NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE newchums.attendance_issues
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE newchums.attendance_issues
  ADD CONSTRAINT attendance_issues_status_check
    CHECK (status IN ('active', 'disputed', 'dismissed', 'confirmed'));
