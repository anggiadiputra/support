"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Brain, 
  Trash2, 
  AlertTriangle, 
  Loader2, 
  User, 
  RefreshCw, 
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { IconBrandWhatsapp } from "@tabler/icons-react"
import type { WhatsAppPhoneNumberOption } from "@/hooks/use-whatsapp-phone-numbers"
import { ClearMemoryDialog } from "./clear-memory-dialog"
import { aiApi } from "@/lib/api/ai-api"
import { useToast } from "@/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { id } from "date-fns/locale"
import { useDebounce } from "@/hooks/use-debounce"

interface CustomerWithMemory {
  customerId: string
  customerName: string | null
  customerPhone: string | null
  memoryCount: number
  lastMemoryAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface MemoryManagementProps {
  phoneNumbers: WhatsAppPhoneNumberOption[]
}

export function MemoryManagement({ phoneNumbers }: MemoryManagementProps) {
  const { toast } = useToast()
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [customers, setCustomers] = useState<CustomerWithMemory[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearch = useDebounce(searchQuery, 300)
  
  // Customer delete dialog
  const [deleteCustomerDialog, setDeleteCustomerDialog] = useState<{
    open: boolean
    customer: CustomerWithMemory | null
  }>({ open: false, customer: null })
  const [deletingCustomer, setDeletingCustomer] = useState(false)

  const selectedPhone = phoneNumbers.find(
    (pn) => pn.whatsappAccountId === selectedAccountId
  )

  const loadCustomers = useCallback(async (page: number = 1) => {
    if (!selectedAccountId) return
    setLoadingCustomers(true)
    try {
      const data = await aiApi.getCustomersWithMemory(selectedAccountId, {
        page,
        limit: 20,
        search: debouncedSearch,
      })
      setCustomers(data.customers)
      setPagination(data.pagination)
    } catch (err: any) {
      console.error("Failed to load customers:", err)
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to load customers",
      })
    } finally {
      setLoadingCustomers(false)
    }
  }, [selectedAccountId, debouncedSearch, toast])

  // Load customers when account selected or search changes
  useEffect(() => {
    if (selectedAccountId) {
      loadCustomers(1) // Reset to page 1 on new search/account
    } else {
      setCustomers([])
      setPagination({ page: 1, limit: 20, total: 0, totalPages: 0 })
    }
  }, [selectedAccountId, debouncedSearch])

  const handleClearAllMemory = () => {
    if (!selectedAccountId) return
    setClearDialogOpen(true)
  }

  const handleDeleteCustomerMemory = (customer: CustomerWithMemory) => {
    setDeleteCustomerDialog({ open: true, customer })
  }

  const confirmDeleteCustomerMemory = async () => {
    if (!deleteCustomerDialog.customer || !selectedAccountId) return
    
    setDeletingCustomer(true)
    try {
      const result = await aiApi.deleteCustomerMemory(
        selectedAccountId, 
        deleteCustomerDialog.customer.customerId
      )
      toast({
        title: "Memory Cleared",
        description: `Deleted ${result.deletedCount} memories for ${deleteCustomerDialog.customer.customerName || deleteCustomerDialog.customer.customerPhone}`,
      })
      setDeleteCustomerDialog({ open: false, customer: null })
      loadCustomers(pagination.page) // Refresh current page
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to delete customer memory",
      })
    } finally {
      setDeletingCustomer(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    loadCustomers(newPage)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          AI Memory Management
        </CardTitle>
        <CardDescription>
          Manage conversation memories that AI uses to personalize responses for each customer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Info Section */}
        <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
          <h4 className="text-sm font-medium">What is AI Memory?</h4>
          <p className="text-sm text-muted-foreground">
            AI Memory stores past conversations between customers and AI/human agents. 
            This allows the AI to remember previous interactions and provide more personalized responses.
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Memories are stored per WhatsApp account</li>
            <li>AI uses semantic search to find relevant past conversations</li>
            <li>Memories are automatically deleted after 90 days</li>
          </ul>
        </div>

        {/* Account Selection */}
        {phoneNumbers.length === 0 ? (
          <div className="flex items-center gap-2 p-4 rounded-lg border border-dashed">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No WhatsApp accounts connected. Connect a WhatsApp account first.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Select WhatsApp Account</Label>
              <Select
                value={selectedAccountId}
                onValueChange={(value) => {
                  setSelectedAccountId(value)
                  setSearchQuery("") // Reset search on account change
                }}
              >
                <SelectTrigger className="w-full md:w-[350px]">
                  <SelectValue placeholder="Select a WhatsApp account..." />
                </SelectTrigger>
                <SelectContent>
                  {phoneNumbers.map((pn) => (
                    <SelectItem key={pn.whatsappAccountId} value={pn.whatsappAccountId}>
                      <div className="flex items-center gap-2">
                        <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
                        <span>{pn.displayPhoneNumber}</span>
                        {pn.verifiedName && (
                          <span className="text-muted-foreground">
                            ({pn.verifiedName})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer Memory List */}
            {selectedAccountId && (
              <div className="space-y-4">
                {/* Header with Search and Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-medium">Customers with AI Memory</h4>
                    {pagination.total > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {pagination.total} customers found
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadCustomers(pagination.page)}
                      disabled={loadingCustomers}
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingCustomers ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleClearAllMemory}
                      disabled={pagination.total === 0}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or phone number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {loadingCustomers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : customers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center border rounded-lg">
                    <Brain className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery 
                        ? "No customers found matching your search."
                        : "No AI memories found for this account."
                      }
                    </p>
                    {!searchQuery && (
                      <p className="text-xs text-muted-foreground">
                        Memories are created when AI responds to customers.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-center">Memories</TableHead>
                            <TableHead>Last Activity</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customers.map((customer) => (
                            <TableRow key={customer.customerId}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">
                                      {customer.customerName || "Unknown"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {customer.customerPhone || customer.customerId.slice(0, 8)}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">
                                  {customer.memoryCount}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(customer.lastMemoryAt), { 
                                  addSuffix: true,
                                  locale: id 
                                })}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteCustomerMemory(customer)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          Page {pagination.page} of {pagination.totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={pagination.page <= 1 || loadingCustomers}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages || loadingCustomers}
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Clear All Memory Dialog */}
      {selectedPhone && (
        <ClearMemoryDialog
          open={clearDialogOpen}
          onOpenChange={setClearDialogOpen}
          whatsappAccountId={selectedAccountId}
          phoneNumber={selectedPhone.displayPhoneNumber}
          onSuccess={() => loadCustomers(1)}
        />
      )}

      {/* Delete Customer Memory Dialog */}
      <AlertDialog 
        open={deleteCustomerDialog.open} 
        onOpenChange={(open) => setDeleteCustomerDialog({ open, customer: open ? deleteCustomerDialog.customer : null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Delete Customer Memory</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-2 space-y-2">
              <p>
                Delete all AI memories for{" "}
                <span className="font-semibold text-foreground">
                  {deleteCustomerDialog.customer?.customerName || deleteCustomerDialog.customer?.customerPhone || "this customer"}
                </span>?
              </p>
              <p className="text-sm">
                This will remove <span className="font-semibold">{deleteCustomerDialog.customer?.memoryCount}</span> conversation memories. 
                The AI will no longer remember past interactions with this customer.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCustomer}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCustomerMemory}
              disabled={deletingCustomer}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingCustomer ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Memory"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
