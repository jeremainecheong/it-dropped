"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, MessageCircle, Eye, Heart, Pin, Lock, TrendingUp, Users, Flame, Clock, ChevronRight } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase"
import { AuthGuard } from "@/components/auth-guard"

interface Thread {
    id: string
    user_id: string
    title: string
    content: string
    category: string
    product_id: string | null
    is_pinned: boolean
    is_locked: boolean
    view_count: number
    like_count: number
    comment_count: number
    created_at: string
}

const CATEGORIES = [
    { id: "all", label: "All", icon: "🌐", color: "bg-muted" },
    { id: "general", label: "General", icon: "💬", color: "bg-zinc-800" },
    { id: "drops", label: "Drops", icon: "🔥", color: "bg-foreground text-background" },
    { id: "fit-check", label: "Fit Check", icon: "👕", color: "bg-zinc-700" },
    { id: "price-talk", label: "Price Talk", icon: "💰", color: "bg-zinc-800" },
    { id: "wtb-wts", label: "WTB/WTS", icon: "🤝", color: "bg-zinc-700 border border-foreground" },
]

function CommunityContent() {
    const router = useRouter()
    const { user } = useAuth()
    const [threads, setThreads] = useState<Thread[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedCategory, setSelectedCategory] = useState("all")
    const [activeUsers] = useState(Math.floor(Math.random() * 100) + 50)

    useEffect(() => {
        fetchThreads()
    }, [selectedCategory])

    const fetchThreads = async () => {
        setIsLoading(true)
        try {
            let query = supabase
                .from("forum_threads")
                .select("*")
                .eq("is_deleted", false)
                .order("is_pinned", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(50)

            if (selectedCategory !== "all") {
                query = query.eq("category", selectedCategory)
            }

            const { data, error } = await query
            if (error) throw error
            setThreads(data || [])
        } catch (error) {
            console.error("Error:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
        if (diff < 60) return "just now"
        if (diff < 3600) return `${Math.floor(diff / 60)}m`
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`
        return `${Math.floor(diff / 86400)}d`
    }

    const getCategoryInfo = (category: string) => {
        return CATEGORIES.find(c => c.id === category) || CATEGORIES[0]
    }

    const trendingThreads = threads.slice(0, 3).sort((a, b) => b.view_count - a.view_count)

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Premium Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="flex items-center justify-between px-4 lg:px-8 h-14">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="text-lg font-medium tracking-tight uppercase">
                            it dropped<span className="text-muted-foreground">!</span>
                        </Link>
                        <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span>{activeUsers} online</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link href="/shop" className="text-sm tracking-wide hover:text-muted-foreground transition-colors">Shop</Link>
                        <Link href="/profile" className="text-sm tracking-wide hover:text-muted-foreground transition-colors">Profile</Link>
                        <Link
                            href="/community/new"
                            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm font-medium tracking-wide hover:bg-foreground/90 transition-all hover:scale-105"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">New Thread</span>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="pt-14">
                <div className="max-w-7xl mx-auto px-4 lg:px-8">
                    {/* Hero Banner */}
                    <div className="py-8 lg:py-12 border-b border-border">
                        <h1 className="text-4xl lg:text-5xl font-light tracking-tight mb-4">Community</h1>
                        <p className="text-lg text-muted-foreground max-w-2xl">
                            Connect with fellow collectors. Share fits, discuss drops, and stay ahead of the game.
                        </p>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-8 py-8">
                        {/* Sidebar */}
                        <aside className="lg:col-span-1 space-y-6">
                            {/* Categories */}
                            <div className="p-4 border border-border">
                                <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Categories</h3>
                                <div className="space-y-1">
                                    {CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setSelectedCategory(cat.id)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all ${selectedCategory === cat.id
                                                    ? "bg-foreground text-background"
                                                    : "hover:bg-muted"
                                                }`}
                                        >
                                            <span className="text-base">{cat.icon}</span>
                                            <span className="tracking-wide">{cat.label}</span>
                                            <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${selectedCategory === cat.id ? "rotate-90" : ""}`} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Trending */}
                            <div className="p-4 border border-border">
                                <h3 className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-4">
                                    <Flame className="w-3 h-3" /> Trending
                                </h3>
                                <div className="space-y-3">
                                    {trendingThreads.map((thread, i) => (
                                        <Link
                                            key={thread.id}
                                            href={`/community/${thread.id}`}
                                            className="block group"
                                        >
                                            <div className="flex gap-3">
                                                <span className="text-2xl font-light text-muted-foreground">{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate group-hover:underline">{thread.title}</p>
                                                    <p className="text-xs text-muted-foreground">{thread.view_count} views</p>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="p-4 border border-border">
                                <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Stats</h3>
                                <div className="space-y-3 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Total Threads</span>
                                        <span className="font-medium">{threads.length}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Online Now</span>
                                        <span className="flex items-center gap-1 font-medium">
                                            <span className="w-2 h-2 rounded-full bg-green-500" />
                                            {activeUsers}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </aside>

                        {/* Main Feed */}
                        <div className="lg:col-span-3">
                            {/* Sort Bar */}
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <button className="flex items-center gap-2 text-sm font-medium">
                                        <Clock className="w-4 h-4" /> Latest
                                    </button>
                                    <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                                        <TrendingUp className="w-4 h-4" /> Popular
                                    </button>
                                </div>
                                <span className="text-xs text-muted-foreground">{threads.length} threads</span>
                            </div>

                            {/* Thread Cards */}
                            {isLoading ? (
                                <div className="space-y-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="p-6 border border-border animate-pulse">
                                            <div className="flex gap-4">
                                                <div className="w-12 h-12 rounded-full bg-muted" />
                                                <div className="flex-1">
                                                    <div className="h-5 bg-muted w-3/4 mb-3" />
                                                    <div className="h-4 bg-muted w-1/2" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : threads.length === 0 ? (
                                <div className="text-center py-20 border border-dashed border-border">
                                    <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground mb-6" />
                                    <h2 className="text-2xl font-medium mb-2">No threads yet</h2>
                                    <p className="text-muted-foreground mb-8">Be the first to start a conversation!</p>
                                    <Link
                                        href="/community/new"
                                        className="inline-flex items-center gap-2 px-8 py-3 bg-foreground text-background text-sm font-medium tracking-wide"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Create Thread
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {threads.map((thread) => {
                                        const catInfo = getCategoryInfo(thread.category)
                                        return (
                                            <Link
                                                key={thread.id}
                                                href={`/community/${thread.id}`}
                                                className="block p-5 border border-border hover:border-foreground/30 transition-all group hover:shadow-lg"
                                            >
                                                <div className="flex gap-4">
                                                    {/* Avatar */}
                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                                        {thread.user_id.slice(0, 2).toUpperCase()}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        {/* Meta Row */}
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {thread.is_pinned && (
                                                                <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] uppercase tracking-wider">
                                                                    <Pin className="w-3 h-3" /> Pinned
                                                                </span>
                                                            )}
                                                            {thread.is_locked && (
                                                                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-500 text-[10px] uppercase tracking-wider">
                                                                    <Lock className="w-3 h-3" /> Locked
                                                                </span>
                                                            )}
                                                            <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider ${catInfo.color}`}>
                                                                {catInfo.icon} {catInfo.label}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground ml-auto">{formatTimeAgo(thread.created_at)}</span>
                                                        </div>

                                                        {/* Title */}
                                                        <h3 className="text-lg font-medium mb-2 group-hover:text-foreground/80 transition-colors line-clamp-1">
                                                            {thread.title}
                                                        </h3>

                                                        {/* Preview */}
                                                        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                                                            {thread.content}
                                                        </p>

                                                        {/* Engagement */}
                                                        <div className="flex items-center gap-6 text-xs text-muted-foreground">
                                                            <span className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                                                                <MessageCircle className="w-4 h-4" />
                                                                {thread.comment_count} {thread.comment_count === 1 ? "reply" : "replies"}
                                                            </span>
                                                            <span className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                                                                <Heart className="w-4 h-4" />
                                                                {thread.like_count}
                                                            </span>
                                                            <span className="flex items-center gap-1.5">
                                                                <Eye className="w-4 h-4" />
                                                                {thread.view_count}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

export default function CommunityPage() {
    return (
        <AuthGuard>
            <CommunityContent />
        </AuthGuard>
    )
}
