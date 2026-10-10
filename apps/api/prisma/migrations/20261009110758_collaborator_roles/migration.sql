-- Rename accepted collection capabilities without resetting grants or audit history.
-- These varchar CHECKs are SQL-only; Prisma's generated migration was empty.
BEGIN;
ALTER TABLE collection_shares DROP CONSTRAINT collection_shares_role_check;
ALTER TABLE audit_logs DROP CONSTRAINT audit_role_check;

UPDATE collection_shares SET role = CASE role
  WHEN 'reader' THEN 'viewer' WHEN 'editor' THEN 'contributor' ELSE role END;
UPDATE audit_logs SET role = CASE role
  WHEN 'reader' THEN 'viewer' WHEN 'editor' THEN 'contributor' ELSE role END
WHERE role IN ('reader', 'editor');
-- Only grant/revoke states encode collection roles. Preserve all other evidence.
UPDATE audit_logs SET
  before_state = CASE before_state
    WHEN 'direct_reader' THEN 'direct_viewer' WHEN 'direct_editor' THEN 'direct_contributor'
    WHEN 'link_reader' THEN 'link_viewer' WHEN 'link_editor' THEN 'link_contributor'
    ELSE before_state END,
  after_state = CASE after_state
    WHEN 'direct_reader' THEN 'direct_viewer' WHEN 'direct_editor' THEN 'direct_contributor'
    WHEN 'link_reader' THEN 'link_viewer' WHEN 'link_editor' THEN 'link_contributor'
    ELSE after_state END
WHERE action IN ('share.granted', 'share.revoked');

ALTER TABLE collection_shares ADD CONSTRAINT collection_shares_role_check
  CHECK (role IN ('viewer', 'contributor'));
ALTER TABLE audit_logs ADD CONSTRAINT audit_role_check
  CHECK (role IS NULL OR role IN ('viewer', 'contributor'));
COMMIT;
