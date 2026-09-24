import { createClient } from "@supabase/supabase-js";
import { configuration } from "./config";

export function database() {
  const { supabaseUrl, supabaseKey } = configuration();
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export const IMAGE_BUCKET = "furniture-images";
