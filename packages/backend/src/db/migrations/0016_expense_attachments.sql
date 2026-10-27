ALTER TABLE "attachments" ADD CONSTRAINT "attachments_id_household_id_key" UNIQUE("id","household_id");--> statement-breakpoint
CREATE TABLE "expense_attachments" (
	"expense_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_attachments_expense_id_attachment_id_pk" PRIMARY KEY("expense_id","attachment_id")
);
--> statement-breakpoint
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expense_fk" FOREIGN KEY ("expense_id","household_id") REFERENCES "public"."expenses"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_attachment_fk" FOREIGN KEY ("attachment_id","household_id") REFERENCES "public"."attachments"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_attachments_attachment_idx" ON "expense_attachments" USING btree ("attachment_id");