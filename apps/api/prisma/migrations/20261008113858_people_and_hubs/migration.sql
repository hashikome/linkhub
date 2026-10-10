-- Keep the person's visibility choice while extending it to their profile.
ALTER TABLE users RENAME COLUMN show_name_on_hub TO show_name;
ALTER TABLE users ADD COLUMN username VARCHAR(20);

-- Adopt existing hub handles where they are valid person routes. Accounts
-- without a usable handle receive a random identifier, never an email or UUIDv7 prefix.
WITH candidates AS (
  SELECT owner_user_id, handle,
    row_number() OVER (PARTITION BY replace(handle, '-', '') ORDER BY owner_user_id) AS claim
  FROM hubs WHERE char_length(handle) <= 20 AND replace(handle, '-', '') NOT IN ('about', 'account', 'accounts', 'admin', 'api', 'assets', 'auth', 'billing', 'c', 'capture', 'collections', 'confirm', 'discover', 'explore', 'exports', 'forms', 'h', 'health', 'help', 'home', 'hub', 'hubs', 'imports', 'invitations', 'login', 'logout', 'manage', 'me', 'notifications', 'ops', 'people', 'platform', 'pricing', 'privacy', 'profile', 'register', 'resources', 'robots', 'saved', 'search', 'settings', 'share', 'shared', 'signin', 'signout', 'signup', 'sitemap', 'static', 'status', 'support', 'tags', 'terms', 'users')
)
UPDATE users u SET username = c.handle FROM candidates c
WHERE c.owner_user_id = u.id AND c.claim = 1;
UPDATE users SET username = 'person-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 13)
WHERE username IS NULL;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX users_username_key ON users(username);
-- Hyphens distinguish display spelling, never account availability.
CREATE UNIQUE INDEX users_username_identity_key ON users ((replace(username, '-', '')));
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (
  char_length(username) BETWEEN 3 AND 20 AND username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
);
ALTER TABLE users ADD CONSTRAINT users_username_reserved CHECK (replace(username, '-', '') NOT IN ('about', 'account', 'accounts', 'admin', 'api', 'assets', 'auth', 'billing', 'c', 'capture', 'collections', 'confirm', 'discover', 'explore', 'exports', 'forms', 'h', 'health', 'help', 'home', 'hub', 'hubs', 'imports', 'invitations', 'login', 'logout', 'manage', 'me', 'notifications', 'ops', 'people', 'platform', 'pricing', 'privacy', 'profile', 'register', 'resources', 'robots', 'saved', 'search', 'settings', 'share', 'shared', 'signin', 'signout', 'signup', 'sitemap', 'static', 'status', 'support', 'tags', 'terms', 'users'));
