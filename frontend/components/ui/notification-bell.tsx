"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Bell, ExternalLink, Check } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"

interface Notification {
    id: string
    type: string
    title: string
    body: string | null
    link: string | null
    is_read: boolean
    created_at: string
}

export function NotificationBell() {
    const { user } = useAuth()
    const [isOpen, setIsOpen] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        if (!user) return
        fetchNotifications()

        const channel = supabase
            .channel(`notifications:${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "notifications",
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    setNotifications((prev) => [payload.new as Notification, ...prev])
                    setUnreadCount((prev) => prev + 1)
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [user])

    const fetchNotifications = async () => {
        if (!user) return

        const { data, error } = await supabase
            .from("notifications")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20)

        if (!error && data) {
            setNotifications(data)
            setUnreadCount(data.filter((n) => !n.is_read).length)
        }
    }

    // Both mark-read paths discarded the Supabase result, so a rejected write
    // (expired session, RLS) left the row grey and the badge decremented for
    // the rest of the session while the database still had is_read = false.
    // Roll the optimistic change back and say so instead.
    const markAsRead = async (id: string) => {
        const target = notifications.find((n) => n.id === id)
        if (!target || target.is_read) return

        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
        setUnreadCount((prev) => Math.max(0, prev - 1))

        const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", id)

        if (error) {
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, is_read: false } : n))
            )
            setUnreadCount((prev) => prev + 1)
            toast.error("Couldn't mark that notification as read")
        }
    }

    const markAllAsRead = async () => {
        if (!user) return

        // Revert by id rather than by snapshot: a realtime INSERT can land
        // while the update is in flight, and restoring a whole snapshot would
        // drop that new notification.
        const unreadIds = new Set(notifications.filter((n) => !n.is_read).map((n) => n.id))
        if (unreadIds.size === 0) return

        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
        setUnreadCount((prev) => Math.max(0, prev - unreadIds.size))

        const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", user.id)
            .eq("is_read", false)

        if (error) {
            setNotifications((prev) =>
                prev.map((n) => (unreadIds.has(n.id) ? { ...n, is_read: false } : n))
            )
            setUnreadCount((prev) => prev + unreadIds.size)
            toast.error("Couldn't mark notifications as read")
        }
    }

    const formatTime = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
        if (diff < 60) return "just now"
        if (diff < 3600) return `${Math.floor(diff / 60)}m`
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`
        return `${Math.floor(diff / 86400)}d`
    }

    if (!user) return null

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-label={
                    unreadCount > 0
                        ? `Notifications, ${unreadCount} unread`
                        : "Notifications"
                }
                aria-expanded={isOpen}
                className="btn btn-ghost btn-icon relative"
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <span
                        aria-hidden
                        className="num absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] flex items-center justify-center rounded-full"
                    >
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl bg-background border border-border shadow-[var(--shadow-pop)] z-50">
                        <div className="sticky top-0 flex items-center justify-between p-3 border-b border-border bg-background">
                            <span className="text-xs uppercase tracking-widest">Notifications</span>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    aria-label="Mark all notifications as read"
                                    className="btn btn-ghost btn-sm -mr-2"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>

                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                No notifications
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {notifications.map((notification) => {
                                    const body = (
                                        <>
                                            <p className="text-sm font-medium truncate">
                                                {notification.title}
                                                {notification.link && (
                                                    <ExternalLink
                                                        aria-hidden
                                                        className="inline-block w-3 h-3 ml-1 align-[-1px] text-muted-foreground"
                                                    />
                                                )}
                                            </p>
                                            {notification.body && (
                                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                                    {notification.body}
                                                </p>
                                            )}
                                            <p className="num text-[10px] text-muted-foreground mt-1">
                                                {formatTime(notification.created_at)}
                                            </p>
                                        </>
                                    )

                                    return (
                                        <div
                                            key={notification.id}
                                            className={`p-3 hover:bg-muted/50 transition-colors ${!notification.is_read ? "bg-foreground/5" : ""
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                {/* The whole body is the target now. It used to be inert
                                                    text with only a 12px icon carrying the link, which
                                                    is why notifications read as unclickable. */}
                                                {notification.link ? (
                                                    <Link
                                                        href={notification.link}
                                                        onClick={() => {
                                                            markAsRead(notification.id)
                                                            setIsOpen(false)
                                                        }}
                                                        className="flex-1 min-w-0 text-left"
                                                    >
                                                        {body}
                                                    </Link>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => markAsRead(notification.id)}
                                                        className="flex-1 min-w-0 text-left"
                                                    >
                                                        {body}
                                                    </button>
                                                )}
                                                {!notification.is_read && (
                                                    <button
                                                        onClick={() => markAsRead(notification.id)}
                                                        aria-label={`Mark "${notification.title}" as read`}
                                                        className="btn btn-ghost btn-icon shrink-0"
                                                    >
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
