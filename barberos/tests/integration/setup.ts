import { afterAll, beforeEach } from "vitest";
import { pool } from "@/server/db/client";
import { adminPool, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await pool.end();
  await adminPool.end();
});
