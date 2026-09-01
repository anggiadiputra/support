"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  IconDeviceFloppy,
  IconAlertCircle,
  IconCircleCheck,
  IconInfoCircle,
  IconHeartbeat,
} from "@tabler/icons-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

type PaymentProvider = "duitku" | "xendit"

interface ProviderInfo {
  providerId: string
  displayName: string
  paymentMethods: string[]
  isConfigured: boolean
  isDefault: boolean
  health: {
    status: "healthy" | "degraded" | "unhealthy"
    message: string | null
    lastChecked: string
  } | null
}

interface ProvidersResponse {
  providers: ProviderInfo[]
  totalProviders: number
  configuredProviders: number
}

export function PaymentGatewaySettings() {
  const [defaultProvider, setDefaultProvider] = useState<PaymentProvider>("duitku")
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isCheckingHealth, setIsCheckingHealth] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/payment/providers`, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch payment providers")
      }

      const result = await response.json()

      if (result.success) {
        const data = result.data as ProvidersResponse
        setProviders(data.providers || [])
        
        // Find the default provider
        const defaultProv = data.providers.find((p: ProviderInfo) => p.isDefault)
        if (defaultProv) {
          setDefaultProvider(defaultProv.providerId as PaymentProvider)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveResult(null)

      // Update the default_provider in duitku settings category
      // This is where the gateway manager reads the default provider from
      const response = await fetch(`${API_URL}/api/v1/admin/settings/duitku`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ default_provider: defaultProvider }),
      })

      const result = await response.json()

      if (!response.ok) {
        setSaveResult({
          success: false,
          message: result.error?.message || "Failed to update default provider",
        })
        return
      }

      setSaveResult({
        success: true,
        message: "Default payment provider updated successfully",
      })
      
      // Refresh providers to update isDefault status
      await fetchProviders()
    } catch (err) {
      setSaveResult({
        success: false,
        message: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const checkHealth = async (providerId: string) => {
    try {
      setIsCheckingHealth(providerId)

      const response = await fetch(`${API_URL}/api/v1/payment/providers/${providerId}/health`, {
        credentials: "include",
      })

      const result = await response.json()

      if (result.success) {
        // Update the provider's health status in the list
        setProviders((prev) =>
          prev.map((p) =>
            p.providerId === providerId
              ? { ...p, health: result.data.health }
              : p
          )
        )
      }
    } catch (err) {
      console.error("Health check failed:", err)
    } finally {
      setIsCheckingHealth(null)
    }
  }

  const getHealthBadge = (provider: ProviderInfo) => {
    if (!provider.health) return null

    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      healthy: "default",
      degraded: "secondary",
      unhealthy: "destructive",
    }

    return (
      <Badge variant={variants[provider.health.status] || "secondary"}>
        {provider.health.status}
      </Badge>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Gateway Configuration</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Gateway Configuration</CardTitle>
        <CardDescription>
          Select the default payment provider and monitor provider health
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <IconAlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {saveResult && (
          <Alert variant={saveResult.success ? "default" : "destructive"}>
            {saveResult.success ? (
              <IconCircleCheck className="h-4 w-4" />
            ) : (
              <IconAlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{saveResult.message}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="default-provider">Default Payment Provider</Label>
            <Select
              value={defaultProvider}
              onValueChange={(v) => {
                setDefaultProvider(v as PaymentProvider)
                setSaveResult(null)
              }}
            >
              <SelectTrigger id="default-provider">
                <SelectValue placeholder="Select default provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="duitku">Duitku</SelectItem>
                <SelectItem value="xendit">Xendit</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This provider will be used for new payment transactions
            </p>
          </div>

          <div className="grid gap-3">
            <Label>Available Providers</Label>
            <div className="space-y-2">
              {providers.length === 0 ? (
                <Alert>
                  <IconInfoCircle className="h-4 w-4" />
                  <AlertDescription>
                    No payment providers configured. Configure Duitku or Xendit below.
                  </AlertDescription>
                </Alert>
              ) : (
                providers.map((provider) => (
                  <div
                    key={provider.providerId}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{provider.displayName}</span>
                        {provider.isConfigured ? (
                          <Badge variant="default">Configured</Badge>
                        ) : (
                          <Badge variant="secondary">Not Configured</Badge>
                        )}
                        {provider.isDefault && (
                          <Badge variant="outline">Default</Badge>
                        )}
                        {getHealthBadge(provider)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Methods: {provider.paymentMethods.join(", ")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => checkHealth(provider.providerId)}
                      disabled={isCheckingHealth === provider.providerId || !provider.isConfigured}
                    >
                      <IconHeartbeat className={`h-4 w-4 ${isCheckingHealth === provider.providerId ? "animate-pulse" : ""}`} />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Default Provider"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
