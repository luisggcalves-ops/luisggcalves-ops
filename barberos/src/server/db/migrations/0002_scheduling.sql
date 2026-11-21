CREATE TYPE "public"."appointment_event_type" AS ENUM('created', 'status_changed', 'rescheduled', 'edited');--> statement-breakpoint
CREATE TYPE "public"."appointment_source" AS ENUM('online', 'staff', 'walk_in');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."cancelled_by" AS ENUM('customer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."customer_source" AS ENUM('online', 'staff', 'walk_in');--> statement-breakpoint
CREATE TYPE "public"."time_off_type" AS ENUM('holiday', 'sick', 'personal', 'other');--> statement-breakpoint
CREATE TABLE "appointment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"type" "appointment_event_type" NOT NULL,
	"from_value" jsonb,
	"to_value" jsonb,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'confirmed' NOT NULL,
	"source" "appointment_source" DEFAULT 'staff' NOT NULL,
	"service_name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"manage_token_hash" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" "cancelled_by",
	"cancel_reason" text,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "appointments_manageTokenHash_unique" UNIQUE("manage_token_hash"),
	CONSTRAINT "appointments_shop_id" UNIQUE("shop_id","id"),
	CONSTRAINT "appointments_order" CHECK ("appointments"."ends_at" > "appointments"."starts_at" and "appointments"."blocked_until" >= "appointments"."ends_at"),
	CONSTRAINT "appointments_price" CHECK ("appointments"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone_e_164" text,
	"email" text,
	"preferred_staff_member_id" uuid,
	"hair_preferences" text,
	"marketing_consent_at" timestamp with time zone,
	"source" "customer_source" DEFAULT 'staff' NOT NULL,
	"first_visit_at" timestamp with time zone,
	"last_visit_at" timestamp with time zone,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_shop_id" UNIQUE("shop_id","id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_min" integer NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	"price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_shop_id" UNIQUE("shop_id","id"),
	CONSTRAINT "services_duration" CHECK ("services"."duration_min" between 5 and 480),
	CONSTRAINT "services_buffer" CHECK ("services"."buffer_after_min" between 0 and 120),
	CONSTRAINT "services_price" CHECK ("services"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shop_closures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_closures_order" CHECK ("shop_closures"."ends_on" >= "shop_closures"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "staff_services" (
	"shop_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"price_cents_override" integer,
	"duration_min_override" integer,
	CONSTRAINT "staff_services_staff_member_id_service_id_pk" PRIMARY KEY("staff_member_id","service_id"),
	CONSTRAINT "staff_services_price" CHECK ("staff_services"."price_cents_override" is null or "staff_services"."price_cents_override" >= 0),
	CONSTRAINT "staff_services_duration" CHECK ("staff_services"."duration_min_override" is null or "staff_services"."duration_min_override" between 5 and 480)
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"type" time_off_type DEFAULT 'holiday' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_off_order" CHECK ("time_off"."ends_at" > "time_off"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "working_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	CONSTRAINT "working_hours_weekday" CHECK ("working_hours"."weekday" between 0 and 6),
	CONSTRAINT "working_hours_order" CHECK ("working_hours"."ends_at" > "working_hours"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_shop_id_appointment_id_appointments_shop_id_id_fk" FOREIGN KEY ("shop_id","appointment_id") REFERENCES "public"."appointments"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_shop_id_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_shop_id_customer_id_customers_shop_id_id_fk" FOREIGN KEY ("shop_id","customer_id") REFERENCES "public"."customers"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_shop_id_service_id_services_shop_id_id_fk" FOREIGN KEY ("shop_id","service_id") REFERENCES "public"."services"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_shop_id_created_by_membership_id_shop_memberships_shop_id_id_fk" FOREIGN KEY ("shop_id","created_by_membership_id") REFERENCES "public"."shop_memberships"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_preferred_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","preferred_staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_closures" ADD CONSTRAINT "shop_closures_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_shop_id_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_shop_id_service_id_services_shop_id_id_fk" FOREIGN KEY ("shop_id","service_id") REFERENCES "public"."services"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_shop_id_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_shop_id_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_events_shop_id_appointment_id_created_at_index" ON "appointment_events" USING btree ("shop_id","appointment_id","created_at");--> statement-breakpoint
CREATE INDEX "appointments_shop_start" ON "appointments" USING btree ("shop_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_staff_start" ON "appointments" USING btree ("shop_id","staff_member_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_customer" ON "appointments" USING btree ("shop_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_shop_phone" ON "customers" USING btree ("shop_id","phone_e_164") WHERE "customers"."phone_e_164" is not null;--> statement-breakpoint
CREATE INDEX "customers_shop_name" ON "customers" USING btree ("shop_id","full_name");--> statement-breakpoint
CREATE INDEX "shop_closures_shop_id_starts_on_index" ON "shop_closures" USING btree ("shop_id","starts_on");--> statement-breakpoint
CREATE INDEX "staff_services_shop_id_service_id_index" ON "staff_services" USING btree ("shop_id","service_id");--> statement-breakpoint
CREATE INDEX "time_off_shop_id_staff_member_id_starts_at_index" ON "time_off" USING btree ("shop_id","staff_member_id","starts_at");--> statement-breakpoint
CREATE INDEX "working_hours_shop_id_staff_member_id_weekday_index" ON "working_hours" USING btree ("shop_id","staff_member_id","weekday");