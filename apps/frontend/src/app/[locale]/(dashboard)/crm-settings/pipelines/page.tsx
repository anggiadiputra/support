"use client"

import { useState, useEffect, useCallback } from "react"
import { IconLayoutKanban } from "@tabler/icons-react"
import { Info, Plus, Trash2, GripVertical, Pencil, X, Loader2, MoreHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"
import { RoleGuard } from "@/components/auth/role-guard"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd"
import { createPortal } from "react-dom"

interface Stage {
  id?: string
  name: string
  color: string
  order: number
}

interface Pipeline {
  id: string
  name: string
  description?: string
  isDefault: boolean
  stages: Stage[]
}

const DEFAULT_STAGES = [
  { name: "New", color: "#3b82f6", order: 0 },
  { name: "Contacted", color: "#eab308", order: 1 },
  { name: "Qualified", color: "#22c55e", order: 2 },
  { name: "Lost", color: "#ef4444", order: 3 }
]

// Draggable stage item component
function StageItem({ 
  stage, 
  index, 
  isDragging,
  onStageChange, 
  onRemoveStage, 
  canRemove,
  dragHandleProps,
}: { 
  stage: Stage
  index: number
  isDragging: boolean
  onStageChange: (index: number, field: keyof Stage, value: string) => void
  onRemoveStage: (index: number) => void
  canRemove: boolean
  dragHandleProps?: any
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 border-2 rounded-lg ${
        isDragging
          ? 'shadow-2xl border-primary bg-background'
          : 'border-border bg-muted/30 hover:border-primary/30'
      }`}
      style={isDragging ? { 
        background: 'var(--background)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      } : undefined}
    >
      <div
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded hover:bg-accent"
      >
        <GripVertical className="h-5 w-5" />
      </div>

      <div
        className="w-5 h-5 rounded-full shrink-0 border-2 border-background shadow-sm"
        style={{ backgroundColor: stage.color }}
      />

      {isDragging ? (
        <div className="flex-1 font-semibold text-foreground text-base">
          {stage.name}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-3">
          <Input
            value={stage.name}
            onChange={(e) => onStageChange(index, 'name', e.target.value)}
            placeholder="Stage Name"
            className="h-9"
          />
          <div className="flex gap-2">
            <Input
              type="color"
              value={stage.color}
              onChange={(e) => onStageChange(index, 'color', e.target.value)}
              className="h-9 w-14 p-1 cursor-pointer"
            />
            <Input
              value={stage.color}
              onChange={(e) => onStageChange(index, 'color', e.target.value)}
              placeholder="#000000"
              className="h-9 flex-1 font-mono text-sm"
            />
          </div>
        </div>
      )}

      {!isDragging && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => onRemoveStage(index)}
          disabled={!canRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

function PortalAwareItem({ 
  provided, 
  snapshot, 
  stage, 
  index,
  onStageChange,
  onRemoveStage,
  canRemove,
}: {
  provided: any
  snapshot: any
  stage: Stage
  index: number
  onStageChange: (index: number, field: keyof Stage, value: string) => void
  onRemoveStage: (index: number) => void
  canRemove: boolean
}) {
  const child = (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={provided.draggableProps.style}
    >
      <StageItem
        stage={stage}
        index={index}
        isDragging={snapshot.isDragging}
        onStageChange={onStageChange}
        onRemoveStage={onRemoveStage}
        canRemove={canRemove}
        dragHandleProps={provided.dragHandleProps}
      />
    </div>
  )

  if (snapshot.isDragging && typeof document !== 'undefined') {
    return createPortal(child, document.body)
  }

  return child
}

export default function PipelinesSettingsPage() {
  const t = useTranslations("crmSettings.pipelines")
  const tCommon = useTranslations("crmSettings.common")
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null)
  const [deletingPipeline, setDeletingPipeline] = useState<Pipeline | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    stages: Stage[]
  }>({
    name: "",
    stages: []
  })

  useEffect(() => {
    fetchPipelines()
  }, [])

  const fetchPipelines = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/pipelines`, {
        credentials: 'include'
      })
      const data = await res.json()
      if (data.success) {
        setPipelines(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch pipelines", error)
      toast({ title: "Failed to fetch pipelines", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (pipeline?: Pipeline) => {
    if (pipeline) {
      setEditingPipeline(pipeline)
      setFormData({
        name: pipeline.name,
        stages: [...pipeline.stages].sort((a, b) => a.order - b.order)
      })
    } else {
      setEditingPipeline(null)
      setFormData({
        name: "New Pipeline",
        stages: [...DEFAULT_STAGES]
      })
    }
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    const stagesWithOrder = formData.stages.map((stage, index) => ({
      ...stage,
      order: index
    }))

    const optimisticPipeline: Pipeline = {
      id: editingPipeline?.id || 'temp-' + Date.now(),
      name: formData.name,
      isDefault: editingPipeline?.isDefault || false,
      stages: stagesWithOrder
    }

    const previousPipelines = [...pipelines]
    if (editingPipeline) {
      setPipelines(prev => prev.map(p => p.id === editingPipeline.id ? optimisticPipeline : p))
    } else {
      setPipelines(prev => [...prev, optimisticPipeline])
    }
    setIsDialogOpen(false)
    setSaving(true)

    try {
      const url = editingPipeline
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/pipelines/${editingPipeline.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/pipelines`

      const method = editingPipeline ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name,
          stages: stagesWithOrder
        })
      })

      const data = await res.json()
      if (data.success) {
        if (editingPipeline) {
          setPipelines(prev => prev.map(p => p.id === editingPipeline.id ? data.data : p))
        } else {
          setPipelines(prev => prev.map(p => p.id === optimisticPipeline.id ? data.data : p))
        }
        toast({ title: `Pipeline ${editingPipeline ? 'updated' : 'created'}` })
      } else {
        setPipelines(previousPipelines)
        toast({ title: data.error || "Operation failed", variant: "destructive" })
      }
    } catch (error) {
      setPipelines(previousPipelines)
      toast({ title: "Error saving pipeline", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingPipeline) return

    const previousPipelines = [...pipelines]
    setPipelines(prev => prev.filter(p => p.id !== deletingPipeline.id))
    setDeletingPipeline(null)

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/pipelines/${deletingPipeline.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (res.ok) {
        toast({ title: "Pipeline deleted" })
      } else {
        setPipelines(previousPipelines)
        toast({ title: "Failed to delete", variant: "destructive" })
      }
    } catch (error) {
      setPipelines(previousPipelines)
      toast({ title: "Error deleting pipeline", variant: "destructive" })
    }
  }

  const handleStageChange = useCallback((index: number, field: keyof Stage, value: string) => {
    setFormData(prev => {
      const newStages = [...prev.stages]
      newStages[index] = { ...newStages[index], [field]: value }
      return { ...prev, stages: newStages }
    })
  }, [])

  const handleAddStage = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      stages: [
        ...prev.stages,
        { name: "New Stage", color: "#94a3b8", order: prev.stages.length }
      ]
    }))
  }, [])

  const handleRemoveStage = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== index)
    }))
  }, [])

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return
    if (result.source.index === result.destination.index) return

    setFormData(prev => {
      const items = Array.from(prev.stages)
      const [reorderedItem] = items.splice(result.source.index, 1)
      items.splice(result.destination!.index, 0, reorderedItem)

      const reorderedStages = items.map((item, index) => ({
        ...item,
        order: index
      }))

      return { ...prev, stages: reorderedStages }
    })
  }, [])

  if (loading) {
    return (
      <RoleGuard>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <IconLayoutKanban className="h-6 w-6" />
              <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
              {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4" />
            {t("newPipeline")}
          </Button>
        </div>

        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t("info")}
          </AlertDescription>
        </Alert>

        {/* Empty State */}
        {pipelines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-muted-foreground mb-4">
              <p className="text-lg font-medium">{t("empty.title")}</p>
              <p className="text-sm">
                {t("empty.description")}
              </p>
            </div>
          </div>
        )}

        {/* Pipelines List */}
        {pipelines.length > 0 && (
          <div className="grid gap-4">
            {pipelines.map((pipeline) => (
              <Card key={pipeline.id} className={pipeline.id.startsWith('temp-') ? 'opacity-70' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {pipeline.name}
                        {pipeline.isDefault && (
                          <Badge variant="secondary" className="text-xs">{t("default")}</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{pipeline.stages.length} {t("stages")}</CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenDialog(pipeline)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {tCommon("edit")}
                        </DropdownMenuItem>
                        {!pipeline.isDefault && (
                          <DropdownMenuItem
                            onClick={() => setDeletingPipeline(pipeline)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {tCommon("delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {[...pipeline.stages].sort((a, b) => a.order - b.order).map((stage) => (
                      <Badge
                        key={stage.id || stage.name}
                        variant="outline"
                        className="flex-shrink-0 whitespace-nowrap"
                        style={{ borderColor: stage.color, color: stage.color }}
                      >
                        {stage.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingPipeline ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
              <DialogDescription>
                {t("dialog.description")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                <Label>{t("dialog.pipelineName")}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("dialog.pipelineNamePlaceholder")}
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>{t("dialog.stagesLabel")}</Label>
                  <Button variant="outline" size="sm" onClick={handleAddStage}>
                    <Plus className="mr-2 h-3 w-3" /> {t("dialog.addStage")}
                  </Button>
                </div>

                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="stages">
                    {(provided, droppableSnapshot) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={`space-y-2 min-h-[100px] rounded-lg p-1 transition-colors ${
                          droppableSnapshot.isDraggingOver ? 'bg-accent/50' : ''
                        }`}
                      >
                        {formData.stages.map((stage, index) => (
                          <Draggable
                            key={stage.id || `new-${index}`}
                            draggableId={stage.id || `new-${index}`}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <PortalAwareItem
                                provided={provided}
                                snapshot={snapshot}
                                stage={stage}
                                index={index}
                                onStageChange={handleStageChange}
                                onRemoveStage={handleRemoveStage}
                                canRemove={formData.stages.length > 1}
                              />
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{tCommon("cancel")}</Button>
              <Button onClick={handleSave}>{tCommon("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingPipeline} onOpenChange={() => setDeletingPipeline(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deletePipeline")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteConfirm", { name: deletingPipeline?.name || "" })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {tCommon("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGuard>
  )
}
