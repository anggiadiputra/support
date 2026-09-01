"use client"

import { cn } from "@/lib/utils"
import { Link } from "@/i18n/routing"
import {
  IconBook,
  IconKey,
  IconSend,
  IconTemplate,
  IconPhoto,
  IconWebhook,
  IconList,
  IconShield,
  IconPlugConnected,
  IconAlertCircle,
  IconGauge,
  IconExternalLink,
  IconSettings,
  IconClick,
  IconDots,
  IconChecks,
  IconPhone,
} from "@tabler/icons-react"

interface NavItem {
  id: string
  label: string
  icon: React.ElementType
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navigation: NavGroup[] = [
  {
    title: "Getting Started",
    items: [
      { id: "overview", label: "Overview", icon: IconBook },
      { id: "authentication", label: "Authentication", icon: IconKey },
    ],
  },
  {
    title: "Account",
    items: [
      { id: "list-phone-numbers", label: "Phone Numbers", icon: IconPhone },
      { id: "list-instagram-accounts", label: "Instagram Accounts", icon: IconPhoto },
      { id: "list-facebook-pages", label: "Facebook Pages", icon: IconPlugConnected },
    ],
  },
  {
    title: "Messages API",
    items: [
      { id: "send-message", label: "Send Message", icon: IconSend },
      { id: "send-template", label: "Send Template", icon: IconTemplate },
      { id: "send-media", label: "Send Media", icon: IconPhoto },
      { id: "send-interactive", label: "Send Interactive", icon: IconClick },
      { id: "typing-indicator", label: "Typing Indicator", icon: IconDots },
      { id: "mark-as-read", label: "Mark as Read", icon: IconChecks },
    ],
  },
  {
    title: "Webhooks",
    items: [
      { id: "webhooks-overview", label: "Overview", icon: IconWebhook },
      { id: "webhook-events", label: "Events", icon: IconList },
      { id: "webhook-security", label: "Security (HMAC)", icon: IconShield },
    ],
  },
  {
    title: "Integrations",
    items: [{ id: "n8n", label: "n8n", icon: IconPlugConnected }],
  },
  {
    title: "Reference",
    items: [
      { id: "error-handling", label: "Error Codes", icon: IconAlertCircle },
      { id: "rate-limits", label: "Rate Limits", icon: IconGauge },
    ],
  },
]

interface QuickLink {
  href: string
  label: string
  icon: React.ElementType
  description: string
}

const quickLinks: QuickLink[] = [
  {
    href: "/developers/api-keys",
    label: "API Keys",
    icon: IconKey,
    description: "Create & manage",
  },
  {
    href: "/developers/webhooks",
    label: "Webhooks",
    icon: IconSettings,
    description: "Configure endpoints",
  },
]

interface DocsSidebarProps {
  activeSection: string
  onNavigate: (sectionId: string) => void
}

export function DocsSidebar({ activeSection, onNavigate }: DocsSidebarProps) {
  const handleClick = (e: React.MouseEvent, sectionId: string) => {
    e.preventDefault()
    onNavigate(sectionId)

    // Update URL hash without triggering scroll
    window.history.replaceState(null, "", `#${sectionId}`)
  }

  return (
    <nav className="space-y-6">
      {/* Quick Links - Manage Section */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-foreground">Manage</h4>
        <ul className="space-y-1">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </span>
                  <IconExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Documentation Navigation */}
      {navigation.map((group) => (
        <div key={group.title}>
          <h4 className="mb-2 text-sm font-semibold text-foreground">
            {group.title}
          </h4>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id

              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => handleClick(e, item.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export { navigation }
export type { NavItem, NavGroup }
