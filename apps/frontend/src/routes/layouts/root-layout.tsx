import { Outlet } from "react-router-dom"
import { Providers } from "@/app/providers"
import { Toaster } from "@/components/ui/toaster"

export function RootLayout() {
  return (
    <Providers>
      <Outlet />
      <Toaster />
    </Providers>
  )
}

export default RootLayout
