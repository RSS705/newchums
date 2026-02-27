-- Down migration for 009: Remove bio from user_profile
ALTER TABLE user_profile DROP COLUMN IF EXISTS bio;
