CREATE TABLE "save" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"seed" bigint NOT NULL,
	"rng_state" jsonb NOT NULL,
	"current_month" integer DEFAULT 0 NOT NULL,
	"player_person_id" uuid,
	"status" text DEFAULT 'ALIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_snapshot" (
	"save_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"state" jsonb NOT NULL,
	CONSTRAINT "world_snapshot_save_id_month_pk" PRIMARY KEY("save_id","month")
);
--> statement-breakpoint
ALTER TABLE "world_snapshot" ADD CONSTRAINT "world_snapshot_save_id_save_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."save"("id") ON DELETE cascade ON UPDATE no action;