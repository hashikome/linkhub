BEGIN;
ALTER TABLE "hubs" ADD COLUMN "handle_changed_at" TIMESTAMPTZ(6);

-- Preserve known changes rather than giving recently renamed hubs a fresh allowance.
-- A single initial reservation is generated at hub creation, not a manual rename.
WITH history AS (
  SELECT hub_id, MAX(created_at) AS changed_at
  FROM hub_handle_reservations GROUP BY hub_id HAVING COUNT(*) > 1
  UNION ALL
  SELECT hub_id, MAX(created_at) AS changed_at
  FROM audit_logs WHERE action = 'hub.handle_changed' AND (outcome IS NULL OR outcome = 'success')
  GROUP BY hub_id
), latest AS (
  SELECT hub_id, MAX(changed_at) AS changed_at FROM history GROUP BY hub_id
)
UPDATE hubs SET handle_changed_at = latest.changed_at FROM latest WHERE hubs.id = latest.hub_id;

CREATE OR REPLACE FUNCTION reserve_hub_handle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Re-saving the current handle neither retires it nor extends the cooldown.
    IF NEW.handle = OLD.handle THEN RETURN NEW; END IF;
    IF OLD.handle_changed_at IS NOT NULL
      AND clock_timestamp() < OLD.handle_changed_at + interval '720 hours' THEN
      RAISE EXCEPTION 'Hub handle change cooldown' USING ERRCODE = '23514',
        CONSTRAINT = 'hub_handle_change_cooldown';
    END IF;
    NEW.handle_changed_at := clock_timestamp();
  ELSE
    -- The initial generated handle can be customized immediately.
    NEW.handle_changed_at := NULL;
  END IF;
  -- Deliberately no ON CONFLICT: even the original hub cannot reuse a retired name.
  INSERT INTO hub_handle_reservations(handle, hub_id) VALUES (NEW.handle, NEW.id);
  RETURN NEW;
END;
$$;
COMMIT;
