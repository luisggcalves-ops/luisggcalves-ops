import { runMigrations } from "../../src/server/db/migrate";

export default async function globalSetup() {
  await runMigrations(
    process.env.E2E_MIGRATION_DATABASE_URL ?? "postgres://barberos_owner:barberos_owner@localhost:5432/barberos_test",
  );
}
