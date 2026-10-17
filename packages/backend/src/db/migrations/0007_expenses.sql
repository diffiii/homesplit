CREATE TABLE "expense_allocation_participants" (
	"expense_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"allocation_method" text NOT NULL,
	"value" bigint,
	CONSTRAINT "expense_allocation_participants_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id"),
	CONSTRAINT "expense_allocation_participants_value" CHECK (COALESCE(CASE "expense_allocation_participants"."allocation_method"
        WHEN 'equal' THEN "expense_allocation_participants"."value" IS NULL
        WHEN 'percentage' THEN "expense_allocation_participants"."value" BETWEEN 1 AND 10000
        WHEN 'shares' THEN "expense_allocation_participants"."value" > 0
        WHEN 'exact' THEN "expense_allocation_participants"."value" >= 0
        WHEN 'adjustment' THEN "expense_allocation_participants"."value" IS NOT NULL
      END, false))
);
--> statement-breakpoint
CREATE TABLE "expense_payers" (
	"expense_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "expense_payers_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id"),
	CONSTRAINT "expense_payers_amount_positive" CHECK ("expense_payers"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "expense_splits" (
	"expense_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "expense_splits_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id"),
	CONSTRAINT "expense_splits_amount_nonnegative" CHECK ("expense_splits"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"total_amount_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"allocation_method" text NOT NULL,
	"author_id" uuid NOT NULL,
	"category_id" uuid,
	"expense_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_id_household_id_key" UNIQUE("id","household_id"),
	CONSTRAINT "expenses_id_household_id_allocation_method_key" UNIQUE("id","household_id","allocation_method"),
	CONSTRAINT "expenses_name_not_empty" CHECK ("expenses"."name" <> ''),
	CONSTRAINT "expenses_description_not_empty" CHECK ("expenses"."description" <> ''),
	CONSTRAINT "expenses_total_amount_positive" CHECK ("expenses"."total_amount_cents" > 0),
	CONSTRAINT "expenses_currency_code" CHECK ("expenses"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "expenses_allocation_method" CHECK ("expenses"."allocation_method" IN ('equal', 'percentage', 'shares', 'exact', 'adjustment'))
);
--> statement-breakpoint
DROP INDEX "expense_categories_household_id_idx";--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_household_id_id_key" UNIQUE("household_id","id");--> statement-breakpoint
ALTER TABLE "expense_allocation_participants" ADD CONSTRAINT "expense_allocation_participants_household_id_organization_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_allocation_participants" ADD CONSTRAINT "expense_allocation_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_allocation_participants" ADD CONSTRAINT "expense_allocation_participants_expense_fk" FOREIGN KEY ("expense_id","household_id") REFERENCES "public"."expenses"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_allocation_participants" ADD CONSTRAINT "expense_allocation_participants_party_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_allocation_participants" ADD CONSTRAINT "expense_allocation_participants_method_fk" FOREIGN KEY ("expense_id","household_id","allocation_method") REFERENCES "public"."expenses"("id","household_id","allocation_method") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_household_id_organization_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_expense_fk" FOREIGN KEY ("expense_id","household_id") REFERENCES "public"."expenses"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_party_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_household_id_organization_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_fk" FOREIGN KEY ("expense_id","household_id") REFERENCES "public"."expenses"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_party_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_household_id_organization_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_fk" FOREIGN KEY ("household_id","category_id") REFERENCES "public"."expense_categories"("household_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_author_party_fk" FOREIGN KEY ("household_id","author_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_payers_member_idx" ON "expense_payers" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "expense_splits_member_idx" ON "expense_splits" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "expenses_list_idx" ON "expenses" USING btree ("household_id","expense_date","created_at","id");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("household_id","category_id");--> statement-breakpoint
CREATE INDEX "expenses_currency_idx" ON "expenses" USING btree ("household_id","currency");