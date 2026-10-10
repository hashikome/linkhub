BEGIN;
-- AlterTable
ALTER TABLE "hubs" ADD COLUMN     "handle_claimed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "self_deactivated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "hub_handle_reservations" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "handle" VARCHAR(60) NOT NULL,
    "hub_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hub_handle_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hub_handle_reservations_handle_key" ON "hub_handle_reservations"("handle");

INSERT INTO hub_handle_reservations(handle, hub_id) SELECT handle, id FROM hubs;

-- Reservations deliberately have no hub FK: deletion must not release a name.
CREATE FUNCTION reserve_hub_handle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reserved_for uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.handle_claimed_at IS NOT NULL AND NEW.handle <> OLD.handle THEN
    RAISE EXCEPTION 'Hub handle is permanent' USING ERRCODE = '23514';
  END IF;
  INSERT INTO hub_handle_reservations(handle, hub_id) VALUES (NEW.handle, NEW.id)
    ON CONFLICT (handle) DO NOTHING;
  SELECT hub_id INTO reserved_for FROM hub_handle_reservations WHERE handle = NEW.handle;
  IF reserved_for <> NEW.id THEN
    RAISE EXCEPTION 'Hub handle is reserved' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reserve_hub_handle BEFORE INSERT OR UPDATE OF handle ON hubs
FOR EACH ROW EXECUTE FUNCTION reserve_hub_handle();
COMMIT;
