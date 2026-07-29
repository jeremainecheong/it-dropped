import { createBrowserClient } from "@supabase/auth-helpers-nextjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Browser-side Supabase client.
 *
 * This must be createBrowserClient, not createClient from supabase-js. The
 * plain client defaults to flowType "implicit", which hands the session back
 * in the URL fragment (#access_token=...). Fragments are never sent to the
 * server, so app/auth/callback/route.ts — a server route handler — found no
 * `code` and bounced every Google sign-in to
 * /login?error=Missing+authorization+code.
 *
 * createBrowserClient uses PKCE and keeps the session, and the PKCE code
 * verifier, in cookies. That gives the callback both the `code` in the query
 * string and the verifier needed to exchange it, and it is what lets server
 * components see the session at all.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
