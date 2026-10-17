CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"payer_id" uuid NOT NULL,
	"payee_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_id" uuid,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "settlements_distinct_parties" CHECK ("settlements"."payer_id" <> "settlements"."payee_id"),
	CONSTRAINT "settlements_amount_positive" CHECK ("settlements"."amount_cents" > 0),
	CONSTRAINT "settlements_currency_code" CHECK ("settlements"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "settlements_note_not_empty" CHECK ("settlements"."note" <> ''),
	CONSTRAINT "settlements_confirmation" CHECK (("settlements"."confirmed_by_id" IS NULL) = ("settlements"."confirmed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_household_id_organization_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payer_id_user_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payee_id_user_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_confirmed_by_id_user_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payer_party_fk" FOREIGN KEY ("household_id","payer_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payee_party_fk" FOREIGN KEY ("household_id","payee_id") REFERENCES "public"."household_membership_history"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settlements_history_idx" ON "settlements" USING btree ("household_id","created_at","id");