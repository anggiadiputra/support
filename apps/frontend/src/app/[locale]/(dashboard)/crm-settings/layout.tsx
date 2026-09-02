import { Outlet } from "react-router-dom"
import { IconSettings } from "@tabler/icons-react"
import { useTranslations } from "next-intl"
import { Header } from "@/components/layout/header"
import { CrmSettingsSidebar } from "./components/crm-settings-sidebar"

interface Props {
  children?: React.ReactNode
}

export default function CrmSettingsLayout({ children }: Props) {
  const t = useTranslations("crmSettings")

  return (
    <>
      <Header />

      <div
        data-layout="fixed"
        className="flex flex-1 flex-col p-5 md:p-8 space-y-6 overflow-hidden"
      >
        <div className="space-y-1">
          <h1 className="flex items-center gap-2.5 text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            <IconSettings className="h-6 w-6 text-gray-700" />
            {t("title")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-auto md:overflow-hidden lg:flex-row">
          <aside className="shrink-0">
            <CrmSettingsSidebar />
          </aside>
          <div className="flex w-full flex-1 flex-col overflow-y-auto">
            {children || <Outlet />}
          </div>
        </div>
      </div>
    </>
  )
}
