import { describe, expect, it } from "vitest";
import { adminPool } from "./helpers";

/** Global (non-tenant) tables that intentionally have no shop_id and no RLS. */
const GLOBAL_TABLES = new Set(["users", "sessions", "accounts", "verifications", "rate_limits"]);

describe("schema security guards", () => {
  it("every table is either a known global table or a tenant table with RLS and a policy", async () => {
    const { rows } = await adminPool.query(`
      select c.relname as table,
             c.relrowsecurity as rls,
             exists (select 1 from information_schema.columns col
                     where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'shop_id') as has_shop_id,
             (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1`);
    const problems = rows
      .filter((r) => !GLOBAL_TABLES.has(r.table))
      .filter((r) => !(r.rls && r.policies > 0 && (r.has_shop_id || r.table === "shops")))
      .map((r) => r.table);
    expect(problems).toEqual([]);
    // Global tables really are global (no tenant data hiding in them).
    expect(rows.filter((r) => GLOBAL_TABLES.has(r.table) && r.has_shop_id).map((r) => r.table)).toEqual([]);
  });

  it("the app role owns nothing and cannot bypass row-level security", async () => {
    const { rows } = await adminPool.query(`
      select r.rolname, r.rolsuper, r.rolbypassrls,
             (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and pg_get_userbyid(c.relowner) = r.rolname) as owned
      from pg_roles r where r.rolname in ('barberos_app', 'barberos_web')`);
    for (const r of rows) expect(r).toMatchObject({ rolsuper: false, rolbypassrls: false, owned: 0 });
  });

  it("money and history ledgers can't be deleted by the app", async () => {
    const tables = ["payments", "payment_items", "commission_records", "inventory_movements", "expenses", "audit_log", "appointment_events", "appointments", "customers"];
    const { rows } = await adminPool.query(
      `select table_name from unnest($1::text[]) as t(table_name)
       where has_table_privilege('barberos_app', 'public.' || table_name, 'DELETE')`,
      [tables],
    );
    expect(rows).toEqual([]);
  });

  it("cross-tenant lookup functions are SECURITY DEFINER with a fixed search_path", async () => {
    const { rows } = await adminPool.query(`
      select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'app\\_%' and p.prosecdef`);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const r of rows) expect(r.config).toMatch(/search_path=public, pg_temp|search_path=public,\s*pg_temp/);
  });
});
