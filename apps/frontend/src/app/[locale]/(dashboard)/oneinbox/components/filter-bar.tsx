"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, X, Tag, GitBranch } from "lucide-react"
import type { ReadStatusFilter, PipelineStage } from "../types/unified-inbox"
import { AccountFilter, type AccountFilterValue, type WhatsAppPhoneNumberOption } from "./account-filter"
import type { InstagramAccount } from "@/lib/api/instagram"
import type { FacebookPage } from "@/lib/api/messenger"

interface FilterBarProps {
  readStatusFilter: ReadStatusFilter
  onReadStatusChange: (status: ReadStatusFilter) => void
  tagsFilter: string[]
  onTagsChange: (tags: string[]) => void
  pipelineFilter: string[]
  onPipelineChange: (stages: string[]) => void
  availableTags: string[]
  availableStages: PipelineStage[]
  resultCount: number
  onClearFilters: () => void
  // Account filter props
  accountFilter: AccountFilterValue
  onAccountFilterChange: (filter: AccountFilterValue) => void
  instagramAccounts: InstagramAccount[]
  facebookPages: FacebookPage[]
  whatsappPhoneNumbers?: WhatsAppPhoneNumberOption[]
}

export function FilterBar({
  readStatusFilter,
  onReadStatusChange,
  tagsFilter,
  onTagsChange,
  pipelineFilter,
  onPipelineChange,
  availableTags,
  availableStages,
  resultCount,
  onClearFilters,
  accountFilter,
  onAccountFilterChange,
  instagramAccounts,
  facebookPages,
  whatsappPhoneNumbers = [],
}: FilterBarProps) {
  const hasActiveFilters =
    readStatusFilter !== "all" || tagsFilter.length > 0 || pipelineFilter.length > 0 || accountFilter !== "all"

  const handleTagToggle = (tag: string) => {
    if (tagsFilter.includes(tag)) {
      onTagsChange(tagsFilter.filter((t) => t !== tag))
    } else {
      onTagsChange([...tagsFilter, tag])
    }
  }

  const handleStageToggle = (stageId: string) => {
    if (pipelineFilter.includes(stageId)) {
      onPipelineChange(pipelineFilter.filter((s) => s !== stageId))
    } else {
      onPipelineChange([...pipelineFilter, stageId])
    }
  }


  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-muted/30">
      {/* Read Status Segmented Control */}
      <div className="flex gap-0.5 p-0.5 bg-muted rounded-md">
        {(["all", "unread", "read"] as ReadStatusFilter[]).map((status) => (
          <Button
            key={status}
            variant={readStatusFilter === status ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onReadStatusChange(status)}
            className={`text-xs h-7 px-3 capitalize ${
              readStatusFilter === status ? "bg-background shadow-sm" : ""
            }`}
          >
            {status}
          </Button>
        ))}
      </div>

      {/* Account Filter - only show if multiple accounts/numbers connected */}
      {(whatsappPhoneNumbers.length > 1 || instagramAccounts.length > 1 || facebookPages.length > 1 ||
        (instagramAccounts.length > 0 && facebookPages.length > 0) ||
        (whatsappPhoneNumbers.length > 1 && (instagramAccounts.length > 0 || facebookPages.length > 0))) && (
        <div className="w-36">
          <AccountFilter
            value={accountFilter}
            onChange={onAccountFilterChange}
            instagramAccounts={instagramAccounts}
            facebookPages={facebookPages}
            whatsappPhoneNumbers={whatsappPhoneNumbers}
          />
        </div>
      )}

      {/* Tags Multi-Select Dropdown */}
      {availableTags.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-7 text-xs gap-1 ${
                tagsFilter.length > 0 ? "border-primary" : ""
              }`}
            >
              <Tag className="h-3 w-3" />
              Tags
              {tagsFilter.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {tagsFilter.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Filter by Tags
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {availableTags.map((tag) => (
                <label
                  key={tag}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={tagsFilter.includes(tag)}
                    onCheckedChange={() => handleTagToggle(tag)}
                  />
                  <span className="text-sm truncate">{tag}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Pipeline Stages Multi-Select Dropdown */}
      {availableStages.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-7 text-xs gap-1 ${
                pipelineFilter.length > 0 ? "border-primary" : ""
              }`}
            >
              <GitBranch className="h-3 w-3" />
              Pipeline
              {pipelineFilter.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {pipelineFilter.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Filter by Stage
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {/* No Stage option */}
              <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={pipelineFilter.includes("no-stage")}
                  onCheckedChange={() => handleStageToggle("no-stage")}
                />
                <span
                  className="w-2 h-2 rounded-full border border-muted-foreground"
                  style={{ backgroundColor: "transparent" }}
                />
                <span className="text-sm">No Stage</span>
              </label>
              {/* Pipeline stages */}
              {availableStages.map((stage) => (
                <label
                  key={stage.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={pipelineFilter.includes(stage.id)}
                    onCheckedChange={() => handleStageToggle(stage.id)}
                  />
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm truncate">{stage.name}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}

      {/* Result Count */}
      <div className="ml-auto text-xs text-muted-foreground">
        {resultCount} conversation{resultCount !== 1 ? "s" : ""}
      </div>
    </div>
  )
}
