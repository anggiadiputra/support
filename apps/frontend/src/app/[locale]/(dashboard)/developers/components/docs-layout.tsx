"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet"
import { IconMenu2, IconCode } from "@tabler/icons-react"

interface DocsLayoutProps {
  sidebar: React.ReactNode
  content: React.ReactNode
  playground: React.ReactNode
}

export function DocsLayout({ sidebar, content, playground }: DocsLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [playgroundOpen, setPlaygroundOpen] = useState(false)

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_420px]">
      {/* Mobile Sidebar Toggle */}
      <div className="fixed bottom-20 left-4 z-50 lg:hidden">
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="rounded-full shadow-lg"
            >
              <IconMenu2 className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 overflow-y-auto overscroll-y-contain p-4"
            aria-describedby={undefined}
          >
            <SheetTitle className="sr-only">Documentation Navigation</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      </div>

      {/* Mobile Playground Toggle */}
      <div className="fixed bottom-20 right-4 z-50 xl:hidden">
        <Sheet open={playgroundOpen} onOpenChange={setPlaygroundOpen}>
          <SheetTrigger asChild>
            <Button size="icon" className="rounded-full shadow-lg">
              <IconCode className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-full overflow-y-auto overscroll-y-contain p-0 sm:w-[420px]"
            aria-describedby={undefined}
          >
            <SheetTitle className="sr-only">API Playground</SheetTitle>
            {playground}
          </SheetContent>
        </Sheet>
      </div>

      {/* Sidebar - Left Navigation (Desktop) */}
      <aside className="hidden overflow-y-auto overscroll-y-contain border-r p-4 lg:block">
        {sidebar}
      </aside>

      {/* Content - Center Documentation */}
      <main
        id="docs-content"
        className="overflow-y-auto overscroll-y-contain"
      >
        <div className="mx-auto max-w-4xl p-6 pb-24 lg:p-8 lg:pb-8">
          {content}
        </div>
      </main>

      {/* Playground - Right Panel (Desktop) */}
      <aside className="hidden overflow-y-auto overscroll-y-contain border-l xl:block">
        {playground}
      </aside>
    </div>
  )
}
