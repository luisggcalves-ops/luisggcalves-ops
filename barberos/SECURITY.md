# BarberOS security review

Reviewed before the pilot (Phase 5). The **Automated guards** column means a test fails if the property ever breaks.

## Threat model in one paragraph

BarberOS holds personal data (customer names, phones, emails, haircut notes) and money records for many independent shops in one database. The main risks:

- one shop seeing or changing another shop's data;
- a barber reaching owner-only data;
- the public booking page being abused;
- financial records being altered after the fact.

## Controls

| Area | Control | Automated guards |
|---|---|---|
| **Tenant isolation** | Every query runs in `withTenantTx`, which sets a transaction-local `app.shop_id`. Postgres RLS on every tenant table. Composite `(shop_id, id)` foreign keys. App connects as a non-owner role without `BYPASSRLS`. | `schema-security.test.ts` (every table has RLS and a policy, or is a known global table; the app role owns nothing and can't bypass RLS), `tenant-isolation.test.ts`, cross-shop tests in each module |
| **Cross-tenant lookups** | Only three `SECURITY DEFINER` functions (slug → shop id, invite token hash → invite, manage token hash → appointment). They return ids only and use a fixed `search_path`. | `schema-security.test.ts` |
| **Authorization** | Static role → permission map. Every domain service asserts permissions. Barbers are scoped to their own appointments, customers and earnings. Shop settings gate managers' finance access and barbers taking payments. | `permissions.test.ts`, per-module integration tests, `access.spec.ts` (signed-out visitors and barbers are redirected from every owner page, and private downloads return 401/403) |
| **Server actions** | Each exported action resolves the caller and permissions before touching data. | `server-actions-audit.test.ts` fails if a `"use server"` export lacks a guard. This caught a cookie helper that was accidentally exposed as an endpoint (fixed). |
| **Authentication** | Better Auth: scrypt hashes, HTTP-only SameSite cookies (Secure over https), DB-backed sessions, sessions revoked on password reset, origin/CSRF checks, DB-backed rate limits (sign-in 10/min, sign-up 5/min, reset 3/min). | e2e sign-in/out tests |
| **Tokens** | Invite and manage-booking tokens: 256-bit random, stored only as SHA-256, one-time (invites), cleared on GDPR erasure. Stripped from logs. | `team.test.ts`, `public-booking.test.ts`, log-redaction unit test |
| **Public booking** | Honeypot field and per-IP rate limits (booking 10 per 10 min, manage 20 per 10 min). Only public services and bookable barbers are exposed. No other customer data reachable. | `public-booking.test.ts`, `booking.spec.ts` |
| **Money integrity** | Payments, payment lines, commission records, stock movements, expenses, the audit log and appointment history can't be deleted by the app role (ledger rows can't be updated either). Voids write reversals. Idempotency keys and a one-active-payment-per-appointment unique index. | `schema-security.test.ts`, `finance.test.ts` (incl. race tests) |
| **Double booking** | Postgres exclusion constraint on (barber, time range incl. buffer). | Race tests in `scheduling.test.ts` and `public-booking.test.ts` |
| **Browser hardening** | Nonce-based CSP with `strict-dynamic` (no inline scripts), `frame-ancestors 'none'`, HSTS, nosniff, strict referrer, COOP, restrictive Permissions-Policy. | Manual check plus a console-violation sweep |
| **Output safety** | React escaping everywhere. CSV exports neutralise formula injection (`=`, `+`, `-`, `@`). JSON export is a download. | `csv` unit test |
| **Open redirects** | `next` parameters accept only same-site relative paths. | `safeNext` unit test |
| **Errors & logs** | Users see generic messages. Structured JSON logs with ids only, tokens redacted, no personal data. | log-redaction unit test |
| **GDPR** | Per-customer export (owner/manager) and anonymising erasure (owner) that cancels future bookings. Both audited. EU data residency recommended at deploy. Privacy page on booking. | `crm.test.ts`, `booking.spec.ts` |

## Known gaps and accepted risks (for the pilot)

- **Email verification is not required at sign-up.** Low risk while invite acceptance requires the invited email. Enable `requireEmailVerification` once real email is configured.
- **Sign-up reveals whether an email is registered.** This is standard for SaaS sign-up. Rate limits slow enumeration.
- **`style-src 'unsafe-inline'`.** Needed for inline positioning styles in the calendar. Inline *scripts* remain blocked.
- **Dev-only advisory.** `npm audit` reports a moderate advisory in esbuild's dev server, pulled in by `drizzle-kit` (a development tool). It doesn't ship and isn't run as a server.
- **No 2FA yet.** Recommended for owners before scale.
- **Rate limiting is per IP**, so shared networks share a budget.
- **Shop-level data export and self-service shop deletion aren't built yet.** Cascading deletes are in place and tested. Today a deletion request is handled manually.

## Reporting

Please report security issues privately to the maintainer rather than in public issues.
