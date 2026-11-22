import { describe, expect, it } from "vitest";
import { deriveAppDatabaseUrl, resolveBaseUrl } from "@/lib/deploy-env";

describe("deployment settings", () => {
  it("derives the restricted app connection from the owner connection", () => {
    const url = deriveAppDatabaseUrl({
      MIGRATION_DATABASE_URL: "postgresql://neondb_owner:ownerpw@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
      APP_DB_PASSWORD: "p@ss/word with spaces",
    });
    const parsed = new URL(url!);
    expect(parsed.username).toBe("barberos_web");
    expect(decodeURIComponent(parsed.password)).toBe("p@ss/word with spaces");
    expect(parsed.host).toBe("ep-x-pooler.eu-central-1.aws.neon.tech");
    expect(parsed.searchParams.get("sslmode")).toBe("require");
  });
  it("prefers an explicit DATABASE_URL and needs both parts otherwise", () => {
    expect(deriveAppDatabaseUrl({ DATABASE_URL: "postgres://a:b@h/d", MIGRATION_DATABASE_URL: "postgres://o:p@h/d", APP_DB_PASSWORD: "x" })).toBe("postgres://a:b@h/d");
    expect(deriveAppDatabaseUrl({ MIGRATION_DATABASE_URL: "postgres://o:p@h/d" })).toBeUndefined();
  });
  it("uses Vercel's production URL when no base URL is set", () => {
    expect(resolveBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "barberos.vercel.app" })).toBe("https://barberos.vercel.app");
    expect(resolveBaseUrl({ BETTER_AUTH_URL: "https://book.example.pt", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://book.example.pt");
  });
});
