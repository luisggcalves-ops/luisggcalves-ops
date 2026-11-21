import { describe, expect, it } from "vitest";
import { assignableRoles, can, canManageMember, homePathFor } from "@/server/authz/permissions";

describe("permissions", () => {
  it("gives owners everything and barbers only the barber app", () => {
    expect(can("owner", "shop.delete")).toBe(true);
    expect(can("manager", "shop.delete")).toBe(false);
    expect(can("manager", "team.manage")).toBe(true);
    expect(can("barber", "dashboard.view")).toBe(false);
    expect(can("barber", "barber_app.view")).toBe(true);
    expect(can("barber", "team.invite")).toBe(false);
  });

  it("restricts role assignment", () => {
    expect(assignableRoles("owner")).toEqual(["manager", "barber"]);
    expect(assignableRoles("manager")).toEqual(["barber"]);
    expect(assignableRoles("barber")).toEqual([]);
  });

  it("protects the owner and peers", () => {
    expect(canManageMember("owner", "owner")).toBe(false);
    expect(canManageMember("owner", "manager")).toBe(true);
    expect(canManageMember("manager", "manager")).toBe(false);
    expect(canManageMember("manager", "barber")).toBe(true);
    expect(canManageMember("barber", "barber")).toBe(false);
  });

  it("routes members to the right home", () => {
    expect(homePathFor("owner")).toBe("/app");
    expect(homePathFor("manager")).toBe("/app");
    expect(homePathFor("barber")).toBe("/barber");
  });
});
