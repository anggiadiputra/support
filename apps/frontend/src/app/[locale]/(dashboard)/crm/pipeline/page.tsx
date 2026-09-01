"use client"

import { useState, useEffect } from "react"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Plus, MoreHorizontal, Settings } from "lucide-react"
import { IconLayoutKanban } from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { Header } from "@/components/layout/header"
import { RoleGuard } from "@/components/auth/role-guard"
import { Link } from "@/i18n/routing"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useCustomers, useUpdateCustomer } from "@/hooks/use-customers"

interface Customer {
    id: string
    name: string
    phoneNumber: string
    leadScore: number
    pipelineStageId: string
}

interface Stage {
    id: string
    name: string
    color: string
    customers: Customer[]
}

export default function PipelinePage() {
    const [stages, setStages] = useState<Stage[]>([])
    const [pipelineLoading, setPipelineLoading] = useState(true)
    const [hasPipeline, setHasPipeline] = useState(true)
    const [addDealOpen, setAddDealOpen] = useState(false)
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>("")
    const [selectedStageId, setSelectedStageId] = useState<string>("")
    const { toast } = useToast()

    // Use TanStack Query for customers data with caching
    const { data: customers = [], isLoading: customersLoading } = useCustomers()
    const updateCustomerMutation = useUpdateCustomer()

    // Customers without pipeline stage for "Add Deal"
    const availableCustomers = customers.filter((c: any) => !c.pipelineStageId)

    useEffect(() => {
        fetchPipelineData()
    }, [customers])

    const fetchPipelineData = async () => {
        try {
            // Fetch default pipeline and its stages
            const pipelineRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/pipelines`, {
                credentials: 'include'
            })
            const pipelineData = await pipelineRes.json()

            if (pipelineData.success && pipelineData.data.length > 0) {
                setHasPipeline(true)
                const defaultPipeline = pipelineData.data.find((p: any) => p.isDefault) || pipelineData.data[0]

                // Group customers by stage using cached customers data
                const stagesWithCustomers = defaultPipeline.stages.map((stage: any) => ({
                    ...stage,
                    customers: customers.filter((c: any) => c.pipelineStageId === stage.id)
                }))
                setStages(stagesWithCustomers)
            } else {
                setHasPipeline(false)
            }
        } catch (error) {
            console.error("Failed to fetch pipeline data", error)
        } finally {
            setPipelineLoading(false)
        }
    }

    const onDragEnd = async (result: any) => {
        const { source, destination, draggableId } = result

        if (!destination) return

        if (
            source.droppableId === destination.droppableId &&
            source.index === destination.index
        ) {
            return
        }

        // Find source and destination stages
        const sourceStageIndex = stages.findIndex(s => s.id === source.droppableId)
        const destStageIndex = stages.findIndex(s => s.id === destination.droppableId)

        const sourceStage = stages[sourceStageIndex]
        const destStage = stages[destStageIndex]

        const sourceCustomers = Array.from(sourceStage.customers)
        const destCustomers = source.droppableId === destination.droppableId
            ? sourceCustomers
            : Array.from(destStage.customers)

        const [movedCustomer] = sourceCustomers.splice(source.index, 1)

        if (source.droppableId === destination.droppableId) {
            sourceCustomers.splice(destination.index, 0, movedCustomer)
            const newStages = [...stages]
            newStages[sourceStageIndex] = { ...sourceStage, customers: sourceCustomers }
            setStages(newStages)
        } else {
            destCustomers.splice(destination.index, 0, movedCustomer)
            const newStages = [...stages]
            newStages[sourceStageIndex] = { ...sourceStage, customers: sourceCustomers }
            newStages[destStageIndex] = { ...destStage, customers: destCustomers }
            setStages(newStages)

            // Update backend using mutation hook with cache invalidation
            try {
                await updateCustomerMutation.mutateAsync({
                    id: draggableId,
                    data: { pipelineStageId: destination.droppableId }
                })
                toast({ title: "Stage updated" })
            } catch (error) {
                toast({ title: "Failed to update stage", variant: "destructive" })
                // Revert state if failed
                fetchPipelineData()
            }
        }
    }

    const handleAddDeal = async () => {
        if (!selectedCustomerId || !selectedStageId) {
            toast({
                title: "Error",
                description: "Please select both customer and stage",
                variant: "destructive",
            })
            return
        }

        try {
            // Update customer with pipeline stage using mutation hook
            await updateCustomerMutation.mutateAsync({
                id: selectedCustomerId,
                data: { pipelineStageId: selectedStageId }
            })

            toast({
                title: "Success",
                description: "Customer added to pipeline",
            })
            setAddDealOpen(false)
            setSelectedCustomerId("")
            setSelectedStageId("")
            // Data will be refreshed automatically via cache invalidation
        } catch (error) {
            console.error("Error adding deal:", error)
            toast({
                title: "Error",
                description: "Failed to add customer to pipeline",
                variant: "destructive",
            })
        }
    }

    const loading = pipelineLoading || customersLoading

    if (loading) return (
        <RoleGuard>
            <div className="flex flex-col h-screen">
                <Header />
                <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4">
                    {/* Header skeleton */}
                    <div className="flex justify-between items-center flex-shrink-0">
                        <div>
                            <Skeleton className="h-8 w-48 mb-2" />
                            <Skeleton className="h-4 w-64" />
                        </div>
                        <Skeleton className="h-10 w-28" />
                    </div>

                    {/* Pipeline columns skeleton */}
                    <div className="flex-1 min-h-0 relative">
                        <div className="absolute inset-0 overflow-x-auto overflow-y-auto">
                            <div className="inline-flex h-full gap-4 pb-4">
                                {Array.from({ length: 4 }).map((_, stageIndex) => (
                                    <div key={stageIndex} className="w-80 flex-shrink-0 flex flex-col bg-muted/50 rounded-lg p-2">
                                        {/* Stage header skeleton */}
                                        <div className="flex items-center justify-between p-2 mb-2">
                                            <div className="flex items-center gap-2">
                                                <Skeleton className="w-3 h-3 rounded-full" />
                                                <Skeleton className="h-4 w-20" />
                                                <Skeleton className="h-5 w-6 rounded-md" />
                                            </div>
                                            <Skeleton className="h-6 w-6" />
                                        </div>

                                        {/* Customer cards skeleton */}
                                        <div className="flex-1 flex flex-col gap-2 min-h-[100px]">
                                            {Array.from({ length: stageIndex === 0 ? 3 : stageIndex === 1 ? 2 : 1 }).map((_, cardIndex) => (
                                                <div key={cardIndex} className="border rounded-lg bg-card p-3 space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <Skeleton className="h-4 w-32" />
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <Skeleton className="h-3 w-16" />
                                                        <Skeleton className="h-5 w-5 rounded-full" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </RoleGuard>
    )

    if (!hasPipeline) return (
        <RoleGuard>
            <div className="flex flex-col h-screen">
                <Header />
                <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4">
                    <div className="flex justify-between items-center flex-shrink-0">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Sales Pipeline</h2>
                            <p className="text-muted-foreground">
                                Manage your deals and customer stages
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center max-w-md space-y-4">
                            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                                <IconLayoutKanban className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-semibold">No Pipeline Created</h3>
                                <p className="text-muted-foreground text-sm">
                                    You need to create a pipeline first before you can start tracking your deals. 
                                    Go to CRM Settings to set up your sales pipeline stages.
                                </p>
                            </div>
                            <Button size="sm" asChild>
                                <Link href="/crm-settings">
                                    <Settings className="h-4 w-4" />
                                    Go to CRM Settings
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </RoleGuard>
    )

    return (
        <RoleGuard>
            <div className="flex flex-col h-screen">
                <Header />
                <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4">
                    <div className="flex justify-between items-center flex-shrink-0">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Sales Pipeline</h2>
                            <p className="text-muted-foreground">
                                Manage your deals and customer stages
                            </p>
                        </div>
                        <Button size="sm" onClick={() => setAddDealOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add Deal
                        </Button>
                    </div>

                    {/* Kanban board dengan scroll horizontal */}
                    <div className="flex-1 min-h-0 relative">
                        <div className="absolute inset-0 overflow-x-auto overflow-y-auto">
                            <DragDropContext onDragEnd={onDragEnd}>
                                <div className="inline-flex h-full gap-4 pb-4">
                                    {stages.map((stage) => (
                                        <div key={stage.id} className="w-80 flex-shrink-0 flex flex-col bg-muted/50 rounded-lg p-2">
                                            <div className="flex items-center justify-between p-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: stage.color }}
                                                    />
                                                    <h3 className="font-semibold text-sm">{stage.name}</h3>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {stage.customers.length}
                                                    </Badge>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </div>

                                            <Droppable droppableId={stage.id}>
                                                {(provided) => (
                                                    <div
                                                        {...provided.droppableProps}
                                                        ref={provided.innerRef}
                                                        className="flex-1 flex flex-col gap-2 min-h-[100px]"
                                                    >
                                                        {stage.customers.map((customer, index) => (
                                                            <Draggable
                                                                key={customer.id}
                                                                draggableId={customer.id}
                                                                index={index}
                                                            >
                                                                {(provided) => (
                                                                    <Card
                                                                        ref={provided.innerRef}
                                                                        {...provided.draggableProps}
                                                                        {...provided.dragHandleProps}
                                                                        className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                                                                    >
                                                                        <CardContent className="p-3 space-y-2">
                                                                            <div className="flex justify-between items-start">
                                                                                <span className="font-medium text-sm line-clamp-1">
                                                                                    {customer.name || customer.phoneNumber}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                                                                                <span>Score: {customer.leadScore}</span>
                                                                                <Avatar className="h-5 w-5">
                                                                                    <AvatarFallback className="text-[10px]">
                                                                                        {(customer.name || "U").charAt(0)}
                                                                                    </AvatarFallback>
                                                                                </Avatar>
                                                                            </div>
                                                                        </CardContent>
                                                                    </Card>
                                                                )}
                                                            </Draggable>
                                                        ))}
                                                        {provided.placeholder}
                                                    </div>
                                                )}
                                            </Droppable>
                                        </div>
                                    ))}
                                </div>
                            </DragDropContext>
                        </div>
                    </div>
                </div>

                {/* Add Deal Dialog */}
                <Dialog open={addDealOpen} onOpenChange={setAddDealOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Customer to Pipeline</DialogTitle>
                            <DialogDescription>
                                Select a customer and stage to add them to your sales pipeline
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="customer">Customer</Label>
                                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                                    <SelectTrigger id="customer">
                                        <SelectValue placeholder="Select a customer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCustomers.length === 0 ? (
                                            <div className="p-2 text-sm text-muted-foreground">
                                                No customers available. All customers are already in the pipeline.
                                            </div>
                                        ) : (
                                            availableCustomers.map((customer) => (
                                                <SelectItem key={customer.id} value={customer.id}>
                                                    {customer.name || customer.phoneNumber}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="stage">Pipeline Stage</Label>
                                <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                                    <SelectTrigger id="stage">
                                        <SelectValue placeholder="Select a stage" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {stages.map((stage) => (
                                            <SelectItem key={stage.id} value={stage.id}>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: stage.color }}
                                                    />
                                                    {stage.name}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setAddDealOpen(false)}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleAddDeal}>
                                Add to Pipeline
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </RoleGuard>
    )
}
