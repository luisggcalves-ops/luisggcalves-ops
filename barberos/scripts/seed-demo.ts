/**
 * Creates a clearly labelled DEMO shop with sample barbers, services and a week
 * of bookings, so you can click around straight away.
 *
 *   npm run seed:demo
 *
 * Everything goes through the real domain services (the same validation, rules
 * and row-level security as the app). The shop is flagged `is_demo`, and the app
 * shows a "Demo data" banner for it. Never run this against production.
 */
import "dotenv/config";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { uuidv7 } from "../src/lib/ids";
import { addDays, startOfMonth, zonedDate } from "../src/lib/time";
import { DEFAULT_OPENING_HOURS } from "../src/lib/validation/shop";
import { createShop } from "../src/server/domain/shops/service";
import { createService, listServices } from "../src/server/domain/services/service";
import { createStaffProfile, listStaff, setStaffServices } from "../src/server/domain/staff/service";
import { changeAppointmentStatus, createAppointment } from "../src/server/domain/appointments/service";
import { addCustomerNote } from "../src/server/domain/customers/crm";
import { createExpense, recordPayment, setCommissionRule } from "../src/server/domain/finance/service";
import { createProduct, listProducts } from "../src/server/domain/finance/inventory";
import { uuidv7 as newKey } from "../src/lib/ids";
import { DomainError } from "../src/server/errors";
import { pool } from "../src/server/db/client";
import type { ActorContext } from "../src/server/domain/context";

const PASSWORD = "barberos-demo";
const OWNER = { name: "Sofia Demo", email: "owner@demo.barberos.test" };
const BARBER = { name: "Rui Demo", email: "barber@demo.barberos.test" };
const TZ = "Europe/Lisbon";

const CUSTOMERS = [
  ["João Pereira", "912000101"],
  ["Tiago Santos", "912000102"],
  ["Rafael Costa", "912000103"],
  ["Bruno Alves", "912000104"],
  ["André Lopes", "912000105"],
  ["Pedro Nunes", "912000106"],
  ["Miguel Sousa", "912000107"],
  ["Diogo Martins", "912000108"],
  ["Gonçalo Ferreira", "912000109"],
  ["Ricardo Gomes", "912000110"],
  ["Hugo Ribeiro", "912000111"],
  ["Nuno Carvalho", "912000112"],
] as const;

const NOTES = [
  "Skin fade, #0.5 at the bottom, blended to #3. Scissors on top, 4cm.",
  "Classic taper, #2 sides, textured crop on top. Likes it matte (clay).",
  "Beard: shape cheek line low, keep length 1cm. Sensitive skin, no alcohol.",
  "Mid fade #1, side part on the left, hard part shaved.",
  "Just a trim, 1cm off everywhere. Talks about football. Benfica!",
];

const SLOTS = ["09:00", "09:45", "10:30", "11:15", "12:00", "14:00", "14:45", "15:30", "16:15", "17:00", "17:45"];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  if (!ownerUrl) throw new Error("MIGRATION_DATABASE_URL is not set (see .env.example).");
  const admin = new Pool({ connectionString: ownerUrl, max: 1 });
  let created = false;

  try {
    const { rows: existing } = await admin.query("select id from users where email = $1", [OWNER.email]);
    if (existing.length) {
      console.log(`Demo data already exists. Sign in as ${OWNER.email} / ${PASSWORD}`);
      return;
    }

    // Accounts are created like Better Auth does it: a user plus a credential account with a scrypt hash.
    const hash = await hashPassword(PASSWORD);
    const createLogin = async (u: { name: string; email: string }) => {
      const id = uuidv7();
      await admin.query("insert into users (id, name, email, email_verified) values ($1, $2, $3, true)", [id, u.name, u.email]);
      await admin.query(
        "insert into accounts (id, user_id, account_id, provider_id, password) values ($1, $2, $3, 'credential', $4)",
        [uuidv7(), id, id, hash],
      );
      return { id, ...u };
    };
    created = true;
    const owner = await createLogin(OWNER);
    const barberUser = await createLogin(BARBER);

    const { shopId } = await createShop(owner, {
      name: "Barbearia Demo",
      slug: `demo-${Date.now().toString(36)}`,
      timezone: TZ,
      currency: "EUR",
      phone: "+351 210 000 000",
      openingHours: DEFAULT_OPENING_HOURS,
      ownerIsBarber: true,
    });
    await admin.query("update shops set is_demo = true, city = 'Lisboa', address_line = 'Rua Demo 1' where id = $1", [shopId]);
    await admin.query("update shop_settings set online_booking_enabled = true, booking_lead_time_min = 30 where shop_id = $1", [shopId]);
    const { rows: m } = await admin.query("select id from shop_memberships where shop_id = $1 and user_id = $2", [shopId, owner.id]);
    const ctx: ActorContext = { userId: owner.id, shopId, membershipId: m[0].id, role: "owner" };

    // A barber who signs in (to try the phone app) and one who doesn't use the app.
    const barberMembershipId = uuidv7();
    await admin.query("insert into shop_memberships (id, shop_id, user_id, role) values ($1, $2, $3, 'barber')", [
      barberMembershipId,
      shopId,
      barberUser.id,
    ]);
    await createStaffProfile(ctx, { displayName: BARBER.name, membershipId: barberMembershipId, calendarColor: "sage" });
    await createStaffProfile(ctx, { displayName: "Zé (no login)", calendarColor: "clay" });

    for (const s of [
      { name: "Haircut", durationMin: 30, bufferAfterMin: 5, price: "15" },
      { name: "Skin fade", durationMin: 45, bufferAfterMin: 5, price: "20" },
      { name: "Beard trim", durationMin: 20, bufferAfterMin: 5, price: "10" },
      { name: "Haircut + beard", durationMin: 60, bufferAfterMin: 5, price: "25" },
      { name: "Kids cut", durationMin: 25, bufferAfterMin: 5, price: "12" },
    ]) {
      await createService(ctx, { ...s, staffMemberIds: [] });
    }
    const services = await listServices(ctx);
    const staff = await listStaff(ctx);
    for (const st of staff) await setStaffServices(ctx, st.id, services.map((s) => ({ serviceId: s.id })));

    // Money: commission rules, retail products and some expenses.
    const rui = staff.find((x) => x.displayName === BARBER.name)!;
    await setCommissionRule(ctx, { type: "percent", percent: 40 });
    await setCommissionRule(ctx, { type: "percent", percent: 50, staffMemberId: rui.id });
    await setCommissionRule(ctx, { appliesTo: "products", type: "percent", percent: 10 });
    for (const [name, cost, price, stock] of [
      ["Matte clay 100ml", "6", "15", 12],
      ["Beard oil 30ml", "5", "13", 3],
      ["Sea salt spray", "4", "11", 8],
      ["Shampoo 250ml", "3.5", "9", 2],
    ] as const) {
      await createProduct(ctx, { name, cost, price, lowStockThreshold: 3, category: "Retail" }, stock);
    }
    const productList = await listProducts(ctx);

    // Bookings from three days ago to a week ahead. Past ones are completed (a few are no-shows).
    const today = zonedDate(new Date(), TZ);
    let booked = 0;
    let n = 0;
    for (let offset = -3; offset <= 7; offset++) {
      const date = addDays(today, offset);
      for (const st of staff) {
        for (const time of SLOTS) {
          n++;
          if ((n * 7) % 10 < 4) continue; // leave gaps, like a real diary
          const [fullName, phone] = CUSTOMERS[n % CUSTOMERS.length];
          const service = services[n % services.length];
          try {
            const { appointmentId } = await createAppointment(ctx, {
              staffMemberId: st.id,
              serviceId: service.id,
              date,
              time,
              newCustomer: { fullName, phone },
              internalNote: n % 9 === 0 ? "Prefers scissors on top, #2 on the sides" : null,
            });
            booked++;
            if (offset < 0) {
              const to = n % 11 === 0 ? "no_show" : "completed";
              if (to === "no_show") {
                await changeAppointmentStatus(ctx, { appointmentId, to, version: 1 }, new Date());
              } else {
                // Paid at the end of the appointment: completes it, credits commission, sells a product now and then.
                const { rows: a } = await admin.query("select ends_at, price_cents from appointments where id = $1", [appointmentId]);
                const product = n % 4 === 0 ? productList[n % productList.length] : null;
                await recordPayment(
                  ctx,
                  {
                    appointmentId,
                    method: n % 3 === 0 ? "cash" : "card",
                    tip: n % 5 === 0 ? "2" : "",
                    idempotencyKey: newKey(),
                    items: [
                      { kind: "service", serviceId: service.id, unitPrice: (a[0].price_cents / 100).toFixed(2) },
                      ...(product && product.stockQty > 1 ? [{ kind: "product", productId: product.id, unitPrice: (product.priceCents / 100).toFixed(2) }] : []),
                    ],
                  },
                  a[0].ends_at,
                );
              }
              if (to === "completed" && n % 3 === 0) {
                const { rows: c } = await admin.query("select customer_id from appointments where id = $1", [appointmentId]);
                const note = NOTES[n % NOTES.length];
                await addCustomerNote(ctx, c[0].customer_id, { body: note, appointmentId }, st.displayName);
              }
            }
          } catch (err) {
            // Closed days and overlaps are skipped, exactly as the app would refuse them.
            if (!(err instanceof DomainError)) throw err;
          }
        }
      }
    }

    await createExpense(ctx, { category: "rent", amount: "850", incurredOn: startOfMonth(today), description: "Monthly rent" });
    await createExpense(ctx, { category: "supplies", amount: "64.90", incurredOn: addDays(today, -2), vendor: "Barber Supply Co.", description: "Blades and neck strips" });
    await createExpense(ctx, { category: "utilities", amount: "120", incurredOn: addDays(today, -1), description: "Electricity" });

    console.log(`\nDemo shop created with ${staff.length} barbers, ${services.length} services and ${booked} appointments.\n`);
    console.log(`  Owner:  ${OWNER.email} / ${PASSWORD}`);
    console.log(`  Barber: ${BARBER.email} / ${PASSWORD}  (try this on your phone)\n`);
  } catch (err) {
    if (created) {
      // Leave nothing half-seeded: remove the demo shop and accounts (cascades to their data).
      await admin.query(
        "delete from shops where id in (select m.shop_id from shop_memberships m join users u on u.id = m.user_id where u.email = $1)",
        [OWNER.email],
      );
      await admin.query("delete from users where email = any($1)", [[OWNER.email, BARBER.email]]);
    }
    throw err;
  } finally {
    await admin.end();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
