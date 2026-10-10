BEGIN;
-- Handles are editable; retain atomic spelling reservations for each hub.
-- Replace the trigger function before dropping the claim metadata it used.
CREATE OR REPLACE FUNCTION reserve_hub_handle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reserved_for uuid;
BEGIN
  INSERT INTO hub_handle_reservations(handle, hub_id) VALUES (NEW.handle, NEW.id)
    ON CONFLICT (handle) DO NOTHING;
  SELECT hub_id INTO reserved_for FROM hub_handle_reservations WHERE handle = NEW.handle;
  IF reserved_for <> NEW.id THEN
    RAISE EXCEPTION 'Hub handle is reserved' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

-- Obsolete confirmation metadata only; hubs and reservations are preserved.
ALTER TABLE "hubs" DROP COLUMN "handle_claimed_at";
COMMIT;
