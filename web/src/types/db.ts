/**
 * Database row types for tables used by the app.
 * Kept in sync with migrations (web/sql/).
 */

/** users table row (001, 003, 004, 005) */
export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  created_at: Date;
  username: string | null;
  username_norm: string | null;
  date_of_birth: string | null; // ISO date YYYY-MM-DD
};
