export function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone)
    .replace(/\D/g, "") // remove +, spaces, @c.us, etc.
    .replace(/^0+/, ""); // remove leading zeros
}
