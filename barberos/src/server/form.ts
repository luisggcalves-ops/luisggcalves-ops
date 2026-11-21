/** Small helpers for reading FormData safely. Values are validated later by Zod. */
export function readString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export function readJson(formData: FormData, key: string): unknown {
  try {
    return JSON.parse(readString(formData, key) || "null");
  } catch {
    return null;
  }
}
