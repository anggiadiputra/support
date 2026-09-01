"use client"

import { useEffect } from "react"
import { RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useUserTemplates } from "../../../hooks/use-admin-user-support"

function getStatusBadge(status: string) {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>
    case "PENDING":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>
    case "REJECTED":
      return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getCategoryBadge(category: string) {
  switch (category.toUpperCase()) {
    case "MARKETING":
      return <Badge variant="outline" className="bg-purple-50">Marketing</Badge>
    case "UTILITY":
      return <Badge variant="outline" className="bg-blue-50">Utility</Badge>
    case "AUTHENTICATION":
      return <Badge variant="outline" className="bg-orange-50">Auth</Badge>
    default:
      return <Badge variant="outline">{category}</Badge>
  }
}

interface TabTemplatesProps {
  userId: string
}

export function TabTemplates({ userId }: TabTemplatesProps) {
  const { data, isLoading, error, fetch } = useUserTemplates(userId)

  useEffect(() => {
    fetch()
  }, [fetch])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Alert>
        <AlertDescription>No data available</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => fetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{data.summary.total}</div>
            <p className="text-xs text-muted-foreground">Total Templates</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{data.summary.approved}</div>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{data.summary.pending}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{data.summary.rejected}</div>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
      </div>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Template metadata only (content not shown for privacy)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.templates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>{getCategoryBadge(template.category)}</TableCell>
                    <TableCell>{template.language}</TableCell>
                    <TableCell>{getStatusBadge(template.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(template.createdAt).toLocaleDateString("id-ID")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No templates found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
