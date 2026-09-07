type UserIdentityRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `app_users.display_name` is the portal's canonical visible name. */
export function canonicalDisplayName(row: UserIdentityRow): string {
  return text(row.display_name)
    ?? text(row.full_name)
    ?? text(row.name)
    ?? text(row.email)?.split("@")[0]
    ?? "";
}

/** Explicit canonical initials win; otherwise derive them from the canonical name. */
export function canonicalInitials(row: UserIdentityRow): string {
  const explicit = text(row.initials);
  if (explicit) return explicit.toUpperCase().slice(0, 4);
  const parts = canonicalDisplayName(row).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
