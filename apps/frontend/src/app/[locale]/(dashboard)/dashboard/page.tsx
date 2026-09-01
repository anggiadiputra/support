import { Header } from "@/components/layout/header"
import Overview from "../boards/overview"

export default async function DashboardPage() {
  return (
    <>
      <Header />

      <div className="space-y-4 p-4">
        <div className="mb-2 flex flex-col items-start justify-between space-y-2 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm">
              WhatsApp Business Overview
            </p>
          </div>
        </div>
        <Overview />
      </div>
    </>
  )
}
