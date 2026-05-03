import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseSsrExtraOptions } from "@/lib/supabase/cookie-options";

export type SupabaseServerClient = ReturnType<typeof createServerClient>;

export function getSupabaseBrowserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export async function createSupabaseServerClient() {
  const config = getSupabaseBrowserConfig();

  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    ...getSupabaseSsrExtraOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies; middleware/route handlers can.
        }
      },
    },
  });
}
