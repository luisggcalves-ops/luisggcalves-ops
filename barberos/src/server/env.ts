import { z } from "zod";
import { deriveAppDatabaseUrl, resolveBaseUrl } from "@/lib/deploy-env";

const schema = z.object({
  DATABASE_URL: z.string({ error: "Set DATABASE_URL, or MIGRATION_DATABASE_URL + APP_DB_PASSWORD" }).min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("BarberOS <no-reply@example.com>"),
});

let cached: z.infer<typeof schema> | undefined;

/** Validated server environment. Throws a readable error on misconfiguration. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse({
      ...process.env,
      DATABASE_URL: deriveAppDatabaseUrl(process.env),
      BETTER_AUTH_URL: resolveBaseUrl(process.env),
    });
    if (!parsed.success) {
      throw new Error(
        "Invalid environment configuration:\n" +
          parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
      );
    }
    cached = parsed.data;
  }
  return cached;
}
