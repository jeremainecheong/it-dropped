"use client"

import { useEffect } from "react"

/**
 * The last line of defence: a throw in the root layout itself.
 *
 * `app/error.tsx` renders *inside* the root layout, so it cannot catch a fault
 * in the layout — the providers, the theme, the fonts. This replaces the whole
 * document, which is why it has to supply its own <html> and <body> and cannot
 * use any of the app's components or CSS variables. Everything here is inline
 * on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Root layout error:", error.digest ?? "(no digest)", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          background: "#ffffff",
          color: "#1d1d1f",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>It Dropped failed to start</p>
        <p style={{ fontSize: 13, color: "#6e6e73", margin: 0, maxWidth: "22rem" }}>
          Something went wrong before the page could render. Reloading usually clears it.
        </p>
        <button
          onClick={reset}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "0.65rem 1.25rem",
            fontSize: 13,
            fontWeight: 500,
            background: "#1d1d1f",
            color: "#ffffff",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        {error.digest && (
          <p style={{ fontSize: 11, color: "#a1a1a6", fontFamily: "monospace", margin: 0 }}>
            {error.digest}
          </p>
        )}
      </body>
    </html>
  )
}
