"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Loader2, Save, AlertCircle, Plus, Pencil, Trash2, Users } from "lucide-react"
import { IconBrandWhatsapp } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { aiApi, type AIConfig, type EscalationKeywordGroup, type TeamAgent } from "@/lib/api/ai-api"
import type { WhatsAppPhoneNumberOption } from "@/hooks/use-whatsapp-phone-numbers"
import { useToast } from "@/hooks/use-toast"
import { useAIConfig, useUpdateAIConfig } from "@/hooks/use-ai"

interface EscalationSettingsProps {
  initialConfig: AIConfig
  phoneNumbers: WhatsAppPhoneNumberOption[]
}

export function EscalationSettings({ initialConfig, phoneNumbers }: EscalationSettingsProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [escalationKeywords, setEscalationKeywords] = useState<string[]>([])
  const [escalationAutoAssign, setEscalationAutoAssign] = useState(true)
  const [newKeyword, setNewKeyword] = useState("")
  const updateConfig = useUpdateAIConfig()

  // Dialog states for keyword groups
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<EscalationKeywordGroup | null>(null)
  const [groupName, setGroupName] = useState("")
  const [groupKeywords, setGroupKeywords] = useState<string[]>([])
  const [groupAgentId, setGroupAgentId] = useState("")
  const [newGroupKeyword, setNewGroupKeyword] = useState("")

  // Fetch config for selected WhatsApp account
  const { data: accountConfigData, isLoading: isLoadingAccountConfig } = useAIConfig(
    selectedAccountId || undefined,
    !!selectedAccountId
  )

  // Fetch team agents
  const { data: teamAgents = [] } = useQuery<TeamAgent[]>({
    queryKey: ["team-agents"],
    queryFn: () => aiApi.getTeamAgents(),
  })

  // Fetch escalation groups for selected account config
  // configId is only available for per-account configs (isCustomized: true)
  const configId = accountConfigData?.isCustomized ? accountConfigData?.data?.id : undefined
  const { data: escalationGroups = [], isLoading: isLoadingGroups } = useQuery<EscalationKeywordGroup[]>({
    queryKey: ["escalation-groups", configId],
    queryFn: () => aiApi.getEscalationGroups(configId!),
    enabled: !!configId,
  })

  // Mutations for escalation groups
  const createGroupMutation = useMutation({
    mutationFn: (data: { configId: string; name: string; keywords: string[]; assignedAgentId: string }) =>
      aiApi.createEscalationGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-groups", configId] })
      toast({ title: "Success", description: "Keyword group created" })
      resetGroupForm()
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to create group" })
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; keywords?: string[]; assignedAgentId?: string } }) =>
      aiApi.updateEscalationGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-groups", configId] })
      toast({ title: "Success", description: "Keyword group updated" })
      resetGroupForm()
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to update group" })
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => aiApi.deleteEscalationGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-groups", configId] })
      toast({ title: "Success", description: "Keyword group deleted" })
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete group" })
    },
  })

  // Update local state when account config is loaded
  useEffect(() => {
    if (accountConfigData?.data) {
      setEscalationKeywords(accountConfigData.data.escalationKeywords || [])
      setEscalationAutoAssign(accountConfigData.data.escalationAutoAssign ?? true)
    } else if (!selectedAccountId) {
      setEscalationKeywords([])
      setEscalationAutoAssign(true)
    }
  }, [accountConfigData, selectedAccountId])

  const resetGroupForm = () => {
    setIsGroupDialogOpen(false)
    setEditingGroup(null)
    setGroupName("")
    setGroupKeywords([])
    setGroupAgentId("")
    setNewGroupKeyword("")
  }

  const openEditGroup = (group: EscalationKeywordGroup) => {
    setEditingGroup(group)
    setGroupName(group.name)
    setGroupKeywords(group.keywords)
    setGroupAgentId(group.assignedAgentId)
    setIsGroupDialogOpen(true)
  }

  const addGroupKeyword = () => {
    // Split by comma to allow adding multiple keywords at once
    const keywords = newGroupKeyword
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k && !groupKeywords.includes(k))
    
    if (keywords.length > 0) {
      setGroupKeywords([...groupKeywords, ...keywords])
    }
    setNewGroupKeyword("")
  }

  const removeGroupKeyword = (keyword: string) => {
    setGroupKeywords(groupKeywords.filter((k) => k !== keyword))
  }

  const handleSaveGroup = () => {
    if (!groupName || groupKeywords.length === 0 || !groupAgentId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      })
      return
    }

    if (editingGroup) {
      updateGroupMutation.mutate({
        id: editingGroup.id,
        data: { name: groupName, keywords: groupKeywords, assignedAgentId: groupAgentId },
      })
    } else {
      createGroupMutation.mutate({
        configId: configId!,
        name: groupName,
        keywords: groupKeywords,
        assignedAgentId: groupAgentId,
      })
    }
  }

  const addKeyword = () => {
    // Split by comma to allow adding multiple keywords at once
    const keywords = newKeyword
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k && !escalationKeywords.includes(k))
    
    if (keywords.length > 0) {
      setEscalationKeywords([...escalationKeywords, ...keywords])
    }
    setNewKeyword("")
  }

  const removeKeyword = (keyword: string) => {
    setEscalationKeywords(escalationKeywords.filter((k) => k !== keyword))
  }

  const handleSave = () => {
    if (!selectedAccountId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a WhatsApp number first",
      })
      return
    }

    updateConfig.mutate(
      { data: { escalationKeywords, escalationAutoAssign }, wabaId: selectedAccountId },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: "Escalation settings saved successfully",
          })
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to save settings",
          })
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      {/* WhatsApp Number Selector Card */}
      <Card>
        <CardHeader>
          <CardTitle>Escalation Settings</CardTitle>
          <CardDescription>
            Configure how AI handles escalation when customers need human assistance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>WhatsApp Number</Label>
            {phoneNumbers.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No WhatsApp numbers connected. Connect a WhatsApp number first to configure escalation.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-full sm:w-[350px]">
                  <SelectValue placeholder="Select WhatsApp number..." />
                </SelectTrigger>
                <SelectContent>
                  {phoneNumbers.map((pn) => (
                    <SelectItem key={pn.whatsappAccountId} value={pn.whatsappAccountId}>
                      <div className="flex items-center gap-2">
                        <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
                        {pn.displayPhoneNumber}
                        {pn.verifiedName && (
                          <span className="text-muted-foreground">({pn.verifiedName})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedAccountId && isLoadingAccountConfig && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading settings...
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAccountId && !isLoadingAccountConfig && (
        <>
          {/* Keyword Groups Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Keyword Groups
                  </CardTitle>
                  <CardDescription>
                    Assign specific keywords to agents. When a customer uses these keywords,
                    the conversation is assigned to the designated agent with a notification.
                  </CardDescription>
                </div>
                {!configId ? (
                  <Button size="sm" disabled variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Save settings first
                  </Button>
                ) : (
                <Dialog open={isGroupDialogOpen} onOpenChange={(open) => {
                  if (!open) resetGroupForm()
                  setIsGroupDialogOpen(open)
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Group
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingGroup ? "Edit Keyword Group" : "Create Keyword Group"}</DialogTitle>
                      <DialogDescription>
                        Create a group of keywords that will trigger assignment to a specific agent.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Group Name</Label>
                        <Input
                          placeholder="e.g., Finance, Technical Support"
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Assign to Agent</Label>
                        <Select value={groupAgentId} onValueChange={setGroupAgentId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select agent..." />
                          </SelectTrigger>
                          <SelectContent>
                            {teamAgents.map((agent) => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.name} ({agent.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Keywords</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add keyword..."
                            value={newGroupKeyword}
                            onChange={(e) => setNewGroupKeyword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                addGroupKeyword()
                              }
                            }}
                          />
                          <Button type="button" size="sm" onClick={addGroupKeyword}>Add</Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {groupKeywords.map((keyword, index) => (
                            <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                              {keyword}
                              <button
                                className="ml-2 hover:text-destructive"
                                onClick={() => removeGroupKeyword(keyword)}
                              >
                                x
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={resetGroupForm}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={handleSaveGroup}
                        disabled={createGroupMutation.isPending || updateGroupMutation.isPending}
                      >
                        {(createGroupMutation.isPending || updateGroupMutation.isPending) && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {editingGroup ? "Update" : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingGroups ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading groups...
                </div>
              ) : escalationGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No keyword groups created. Create a group to assign conversations to specific agents.
                </p>
              ) : (
                <div className="space-y-3">
                  {escalationGroups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{group.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Assigned to: {group.assignedAgent?.name || "Unknown"}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {group.keywords.map((keyword, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditGroup(group)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteGroupMutation.mutate(group.id)}
                          disabled={deleteGroupMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* General Escalation Keywords Card */}
          <Card>
            <CardHeader>
              <CardTitle>General Escalation Keywords</CardTitle>
              <CardDescription>
                These keywords stop AI from responding. If no keyword group matches,
                the conversation can be moved to the unassigned queue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter keyword (e.g. 'bicara cs', 'komplain')"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addKeyword()
                    }
                  }}
                />
                <Button size="sm" onClick={addKeyword}>Add</Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {escalationKeywords.map((keyword, index) => (
                  <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                    {keyword}
                    <button
                      className="ml-2 hover:text-destructive"
                      onClick={() => removeKeyword(keyword)}
                    >
                      x
                    </button>
                  </Badge>
                ))}
                {escalationKeywords.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No general escalation keywords. Only keyword groups will trigger escalation.
                  </p>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between space-x-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Auto-assign to human queue</Label>
                  <p className="text-sm text-muted-foreground">
                    When a general escalation keyword is triggered (not in a group),
                    move the conversation to the unassigned queue for any agent to pick up.
                  </p>
                </div>
                <Switch
                  checked={escalationAutoAssign}
                  onCheckedChange={setEscalationAutoAssign}
                />
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={updateConfig.isPending}>
                  {updateConfig.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save General Settings
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
