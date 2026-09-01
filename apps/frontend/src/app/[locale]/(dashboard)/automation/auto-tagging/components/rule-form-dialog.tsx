"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  useCreateAutoTagRule,
  useUpdateAutoTagRule,
  type AutoTagRule,
  type CreateAutoTagRuleInput,
} from "@/hooks/use-auto-tagging"

interface PipelineStage {
  id: string
  name: string
  color: string
  order: number
}

interface Pipeline {
  id: string
  name: string
  stages: PipelineStage[]
}

interface RuleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  rule?: AutoTagRule
}

export function RuleFormDialog({
  open,
  onOpenChange,
  mode,
  rule,
}: RuleFormDialogProps) {
  const { toast } = useToast()
  const createMutation = useCreateAutoTagRule()
  const updateMutation = useUpdateAutoTagRule()

  const [name, setName] = useState("")
  const [keywords, setKeywords] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [priority, setPriority] = useState(10)
  const [isActive, setIsActive] = useState(true)
  const [pipelineStageId, setPipelineStageId] = useState<string | null>(null)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loadingPipelines, setLoadingPipelines] = useState(false)

  // Fetch pipelines for dropdown
  useEffect(() => {
    if (open) {
      fetchPipelines()
    }
  }, [open])

  // Reset form when dialog opens/closes or rule changes
  useEffect(() => {
    if (open && mode === "edit" && rule) {
      setName(rule.name)
      setKeywords(rule.keywords)
      setTags(rule.addTags)
      setPriority(rule.priority)
      setIsActive(rule.isActive)
      setPipelineStageId(rule.moveToPipelineStageId)
    } else if (open && mode === "create") {
      resetForm()
    }
  }, [open, mode, rule])

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Small delay to allow closing animation
      const timer = setTimeout(() => {
        resetForm()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  const fetchPipelines = async () => {
    setLoadingPipelines(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/pipelines`, {
        credentials: "include",
      })
      const data = await res.json()
      if (data.success) {
        setPipelines(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch pipelines:", error)
    } finally {
      setLoadingPipelines(false)
    }
  }

  const resetForm = () => {
    setName("")
    setKeywords([])
    setKeywordInput("")
    setTags([])
    setTagInput("")
    setPriority(10)
    setIsActive(true)
    setPipelineStageId(null)
  }

  const handleAddKeyword = () => {
    const keyword = keywordInput.trim().toLowerCase()
    if (keyword.length > 0 && !keywords.includes(keyword)) {
      setKeywords([...keywords, keyword])
      setKeywordInput("")
    }
  }

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword))
  }

  const handleAddTag = () => {
    const tag = tagInput.trim()
    if (tag.length > 0 && !tags.includes(tag)) {
      setTags([...tags, tag])
      setTagInput("")
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    type: "keyword" | "tag"
  ) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (type === "keyword") {
        handleAddKeyword()
      } else {
        handleAddTag()
      }
    }
  }

  const handleSubmit = async () => {
    // Validation
    if (!name.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" })
      return
    }
    if (keywords.length === 0) {
      toast({ title: "Error", description: "At least one keyword is required", variant: "destructive" })
      return
    }
    if (tags.length === 0) {
      toast({ title: "Error", description: "At least one tag is required", variant: "destructive" })
      return
    }

    const data: CreateAutoTagRuleInput = {
      name: name.trim(),
      keywords,
      addTags: tags,
      priority,
      isActive,
      moveToPipelineStageId: pipelineStageId,
    }

    try {
      if (mode === "create") {
        await createMutation.mutateAsync(data)
        toast({ title: "Success", description: "Rule created successfully" })
      } else if (rule) {
        await updateMutation.mutateAsync({ id: rule.id, data })
        toast({ title: "Success", description: "Rule updated successfully" })
      }
      onOpenChange(false)
      resetForm()
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${mode} rule`,
        variant: "destructive",
      })
    }
  }

  // Get all stages from all pipelines
  const allStages = pipelines.flatMap((p) =>
    p.stages.map((s) => ({ ...s, pipelineName: p.name }))
  )

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Auto-Tag Rule" : "Edit Auto-Tag Rule"}
          </DialogTitle>
          <DialogDescription>
            Define keywords to match and actions to take when they're found in messages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Rule Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Rule Name</Label>
            <Input
              id="name"
              placeholder="e.g., Price Inquiry"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label>Keywords</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Type keyword and press Enter"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, "keyword")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddKeyword}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {keywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="gap-1">
                    {keyword}
                    <button
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Keywords are case-insensitive and match partial text
            </p>
          </div>

          {/* Tags to Add */}
          <div className="space-y-2">
            <Label>Tags to Add</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Type tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, "tag")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddTag}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} className="gap-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline Stage */}
          <div className="space-y-2">
            <Label>Move to Pipeline Stage (Optional)</Label>
            <Select
              value={pipelineStageId || "none"}
              onValueChange={(v) => setPipelineStageId(v === "none" ? null : v)}
              disabled={loadingPipelines}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {allStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span>{stage.name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({stage.pipelineName})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority (1-100)</Label>
            <Input
              id="priority"
              type="number"
              min={1}
              max={100}
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 10)}
            />
            <p className="text-xs text-muted-foreground">
              Higher priority rules take precedence when multiple rules match
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">
                Enable this rule to start matching messages
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : mode === "create" ? "Create Rule" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
