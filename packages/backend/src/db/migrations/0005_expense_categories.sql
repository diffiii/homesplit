CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_household_id_organization_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_categories_household_id_idx" ON "expense_categories" USING btree ("household_id");