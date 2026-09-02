import { Outlet } from "react-router-dom"
import { IconBolt } from "@tabler/icons-react"
import { Header } from "@/components/layout/header"
import { AutomationSidebar } from "./components/automation-sidebar"

interface Props {
  children?: React.ReactNode
}

export default function AutomationLayout({ children }: Props) {
  return (
    <>
      <Header />

      <div
        data-layout="fixed"
        className="flex flex-1 flex-col p-5 md:p-8 space-y-6 overflow-hidden"
      >
        <div className="space-y-1">
          <h1 className="flex items-center gap-2.5 text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            <IconBolt className="h-6 w-6 text-gray-700" />
            Automation
          </h1>
          <p className="text-sm text-gray-500">
            Manage reusable replies and customer tagging rules.
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-auto md:overflow-hidden lg:flex-row">
          <aside className="shrink-0">
            <AutomationSidebar />
          </aside>
          <div className="flex w-full flex-1 flex-col overflow-y-auto">
            {children || <Outlet />}
          </div>
        </div>
      </div>
    </>
  )
}
