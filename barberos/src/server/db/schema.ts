/**
 * BarberOS database schema.
 *
 * Conventions:
 * - Column names are snake_case in Postgres (Drizzle `casing: "snake_case"`).
 * - Primary keys are UUID v7, generated in the app.
 * - Every tenant table has `shop_id` and is protected by row-level security
 *   (see migrations/0001_tenant_security.sql). Child tables reference tenant
 *   parents through composite `(shop_id, id)` foreign keys, so a row can never
 *   point at another shop's data.
 * - Money is stored as integer minor units (`*_cents`). Timestamps are timestamptz (UTC).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "@/lib/ids";

const id = () => uuid().primaryKey().$defaultFn(uuidv7);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------------ */
/* Identity (global, managed by Better Auth)                                 */
/* ------------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    token: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.identifier)],
);

export const rateLimits = pgTable("rate_limits", {
  id: id(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------------ */
/* Tenancy                                                                   */
/* ------------------------------------------------------------------------ */

export const membershipRole = pgEnum("membership_role", ["owner", "manager", "barber"]);
export const membershipStatus = pgEnum("membership_status", ["active", "deactivated"]);

export const shops = pgTable(
  "shops",
  {
    id: id(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    timezone: text().notNull(),
    currency: char({ length: 3 }).notNull(),
    locale: text().notNull().default("en"),
    phone: text(),
    email: text(),
    addressLine: text(),
    city: text(),
    postalCode: text(),
    country: char({ length: 2 }),
    logoUrl: text(),
    brandColor: text(),
    /** Demo shops hold clearly fake data and are excluded from real metrics. */
    isDemo: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("shops_slug_format", sql`${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'`)],
);

export const shopSettings = pgTable("shop_settings", {
  shopId: uuid()
    .primaryKey()
    .references(() => shops.id, { onDelete: "cascade" }),
  slotIntervalMin: smallint().notNull().default(15),
  bookingLeadTimeMin: integer().notNull().default(60),
  bookingHorizonDays: integer().notNull().default(60),
  cancellationWindowHours: integer().notNull().default(24),
  autoConfirmOnline: boolean().notNull().default(true),
  requireCustomerEmail: boolean().notNull().default(false),
  barbersSeeSharedCalendar: boolean().notNull().default(true),
  barbersRecordPayments: boolean().notNull().default(true),
  managersSeeFinance: boolean().notNull().default(true),
  updatedAt: updatedAt(),
});

export const shopOpeningHours = pgTable(
  "shop_opening_hours",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday (JavaScript `Date#getDay` convention). */
    weekday: smallint().notNull(),
    opensAt: time().notNull(),
    closesAt: time().notNull(),
  },
  (t) => [
    index().on(t.shopId, t.weekday),
    check("opening_hours_weekday", sql`${t.weekday} between 0 and 6`),
    check("opening_hours_order", sql`${t.closesAt} > ${t.opensAt}`),
  ],
);

export const shopMemberships = pgTable(
  "shop_memberships",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole().notNull(),
    status: membershipStatus().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("shop_memberships_shop_user").on(t.shopId, t.userId),
    unique("shop_memberships_shop_id").on(t.shopId, t.id),
    uniqueIndex("shop_memberships_one_owner")
      .on(t.shopId)
      .where(sql`${t.role} = 'owner'`),
    index().on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: membershipRole().notNull(),
    /** SHA-256 of the random invite token. The raw token is never stored. */
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    acceptedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp({ withTimezone: true }),
    invitedByMembershipId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.shopId, t.invitedByMembershipId],
      foreignColumns: [shopMemberships.shopId, shopMemberships.id],
    }),
    uniqueIndex("invitations_one_pending_per_email")
      .on(t.shopId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    check("invitations_role", sql`${t.role} <> 'owner'`),
  ],
);

/** A barber's bookable profile. It is separate from the login membership so owners who cut hair get one too. */
export const staffMembers = pgTable(
  "staff_members",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    membershipId: uuid().unique(),
    displayName: text().notNull(),
    bio: text(),
    avatarUrl: text(),
    calendarColor: text(),
    isBookable: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("staff_members_shop_id").on(t.shopId, t.id),
    foreignKey({
      columns: [t.shopId, t.membershipId],
      foreignColumns: [shopMemberships.shopId, shopMemberships.id],
    }),
  ],
);

/** Append-only record of sensitive actions. The app role cannot update or delete rows. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    changes: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.shopId, t.createdAt)],
);

export type MembershipRole = (typeof membershipRole.enumValues)[number];
export type Shop = typeof shops.$inferSelect;
