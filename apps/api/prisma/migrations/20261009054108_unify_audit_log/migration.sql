BEGIN;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "category" VARCHAR(16) NOT NULL DEFAULT 'content',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_kind" VARCHAR(16) NOT NULL DEFAULT 'user',
    "actor_user_id" UUID,
    "authority" VARCHAR(128),
    "hub_id" UUID,
    "target_user_id" UUID,
    "collection_id" UUID,
    "resource_id" UUID,
    "invitation_id" UUID,
    "action" VARCHAR(48) NOT NULL,
    "role" VARCHAR(16),
    "reason" VARCHAR(32),
    "outcome" VARCHAR(16),
    "before_state" VARCHAR(48),
    "after_state" VARCHAR(48),
    "request_id" VARCHAR(64),
    "operation_id" UUID,
    "payload_hash" VARCHAR(64),
    "result_version" INTEGER,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_hub_id_created_at_id_idx" ON "audit_logs"("hub_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_collection_id_created_at_id_idx" ON "audit_logs"("collection_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_target_user_id_created_at_idx" ON "audit_logs"("target_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_category_created_at_idx" ON "audit_logs"("category", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_actor_user_id_operation_id_key" ON "audit_logs"("actor_user_id", "operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_authority_operation_id_key" ON "audit_logs"("authority", "operation_id");

-- Preserve validation formerly attached to each evidence store.
ALTER TABLE audit_logs ADD CONSTRAINT audit_category_check
  CHECK (category IN ('content', 'operation', 'authentication'));
ALTER TABLE audit_logs ADD CONSTRAINT audit_role_check
  CHECK (role IS NULL OR role IN ('reader', 'editor'));
ALTER TABLE audit_logs ADD CONSTRAINT audit_content_check CHECK (
  category <> 'content' OR (hub_id IS NOT NULL AND actor_user_id IS NOT NULL
    AND action IN (
    'collection.published',
    'collection.unpublished',
    'collection.deleted',
    'collection.transferred_out',
    'collection.transferred_in',
    'share.granted',
    'share.revoked',
    'link.enabled',
    'link.rotated',
    'link.disabled',
    'hub.handle_changed',
    'hub.name_changed',
    'audit.read',
    'collection.created',
    'collection.updated',
    'item.link_added',
    'item.reference_added',
    'item.section_added',
    'item.updated',
    'item.removed',
    'items.reordered',
    'items.imported',
    'comment.hidden',
    'comment.shown',
    'comment.answer_marked',
    'comment.answer_unmarked'
)));
ALTER TABLE audit_logs ADD CONSTRAINT audit_effect_complete CHECK (
  category <> 'content' OR
  (before_state IS NULL AND after_state IS NULL AND outcome IS NULL) OR
  (before_state IS NOT NULL AND after_state IS NOT NULL AND outcome IS NOT NULL
    AND outcome IN ('success', 'no_change')));
ALTER TABLE audit_logs ADD CONSTRAINT audit_actor_check CHECK (
  (actor_kind = 'user' AND actor_user_id IS NOT NULL AND authority IS NULL) OR
  (actor_kind = 'deployment' AND actor_user_id IS NULL AND authority IS NOT NULL) OR
  (actor_kind = 'invitee' AND invitation_id IS NOT NULL AND authority IS NOT NULL) OR
  (category = 'authentication' AND actor_kind = 'anonymous' AND actor_user_id IS NULL AND authority IS NULL));
ALTER TABLE audit_logs ADD CONSTRAINT audit_outcome_check
  CHECK (category = 'content' OR outcome IS NOT NULL);

-- Explicit columns preserve IDs, microsecond timestamps, missing evidence and replay keys.
INSERT INTO audit_logs (id, category, created_at, actor_kind, actor_user_id, hub_id,
  collection_id, target_user_id, resource_id, action, role, before_state, after_state, outcome)
SELECT id, 'content', created_at, 'user', actor_user_id, hub_id,
  collection_id, target_user_id, resource_id, action, role, before_state, after_state, outcome
FROM audit_records;
INSERT INTO audit_logs (id, category, created_at, actor_kind, actor_user_id, authority,
  hub_id, invitation_id, target_user_id, collection_id, action, reason, outcome,
  before_state, after_state, request_id, operation_id, payload_hash, result_version)
SELECT id, 'operation', created_at, actor_kind, actor_user_id, authority,
  hub_id, invitation_id, target_user_id, collection_id, action, reason, outcome,
  before_state, after_state, request_id, operation_id, payload_hash, result_version
FROM operator_audit;
INSERT INTO audit_logs (id, category, created_at, actor_kind, actor_user_id, target_user_id, action, outcome)
SELECT id, 'authentication', created_at, CASE WHEN user_id IS NULL THEN 'anonymous' ELSE 'user' END,
  user_id, user_id, action, outcome FROM auth_audit;

-- All inserts and constraints must succeed before removing the old stores.
DROP TABLE audit_records;
DROP TABLE operator_audit;
DROP TABLE auth_audit;
COMMIT;
