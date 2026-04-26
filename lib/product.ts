export const PROJECT_SLUG = process.env.GLASSSPIDER_PROJECT_SLUG ?? "glassspider";

export const LAIGHTWORKS_LOGIN_URL =
  process.env.NEXT_PUBLIC_LAIGHTWORKS_LOGIN_URL ?? "https://laightworks.com/login";

export const ADMIN_ROLES = (process.env.GLASSSPIDER_ADMIN_ROLES ?? "owner,admin")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean);

export const VIEWER_ROLES = ["owner", "admin", "member", "viewer", "analyst", "reviewer"];
