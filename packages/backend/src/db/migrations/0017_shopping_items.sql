CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text,
	"added_by_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purchased_by_id" uuid,
	"purchased_at" timestamp with time zone,
	CONSTRAINT "shopping_items_name_not_blank" CHECK ("shopping_items"."name" ~ '\S'),
	CONSTRAINT "shopping_items_unit_not_blank" CHECK ("shopping_items"."unit" ~ '\S'),
	CONSTRAINT "shopping_items_quantity_positive" CHECK ("shopping_items"."quantity" >= 1),
	CONSTRAINT "shopping_items_purchase" CHECK (("shopping_items"."purchased_by_id" IS NULL) = ("shopping_items"."purchased_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_household_id_organization_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_added_by_id_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_purchased_by_id_user_id_fk" FOREIGN KEY ("purchased_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_added_by_party_fk" FOREIGN KEY ("household_id","added_by_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_purchased_by_party_fk" FOREIGN KEY ("household_id","purchased_by_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_items_list_idx" ON "shopping_items" USING btree ("household_id","added_at","id");