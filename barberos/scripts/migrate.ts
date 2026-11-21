/**
 * Applies pending migrations using the owner connection (MIGRATION_DATABASE_URL).
 * Usage: npm run db:migrate
 */
import "dotenv/config";
import { runMigrations } from "../src/server/db/migrate";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is not set");
  process.exit(1);
}
runMigrations(url)
  .then(() => console.log("Migrations applied"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
