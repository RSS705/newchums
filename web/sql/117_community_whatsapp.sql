-- 117: WhatsApp group link for communities.
-- Sits alongside website / discord_url and follows their exact rules:
-- optional free-text URL (client clips to 500 chars), shown on the full
-- community page, omitted from restricted private-community responses.
ALTER TABLE newchums.communities ADD COLUMN IF NOT EXISTS whatsapp_url text;
