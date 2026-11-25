-- Queues a deleted attachment's thumbnail with its file, so cleanup deletes
-- both objects. The `attachments_queue_object_deletion` trigger from 0015
-- already calls this function. Written to be safe to re-run.
CREATE OR REPLACE FUNCTION "queue_storage_object_deletion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "storage_object_deletions" ("storage_key", "queued_at")
	VALUES (OLD."storage_key", now())
	ON CONFLICT DO NOTHING;
	IF OLD."thumbnail_storage_key" IS NOT NULL THEN
		INSERT INTO "storage_object_deletions" ("storage_key", "queued_at")
		VALUES (OLD."thumbnail_storage_key", now())
		ON CONFLICT DO NOTHING;
	END IF;
	RETURN NULL;
END;
$$;
