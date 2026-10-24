CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_requests_not_self" CHECK ("friend_requests"."requester_id" <> "friend_requests"."recipient_id")
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pair_key" ON "friend_requests" USING btree (least("requester_id", "recipient_id"),greatest("requester_id", "recipient_id"));--> statement-breakpoint
CREATE INDEX "friend_requests_requester_id_idx" ON "friend_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "friend_requests_recipient_id_idx" ON "friend_requests" USING btree ("recipient_id");