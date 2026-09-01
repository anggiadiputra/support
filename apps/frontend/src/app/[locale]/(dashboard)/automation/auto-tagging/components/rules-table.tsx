"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  useToggleAutoTagRule,
  useDeleteAutoTagRule,
  type AutoTagRule,
} from "@/hooks/use-auto-tagging"
import { RuleFormDialog } from "./rule-form-dialog"

interface RulesTableProps {
  rules: AutoTagRule[]
}

export function RulesTable({ rules }: RulesTableProps) {
  const { toast } = useToast()
  const [editingRule, setEditingRule] = useState<AutoTagRule | null>(null)
  const [deletingRule, setDeletingRule] = useState<AutoTagRule | null>(null)

  const toggleMutation = useToggleAutoTagRule()
  const deleteMutation = useDeleteAutoTagRule()

  const handleToggle = async (rule: AutoTagRule) => {
    try {
      await toggleMutation.mutateAsync(rule.id)
      toast({
        title: rule.isActive ? "Rule disabled" : "Rule enabled",
        description: `"${rule.name}" has been ${rule.isActive ? "disabled" : "enabled"}`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle rule status",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async () => {
    if (!deletingRule) return

    try {
      await deleteMutation.mutateAsync(deletingRule.id)
      toast({
        title: "Rule deleted",
        description: `"${deletingRule.name}" has been deleted`,
      })
      setDeletingRule(null)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete rule",
        variant: "destructive",
      })
    }
  }

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-muted-foreground mb-4">
          <p className="text-lg font-medium">No auto-tagging rules yet</p>
          <p className="text-sm">
            Create your first rule to automatically tag customers based on their messages
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Keywords</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Pipeline Stage</TableHead>
              <TableHead className="text-center">Priority</TableHead>
              <TableHead>Matches</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {rule.keywords.slice(0, 3).map((keyword, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                    {rule.keywords.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{rule.keywords.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[150px]">
                    {rule.addTags.slice(0, 2).map((tag, i) => (
                      <Badge key={i} className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {rule.addTags.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{rule.addTags.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {rule.moveToPipelineStage ? (
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: rule.moveToPipelineStage.color,
                        color: rule.moveToPipelineStage.color,
                      }}
                    >
                      {rule.moveToPipelineStage.name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{rule.priority}</Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <span className="font-medium">{rule.matchCount}</span>
                    {rule.lastMatchAt && (
                      <span className="text-muted-foreground text-xs block">
                        Last: {formatDistanceToNow(new Date(rule.lastMatchAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={() => handleToggle(rule)}
                    disabled={toggleMutation.isPending}
                  />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingRule(rule)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeletingRule(rule)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <RuleFormDialog
        open={!!editingRule}
        onOpenChange={(open) => !open && setEditingRule(null)}
        mode="edit"
        rule={editingRule || undefined}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingRule} onOpenChange={(open: boolean) => !open && setDeletingRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingRule?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
