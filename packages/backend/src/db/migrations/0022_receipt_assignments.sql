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
ALTER TABLE "receipts" ADD COLUMN "suggested_category_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "suggested_category_confidence" text;--> statement-breakpoint
ALTER TABLE "receipt_item_assignments" ADD CONSTRAINT "receipt_item_assignments_receipt_item_id_receipt_items_id_fk" FOREIGN KEY ("receipt_item_id") REFERENCES "public"."receipt_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_item_assignments" ADD CONSTRAINT "receipt_item_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_item_assignments" ADD CONSTRAINT "receipt_item_assignments_party_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_item_assignments_party_idx" ON "receipt_item_assignments" USING btree ("household_id","user_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_suggested_category_id_expense_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_suggested_category_idx" ON "receipts" USING btree ("suggested_category_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expense_id_key" UNIQUE("expense_id");--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_unit_price_nonnegative" CHECK ("receipt_items"."unit_price_cents" >= 0);--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_total_nonnegative" CHECK ("receipt_items"."total_cents" >= 0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expense" CHECK ("receipts"."expense_id" IS NULL OR "receipts"."status" = 'confirmed');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_suggested_category_confidence" CHECK ("receipts"."suggested_category_confidence" IN ('low', 'medium', 'high'));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_suggested_category" CHECK ("receipts"."suggested_category_id" IS NULL OR "receipts"."suggested_category_confidence" IS NOT NULL);