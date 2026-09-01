import { IconBolt } from "@tabler/icons-react"
import { Header } from "@/components/layout/header"
import { AutomationSidebar } from "./components/automation-sidebar"

interface Props {
  children: React.ReactNode
}

export default function AutomationLayout({ children }: Props) {
  return (
    <>
      <Header />

      <div
        data-layout="fixed"
        className="flex flex-1 flex-col gap-3 md:gap-4 overflow-hidden p-3 md:p-4"
      >
        <div className="space-y-0.5">
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight md:text-2xl">
            <IconBolt className="h-5 w-5 md:h-6 md:w-6" />
            Automation
          </h1>
          <p className="text-sm text-muted-foreground hidden sm:block">
            Manage reusable replies and customer tagging rules.
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-3 md:gap-4 overflow-auto md:overflow-hidden lg:flex-row lg:gap-8">
          <aside className="shrink-0">
            <AutomationSidebar />
          </aside>
          <div className="flex w-full flex-1 flex-col overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
