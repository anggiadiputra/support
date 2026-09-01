"use client"

import { useState } from "react"
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
import {
  FileText,
  Loader2,
  Upload,
  Trash2,
  AlertTriangle,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Badge } from "@/components/ui/badge"
import type { KnowledgeDocument } from "@/lib/api/ai-api"
import { useToast } from "@/hooks/use-toast"
import { useUploadDocument, useDeleteDocument } from "@/hooks/use-ai"
import { useSubscription } from "@/hooks/use-subscription"

interface KnowledgeBaseProps {
  documents: KnowledgeDocument[]
}

export function KnowledgeBase({ documents }: KnowledgeBaseProps) {
  const { toast } = useToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<KnowledgeDocument | null>(null)

  const uploadDocument = useUploadDocument()
  const deleteDocument = useDeleteDocument()
  
  // Get subscription limits
  const { canCreate, getUsageText } = useSubscription()
  const canUploadDoc = canCreate("knowledgeDocs")
  const docUsageText = getUsageText("knowledgeDocs")

  const handleDeleteClick = (doc: KnowledgeDocument) => {
    setDocumentToDelete(doc)
    setDeleteDialogOpen(true)
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== "application/pdf") {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Only PDF files are supported",
      })
      return
    }

    // Reset input early
    e.target.value = ""

    uploadDocument.mutate(file, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "File uploaded. Processing...",
        })
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to upload file",
        })
      },
    })
  }

  const handleConfirmDelete = () => {
    if (!documentToDelete) return

    deleteDocument.mutate(documentToDelete.id, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Document deleted",
        })
        setDeleteDialogOpen(false)
        setDocumentToDelete(null)
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to delete document",
        })
      },
    })
  }
  const isUploadDisabled = uploadDocument.isPending || !canUploadDoc

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              Knowledge Base Documents
              <Badge variant="outline" className="font-normal">
                {docUsageText}
              </Badge>
            </CardTitle>
            <CardDescription>
              Upload PDF documents to train your AI.
            </CardDescription>
          </div>
          <div>
            <Input
              type="file"
              accept=".pdf"
              className="hidden"
              id="file-upload"
              onChange={handleUpload}
              disabled={isUploadDisabled}
            />
            <Button asChild size="sm" disabled={isUploadDisabled}>
              <Label htmlFor="file-upload" className={isUploadDisabled ? "cursor-not-allowed" : "cursor-pointer"}>
                {uploadDocument.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload PDF
              </Label>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No documents uploaded yet.</p>
            <p className="text-sm">Upload a PDF to get started.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      {doc.filename}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        doc.status === "COMPLETED"
                          ? "default"
                          : doc.status === "FAILED"
                          ? "destructive"
                          : "secondary"
                      }
                      className={
                        doc.status === "COMPLETED"
                          ? "bg-green-500 hover:bg-green-600"
                          : doc.status === "PENDING" || doc.status === "PROCESSING"
                          ? "animate-pulse"
                          : ""
                      }
                    >
                      {doc.status === "PENDING" && "Uploading..."}
                      {doc.status === "PROCESSING" && "Processing..."}
                      {doc.status === "COMPLETED" && "Completed"}
                      {doc.status === "FAILED" && "Failed"}
                    </Badge>
                    {doc.status === "FAILED" && doc.errorMessage && (
                      <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={doc.errorMessage}>
                        {doc.errorMessage}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.createdAt
                      ? new Date(doc.createdAt).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(doc)}
                      className="text-destructive hover:text-destructive/90"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <AlertDialogTitle>Delete Document</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="pt-2">
                Are you sure you want to delete <strong>{documentToDelete?.filename}</strong>?
                <br /><br />
                This action cannot be undone. The document and all its processed data will be permanently removed from the knowledge base.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteDocument.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={deleteDocument.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteDocument.isPending ? "Deleting..." : "Delete Document"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}