"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AIAgent, KnowledgeDocument } from "@/lib/api/ai-api"
import { Loader2 } from "lucide-react"
import { IconBrandWhatsapp } from "@tabler/icons-react"
import type { WhatsAppPhoneNumberOption } from "@/hooks/use-whatsapp-phone-numbers"

interface AgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: AIAgent
  documents: KnowledgeDocument[]
  phoneNumbers: WhatsAppPhoneNumberOption[]
  onSave: (data: { name: string; systemPrompt: string; documentIds: string[]; assignedPhoneNumberIds: string[] }) => Promise<void>
}

export function AgentDialog({
  open,
  onOpenChange,
  agent,
  documents,
  phoneNumbers,
  onSave,
}: AgentDialogProps) {
  const [name, setName] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [selectedPhones, setSelectedPhones] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (agent) {
      setName(agent.name)
      setSystemPrompt(agent.systemPrompt)
      setSelectedDocs(agent.knowledgeDocuments?.map(d => d.id) || [])
      setSelectedPhones(agent.assignedPhoneNumberIds || [])
    } else {
      setName("")
      setSystemPrompt("You are a helpful customer support assistant.")
      setSelectedDocs([])
      setSelectedPhones([])
    }
  }, [agent, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      await onSave({ name, systemPrompt, documentIds: selectedDocs, assignedPhoneNumberIds: selectedPhones })
      onOpenChange(false)
    } catch (error) {
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  const toggleDocument = (docId: string) => {
    setSelectedDocs(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    )
  }

  const togglePhone = (whatsappAccountId: string) => {
    setSelectedPhones(prev =>
      prev.includes(whatsappAccountId)
        ? prev.filter(id => id !== whatsappAccountId)
        : [...prev, whatsappAccountId]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{agent ? "Edit Agent" : "Create New Agent"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto flex-1 pr-2">
          <div className="space-y-2">
            <Label htmlFor="name">Agent Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Support Bot"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">System Prompt</Label>
            <Textarea
              id="prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Describe how the agent should behave..."
              className="min-h-[150px]"
              required
            />
            <p className="text-xs text-muted-foreground">
              Define the agent's personality, role, and any specific instructions.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Knowledge Base Documents</Label>
            <div className="border rounded-md p-4">
              <ScrollArea className="h-[150px]">
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No documents available. Upload documents in the Knowledge Base tab.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`doc-${doc.id}`}
                          checked={selectedDocs.includes(doc.id)}
                          onCheckedChange={() => toggleDocument(doc.id)}
                        />
                        <Label
                          htmlFor={`doc-${doc.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {doc.filename}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
            <p className="text-xs text-muted-foreground">
              Select the documents this agent should use for context.
            </p>
          </div>

          {phoneNumbers.length > 0 && (
            <div className="space-y-2">
              <Label>Assign to WhatsApp Numbers</Label>
              <div className="border rounded-md p-4">
                <div className="space-y-2">
                  {phoneNumbers.map((pn) => (
                    <div key={pn.whatsappAccountId} className="flex items-center space-x-2">
                      <Checkbox
                        id={`phone-${pn.whatsappAccountId}`}
                        checked={selectedPhones.includes(pn.whatsappAccountId)}
                        onCheckedChange={() => togglePhone(pn.whatsappAccountId)}
                      />
                      <Label
                        htmlFor={`phone-${pn.whatsappAccountId}`}
                        className="text-sm font-normal cursor-pointer flex-1 flex items-center gap-2"
                      >
                        <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
                        {pn.displayPhoneNumber}
                        {pn.verifiedName && (
                          <span className="text-xs text-muted-foreground">
                            ({pn.verifiedName})
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Select which WhatsApp numbers this agent should handle. The agent will auto-reply on selected numbers.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {agent ? "Update Agent" : "Create Agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}