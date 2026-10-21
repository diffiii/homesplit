ALTER TABLE "chores" DROP CONSTRAINT "chores_completed_by_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "chores" ADD CONSTRAINT "chores_completed_by_id_user_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chores" ADD CONSTRAINT "chores_completion" CHECK (("chores"."is_completed" AND "chores"."completed_at" IS NOT NULL AND "chores"."completed_by_id" IS NOT NULL) OR (NOT "chores"."is_completed" AND "chores"."completed_at" IS NULL AND "chores"."completed_by_id" IS NULL));