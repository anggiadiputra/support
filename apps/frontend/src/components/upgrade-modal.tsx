import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Check, CreditCard } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

interface UpgradeModalProps {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function UpgradeModal({ trigger, open, onOpenChange }: UpgradeModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const t = useTranslations("common")
  
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange : setInternalOpen

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upgrade to Access AI Features</DialogTitle>
          <DialogDescription>
            Unlock AI Auto-Reply, Knowledge Base, and more.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
            <h3 className="font-bold text-lg">Lite Plan</h3>
            <div className="text-2xl font-bold">Rp 99.000<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> AI Chatbot Enabled</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> 5 Knowledge Docs</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> 1 AI Agent</li>
            </ul>
          </div>
          
          <div className="border rounded-lg p-4 space-y-4 border-primary bg-primary/5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-primary">Pro Plan</h3>
              <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">Popular</span>
            </div>
            <div className="text-2xl font-bold">Rp 199.000<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Everything in Lite</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> 50 Knowledge Docs</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> 10 AI Agents</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Priority Support</li>
            </ul>
          </div>
        </div>

        <div className="bg-muted p-4 rounded-md space-y-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CreditCard className="h-4 w-4" />
            Manual Payment Instructions
          </div>
          <p className="text-muted-foreground">
            Currently we accept manual bank transfers. Please transfer the amount to:
          </p>
          <div className="font-mono bg-background p-2 rounded border">
            BCA 1234567890 a/n Messaging Platform
          </div>
          <p className="text-muted-foreground text-xs">
            After transfer, please send the proof to our support WhatsApp or support email to activate your account.
          </p>
        </div>

        <DialogFooter>
           <Button variant="outline" onClick={() => setIsOpen && setIsOpen(false)}>{t("close")}</Button>
           <Button onClick={() => window.open('https://wa.me/6281234567890', '_blank')}>{t("contactSupport")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
