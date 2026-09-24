import type { SetupStatus } from "./types";

export function setupStatus(): SetupStatus {
  const missing = [];
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (
    !process.env.SUPABASE_SECRET_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    missing.push("SUPABASE_SECRET_KEY");
  return { ready: missing.length === 0, missing };
}
export function configuration() {
  const status = setupStatus();
  if (!status.ready)
    throw new Error(
      `Setup required: ${status.missing.join(", ")}. Add these to .env.local and restart.`,
    );
  return {
    openaiKey: process.env.OPENAI_API_KEY!,
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: (process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    model: process.env.OPENAI_MODEL || "gpt-6-astra",
  };
}
