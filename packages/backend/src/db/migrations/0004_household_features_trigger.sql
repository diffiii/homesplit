-- Keeps household_features in sync with every insert into organization,
-- whichever Better Auth path creates it. Written to be safe to re-run.
CREATE OR REPLACE FUNCTION "seed_household_features"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "household_features" ("organization_id")
	VALUES (NEW."id")
	ON CONFLICT DO NOTHING;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "organization_seed_features"
AFTER INSERT ON "organization"
FOR EACH ROW EXECUTE FUNCTION "seed_household_features"();
--> statement-breakpoint
INSERT INTO "household_features" ("organization_id")
SELECT "id" FROM "organization"
ON CONFLICT DO NOTHING;
