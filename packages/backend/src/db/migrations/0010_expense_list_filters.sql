DROP INDEX "expenses_category_idx";--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("household_id","category_id","expense_date","created_at","id");