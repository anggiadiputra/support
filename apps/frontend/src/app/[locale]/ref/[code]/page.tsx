import { useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { RefreshCw } from "lucide-react"

const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3005"

export default function ReferralPage() {
  const { code = "" } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    async function validateAndRedirect() {
      try {
        const response = await fetch(`${API_URL}/api/v1/affiliate/validate/${code}`)
        const result = await response.json()
        if (result.success && result.data?.valid) {
          navigate(`/register?ref=${code}`)
          return
        }
      } catch (err) {
        console.error("Referral validation error:", err)
      }
      navigate("/register")
    }

    if (code) {
      validateAndRedirect()
    } else {
      navigate("/register")
    }
  }, [code, navigate])

  return (
    <div className="flex h-screen items-center justify-center">
      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
