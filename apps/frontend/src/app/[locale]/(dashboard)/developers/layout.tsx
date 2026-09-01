"use client"

import { IconCode } from "@tabler/icons-react"
import { usePathname } from "next/navigation"
import { Header } from "@/components/layout/header"
import { DevelopersSidebar } from "./components/developers-sidebar"

interface Props {
  children: React.ReactNode
}

export default function DevelopersLayout({ children }: Props) {
  const pathname = usePathname()
  
  // Docs has its own layout, so we render it without the sidebar wrapper
  const isDocsPage = pathname?.includes("/developers/docs")
  
  if (isDocsPage) {
    return (
      <>
        <Header />
        <main className="flex min-h-0 flex-1 flex-col p-4">
          {children}
        </main>
      </>
    )
  }

  return (
    <>
      <Header />

      <div
        data-layout="fixed"
        className="flex flex-1 flex-col gap-4 overflow-hidden p-4"
      >
        <div className="space-y-0.5">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
            <IconCode className="h-6 w-6" />
            Developers
          </h1>
          <p className="text-muted-foreground">
            Manage API keys and webhook integrations.
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-auto md:overflow-hidden lg:flex-row lg:gap-8">
          <aside className="shrink-0">
            <DevelopersSidebar />
          </aside>
          <div className="flex w-full flex-1 flex-col overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
