-- 053: Add status column to conduct_reports for internal management
-- Supports: new / reviewed / closed

ALTER TABLE newchums.conduct_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';

ALTER TABLE newchums.conduct_reports
  ADD CONSTRAINT conduct_reports_status_check
    CHECK (status IN ('new', 'reviewed', 'closed'));
