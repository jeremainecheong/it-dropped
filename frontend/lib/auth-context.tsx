"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { supabase } from "./supabase"
import type { User as SupabaseUser, Session } from "@supabase/supabase-js"

interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role?: "user" | "admin"
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signup: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>
  loginWithGoogle: (redirectTo?: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function mapSupabaseUser(supabaseUser: SupabaseUser): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || "",
    name:
      supabaseUser.user_metadata?.name ||
      supabaseUser.user_metadata?.full_name ||
      supabaseUser.email?.split("@")[0] ||
      "User",
    avatar: supabaseUser.user_metadata?.avatar_url ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${supabaseUser.email}`,
    role: supabaseUser.email === "admin@dropradar.com" ? "admin" : "user",
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user))
      }
      setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(mapSupabaseUser(session.user))
        } else {
          setUser(null)
        }
        setIsLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setIsLoading(false)
      return { success: false, error: error.message }
    }

    // Set user immediately from login response
    if (data.user) {
      setUser(mapSupabaseUser(data.user))
    }

    setIsLoading(false)
    return { success: true }
  }

  const signup = async (email: string, password: string, name: string) => {
    setIsLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    })

    setIsLoading(false)
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  }

  /**
   * Google SSO. Supabase redirects to Google, then back to /auth/callback,
   * which finishes the exchange and forwards to `redirectTo`.
   */
  const loginWithGoogle = async (redirectTo = "/shop") => {
    const callback = new URL("/auth/callback", window.location.origin)
    callback.searchParams.set("next", redirectTo)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    })

    if (error) {
      return { success: false, error: error.message }
    }
    // On success the browser navigates away to Google.
    return { success: true }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
