const DEFAULT_LAIGHTWORKS_LOGIN_URL = "https://laightworks.com/login";

function normalizeLaightworksLoginUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_LAIGHTWORKS_LOGIN_URL;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    /* discard */
  }

  return DEFAULT_LAIGHTWORKS_LOGIN_URL;
}

export const PROJECT_SLUG = process.env.GLASSSPIDER_PROJECT_SLUG ?? "glassspider";

/** Absolute URL — non-absolute env values fall back so Next never treats the string as a same-origin path. */
export const LAIGHTWORKS_LOGIN_URL = normalizeLaightworksLoginUrl(
  process.env.NEXT_PUBLIC_LAIGHTWORKS_LOGIN_URL,
);

export const ADMIN_ROLES = (process.env.GLASSSPIDER_ADMIN_ROLES ?? "owner,admin")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean);

export const VIEWER_ROLES = ["owner", "admin", "member", "viewer", "analyst", "reviewer"];
