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
  IconBolt,
} from "@tabler/icons-react"
import { BrainCircuit, HelpCircle } from "lucide-react"
import { type SidebarData } from "../types"

export const sidebarData: SidebarData = {
  user: {
    name: "User",
    email: "user@yourdomain.com",
    avatar: "/favicon.svg",
  },
  teams: [
    {
      name: process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform",
      logo: ({ className }: { className: string }) => (
        <IconMessage className={className} />
      ),
      plan: "WhatsApp Business",
    },
  ],
  navGroups: [
    {
      title: "Global",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: IconLayoutDashboard,
        },
        {
          title: "Inbox",
          url: "/oneinbox",
          icon: IconInbox,
        },
        {
          title: "Templates",
          url: "/templates",
          icon: IconTemplate,
        },
      ],
    },
    {
      title: "CRM",
      items: [
        {
          title: "Customers",
          url: "/customers",
          icon: IconUsers,
        },
        {
          title: "Pipeline",
          url: "/crm/pipeline",
          icon: IconChartBar,
        },
      ],
    },
    {
      title: "Platforms",
      items: [
        {
          title: "WhatsApp",
          url: "/waba",
          icon: IconBrandWhatsapp,
        },
        {
          title: "Instagram",
          url: "/instagram",
          icon: IconBrandInstagram,
        },
        {
          title: "Messenger",
          url: "/messenger",
          icon: IconBrandFacebook,
        },
      ],
    },
    {
      title: "Configuration",
      items: [
        {
          title: "AI Chatbot",
          url: "/ai",
          icon: BrainCircuit,
        },
        {
          title: "Automation",
          url: "/automation",
          icon: IconBolt,
          badge: "New",
        },
        {
          title: "Developers",
          url: "/developers",
          icon: IconCode,
        },
        {
          title: "Subscription",
          url: "/subscription",
          icon: IconCreditCard,
        },
        {
          title: "Affiliate",
          url: "/affiliate",
          icon: IconUsersGroup,
        },
        {
          title: "Settings",
          url: "/settings",
          icon: IconSettings,
        },
      ],
    },
    {
      title: "Support",
      items: [
        {
          title: "Help & Support",
          url: "/help-support",
          icon: HelpCircle,
        },
      ],
    },
  ],
}
