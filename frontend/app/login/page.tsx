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
      {/* Left Panel - Stussy style branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-foreground items-center justify-center p-12">
        <div className="max-w-md">
          <Link href="/" className="text-background text-lg uppercase tracking-wide">
            it dropped!
          </Link>
          <h1 className="text-4xl text-background uppercase tracking-wide leading-tight mt-12 mb-6">
            Never miss a drop again
          </h1>
          <p className="text-background/60 text-sm uppercase tracking-wide">
            Track Stüssy releases worldwide
          </p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Link href="/" className="text-lg uppercase tracking-wide">
              it dropped!
            </Link>
          </div>

          <h2 className="text-sm uppercase tracking-widest mb-1">Sign In</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-8">
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
              className="w-full py-3 bg-foreground text-background text-xs uppercase tracking-wide font-medium flex items-center justify-center gap-2 hover:bg-foreground/90 transition-colors disabled:opacity-50"
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
