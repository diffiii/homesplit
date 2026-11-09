const MASK = "•••";

/**
 * `jan.kowalski@gmail.com` as `j•••@gmail.com`: enough for someone with the
 * link to pick the right account, not enough to learn the address.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) {
    return MASK;
  }
  return `${email.slice(0, 1)}${MASK}${email.slice(at)}`;
}
