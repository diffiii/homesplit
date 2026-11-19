CREATE TABLE "receipt_item_assignments" (
	"receipt_item_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shares" integer NOT NULL,
	CONSTRAINT "receipt_item_assignments_receipt_item_id_user_id_pk" PRIMARY KEY("receipt_item_id","user_id"),
	CONSTRAINT "receipt_item_assignments_shares_positive" CHECK ("receipt_item_assignments"."shares" > 0)
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "receipt_item_assignments" ADD CONSTRAINT "receipt_item_assignments_receipt_item_id_receipt_items_id_fk" FOREIGN KEY ("receipt_item_id") REFERENCES "public"."receipt_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_item_assignments" ADD CONSTRAINT "receipt_item_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_item_assignments" ADD CONSTRAINT "receipt_item_assignments_party_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_item_assignments_party_idx" ON "receipt_item_assignments" USING btree ("household_id","user_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expense_id_key" UNIQUE("expense_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expense" CHECK ("receipts"."expense_id" IS NULL OR "receipts"."status" = 'confirmed');