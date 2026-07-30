import type React from "react"
import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/lib/auth-context"
import { WishlistProvider } from "@/lib/wishlist-context"
import { PWAProvider } from "@/components/pwa-provider"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

// San Francisco (SF Pro) — self-hosted, subset to Latin
const sfText = localFont({
  variable: "--font-sf-text",
  display: "swap",
  src: [
    { path: "../public/fonts/SF-Pro-Text-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/SF-Pro-Text-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/SF-Pro-Text-Semibold.woff2", weight: "600", style: "normal" },
  ],
})

const sfDisplay = localFont({
  variable: "--font-sf-display",
  display: "swap",
  src: [
    { path: "../public/fonts/SF-Pro-Display-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/SF-Pro-Display-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/SF-Pro-Display-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/SF-Pro-Display-Bold.woff2", weight: "700", style: "normal" },
  ],
})

export const metadata: Metadata = {
  // Required so relative OG/canonical URLs resolve correctly.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://itdropped.app"),
  title: {
    default: "It Dropped — Stüssy drop tracker across six regions",
    template: "%s — It Dropped",
  },
  description: "Never miss a Stüssy drop. Track releases, restocks, and price changes across all regions in real-time.",
  generator: "v0.app",
  keywords: ["Stüssy", "streetwear", "drops", "restocks", "price tracker", "fashion"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IT DROPPED",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
}

/**
 * Next 14 wants these in their own export; leaving them in `metadata` logged a
 * warning on every route at build and applied nothing.
 *
 * `maximumScale: 1` and `userScalable: false` are gone. They blocked pinch-zoom
 * across an app whose body copy is 13px and whose smallest labels are 9px — a
 * WCAG 1.4.4 failure with nothing gained. Nobody was being protected from
 * anything; iOS has not zoomed on input focus since it started respecting
 * 16px-or-larger form fields.
 *
 * `viewportFit: "cover"` is what makes `env(safe-area-inset-*)` resolve, which
 * the bottom navigation needs to clear the iPhone home indicator.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${sfText.variable} ${sfDisplay.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            <WishlistProvider>{children}</WishlistProvider>
          </AuthProvider>
        </ThemeProvider>
        <PWAProvider />
        {/* Mounted at last. The toast system was installed, duplicated across
            two directories, and rendered nowhere — so 26 of the app's 37 catch
            blocks had nothing to report to and only wrote to the console. */}
        <Toaster position="top-center" richColors closeButton />
        <Analytics />
      </body>
    </html>
  )
}
