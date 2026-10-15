-- Keeps household_membership_history in sync with every insert into member,
-- whichever Better Auth path makes it. Written to be safe to re-run.
CREATE OR REPLACE FUNCTION "record_household_membership"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "household_membership_history" ("organization_id", "user_id", "first_joined_at")
	VALUES (NEW."organization_id", NEW."user_id", now())
	ON CONFLICT DO NOTHING;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "member_record_history"
AFTER INSERT ON "member"
FOR EACH ROW EXECUTE FUNCTION "record_household_membership"();
--> statement-breakpoint
-- member.created_at has no time zone; treat wall-clock values as UTC.
INSERT INTO "household_membership_history" ("organization_id", "user_id", "first_joined_at")
SELECT "organization_id", "user_id", min("created_at") AT TIME ZONE 'UTC'
FROM "member"
GROUP BY "organization_id", "user_id"
ON CONFLICT DO NOTHING;
