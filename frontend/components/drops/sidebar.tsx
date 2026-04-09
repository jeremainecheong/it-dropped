"use client"

import * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Check } from "lucide-react"

interface SidebarProps {
    categories: string[]
    selectedCategory: string
    onSelectCategory: (category: string) => void
    className?: string
}

// Known root categories for grouping
const ROOT_CATEGORIES = ["Mens", "Womens", "Accessories", "Home", "Kids"]

export function Sidebar({ categories, selectedCategory, onSelectCategory, className = "" }: SidebarProps) {
    // Parse categories into hierarchy
    const hierarchy = React.useMemo(() => {
        const tree: Record<string, { original: string; sub: string }[]> = {}

        // Initialize roots
        ROOT_CATEGORIES.forEach(root => {
            tree[root] = []
        })
        tree["Other"] = []

        categories.forEach(cat => {
            let matched = false
            for (const root of ROOT_CATEGORIES) {
                if (cat.startsWith(root)) {
                    // Extract subcategory
                    let sub = cat.substring(root.length).trim()
                    // Remove separator if present (e.g. " - " or just space)
                    if (sub.startsWith("- ")) {
                        sub = sub.substring(2).trim()
                    }
                    tree[root].push({ original: cat, sub })
                    matched = true
                    break
                }
            }
            if (!matched) {
                tree["Other"].push({ original: cat, sub: cat })
            }
        })

        return tree
    }, [categories])

    return (
        <div className={`space-y-6 ${className}`}>
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <h2 className="text-lg font-bold tracking-tight">Filters</h2>
                {selectedCategory && (
                    <button
                        onClick={() => onSelectCategory("")}
                        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                    >
                        Clear All
                    </button>
                )}
            </div>

            <Accordion type="multiple" defaultValue={ROOT_CATEGORIES} className="w-full">
                {Object.entries(hierarchy).map(([root, items]: [string, any[]]) => {
                    if (items.length === 0) return null

                    return (
                        <AccordionItem key={root} value={root}>
                            <AccordionTrigger className="text-sm uppercase tracking-wider py-3">
                                {root}
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="flex flex-col space-y-1">
                                    {items.map((item: any) => {
                                        const isSelected = selectedCategory === item.original
                                        return (
                                            <button
                                                key={item.original}
                                                onClick={() => onSelectCategory(isSelected ? "" : item.original)}
                                                className={`flex items-center justify-between py-2 px-1 text-sm transition-colors rounded-sm text-left group ${isSelected
                                                    ? "font-medium text-foreground bg-muted"
                                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                    }`}
                                            >
                                                <span className="truncate pr-2">{item.sub || "All"}</span>
                                                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    )
                })}
            </Accordion>
        </div>
    )
}
