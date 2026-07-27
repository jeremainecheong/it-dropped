"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    const result = await login(email, password)

    if (result.success) {
      router.push("/shop")
    } else {
      setError(result.error || "Invalid credentials")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - editorial branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-foreground text-background flex-col justify-between p-12 border-r border-foreground">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-background/60">
          <Link href="/" className="flex items-center gap-2 text-background">
            <span className="text-signal">◉</span> it dropped
          </Link>
          <span>Access / 001</span>
        </div>
        <div>
          <h1 className="display text-[clamp(3rem,7vw,6rem)]">
            Never miss<br />a drop<span className="text-signal">.</span>
          </h1>
          <p className="serif-accent text-2xl text-background/70 mt-4">the whole floor, one feed.</p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-background/40">
          Six regions · Live tracking · Price intelligence
        </p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Link href="/" className="flex items-center gap-2 text-lg uppercase tracking-wide font-bold">
              <span className="text-signal text-xs">◉</span> it dropped
            </Link>
          </div>

          <p className="mono-label text-signal mb-2">● Access</p>
          <h2 className="display text-4xl mb-2">Sign In</h2>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-8">
            Enter your details below
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs uppercase tracking-wide">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs uppercase tracking-wide mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-3 bg-background border border-border text-sm focus:border-foreground focus:outline-none transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs uppercase tracking-wide mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-3 bg-background border border-border text-sm focus:border-foreground focus:outline-none transition-colors pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-foreground text-background text-xs uppercase tracking-[0.2em] font-medium flex items-center justify-center gap-2 hover:bg-signal transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground uppercase tracking-wide">
            Don't have an account?{" "}
            <Link href="/signup" className="text-foreground link-underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
