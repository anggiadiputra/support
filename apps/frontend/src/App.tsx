import { RouterProvider } from "react-router-dom"
import { router } from "@/routes"
import { Providers } from "@/app/providers"
import { Toaster } from "@/components/ui/toaster"

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
      <Toaster />
    </Providers>
  )
}

export default App
