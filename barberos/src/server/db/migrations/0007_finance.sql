CREATE TYPE "public"."commission_applies_to" AS ENUM('services', 'products');--> statement-breakpoint
CREATE TYPE "public"."commission_record_kind" AS ENUM('earned', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."commission_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('rent', 'utilities', 'supplies', 'products', 'equipment', 'marketing', 'salaries', 'taxes', 'other');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('purchase', 'sale', 'usage', 'adjustment', 'sale_reversal');--> statement-breakpoint
CREATE TYPE "public"."payment_item_kind" AS ENUM('service', 'product');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('recorded', 'voided');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('retail', 'consumable', 'both');--> statement-breakpoint
CREATE TABLE "commission_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"payment_item_id" uuid NOT NULL,
	"rule_id" uuid,
	"rule_snapshot" jsonb NOT NULL,
	"base_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"kind" "commission_record_kind" NOT NULL,
	"reverses_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_records_reversesId_unique" UNIQUE("reverses_id")
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"staff_member_id" uuid,
	"service_id" uuid,
	"applies_to" "commission_applies_to" DEFAULT 'services' NOT NULL,
	"type" "commission_type" NOT NULL,
	"percent_bps" integer,
	"amount_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "commission_rules_value" CHECK (("commission_rules"."type" = 'percent' and "commission_rules"."percent_bps" between 0 and 10000 and "commission_rules"."amount_cents" is null)
        or ("commission_rules"."type" = 'fixed' and "commission_rules"."amount_cents" >= 0 and "commission_rules"."percent_bps" is null)),
	CONSTRAINT "commission_rules_products" CHECK ("commission_rules"."applies_to" = 'services' or "commission_rules"."service_id" is null)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_cents" integer NOT NULL,
	"incurred_on" date NOT NULL,
	"vendor" text,
	"description" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" text,
	CONSTRAINT "expenses_amount" CHECK ("expenses"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty_delta" integer NOT NULL,
	"type" "inventory_movement_type" NOT NULL,
	"unit_cost_cents" integer,
	"payment_item_id" uuid,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_qty_nonzero" CHECK ("inventory_movements"."qty_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "payment_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"kind" "payment_item_kind" NOT NULL,
	"service_id" uuid,
	"product_id" uuid,
	"staff_member_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"unit_cost_cents" integer,
	CONSTRAINT "payment_items_shop_id" UNIQUE("shop_id","id"),
	CONSTRAINT "payment_items_qty" CHECK ("payment_items"."quantity" > 0),
	CONSTRAINT "payment_items_total" CHECK ("payment_items"."unit_price_cents" >= 0 and "payment_items"."total_cents" = "payment_items"."unit_price_cents" * "payment_items"."quantity"),
	CONSTRAINT "payment_items_ref" CHECK (("payment_items"."kind" = 'service' and "payment_items"."product_id" is null) or ("payment_items"."kind" = 'product' and "payment_items"."product_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"appointment_id" uuid,
	"customer_id" uuid,
	"method" "payment_method" NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"tip_staff_member_id" uuid,
	"status" "payment_status" DEFAULT 'recorded' NOT NULL,
	"note" text,
	"idempotency_key" text NOT NULL,
	"recorded_by_user_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "payments_shop_id" UNIQUE("shop_id","id"),
	CONSTRAINT "payments_idempotency" UNIQUE("shop_id","idempotency_key"),
	CONSTRAINT "payments_amounts" CHECK ("payments"."subtotal_cents" >= 0 and "payments"."tip_cents" >= 0 and "payments"."total_cents" = "payments"."subtotal_cents" + "payments"."tip_cents"),
	CONSTRAINT "payments_void" CHECK (("payments"."status" = 'voided') = ("payments"."voided_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"category" text,
	"kind" "product_kind" DEFAULT 'retail' NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_shop_id" UNIQUE("shop_id","id"),
	CONSTRAINT "products_money" CHECK ("products"."cost_cents" >= 0 and "products"."price_cents" >= 0),
	CONSTRAINT "products_threshold" CHECK ("products"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_shop_id_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_shop_id_payment_id_payments_shop_id_id_fk" FOREIGN KEY ("shop_id","payment_id") REFERENCES "public"."payments"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_shop_id_payment_item_id_payment_items_shop_id_id_fk" FOREIGN KEY ("shop_id","payment_item_id") REFERENCES "public"."payment_items"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_shop_id_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_shop_id_service_id_services_shop_id_id_fk" FOREIGN KEY ("shop_id","service_id") REFERENCES "public"."services"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_shop_id_product_id_products_shop_id_id_fk" FOREIGN KEY ("shop_id","product_id") REFERENCES "public"."products"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_shop_id_payment_id_payments_shop_id_id_fk" FOREIGN KEY ("shop_id","payment_id") REFERENCES "public"."payments"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_shop_id_service_id_services_shop_id_id_fk" FOREIGN KEY ("shop_id","service_id") REFERENCES "public"."services"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_shop_id_product_id_products_shop_id_id_fk" FOREIGN KEY ("shop_id","product_id") REFERENCES "public"."products"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_shop_id_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_appointment_id_appointments_shop_id_id_fk" FOREIGN KEY ("shop_id","appointment_id") REFERENCES "public"."appointments"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_customer_id_customers_shop_id_id_fk" FOREIGN KEY ("shop_id","customer_id") REFERENCES "public"."customers"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_tip_staff_member_id_staff_members_shop_id_id_fk" FOREIGN KEY ("shop_id","tip_staff_member_id") REFERENCES "public"."staff_members"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_one_earned_per_item" ON "commission_records" USING btree ("payment_item_id") WHERE "commission_records"."kind" = 'earned';--> statement-breakpoint
CREATE INDEX "commission_records_shop_id_staff_member_id_created_at_index" ON "commission_records" USING btree ("shop_id","staff_member_id","created_at");--> statement-breakpoint
CREATE INDEX "commission_rules_shop_id_active_index" ON "commission_rules" USING btree ("shop_id","active");--> statement-breakpoint
CREATE INDEX "expenses_shop_id_incurred_on_index" ON "expenses" USING btree ("shop_id","incurred_on");--> statement-breakpoint
CREATE INDEX "inventory_movements_shop_id_product_id_created_at_index" ON "inventory_movements" USING btree ("shop_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_items_shop_id_payment_id_index" ON "payment_items" USING btree ("shop_id","payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_active_per_appointment" ON "payments" USING btree ("appointment_id") WHERE "payments"."status" = 'recorded' and "payments"."appointment_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_shop_recorded" ON "payments" USING btree ("shop_id","recorded_at");