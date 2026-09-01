"use client"

import {
  FileText,
  Settings,
  HelpCircle,
  Ban,
  Bot,
  MessageSquare,
  Brain,
  Clock,
  UserPlus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type AITabValue =
  | "settings"
  | "escalation"
  | "working-hours"
  | "agents"
  | "knowledge"
  | "test"
  | "memory"
  | "filter"
  | "help"

interface AISidebarItem {
  value: AITabValue
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const sidebarItems: AISidebarItem[] = [
  { value: "settings", label: "General Settings", icon: Settings },
  { value: "escalation", label: "Escalation", icon: UserPlus },
  { value: "working-hours", label: "Working Hours", icon: Clock },
  { value: "agents", label: "Agents", icon: Bot },
  { value: "knowledge", label: "Knowledge Base", icon: FileText },
  { value: "test", label: "Test Chatbot", icon: MessageSquare },
  { value: "memory", label: "Memory", icon: Brain },
  { value: "filter", label: "Filters", icon: Ban },
  { value: "help", label: "Contoh Prompt", icon: HelpCircle },
]

interface AISidebarProps {
  activeTab: AITabValue
  onTabChange: (value: AITabValue) => void
}

export function AISidebar({ activeTab, onTabChange }: AISidebarProps) {
  const activeItem = sidebarItems.find((item) => item.value === activeTab)

  return (
    <>
      {/* Mobile: Dropdown Select */}
      <div className="w-full md:hidden">
        <Select
          value={activeTab}
          onValueChange={(v) => onTabChange(v as AITabValue)}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {activeItem && (
                <span className="flex items-center gap-2">
                  <activeItem.icon className="h-4 w-4" />
                  {activeItem.label}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sidebarItems.map((item) => {
              const Icon = item.icon
              return (
                <SelectItem key={item.value} value={item.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: Mini Sidebar - Sticky */}
      <nav className="hidden w-52 shrink-0 md:block">
        <div className="sticky top-20 space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.value

            return (
              <button
                key={item.value}
                onClick={() => onTabChange(item.value)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}

export { sidebarItems }
