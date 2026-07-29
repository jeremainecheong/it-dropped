"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Heart, MessageCircle, Pin, Lock, Trash2, Send, MoreHorizontal } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase"
import { Header } from "@/components/layout/header"

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

interface Comment {
    id: string
    thread_id: string
    user_id: string
    parent_id: string | null
    content: string
    like_count: number
    created_at: string
    replies?: Comment[]
}

export default function ThreadPage() {
    const params = useParams()
    const router = useRouter()
    const { user } = useAuth()
    const threadId = params.threadId as string

    const [thread, setThread] = useState<Thread | null>(null)
    const [comments, setComments] = useState<Comment[]>([])
    const [newComment, setNewComment] = useState("")
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyContent, setReplyContent] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [hasLiked, setHasLiked] = useState(false)
    const [commentError, setCommentError] = useState("")

    const isAdmin = user?.role === "admin"

    useEffect(() => {
        if (!threadId) return
        fetchThread()
        fetchComments()
        incrementViewCount()
        checkLikeStatus()

        const channel = supabase
            .channel(`thread:${threadId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "forum_comments", filter: `thread_id=eq.${threadId}` },
                () => {
                    fetchComments() // Re-fetch to get nested structure
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [threadId])

    const fetchThread = async () => {
        const { data, error } = await supabase
            .from("forum_threads")
            .select("*")
            .eq("id", threadId)
            .single()

        if (error) {
            console.error("Error:", error)
            router.push("/community")
        } else {
            setThread(data)
            setIsLoading(false)
        }
    }

    const fetchComments = async () => {
        const { data, error } = await supabase
            .from("forum_comments")
            .select("*")
            .eq("thread_id", threadId)
            .eq("is_deleted", false)
            .order("created_at", { ascending: true })

        // A read that fails here used to leave the list exactly as it was,
        // with nothing logged — so a comment that posted fine looked like it
        // had vanished. Say so instead of silently keeping stale state.
        if (error) {
            console.error("Failed to load comments:", error.message)
            setCommentError("Couldn't refresh comments. Reload the page.")
            return
        }

        if (data) {
            // Organize into nested structure
            const topLevel = data.filter((c) => !c.parent_id)
            const replies = data.filter((c) => c.parent_id)

            const nested = topLevel.map((comment) => ({
                ...comment,
                replies: replies.filter((r) => r.parent_id === comment.id),
            }))

            setComments(nested)
        }
    }

    const incrementViewCount = async () => {
        // Simple increment - will be handled by trigger in DB
        await supabase
            .from("forum_threads")
            .update({ view_count: (thread?.view_count || 0) + 1 })
            .eq("id", threadId)
    }

    const checkLikeStatus = async () => {
        if (!user) return
        const { data } = await supabase
            .from("forum_likes")
            .select("id")
            .eq("thread_id", threadId)
            .eq("user_id", user.id)
            .single()
        setHasLiked(!!data)
    }

    const handleSubmitComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !newComment.trim() || thread?.is_locked) return

        setIsSubmitting(true)
        setCommentError("")
        const { error } = await supabase.from("forum_comments").insert({
            thread_id: threadId,
            user_id: user.id,
            content: newComment.trim(),
        })

        if (error) {
            // Previously this branch did nothing at all: the box kept its text
            // and no comment appeared, with no way to tell whether the post had
            // failed or the list had simply not refreshed.
            setCommentError(error.message)
            setIsSubmitting(false)
            return
        }

        // Await it. Firing this without waiting meant the submit button
        // re-enabled before the list had been rebuilt, so a quick second post
        // could race the first one's read.
        setNewComment("")
        await fetchComments()
        setIsSubmitting(false)
    }

    const handleSubmitReply = async (parentId: string) => {
        if (!user || !replyContent.trim() || thread?.is_locked) return

        setIsSubmitting(true)
        const { error } = await supabase.from("forum_comments").insert({
            thread_id: threadId,
            user_id: user.id,
            parent_id: parentId,
            content: replyContent.trim(),
        })

        if (error) {
            setCommentError(error.message)
            setIsSubmitting(false)
            return
        }

        setReplyContent("")
        setReplyingTo(null)
        await fetchComments()
        setIsSubmitting(false)
    }

    const handleLikeThread = async () => {
        if (!user) return

        if (hasLiked) {
            await supabase.from("forum_likes").delete().eq("thread_id", threadId).eq("user_id", user.id)
            setHasLiked(false)
            setThread((prev) => prev ? { ...prev, like_count: prev.like_count - 1 } : null)
        } else {
            await supabase.from("forum_likes").insert({ thread_id: threadId, user_id: user.id })
            setHasLiked(true)
            setThread((prev) => prev ? { ...prev, like_count: prev.like_count + 1 } : null)
        }
    }

    const handlePinThread = async () => {
        if (!isAdmin || !thread) return
        await supabase.from("forum_threads").update({ is_pinned: !thread.is_pinned }).eq("id", threadId)
        setThread((prev) => prev ? { ...prev, is_pinned: !prev.is_pinned } : null)
    }

    const handleLockThread = async () => {
        if (!isAdmin || !thread) return
        await supabase.from("forum_threads").update({ is_locked: !thread.is_locked }).eq("id", threadId)
        setThread((prev) => prev ? { ...prev, is_locked: !prev.is_locked } : null)
    }

    const handleDeleteThread = async () => {
        if (!isAdmin || !confirm("Delete this thread?")) return
        await supabase.from("forum_threads").update({ is_deleted: true }).eq("id", threadId)
        router.push("/community")
    }

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
        if (diff < 60) return "just now"
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
        return `${Math.floor(diff / 86400)}d ago`
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-[13px] text-muted-foreground animate-pulse">Loading…</div>
            </div>
        )
    }

    if (!thread) return null

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <Header
                actions={
                    isAdmin ? (
                        <>
                            <button onClick={handlePinThread} aria-label="Pin thread" className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${thread.is_pinned ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                <Pin className="w-4 h-4" />
                            </button>
                            <button onClick={handleLockThread} aria-label="Lock thread" className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${thread.is_locked ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                <Lock className="w-4 h-4" />
                            </button>
                            <button onClick={handleDeleteThread} aria-label="Delete thread" className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </>
                    ) : undefined
                }
            />

            <main className="pt-12 max-w-3xl mx-auto px-4 sm:px-6 py-8">
                <Link href="/community" className="inline-flex items-center gap-1.5 mb-6 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to community
                </Link>
                {/* Thread Content */}
                <article className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-muted">
                            {thread.category}
                        </span>
                        {thread.is_pinned && <Pin className="w-3 h-3 text-muted-foreground" />}
                        {thread.is_locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                    </div>

                    <h1 className="text-2xl lg:text-3xl font-medium mb-4">{thread.title}</h1>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                        <span>{formatTimeAgo(thread.created_at)}</span>
                        <span>{thread.view_count} views</span>
                    </div>

                    <div className="prose prose-sm max-w-none text-foreground mb-6">
                        <p className="whitespace-pre-wrap">{thread.content}</p>
                    </div>

                    <div className="flex items-center gap-4 border-t border-border pt-4">
                        <button
                            onClick={handleLikeThread}
                            disabled={!user}
                            className={`flex items-center gap-2 text-sm ${hasLiked ? "text-foreground" : "text-muted-foreground hover:text-foreground"} transition-colors`}
                        >
                            <Heart className={`w-4 h-4 ${hasLiked ? "fill-current" : ""}`} />
                            {thread.like_count} likes
                        </button>
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MessageCircle className="w-4 h-4" />
                            {thread.comment_count} comments
                        </span>
                    </div>
                </article>

                {/* Comments Section */}
                <section className="border-t border-border pt-8">
                    <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-6">Comments</h2>

                    {/* Comment Form */}
                    {user && !thread.is_locked ? (
                        <form onSubmit={handleSubmitComment} className="mb-8">
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                                    {user.name?.slice(0, 2).toUpperCase() || "U"}
                                </div>
                                <div className="flex-1">
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Write a comment..."
                                        className="w-full p-3 bg-background border border-border text-sm resize-none focus:border-foreground focus:outline-none"
                                        rows={3}
                                    />
                                    <div className="flex justify-end mt-2">
                                        <button
                                            type="submit"
                                            disabled={!newComment.trim() || isSubmitting}
                                            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm tracking-wide disabled:opacity-50"
                                        >
                                            <Send className="w-3 h-3" />
                                            Post
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    ) : thread.is_locked ? (
                        <div className="p-4 bg-muted text-sm text-muted-foreground text-center mb-8">
                            <Lock className="w-4 h-4 mx-auto mb-2" />
                            This thread is locked
                        </div>
                    ) : (
                        <div className="p-4 border border-border text-sm text-center mb-8">
                            <Link href="/login" className="text-foreground underline">Sign in</Link> to comment
                        </div>
                    )}

                    {commentError && (
                        <div className="mb-6 p-3 border border-border text-sm text-muted-foreground">
                            {commentError}
                        </div>
                    )}

                    {/* Comments List */}
                    <div className="space-y-6">
                        {comments.map((comment) => (
                            <div key={comment.id} className="border-l-2 border-border pl-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                                        U
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium">User</span>
                                            <span className="text-xs text-muted-foreground">{formatTimeAgo(comment.created_at)}</span>
                                        </div>
                                        <p className="text-sm mb-2">{comment.content}</p>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                            <button className="flex items-center gap-1 hover:text-foreground">
                                                <Heart className="w-3 h-3" /> {comment.like_count}
                                            </button>
                                            {user && !thread.is_locked && (
                                                <button
                                                    onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                                                    className="hover:text-foreground"
                                                >
                                                    Reply
                                                </button>
                                            )}
                                        </div>

                                        {/* Reply Form */}
                                        {replyingTo === comment.id && (
                                            <div className="mt-3 flex gap-2">
                                                <input
                                                    type="text"
                                                    value={replyContent}
                                                    onChange={(e) => setReplyContent(e.target.value)}
                                                    placeholder="Write a reply..."
                                                    className="flex-1 px-3 py-2 bg-background border border-border text-sm focus:border-foreground focus:outline-none"
                                                />
                                                <button
                                                    onClick={() => handleSubmitReply(comment.id)}
                                                    disabled={!replyContent.trim() || isSubmitting}
                                                    className="px-3 py-2 bg-foreground text-background text-xs disabled:opacity-50"
                                                >
                                                    Reply
                                                </button>
                                            </div>
                                        )}

                                        {/* Nested Replies */}
                                        {comment.replies && comment.replies.length > 0 && (
                                            <div className="mt-4 space-y-4">
                                                {comment.replies.map((reply) => (
                                                    <div key={reply.id} className="flex items-start gap-3 pl-4 border-l border-border">
                                                        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium">
                                                            U
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs font-medium">User</span>
                                                                <span className="text-[10px] text-muted-foreground">{formatTimeAgo(reply.created_at)}</span>
                                                            </div>
                                                            <p className="text-sm">{reply.content}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    )
}
