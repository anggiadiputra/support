import { Card } from "@/components/ui/card"
import { ForgotPasswordForm } from "./components/forgot-password-form"

export default function ForgotPasswordPage() {
  return (
    <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm">
      <ForgotPasswordForm />
    </Card>
  )
}
