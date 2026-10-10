-- Visibility belongs to the hub. Preserve existing owners' choices before
-- removing the obsolete user-level preference.
ALTER TABLE hubs ADD COLUMN show_owner BOOLEAN NOT NULL DEFAULT true;
UPDATE hubs h SET show_owner = u.show_hub_connection
FROM users u WHERE u.id = h.owner_user_id;
ALTER TABLE users DROP COLUMN show_hub_connection;
