"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { IconTemplate, IconAlertCircle } from "@tabler/icons-react"
import type { TemplatePerformanceData, TemplatePerformanceItem } from "@/lib/api/insights-api"

interface TemplatePerformanceTableProps {
  data: TemplatePerformanceData | null
  isLoading: boolean
  isRegionRestricted?: boolean
}

function getPerformanceScore(template: TemplatePerformanceItem): number {
  // Calculate performance score based on delivery and read rates
  const deliveryWeight = 0.4
  const readWeight = 0.6
  return (template.deliveryRate * deliveryWeight) + (template.readRate * readWeight)
}

function getPerformanceBadge(score: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (score >= 80) return { label: "Excellent", variant: "default" }
  if (score >= 60) return { label: "Good", variant: "secondary" }
  if (score >= 40) return { label: "Average", variant: "outline" }
  return { label: "Poor", variant: "destructive" }
}

/**
 * Template Performance Table Component
 * Displays table with template metrics sorted by performance score
 * Requirements: 3.1, 3.2, 3.3, 3.5, 5.3
 */
export function TemplatePerformanceTable({ 
  data, 
  isLoading, 
  isRegionRestricted = false 
}: TemplatePerformanceTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Sort templates by performance score
  const sortedTemplates = [...(data?.templates || [])].sort((a, b) => {
    return getPerformanceScore(b) - getPerformanceScore(a)
  })

  const isEmpty = sortedTemplates.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <IconTemplate className="h-4 w-4" />
          Template Performance
        </CardTitle>
        <CardDescription>
          {sortedTemplates.length > 0 
            ? `${sortedTemplates.length} templates • Sorted by performance`
            : "Template delivery and read metrics"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isRegionRestricted && (
          <Alert className="mb-4">
            <IconAlertCircle className="h-4 w-4" />
            <AlertDescription>
              Template performance metrics are not available in your region (EU/Japan) due to privacy regulations.
            </AlertDescription>
          </Alert>
        )}

        {isEmpty && !isRegionRestricted ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <IconTemplate className="mx-auto h-12 w-12 opacity-50" />
              <p className="mt-2">No template data available for this period</p>
            </div>
          </div>
        ) : !isRegionRestricted && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Read</TableHead>
                  <TableHead className="text-right">Delivery %</TableHead>
                  <TableHead className="text-right">Read %</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTemplates.map((template) => {
                  const score = getPerformanceScore(template)
                  const badge = getPerformanceBadge(score)
                  
                  return (
                    <TableRow key={template.templateId}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="truncate max-w-[200px]">
                            {template.templateName || template.templateId}
                          </span>
                          {template.templateName && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {template.templateId}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {template.sent.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {template.delivered.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {template.read.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {template.deliveryRate.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {template.readRate.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={badge.variant}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
