"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Bell, X, ExternalLink, Check } from "lucide-react"
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
        if (user) {
            fetchNotifications()
            subscribeToNotifications()
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

    const subscribeToNotifications = () => {
        if (!user) return

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
            channel.unsubscribe()
        }
    }

    const markAsRead = async (id: string) => {
        await supabase.from("notifications").update({ is_read: true }).eq("id", id)
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
    }

    const markAllAsRead = async () => {
        if (!user) return
        await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", user.id)
            .eq("is_read", false)
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
        setUnreadCount(0)
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
                className="relative p-2 hover:bg-muted rounded transition-colors"
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-foreground text-background text-[10px] flex items-center justify-center rounded-full">
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
                    <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-background border border-border shadow-lg z-50">
                        <div className="sticky top-0 flex items-center justify-between p-3 border-b border-border bg-background">
                            <span className="text-xs uppercase tracking-widest">Notifications</span>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="text-xs text-muted-foreground hover:text-foreground"
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
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`p-3 hover:bg-muted/50 transition-colors ${!notification.is_read ? "bg-foreground/5" : ""
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {notification.title}
                                                </p>
                                                {notification.body && (
                                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                                        {notification.body}
                                                    </p>
                                                )}
                                                <p className="text-[10px] text-muted-foreground mt-1">
                                                    {formatTime(notification.created_at)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {notification.link && (
                                                    <Link
                                                        href={notification.link}
                                                        onClick={() => {
                                                            markAsRead(notification.id)
                                                            setIsOpen(false)
                                                        }}
                                                        className="p-1 hover:bg-muted rounded"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                    </Link>
                                                )}
                                                {!notification.is_read && (
                                                    <button
                                                        onClick={() => markAsRead(notification.id)}
                                                        className="p-1 hover:bg-muted rounded"
                                                    >
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
