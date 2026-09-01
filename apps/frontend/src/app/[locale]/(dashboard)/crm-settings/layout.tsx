import { IconSettings } from "@tabler/icons-react"
import { getTranslations } from "next-intl/server"
import { Header } from "@/components/layout/header"
import { CrmSettingsSidebar } from "./components/crm-settings-sidebar"

interface Props {
  children: React.ReactNode
}

export default async function CrmSettingsLayout({ children }: Props) {
  const t = await getTranslations("crmSettings")

  return (
    <>
      <Header />

      <div
        data-layout="fixed"
        className="flex flex-1 flex-col gap-4 overflow-hidden p-4"
      >
        <div className="space-y-0.5">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
            <IconSettings className="h-6 w-6" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-auto md:overflow-hidden lg:flex-row lg:gap-8">
          <aside className="shrink-0">
            <CrmSettingsSidebar />
          </aside>
          <div className="flex w-full flex-1 flex-col overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
