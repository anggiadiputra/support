"use client"

import { useState, useRef, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { IconCheck, IconCopy, IconKey } from "@tabler/icons-react"
import { Loader2 } from "lucide-react"
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/hooks/use-toast"
import { useBranding } from "@/hooks/use-branding"
import { apiKeysApi, type ApiKey } from "@/lib/api/api-keys-api"

const formSchema = z.object({
  name: z.string().min(1, "API key name is required").max(100, "Name must be 100 characters or less"),
})

interface Props {
  onKeyCreated?: (key: ApiKey) => void
}

export function CreateApiKeyDialog({ onKeyCreated }: Props) {
  const [opened, setOpened] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const { websiteName } = useBranding()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  })

  // Auto-focus and select the API key when it's created
  useEffect(() => {
    if (createdKey && apiKeyInputRef.current) {
      apiKeyInputRef.current.focus()
      apiKeyInputRef.current.select()
    }
  }, [createdKey])

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsLoading(true)
      const newKey = await apiKeysApi.create(values.name)
      setCreatedKey(newKey.key || null)
      onKeyCreated?.(newKey)
      toast({
        title: "API Key Created",
        description: "Your new API key has been created. Make sure to copy it now!",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create API key",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
      toast({
        title: "Copied!",
        description: "API key copied to clipboard",
      })
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      })
    }
  }

  const handleClose = () => {
    form.reset()
    setCreatedKey(null)
    setIsCopied(false)
    setOpened(false)
  }

  return (
    <Dialog open={opened} onOpenChange={(open) => {
      // Prevent closing if showing created key (user must click Done)
      if (!open && createdKey) {
        return
      }
      if (!open) {
        handleClose()
      } else {
        setOpened(true)
      }
    }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <IconKey className="h-4 w-4" />
          Create API Key
        </Button>
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-[500px]" 
        onInteractOutside={(e) => {
          // Prevent closing on outside click if showing created key
          if (createdKey) {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          // Prevent closing with ESC key if showing created key
          if (createdKey) {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {createdKey ? "API Key Created" : "Create New API Key"}
          </DialogTitle>
          <DialogDescription>
            {createdKey
              ? "Your API key has been created. Copy it now - you won't be able to see it again!"
              : `Generate a new API key to securely access the ${websiteName} Public API.`}
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4">
            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                This is the only time you'll see this key. Store it securely!
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Your API Key</label>
              <div className="flex gap-2">
                <Input
                  ref={apiKeyInputRef}
                  readOnly
                  value={createdKey}
                  className="font-mono text-sm"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {isCopied ? (
                    <IconCheck className="h-4 w-4 text-green-500" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={handleCopy}
                className="flex-1"
              >
                <IconCopy className="mr-2 h-4 w-4" />
                {isCopied ? "Copied!" : "Copy to Clipboard"}
              </Button>
              <Button onClick={handleClose} className="flex-1">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., n8n Production, Zapier Integration"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A descriptive name to identify this API key.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Key"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
