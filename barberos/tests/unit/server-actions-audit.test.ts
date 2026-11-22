import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every exported function in a "use server" file is a public HTTP endpoint.
 * This test fails if one of them doesn't establish who is calling and what
 * they may do before touching data. That catches a forgotten check, or a
 * helper exported from the wrong file.
 */
const SRC = path.join(__dirname, "../../src");
const GUARDS = [
  "requireActionContext(", // signed-in staff, permission checked by domain services
  "requireUser(", // signed-in user (onboarding, invites, shop switching)
  "auth.api.signOut(", // signing out only needs the session itself
  "guard(", // public booking endpoints: rate-limited, token/slug scoped
  "requireActionContext()",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("server action audit", () => {
  const actionFiles = files(SRC).filter((f) => /^\s*["']use server["'];?/m.test(readFileSync(f, "utf8").split("\n").slice(0, 3).join("\n")));

  it("finds the server action files", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of actionFiles) {
    const src = readFileSync(file, "utf8");
    const exported = [...src.matchAll(/^export async function (\w+)\s*\(/gm)];
    for (const m of exported) {
      const start = m.index!;
      const next = src.indexOf("\nexport ", start + 1);
      const body = src.slice(start, next === -1 ? undefined : next);
      it(`${path.relative(SRC, file)} → ${m[1]} checks the caller`, () => {
        expect(GUARDS.some((g) => body.includes(g))).toBe(true);
      });
    }
    it(`${path.relative(SRC, file)} exports only async functions`, () => {
      expect(src.match(/^export (const|let|function |class )/gm) ?? []).toEqual([]);
    });
  }
});
