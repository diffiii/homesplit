CREATE TABLE "receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	CONSTRAINT "receipt_items_name_not_blank" CHECK ("receipt_items"."name" ~ '\S'),
	CONSTRAINT "receipt_items_position_nonnegative" CHECK ("receipt_items"."position" >= 0),
	CONSTRAINT "receipt_items_quantity_positive" CHECK ("receipt_items"."quantity" > 0),
	CONSTRAINT "receipt_items_discount_nonnegative" CHECK ("receipt_items"."discount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"extraction_id" uuid,
	"merchant" text,
	"purchased_on" date,
	"currency" text,
	"total_cents" bigint,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_status" CHECK ("receipts"."status" IN ('processing', 'ready', 'failed', 'confirmed')),
	CONSTRAINT "receipts_failure" CHECK (("receipts"."status" = 'failed') = ("receipts"."failure_code" IS NOT NULL)),
	CONSTRAINT "receipts_extraction" CHECK (("receipts"."status" = 'processing') = ("receipts"."extraction_id" IS NOT NULL)),
	CONSTRAINT "receipts_merchant_not_blank" CHECK ("receipts"."merchant" ~ '\S'),
	CONSTRAINT "receipts_currency_code" CHECK ("receipts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "receipts_total_nonnegative" CHECK ("receipts"."total_cents" >= 0),
	CONSTRAINT "receipts_discount_nonnegative" CHECK ("receipts"."discount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_household_id_organization_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_attachment_fk" FOREIGN KEY ("attachment_id","household_id") REFERENCES "public"."attachments"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_party_fk" FOREIGN KEY ("household_id","created_by_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_items_receipt_idx" ON "receipt_items" USING btree ("receipt_id","position");--> statement-breakpoint
CREATE INDEX "receipts_list_idx" ON "receipts" USING btree ("household_id","created_at","id");--> statement-breakpoint
CREATE INDEX "receipts_attachment_idx" ON "receipts" USING btree ("attachment_id");