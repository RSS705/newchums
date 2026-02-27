/**
 * Computes the best display name for greetings.
 * Priority: display name (real name) → handle (username) → "friend".
 */
export function getGreetingName({
  displayName,
  handle,
}: {
  displayName?: string | null;
  handle?: string | null;
}): string {
  const name = displayName?.trim();
  if (name) return name;
  const h = handle?.trim();
  if (h) return h;
  return "friend";
}
