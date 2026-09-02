import { Header } from "@/components/layout/header"
import Overview from "../boards/overview"

export default function DashboardPage() {
  return (
    <>
      <Header />

      <div className="p-5 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
            <p className="text-sm text-gray-500">
              WhatsApp Business Overview
            </p>
          </div>
        </div>
        <Overview />
      </div>
    </>
  )
}
