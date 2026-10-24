-- Queues the object of every deleted attachment for deletion from object
-- storage, whichever path deletes the row, including cascades from a deleted
-- household. Written to be safe to re-run.
CREATE OR REPLACE FUNCTION "queue_storage_object_deletion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "storage_object_deletions" ("storage_key", "queued_at")
	VALUES (OLD."storage_key", now())
	ON CONFLICT DO NOTHING;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "attachments_queue_object_deletion"
AFTER DELETE ON "attachments"
FOR EACH ROW EXECUTE FUNCTION "queue_storage_object_deletion"();
