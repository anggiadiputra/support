"use client"

import { useState, useEffect } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { IconBrain, IconAlertTriangle, IconLoader2 } from "@tabler/icons-react"
import { aiApi } from "@/lib/api/ai-api"

interface ClearMemoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  whatsappAccountId: string
  phoneNumber: string
  onSuccess?: () => void
}

export function ClearMemoryDialog({
  open,
  onOpenChange,
  whatsappAccountId,
  phoneNumber,
  onSuccess,
}: ClearMemoryDialogProps) {
  const [loading, setLoading] = useState(false)
  const [loadingCount, setLoadingCount] = useState(false)
  const [memoryCount, setMemoryCount] = useState<number | null>(null)
  const { toast } = useToast()

  // Load memory count when dialog opens
  useEffect(() => {
    if (open) {
      loadMemoryCount()
    } else {
      setMemoryCount(null)
    }
  }, [open, whatsappAccountId])

  const loadMemoryCount = async () => {
    setLoadingCount(true)
    try {
      const result = await aiApi.getMemoryCount(whatsappAccountId)
      setMemoryCount(result.count)
    } catch (err: any) {
      console.error("Failed to load memory count:", err)
      setMemoryCount(0)
    } finally {
      setLoadingCount(false)
    }
  }

  const handleClearMemory = async () => {
    setLoading(true)
    try {
      const result = await aiApi.deleteMemory(whatsappAccountId)
      toast({
        title: "AI Memory Cleared",
        description: `Successfully deleted ${result.deletedCount} conversation memories for ${phoneNumber}`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to clear AI memory",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <IconBrain className="h-5 w-5 text-amber-600" />
            </div>
            <AlertDialogTitle>Clear AI Memory</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2 space-y-3">
            <p>
              This will delete all AI conversation memories for{" "}
              <span className="font-semibold text-foreground">{phoneNumber}</span>.
            </p>
            
            {loadingCount ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <IconLoader2 className="h-4 w-4 animate-spin" />
                <span>Loading memory count...</span>
              </div>
            ) : memoryCount !== null && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                <IconAlertTriangle className="h-4 w-4 text-amber-500" />
                <span>
                  {memoryCount === 0 ? (
                    "No memories found for this account."
                  ) : (
                    <>
                      <span className="font-semibold">{memoryCount}</span> conversation{memoryCount !== 1 ? "s" : ""} will be permanently deleted.
                    </>
                  )}
                </span>
              </div>
            )}

            <p className="text-sm">
              The AI will no longer remember past conversations with customers on this number. 
              This action cannot be undone.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClearMemory}
            disabled={loading || memoryCount === 0}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            {loading ? (
              <>
                <IconLoader2 className="h-4 w-4 mr-2 animate-spin" />
                Clearing...
              </>
            ) : (
              "Clear Memory"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
