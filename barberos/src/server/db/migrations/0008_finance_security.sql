-- Phase 4: isolation and traceability for money and stock.

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON products FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON inventory_movements FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON payments FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE payment_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON payment_items FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON commission_rules FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON commission_records FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON expenses FOR ALL TO barberos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());
--> statement-breakpoint

-- Every financial record must stay traceable. The app can't delete money or stock history,
-- and ledger rows can't be edited after the fact. Payments and expenses are voided, not deleted.
REVOKE DELETE ON payments, payment_items, commission_records, commission_rules, expenses, inventory_movements, products FROM barberos_app;
--> statement-breakpoint
REVOKE UPDATE ON payment_items, commission_records, inventory_movements FROM barberos_app;
