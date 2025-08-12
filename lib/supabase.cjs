// lib/supabase.cjs  (CommonJS; safe on Vercel Node runtimes)
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn(
    "[Supabase] Missing envs. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
  );
}

const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false }
});

module.exports = { supabaseAdmin };
