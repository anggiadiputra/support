import { ProtectedRoute } from "@/components/auth/protected-route"

interface Props {
  children: React.ReactNode
}

/**
 * Print Layout
 * Minimal layout without sidebar and bottom nav
 * Used for invoice and other printable pages
 */
export default function PrintLayout({ children }: Props) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    </ProtectedRoute>
  )
}
