-- At most one pending invitation per address and household, the newest.
UPDATE "invitation" AS older
SET "status" = 'canceled'
WHERE older."status" = 'pending'
  AND EXISTS (
    SELECT 1
    FROM "invitation" AS newer
    WHERE newer."organization_id" = older."organization_id"
      AND lower(newer."email") = lower(older."email")
      AND newer."status" = 'pending'
      AND (newer."created_at", newer."id") > (older."created_at", older."id")
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "invitation_cancel_other_pending"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'pending' THEN
    -- Concurrent invitations of one address to one household take turns, so
    -- the later one sees the earlier one's row and cancels it.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW."organization_id"::text || ':' || lower(NEW."email"), 0)
    );
    UPDATE "invitation"
    SET "status" = 'canceled'
    WHERE "organization_id" = NEW."organization_id"
      AND lower("email") = lower(NEW."email")
      AND "status" = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "invitation_single_pending" ON "invitation";
--> statement-breakpoint
CREATE TRIGGER "invitation_single_pending"
BEFORE INSERT ON "invitation"
FOR EACH ROW EXECUTE FUNCTION "invitation_cancel_other_pending"();