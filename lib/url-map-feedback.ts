/** Heuristic: Supabase/Postgres denying URL-map row updates (missing UPDATE policy). */
export function isLikelyUrlMapRlsError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("row-level security") ||
    m.includes("rls") ||
    m.includes("violates row-level") ||
    m.includes("permission denied") ||
    m.includes("policy") ||
    m.includes("42501")
  );
}
