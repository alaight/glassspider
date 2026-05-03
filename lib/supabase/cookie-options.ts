/**
 * Optional cookie scope for ecosystem SSO across `*.laightworks.com`.
 * Omit in local dev unless you deliberately test subdomain cookies against a shared host.
 */
export function getSupabaseSsrExtraOptions() {
  let domain = process.env.SUPABASE_AUTH_COOKIE_DOMAIN?.trim();
  if (!domain) return {};

  domain = domain.replace(/^\.+/, "");
  if (!domain) return {};

  return {
    cookieOptions: {
      domain,
      path: "/",
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    },
  };
}
