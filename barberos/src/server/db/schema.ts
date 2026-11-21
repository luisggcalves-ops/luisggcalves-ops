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
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
  /** The public booking page only takes bookings once the owner switches it on. */
  onlineBookingEnabled: boolean().notNull().default(false),
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

/* ------------------------------------------------------------------------ */
/* Services and schedules                                                    */
/* ------------------------------------------------------------------------ */

export const services = pgTable(
  "services",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    durationMin: integer().notNull(),
    /** Clean-up time after the service. Blocks the barber but isn't shown as the appointment length. */
    bufferAfterMin: integer().notNull().default(0),
    priceCents: integer().notNull(),
    /** Inactive services can't be booked, but they stay on past appointments. */
    active: boolean().notNull().default(true),
    /** Hidden services can be booked by staff but don't appear on the public booking page. */
    isPublic: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("services_shop_id").on(t.shopId, t.id),
    check("services_duration", sql`${t.durationMin} between 5 and 480`),
    check("services_buffer", sql`${t.bufferAfterMin} between 0 and 120`),
    check("services_price", sql`${t.priceCents} >= 0`),
  ],
);

/** Which barber offers which service, with optional per-barber price or duration. */
export const staffServices = pgTable(
  "staff_services",
  {
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    staffMemberId: uuid().notNull(),
    serviceId: uuid().notNull(),
    priceCentsOverride: integer(),
    durationMinOverride: integer(),
  },
  (t) => [
    primaryKey({ columns: [t.staffMemberId, t.serviceId] }),
    foreignKey({ columns: [t.shopId, t.staffMemberId], foreignColumns: [staffMembers.shopId, staffMembers.id] }),
    foreignKey({ columns: [t.shopId, t.serviceId], foreignColumns: [services.shopId, services.id] }),
    index().on(t.shopId, t.serviceId),
    check("staff_services_price", sql`${t.priceCentsOverride} is null or ${t.priceCentsOverride} >= 0`),
    check(
      "staff_services_duration",
      sql`${t.durationMinOverride} is null or ${t.durationMinOverride} between 5 and 480`,
    ),
  ],
);

/** A barber's recurring weekly hours. Several rows per day allow split shifts. */
export const workingHours = pgTable(
  "working_hours",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    staffMemberId: uuid().notNull(),
    weekday: smallint().notNull(),
    startsAt: time().notNull(),
    endsAt: time().notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.shopId, t.staffMemberId], foreignColumns: [staffMembers.shopId, staffMembers.id] }),
    index().on(t.shopId, t.staffMemberId, t.weekday),
    check("working_hours_weekday", sql`${t.weekday} between 0 and 6`),
    check("working_hours_order", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const timeOffType = pgEnum("time_off_type", ["holiday", "sick", "personal", "other"]);

export const timeOff = pgTable(
  "time_off",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    staffMemberId: uuid().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    type: timeOffType().notNull().default("holiday"),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.shopId, t.staffMemberId], foreignColumns: [staffMembers.shopId, staffMembers.id] }),
    index().on(t.shopId, t.staffMemberId, t.startsAt),
    check("time_off_order", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/** Whole days the shop is closed (public holidays, shop vacation). Dates are in the shop's time zone. */
export const shopClosures = pgTable(
  "shop_closures",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    startsOn: date().notNull(),
    endsOn: date().notNull(),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.shopId, t.startsOn), check("shop_closures_order", sql`${t.endsOn} >= ${t.startsOn}`)],
);

/* ------------------------------------------------------------------------ */
/* Customers (minimal in Phase 2; full CRM in Phase 3)                       */
/* ------------------------------------------------------------------------ */

export const customerSource = pgEnum("customer_source", ["online", "staff", "walk_in"]);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    fullName: text().notNull(),
    /** E.164 format, such as +351912345678. Used to recognise returning customers. */
    phoneE164: text(),
    email: text(),
    preferredStaffMemberId: uuid(),
    hairPreferences: text(),
    marketingConsentAt: timestamp({ withTimezone: true }),
    source: customerSource().notNull().default("staff"),
    firstVisitAt: timestamp({ withTimezone: true }),
    lastVisitAt: timestamp({ withTimezone: true }),
    visitCount: integer().notNull().default(0),
    anonymizedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("customers_shop_id").on(t.shopId, t.id),
    uniqueIndex("customers_shop_phone").on(t.shopId, t.phoneE164).where(sql`${t.phoneE164} is not null`),
    index("customers_shop_name").on(t.shopId, t.fullName),
    foreignKey({
      columns: [t.shopId, t.preferredStaffMemberId],
      foreignColumns: [staffMembers.shopId, staffMembers.id],
    }),
  ],
);

/* ------------------------------------------------------------------------ */
/* Appointments                                                              */
/* ------------------------------------------------------------------------ */

export const appointmentStatus = pgEnum("appointment_status", [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);
export const appointmentSource = pgEnum("appointment_source", ["online", "staff", "walk_in"]);
export const cancelledBy = pgEnum("cancelled_by", ["customer", "staff"]);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    staffMemberId: uuid().notNull(),
    customerId: uuid().notNull(),
    serviceId: uuid().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    /** End of the service itself, shown on the calendar. */
    endsAt: timestamp({ withTimezone: true }).notNull(),
    /** End of the service plus its buffer. The barber is unavailable until then. */
    blockedUntil: timestamp({ withTimezone: true }).notNull(),
    status: appointmentStatus().notNull().default("confirmed"),
    source: appointmentSource().notNull().default("staff"),
    // Snapshots, so history stays correct after the service or price changes.
    serviceName: text().notNull(),
    priceCents: integer().notNull(),
    durationMin: integer().notNull(),
    customerNote: text(),
    internalNote: text(),
    manageTokenHash: text().unique(),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledBy: cancelledBy(),
    cancelReason: text(),
    createdByMembershipId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Optimistic locking: an edit must name the version it was based on. */
    version: integer().notNull().default(1),
  },
  (t) => [
    unique("appointments_shop_id").on(t.shopId, t.id),
    foreignKey({ columns: [t.shopId, t.staffMemberId], foreignColumns: [staffMembers.shopId, staffMembers.id] }),
    foreignKey({ columns: [t.shopId, t.customerId], foreignColumns: [customers.shopId, customers.id] }),
    foreignKey({ columns: [t.shopId, t.serviceId], foreignColumns: [services.shopId, services.id] }),
    foreignKey({
      columns: [t.shopId, t.createdByMembershipId],
      foreignColumns: [shopMemberships.shopId, shopMemberships.id],
    }),
    index("appointments_shop_start").on(t.shopId, t.startsAt),
    index("appointments_staff_start").on(t.shopId, t.staffMemberId, t.startsAt),
    index("appointments_customer").on(t.shopId, t.customerId),
    check("appointments_order", sql`${t.endsAt} > ${t.startsAt} and ${t.blockedUntil} >= ${t.endsAt}`),
    check("appointments_price", sql`${t.priceCents} >= 0`),
    // The no-overlap exclusion constraint lives in migration 0003 (Drizzle can't express it).
  ],
);

export const appointmentEventType = pgEnum("appointment_event_type", [
  "created",
  "status_changed",
  "rescheduled",
  "edited",
]);

/** Every change to an appointment, for traceability. Append-only for the app. */
export const appointmentEvents = pgTable(
  "appointment_events",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    appointmentId: uuid().notNull(),
    type: appointmentEventType().notNull(),
    fromValue: jsonb(),
    toValue: jsonb(),
    /** Null when the customer made the change (online booking). */
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    actorLabel: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.shopId, t.appointmentId], foreignColumns: [appointments.shopId, appointments.id] }),
    index().on(t.shopId, t.appointmentId, t.createdAt),
  ],
);

/* ------------------------------------------------------------------------ */
/* CRM: haircut and general notes                                            */
/* ------------------------------------------------------------------------ */

export const customerNoteKind = pgEnum("customer_note_kind", ["haircut", "general"]);

export const customerNotes = pgTable(
  "customer_notes",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    customerId: uuid().notNull(),
    appointmentId: uuid(),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    authorName: text().notNull(),
    kind: customerNoteKind().notNull().default("haircut"),
    body: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.shopId, t.customerId], foreignColumns: [customers.shopId, customers.id] }),
    foreignKey({ columns: [t.shopId, t.appointmentId], foreignColumns: [appointments.shopId, appointments.id] }),
    index().on(t.shopId, t.customerId, t.createdAt),
    check("customer_notes_body", sql`length(${t.body}) between 1 and 2000`),
  ],
);

/* ------------------------------------------------------------------------ */
/* Notification outbox                                                       */
/* ------------------------------------------------------------------------ */

export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed", "cancelled"]);

/**
 * Every outgoing message is written here in the same transaction as the change
 * that caused it, then delivered (and retried) separately. Reminders and
 * re-engagement messages will be added as new templates.
 */
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    channel: text().notNull().default("email"),
    recipient: text().notNull(),
    template: text().notNull(),
    payload: jsonb().notNull(),
    status: outboxStatus().notNull().default("pending"),
    scheduledFor: timestamp({ withTimezone: true }).notNull().defaultNow(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_due").on(t.status, t.scheduledFor), index().on(t.shopId, t.createdAt)],
);

export type MembershipRole = (typeof membershipRole.enumValues)[number];
export type Shop = typeof shops.$inferSelect;
export type AppointmentStatus = (typeof appointmentStatus.enumValues)[number];
export type Service = typeof services.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
