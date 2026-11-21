import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalizes a phone number to E.164 (+351912345678). Numbers without a country
 * code are read as local to the shop's country. Returns null if it isn't a valid number.
 */
export function normalizePhone(input: string, defaultCountry: string = "PT"): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
