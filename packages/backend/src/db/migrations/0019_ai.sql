CREATE TABLE "ai_usage" (
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"requests" integer NOT NULL,
	CONSTRAINT "ai_usage_organization_id_day_pk" PRIMARY KEY("organization_id","day")
);
--> statement-breakpoint
ALTER TABLE "household_features" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;