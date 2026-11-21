import { runMigrations } from "../../src/server/db/migrate";

export default async function setup() {
  const url =
    process.env.TEST_MIGRATION_DATABASE_URL ?? "postgres://barberos_owner:barberos_owner@localhost:5432/barberos_test";
  await runMigrations(url);
}
