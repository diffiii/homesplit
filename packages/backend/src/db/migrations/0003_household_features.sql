CREATE TABLE "household_features" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"expenses_enabled" boolean DEFAULT true NOT NULL,
	"chores_enabled" boolean DEFAULT true NOT NULL,
	"shopping_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_features" ADD CONSTRAINT "household_features_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;