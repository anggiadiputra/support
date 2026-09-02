"use client"

import { IconCode } from "@tabler/icons-react"
import { usePathname } from "@/i18n/routing"
import { Outlet } from "react-router-dom"
import { Header } from "@/components/layout/header"
import { DevelopersSidebar } from "./components/developers-sidebar"

interface Props {
  children?: React.ReactNode
}

export default function DevelopersLayout({ children }: Props) {
  const pathname = usePathname()
  
  // Docs has its own layout, so we render it without the sidebar wrapper
  const isDocsPage = pathname?.includes("/developers/docs")
  
  if (isDocsPage) {
    return (
      <>
        <Header />
        <main className="flex min-h-0 flex-1 flex-col p-5 md:p-8">
          {children || <Outlet />}
        </main>
      </>
    )
  }

  return (
    <>
      <Header />

      <div
        data-layout="fixed"
        className="flex flex-1 flex-col p-5 md:p-8 space-y-6 overflow-hidden"
      >
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl md:text-2xl font-bold tracking-tight text-gray-900">
            <IconCode className="h-6 w-6" />
            Developers
          </h1>
          <p className="text-sm text-gray-500">
            Manage API keys, webhooks, and developer integrations.
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-auto md:overflow-hidden lg:flex-row">
          <aside className="shrink-0">
            <DevelopersSidebar />
          </aside>
          <div className="flex w-full flex-1 flex-col overflow-y-auto">
            {children || <Outlet />}
          </div>
        </div>
      </div>
    </>
  )
}
