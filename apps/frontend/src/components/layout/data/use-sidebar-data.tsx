"use client"

import { useTranslations } from "next-intl"
import {
  IconLayoutDashboard,
  IconSettings,
  IconMessage,
  IconUsers,
  IconChartBar,
  IconBrandInstagram,
  IconBrandWhatsapp,
  IconBrandFacebook,
  IconInbox,
  IconCode,
  IconTemplate,
  IconCreditCard,
  IconUsersGroup,
  IconShieldCog,
  IconBroadcast,
  IconChartLine,
  IconTags,
  IconHeartHandshake,
  IconBolt,
  IconAdjustments,
  IconExternalLink,
} from "@tabler/icons-react"
import { BrainCircuit, HelpCircle } from "lucide-react"
import { type SidebarData, type NavItem } from "../types"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { useBranding } from "@/hooks/use-branding"
import { useChannelStatus } from "@/hooks/use-channel-status"

// Extended NavItem with optional roles and channel for filtering
type NavItemWithRoles = NavItem & { 
  roles?: string[]
  channel?: 'instagram' | 'messenger'
}

export function useSidebarData(): SidebarData {
  const t = useTranslations("navigation")
  const { userRole } = useBusinessAccount()
  const { websiteName, logoUrl, externalLinks } = useBranding()
  const { instagramEnabled, messengerEnabled } = useChannelStatus()

  // Filter items based on user role and channel enabled status
  const filterByRole = (items: NavItemWithRoles[]): NavItem[] => {
    return items.filter(item => {
      // Check role first
      if (item.roles && item.roles.length > 0) {
        if (!item.roles.includes(userRole || '')) return false
      }
      // Check channel enabled status
      if (item.channel === 'instagram' && !instagramEnabled) return false
      if (item.channel === 'messenger' && !messengerEnabled) return false
      return true
    }).map(({ roles, channel, ...rest }) => rest as NavItem)
  }

  const navGroups = [
    {
      title: t("global"),
      items: filterByRole([
        {
          title: t("dashboard"),
          url: "/dashboard",
          icon: IconLayoutDashboard,
        },
        {
          title: t("inbox"),
          url: "/oneinbox",
          icon: IconInbox,
        },
        {
          title: t("templates"),
          url: "/templates",
          icon: IconTemplate,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
        {
          title: t("broadcast"),
          url: "/broadcast",
          icon: IconBroadcast,
          roles: ["BUSINESS_OWNER", "ADMIN", "AGENT"],
        },
        {
          title: t("insights"),
          url: "/insights",
          icon: IconChartLine,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
      ]),
    },
    {
      title: t("crm"),
      items: filterByRole([
        {
          title: t("customers"),
          url: "/customers",
          icon: IconUsers,
        },
        {
          title: t("pipeline"),
          url: "/crm/pipeline",
          icon: IconChartBar,
          roles: ["BUSINESS_OWNER", "ADMIN", "AGENT"],
        },
        {
          title: t("automation"),
          url: "/automation",
          icon: IconBolt,
          badge: "New",
          roles: ["BUSINESS_OWNER", "ADMIN", "AGENT"],
        },
        {
          title: t("crmSettings"),
          url: "/crm-settings",
          icon: IconAdjustments,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
      ]),
    },
    {
      title: t("platforms"),
      items: filterByRole([
        {
          title: t("whatsapp"),
          url: "/waba",
          icon: IconBrandWhatsapp,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
{
          title: t("instagram"),
          url: "/instagram",
          icon: IconBrandInstagram,
          roles: ["BUSINESS_OWNER", "ADMIN"],
          channel: "instagram",
        },
        {
          title: t("messenger"),
          url: "/messenger",
          icon: IconBrandFacebook,
          roles: ["BUSINESS_OWNER", "ADMIN"],
          channel: "messenger",
        },
      ]),
    },
    {
      title: t("configuration"),
      items: filterByRole([
        {
          title: t("team"),
          url: "/team",
          icon: IconUsersGroup,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
        {
          title: t("aiChatbot"),
          url: "/ai",
          icon: BrainCircuit,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
        {
          title: t("developers"),
          url: "/developers",
          icon: IconCode,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
        {
          title: t("subscription"),
          url: "/subscription",
          icon: IconCreditCard,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
        {
          title: t("affiliate"),
          url: "/affiliate",
          icon: IconHeartHandshake,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
        {
          title: t("settings"),
          url: "/settings",
          icon: IconSettings,
          roles: ["BUSINESS_OWNER", "ADMIN"],
        },
      ]),
    },
    {
      title: t("support"),
      items: [
        ...filterByRole([
          {
            title: t("helpSupport"),
            url: "/help-support",
            icon: HelpCircle,
          },
        ]),
        // Add external links from branding settings
        ...(Array.isArray(externalLinks) ? externalLinks : [])
          .filter((link) => link.label && link.url)
          .map((link) => ({
            title: link.label,
            url: link.url,
            icon: IconExternalLink,
            external: true,
          })),
      ],
    },
    {
      title: t("administration"),
      items: filterByRole([
        {
          title: t("adminPanel"),
          url: "/admin",
          icon: IconShieldCog,
          roles: ["ADMIN"],
        },
      ]),
    },
  ]

  // Filter out empty groups
  const filteredNavGroups = navGroups.filter(group => group.items.length > 0)

  return {
    user: {
      name: "User",
      email: "user@yourdomain.com",
      avatar: "/favicon.svg",
    },
    teams: [
      {
        name: websiteName,
        logo: logoUrl
          ? ({ className }: { className: string }) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={websiteName} className={className} />
            )
          : ({ className }: { className: string }) => (
              <IconMessage className={className} />
            ),
        plan: "WhatsApp Business",
      },
    ],
    navGroups: filteredNavGroups,
  }
}
