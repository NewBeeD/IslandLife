CREATE TYPE "public"."bank_state" AS ENUM('HEALTHY', 'STRESSED', 'DISTRESSED', 'INSOLVENT');--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('HEALTHY', 'DISTRESSED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."employment" AS ENUM('EMPLOYED', 'SELF_EMPLOYED', 'INFORMAL', 'UNEMPLOYED');--> statement-breakpoint
CREATE TYPE "public"."industry" AS ENUM('FISHING', 'AGRICULTURE', 'CONSTRUCTION', 'INFORMAL_TRADE', 'RETAIL', 'TOURISM', 'TRANSPORTATION', 'FINANCE');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('ACTIVE', 'PAID', 'DEFAULT');--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"owner_person_id" uuid,
	"owner_company_id" uuid,
	"type" text NOT NULL,
	"size" text,
	"value" numeric NOT NULL,
	CONSTRAINT "asset_owner_chk" CHECK ("asset"."owner_person_id" IS NOT NULL OR "asset"."owner_company_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "bank" (
	"id" text NOT NULL,
	"save_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"country_id" text,
	"total_assets" numeric NOT NULL,
	"total_loans" numeric NOT NULL,
	"npl_ratio" numeric NOT NULL,
	"solvency_score" numeric NOT NULL,
	"lending_appetite" numeric NOT NULL,
	"base_lending_appetite" numeric NOT NULL,
	"bias_toward_formal_sector" numeric NOT NULL,
	"state" "bank_state" DEFAULT 'HEALTHY' NOT NULL,
	CONSTRAINT "bank_save_id_id_pk" PRIMARY KEY("save_id","id")
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" "industry" NOT NULL,
	"type" text NOT NULL,
	"parish_id" text,
	"owner_person_id" uuid,
	"market_share" numeric NOT NULL,
	"employees_count" integer NOT NULL,
	"base_operating_costs" numeric NOT NULL,
	"monthly_revenue" numeric DEFAULT '0' NOT NULL,
	"profit" numeric DEFAULT '0' NOT NULL,
	"consecutive_loss_months" integer DEFAULT 0 NOT NULL,
	"status" "company_status" DEFAULT 'HEALTHY' NOT NULL,
	"estimated_annual_tax" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_interest_rate" numeric NOT NULL,
	"institution_score" numeric NOT NULL,
	"corruption_index" numeric NOT NULL,
	"exchange_rate" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"type" text NOT NULL,
	"situation" text NOT NULL,
	"options" jsonb NOT NULL,
	"chosen_option" text,
	"resolved_month" integer
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"definition_id" text NOT NULL,
	"severity" numeric NOT NULL,
	"started_month" integer NOT NULL,
	"duration_remaining" integer NOT NULL,
	"affected_industries" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"surname" text,
	"parish_id" text
);
--> statement-breakpoint
CREATE TABLE "government" (
	"save_id" uuid PRIMARY KEY NOT NULL,
	"country_id" text,
	"monthly_tax_revenue" numeric NOT NULL,
	"fiscal_balance" numeric NOT NULL,
	"unemployment_rate" numeric NOT NULL,
	"public_sentiment" numeric NOT NULL,
	"corruption_level" numeric NOT NULL,
	"policies" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"company_id" uuid,
	"title" text,
	"monthly_salary" numeric NOT NULL,
	"start_month" integer NOT NULL,
	"end_month" integer
);
--> statement-breakpoint
CREATE TABLE "legacy_score" (
	"save_id" uuid PRIMARY KEY NOT NULL,
	"wealth_score" numeric DEFAULT '0' NOT NULL,
	"family_score" numeric DEFAULT '0' NOT NULL,
	"community_score" numeric DEFAULT '0' NOT NULL,
	"innovation_score" numeric DEFAULT '0' NOT NULL,
	"environment_score" numeric DEFAULT '0' NOT NULL,
	"reputation_score" numeric DEFAULT '0' NOT NULL,
	"last_net_worth" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"bank_id" text NOT NULL,
	"borrower_person_id" uuid,
	"borrower_company_id" uuid,
	"principal" numeric NOT NULL,
	"remaining_principal" numeric NOT NULL,
	"interest_rate" numeric NOT NULL,
	"monthly_payment" numeric NOT NULL,
	"term_months" integer NOT NULL,
	"origin_month" integer NOT NULL,
	"purpose_industry" "industry",
	"status" "loan_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"good_id" text NOT NULL,
	"parish_id" text,
	"current_price" numeric NOT NULL,
	"demand" numeric NOT NULL,
	"supply" numeric NOT NULL,
	"price_history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narrative_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"type" text NOT NULL,
	"trigger_id" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parish" (
	"id" text PRIMARY KEY NOT NULL,
	"country_id" text NOT NULL,
	"name" text NOT NULL,
	"capital" text NOT NULL,
	"population" integer NOT NULL,
	"infrastructure_score" numeric NOT NULL,
	"market_access_score" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"save_id" uuid NOT NULL,
	"name" text NOT NULL,
	"age" integer NOT NULL,
	"parish_id" text,
	"family_id" uuid,
	"is_player" boolean DEFAULT false NOT NULL,
	"family_background" text,
	"formative_event" text,
	"employment_status" "employment" NOT NULL,
	"occupation" "industry",
	"employer_company_id" uuid,
	"monthly_income" numeric DEFAULT '0' NOT NULL,
	"monthly_living_costs" numeric NOT NULL,
	"cash" numeric NOT NULL,
	"ocean" jsonb NOT NULL,
	"noncognitive" jsonb NOT NULL,
	"capital" jsonb NOT NULL,
	"knowledge" jsonb NOT NULL,
	"experience" jsonb NOT NULL,
	"previous_month_capital" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_company_id_company_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank" ADD CONSTRAINT "bank_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank" ADD CONSTRAINT "bank_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_parish_id_parish_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parish"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family" ADD CONSTRAINT "family_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family" ADD CONSTRAINT "family_parish_id_parish_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parish"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government" ADD CONSTRAINT "government_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government" ADD CONSTRAINT "government_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_score" ADD CONSTRAINT "legacy_score_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_borrower_person_id_person_id_fk" FOREIGN KEY ("borrower_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_borrower_company_id_company_id_fk" FOREIGN KEY ("borrower_company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan" ADD CONSTRAINT "loan_save_id_bank_id_bank_save_id_id_fk" FOREIGN KEY ("save_id","bank_id") REFERENCES "public"."bank"("save_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market" ADD CONSTRAINT "market_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market" ADD CONSTRAINT "market_parish_id_parish_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parish"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_entry" ADD CONSTRAINT "narrative_entry_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parish" ADD CONSTRAINT "parish_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_parish_id_parish_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parish"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_employer_company_id_company_id_fk" FOREIGN KEY ("employer_company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_save_idx" ON "company" USING btree ("save_id");--> statement-breakpoint
CREATE INDEX "loan_bank_idx" ON "loan" USING btree ("save_id","bank_id");--> statement-breakpoint
CREATE INDEX "feed_idx" ON "narrative_entry" USING btree ("save_id","month");--> statement-breakpoint
CREATE INDEX "person_save_idx" ON "person" USING btree ("save_id");