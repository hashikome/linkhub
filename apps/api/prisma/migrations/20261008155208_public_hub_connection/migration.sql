-- Preserve the person's existing choice: opting out now hides the public
-- connection in both directions, not just the hub's name credit.
ALTER TABLE users RENAME COLUMN show_name TO show_hub_connection;
