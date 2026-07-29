import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

// Always run fresh — this route completes an OAuth exchange.
export const dynamic = "force-dynamic"

/**
 * OAuth callback. Google redirects here with a `code`, which we exchange for a
 * Supabase session cookie before forwarding the user on to `next`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error")

  // Only allow same-origin relative paths, so `next` can't be used as an open redirect.
  const requestedNext = url.searchParams.get("next") || "/shop"
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/shop"

  if (oauthError) {
    const failed = new URL("/login", url.origin)
    failed.searchParams.set("error", oauthError)
    return NextResponse.redirect(failed)
  }

  if (!code) {
    const failed = new URL("/login", url.origin)
    failed.searchParams.set("error", "Missing authorization code")
    return NextResponse.redirect(failed)
  }

  const supabase = createRouteHandlerClient({ cookies })
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const failed = new URL("/login", url.origin)
    failed.searchParams.set("error", error.message)
    return NextResponse.redirect(failed)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
