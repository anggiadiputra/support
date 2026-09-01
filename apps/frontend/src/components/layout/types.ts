interface User {
  name: string
  email: string
  avatar: string
}

interface Team {
  name: string
  logo: React.ElementType
  plan: string
}

interface BaseNavItem {
  title: string
  badge?: string
  icon?: React.ElementType
  roles?: string[] // Optional: restrict to specific roles
  external?: boolean // Optional: open in new tab (for external links)
}

export type NavItem =
  | (BaseNavItem & {
      items: (BaseNavItem & { url: string })[]
      url?: never
    })
  | (BaseNavItem & {
      url: string
      items?: never
    })

interface NavGroup {
  title: string
  items: NavItem[]
}

interface SidebarData {
  user: User
  teams: Team[]
  navGroups: NavGroup[]
}

export type { SidebarData, NavGroup }
