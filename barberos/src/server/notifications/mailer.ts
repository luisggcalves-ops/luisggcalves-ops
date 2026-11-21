import "server-only";
import { env } from "@/server/env";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Sends transactional email through Resend when RESEND_API_KEY is set.
 * Without a key (local development and tests), it prints the email to the
 * server console, so links such as password resets are still reachable.
 */
export async function sendEmail(email: Email): Promise<void> {
  const { RESEND_API_KEY, MAIL_FROM } = env();
  if (!RESEND_API_KEY) {
    console.info(
      `\n[mail:dev] To: ${email.to}\n[mail:dev] Subject: ${email.subject}\n${email.text
        .split("\n")
        .map((l) => `[mail:dev] ${l}`)
        .join("\n")}\n`,
    );
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) {
    // Never log the recipient's details. The status code is enough to diagnose.
    throw new Error(`Email provider returned ${res.status}`);
  }
}
