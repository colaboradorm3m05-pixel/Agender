CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"professional_id" uuid,
	"service_id" uuid,
	"type" text NOT NULL,
	"percent_basis_points" integer,
	"fixed_cents" integer,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rules_type_ck" CHECK ("commission_rules"."type" in ('percent', 'fixed')),
	CONSTRAINT "commission_rules_value_ck" CHECK (("commission_rules"."type" = 'percent' and "commission_rules"."percent_basis_points" between 0 and 10000 and "commission_rules"."fixed_cents" is null) or ("commission_rules"."type" = 'fixed' and "commission_rules"."fixed_cents" >= 0 and "commission_rules"."percent_basis_points" is null)),
	CONSTRAINT "commission_rules_dates_ck" CHECK ("commission_rules"."valid_to" is null or "commission_rules"."valid_to" >= "commission_rules"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "commission_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "commission_cents" integer;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "commission_description" text;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_rules_company_idx" ON "commission_rules" USING btree ("company_id");