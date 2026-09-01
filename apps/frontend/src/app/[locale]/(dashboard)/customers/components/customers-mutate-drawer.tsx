"use client"

import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Customer } from "../data/schema"
import { Badge } from "@/components/ui/badge"
import { IconX, IconSettings } from "@tabler/icons-react"
import { useState, useEffect } from "react"
import { Link } from "@/i18n/routing"
import { useCreateCustomer, useUpdateCustomer } from "@/hooks/use-customers"
import { useToast } from "@/hooks/use-toast"
import { useWhatsAppPhoneNumbers } from "@/hooks/use-whatsapp-phone-numbers"

interface PipelineStage {
  id: string
  name: string
  pipelineId: string
}

interface CustomFieldDefinition {
  id: string
  key: string
  name: string
  type: string
  required: boolean
  options?: string[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Customer
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .regex(
      /^\+[1-9]\d{1,14}$/,
      "Invalid format. Must start with + and country code (e.g., +628123456789)"
    )
    .refine(
      (val) => !val.includes(" "),
      "Phone number cannot contain spaces"
    ),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  whatsappPhoneNumberId: z.string().min(1, "WhatsApp account is required"),
  consentStatus: z.enum(["CONSENTED", "NOT_CONSENTED", "REVOKED"]),
  tags: z.array(z.string()).optional(),
  pipelineStageId: z.string().optional(),
  customFields: z.record(z.any()).optional(),
})

type CustomerForm = z.infer<typeof formSchema>

export function CustomersMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: Props) {
  const isUpdate = !!currentRow
  const [tagInput, setTagInput] = useState("")
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([])
  const { toast } = useToast()
  const { phoneNumbers: whatsappPhoneNumbers, isLoading: isLoadingPhoneNumbers } = useWhatsAppPhoneNumbers()

  // Use mutation hooks with cache invalidation
  const createCustomerMutation = useCreateCustomer()
  const updateCustomerMutation = useUpdateCustomer()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pipelinesRes, fieldsRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/pipelines`, { credentials: 'include' }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/custom-fields`, { credentials: 'include' })
        ])

        const pipelinesData = await pipelinesRes.json()
        const fieldsData = await fieldsRes.json()

        if (pipelinesData.success && pipelinesData.data.length > 0) {
          // Flatten stages from all pipelines or just use default
          const defaultPipeline = pipelinesData.data.find((p: any) => p.isDefault) || pipelinesData.data[0]
          setStages(defaultPipeline.stages)
        }

        if (fieldsData.success) {
          setCustomFieldDefs(fieldsData.data)
        }
      } catch (error) {
        console.error("Failed to fetch CRM data", error)
      }
    }
    fetchData()
  }, [])

  const form = useForm<CustomerForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phoneNumber: "",
      email: "",
      whatsappPhoneNumberId: whatsappPhoneNumbers[0]?.id || "",
      consentStatus: "NOT_CONSENTED",
      tags: [],
      pipelineStageId: "",
      customFields: {},
    },
  })

  // Update form values when currentRow changes
  useEffect(() => {
    if (currentRow && open) {
      // Ensure phone number has + prefix
      const phoneNumber = currentRow.phoneNumber?.startsWith('+')
        ? currentRow.phoneNumber
        : `+${currentRow.phoneNumber}`

      form.reset({
        name: currentRow.name,
        phoneNumber: phoneNumber,
        email: currentRow.email || "",
        whatsappPhoneNumberId: currentRow.whatsappPhoneNumberId || whatsappPhoneNumbers[0]?.id || "",
        consentStatus: currentRow.consentStatus,
        tags: currentRow.tags,
        pipelineStageId: currentRow.pipelineStageId || "",
        customFields: currentRow.customFields?.reduce((acc: any, curr: any) => {
          acc[curr.fieldDefinition.key] = curr.value
          return acc
        }, {}) || {},
      })
      setCurrentTags(currentRow.tags || [])
    } else if (!currentRow && open) {
      form.reset({
        name: "",
        phoneNumber: "",
        email: "",
        whatsappPhoneNumberId: whatsappPhoneNumbers[0]?.id || "",
        consentStatus: "NOT_CONSENTED",
        tags: [],
        pipelineStageId: "",
        customFields: {},
      })
      setCurrentTags([])
    }
  }, [currentRow, open, form, whatsappPhoneNumbers])

  const handleAddTag = () => {
    if (tagInput.trim() && !currentTags.includes(tagInput.trim())) {
      const newTags = [...currentTags, tagInput.trim()]
      setCurrentTags(newTags)
      form.setValue("tags", newTags)
      setTagInput("")
    }
  }

  const handleRemoveTag = (tag: string) => {
    const newTags = currentTags.filter((t) => t !== tag)
    setCurrentTags(newTags)
    form.setValue("tags", newTags)
  }

  const onSubmit = async (data: CustomerForm) => {
    try {
      // Transform custom fields from form data (key-value) to API format (array of objects)
      const formattedCustomFields = Object.entries(data.customFields || {}).map(([key, value]) => {
        const def = customFieldDefs.find(d => d.key === key)
        return def ? { fieldDefinitionId: def.id, value } : null
      }).filter(Boolean)

      if (isUpdate && currentRow) {
        // Use update mutation with cache invalidation
        await updateCustomerMutation.mutateAsync({
          id: currentRow.id,
          data: {
            name: data.name,
            email: data.email || null,
            pipelineStageId: data.pipelineStageId || null,
          }
        })
        toast({
          title: "Success",
          description: "Customer updated successfully",
        })
      } else {
        // Use create mutation with cache invalidation
        await createCustomerMutation.mutateAsync({
          phoneNumber: data.phoneNumber,
          name: data.name,
          whatsappPhoneNumberId: data.whatsappPhoneNumberId,
          consentStatus: data.consentStatus === "CONSENTED",
          consentSource: "Admin Dashboard",
        })
        toast({
          title: "Success",
          description: "Customer created successfully",
        })
      }

      onOpenChange(false)
      form.reset()
      setCurrentTags([])
      // No need to reload - cache invalidation will trigger refetch
    } catch (error) {
      console.error("Error saving customer:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save customer",
        variant: "destructive",
      })
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
          setCurrentTags([])
        }
      }}
    >
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {isUpdate ? "Update" : "Add"} Customer
          </SheetTitle>
          <SheetDescription>
            {isUpdate
              ? "Update customer information and consent status."
              : "Add a new customer to your WhatsApp Business contact list."}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id="customers-form"
            onSubmit={form.handleSubmit(
              onSubmit
            )}
            className="flex-1 space-y-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp Phone Number *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+628123456789"
                      {...field}
                      readOnly={isUpdate}
                      className={isUpdate ? "bg-muted cursor-not-allowed" : ""}
                      onChange={(e) => {
                        if (!isUpdate) {
                          // Remove spaces and ensure starts with +
                          let value = e.target.value.trim().replace(/\s/g, "")
                          if (value && !value.startsWith("+")) {
                            value = "+" + value
                          }
                          field.onChange(value)
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Format: +[country code][number]. Example: +628123456789 (Indonesia)
                    {isUpdate && " • Cannot be changed after creation"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isUpdate && (
              <FormField
                control={form.control}
                name="whatsappPhoneNumberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp Account *</FormLabel>
                    {isLoadingPhoneNumbers ? (
                      <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                    ) : whatsappPhoneNumbers.length > 0 ? (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select WhatsApp account" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {whatsappPhoneNumbers.map((pn) => (
                            <SelectItem key={pn.id} value={pn.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">{pn.displayPhoneNumber}</span>
                                {pn.verifiedName && (
                                  <span className="text-xs text-muted-foreground">{pn.verifiedName}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-center">
                        <p className="text-sm text-destructive">
                          No connected WhatsApp accounts found. Please connect a WhatsApp account first.
                        </p>
                      </div>
                    )}
                    <FormDescription>
                      Customer will be associated with this WhatsApp business number
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isUpdate && (
              <FormField
                control={form.control}
                name="consentStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial Consent Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select consent status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CONSENTED">
                          <div>
                            <div className="font-medium">Consented</div>
                            <div className="text-muted-foreground text-xs">
                              Customer agreed to receive messages
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="NOT_CONSENTED">
                          <div>
                            <div className="font-medium">Not Consented</div>
                            <div className="text-muted-foreground text-xs">
                              Only transactional messages
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Only set to &quot;Consented&quot; if customer explicitly agreed
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isUpdate && currentRow && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Marketing Consent</label>
                <div className="rounded-md border border-muted bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {currentRow.consentStatus === "CONSENTED" && "Consented"}
                        {currentRow.consentStatus === "NOT_CONSENTED" && "Not Consented"}
                        {currentRow.consentStatus === "REVOKED" && "Revoked"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {currentRow.consentStatus === "CONSENTED" && "Customer agreed to receive marketing messages"}
                        {currentRow.consentStatus === "NOT_CONSENTED" && "Only transactional messages allowed"}
                        {currentRow.consentStatus === "REVOKED" && "Customer opted out"}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  Consent status can only be changed by the customer. Use the &quot;Manage Consent&quot; action to send consent request.
                </p>
              </div>
            )}

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags (Optional)</FormLabel>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add tag..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddTag()
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleAddTag}
                      >
                        Add
                      </Button>
                    </div>
                    {currentTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {currentTags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag)}
                              className="ml-1 hover:text-destructive"
                            >
                              <IconX className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <FormDescription>
                    Press Enter or click Add to create tags
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pipelineStageId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pipeline Stage</FormLabel>
                  {stages.length > 0 ? (
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-md border border-dashed p-3 text-center">
                      <p className="text-sm text-muted-foreground mb-2">
                        No pipeline stages configured
                      </p>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/crm/pipeline?tab=settings">
                          <IconSettings className="h-4 w-4 mr-1" />
                          Configure Pipeline
                        </Link>
                      </Button>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {customFieldDefs.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-medium">Custom Fields</h4>
                {customFieldDefs.map((def) => (
                  <FormField
                    key={def.id}
                    control={form.control}
                    name={`customFields.${def.key}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {def.name}
                          {def.required && <span className="text-destructive"> *</span>}
                        </FormLabel>
                        <FormControl>
                          {def.type === 'BOOLEAN' ? (
                            <Switch
                              checked={field.value === 'true' || field.value === true}
                              onCheckedChange={field.onChange}
                            />
                          ) : (
                            <Input
                              {...field}
                              type={def.type === 'NUMBER' ? 'number' : 'text'}
                              value={field.value || ''}
                            />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}
          </form>
        </Form>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="button" variant="outline" size="sm">
              Cancel
            </Button>
          </SheetClose>
          <Button type="submit" form="customers-form" size="sm">
            {isUpdate ? "Update Customer" : "Add Customer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
