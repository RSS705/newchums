-- Down migration for 005: Remove date_of_birth from users
ALTER TABLE users DROP COLUMN IF EXISTS date_of_birth;
