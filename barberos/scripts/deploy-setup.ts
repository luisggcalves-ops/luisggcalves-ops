/**
 * Runs before every production build (`npm run vercel-build`):
 *   1. applies database migrations (owner connection);
 *   2. makes sure the restricted app login exists and is in `barberos_app`;
 *   3. optionally loads the demo shop (SEED_DEMO_ON_DEPLOY=1).
 * Without MIGRATION_DATABASE_URL it does nothing, so preview builds still work.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { runMigrations } from "../src/server/db/migrate";
import { DEFAULT_APP_DB_USER } from "../src/lib/deploy-env";

async function main() {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  if (!ownerUrl) {
    console.log("[deploy-setup] MIGRATION_DATABASE_URL not set; skipping database setup.");
    return;
  }
  console.log("[deploy-setup] Applying migrations…");
  await runMigrations(ownerUrl);

  const password = process.env.APP_DB_PASSWORD;
  const user = process.env.APP_DB_USER || DEFAULT_APP_DB_USER;
  if (password && !process.env.DATABASE_URL) {
    if (password.length < 16) throw new Error("APP_DB_PASSWORD must be at least 16 characters.");
    if (!/^[a-z_][a-z0-9_]*$/.test(user)) throw new Error("APP_DB_USER must be a simple lowercase name.");
    const pool = new Pool({ connectionString: ownerUrl, max: 1 });
    try {
      const { rows } = await pool.query("select 1 from pg_roles where rolname = $1", [user]);
      // Role names can't be bound parameters, and the name is validated above. The password is quoted safely by format().
      if (!rows.length) {
        const { rows: q } = await pool.query("select format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) as sql", [user, password]);
        await pool.query(q[0].sql);
        console.log(`[deploy-setup] Created app login ${user}.`);
      } else {
        const { rows: q } = await pool.query("select format('ALTER ROLE %I WITH LOGIN PASSWORD %L', $1::text, $2::text) as sql", [user, password]);
        await pool.query(q[0].sql);
      }
      const { rows: g } = await pool.query("select format('GRANT barberos_app TO %I', $1::text) as sql", [user]);
      await pool.query(g[0].sql);
    } finally {
      await pool.end();
    }
  }

  if (process.env.SEED_DEMO_ON_DEPLOY === "1") {
    console.log("[deploy-setup] Loading demo shop…");
    execFileSync("npx", ["tsx", "scripts/seed-demo.ts"], { stdio: "inherit", env: { ...process.env, ALLOW_DEMO_SEED: "1" } });
  }
  console.log("[deploy-setup] Done.");
}

main().catch((err) => {
  console.error("[deploy-setup] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
