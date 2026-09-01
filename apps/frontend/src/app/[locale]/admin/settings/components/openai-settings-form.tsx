"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { SensitiveInput } from "./sensitive-input"
import { useAdminSettings } from "../../hooks/use-admin-settings"
import { Input } from "@/components/ui/input"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconRefresh,
  IconPlugConnected,
  IconDeviceFloppy,
  IconAlertCircle,
  IconCircleCheck,
  IconInfoCircle,
  IconDownload,
} from "@tabler/icons-react"

interface OpenAISettings {
  apiKey: string
  baseUrl: string
  defaultChatModel: string
  embeddingModel: string
  enabled: boolean
}

interface ModelInfo {
  id: string
  owned_by: string
}

const defaultSettings: OpenAISettings = {
  apiKey: "",
  baseUrl: "",
  defaultChatModel: "",
  embeddingModel: "",
  enabled: false,
}

const DEFAULT_CHAT_MODEL = "gpt-4.1-nano-2025-04-14"
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"

// Check if a model ID looks like an embedding model
const isEmbeddingModel = (modelId: string) => {
  const lower = modelId.toLowerCase()
  return lower.includes("embed") || lower.includes("embedding")
}

export function OpenAISettingsForm() {
  const {
    settings,
    source,
    isLoading,
    error,
    updateSettings,
    testConnection,
    resetToDefault,
    isUpdating,
    isTesting,
    isResetting,
  } = useAdminSettings<OpenAISettings>("openai")

  const [formData, setFormData] = useState<OpenAISettings>(defaultSettings)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)

  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  const handleFetchModels = async () => {
    setIsFetchingModels(true)
    try {
      const response = await fetch(`${API_URL}/api/v1/admin/settings/openai/models`, {
        credentials: "include",
      })
      const data = await response.json()
      if (data.success && data.data?.models) {
        setAvailableModels(data.data.models)
      } else {
        setTestResult({ success: false, message: data.error?.message || "Failed to fetch models" })
      }
    } catch (error) {
      setTestResult({ success: false, message: "Failed to fetch models from API" })
    } finally {
      setIsFetchingModels(false)
    }
  }

  const handleChatModelChange = (value: string) => {
    setFormData((prev) => ({ ...prev, defaultChatModel: value }))
    setSaveResult(null)
  }

  const handleEmbeddingModelChange = (value: string) => {
    setFormData((prev) => ({ ...prev, embeddingModel: value }))
    setSaveResult(null)
  }

  const handleChange = (field: keyof OpenAISettings) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }))
    setSaveResult(null)
  }

  const handleEnabledChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, enabled: checked }))
    setSaveResult(null)
  }

  const handleSave = async () => {
    setSaveResult(null)
    setTestResult(null)
    const result = await updateSettings(formData)
    setSaveResult(result)
  }

  const handleTest = async () => {
    setTestResult(null)
    const result = await testConnection()
    setTestResult(result)
  }

  const handleReset = async () => {
    setSaveResult(null)
    setTestResult(null)
    const result = await resetToDefault()
    if (result.success) {
      setSaveResult({ success: true, message: "Settings reset to .env defaults" })
    } else {
      setSaveResult(result)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>OpenAI Configuration</CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>OpenAI Configuration</CardTitle>
        <CardDescription>
          Configure OpenAI or OpenAI-compatible API for AI features
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {source && (
          <Alert variant={source === "database" ? "default" : "destructive"}>
            <IconInfoCircle className="h-4 w-4" />
            <AlertDescription>
              {source === "database"
                ? "Settings loaded from database"
                : "Settings loaded from .env (database unavailable or empty)"}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <IconAlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? (
              <IconCircleCheck className="h-4 w-4" />
            ) : (
              <IconAlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{testResult.message}</AlertDescription>
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
          <div className="flex items-center space-x-2">
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={handleEnabledChange}
            />
            <Label htmlFor="enabled">Enable AI Features</Label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <SensitiveInput
              id="apiKey"
              value={formData.apiKey}
              onChange={handleChange("apiKey")}
              placeholder="sk-..."
              isMasked={formData.apiKey?.includes("****")}
              disabled={!formData.enabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="baseUrl">Base URL (Optional)</Label>
            <Input
              id="baseUrl"
              value={formData.baseUrl}
              onChange={handleChange("baseUrl")}
              placeholder="https://api.openai.com/v1"
              disabled={!formData.enabled}
            />
            <p className="text-sm text-muted-foreground">
              Leave empty for OpenAI. Use custom URL for OpenAI-compatible providers (LM Studio, Ollama, Azure, etc.)
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="defaultChatModel">Default Chat Model</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleFetchModels}
                disabled={!formData.enabled || isFetchingModels}
              >
                <IconDownload className="mr-1 h-3 w-3" />
                {isFetchingModels ? "Fetching..." : "Fetch Models"}
              </Button>
            </div>
            {(() => {
              const chatModels = availableModels.filter((m) => !isEmbeddingModel(m.id))

              if (chatModels.length > 0) {
                return (
                  <Select
                    value={formData.defaultChatModel || DEFAULT_CHAT_MODEL}
                    onValueChange={handleChatModelChange}
                    disabled={!formData.enabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select chat model" />
                    </SelectTrigger>
                    <SelectContent>
                      {chatModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }

              return (
                <Input
                  id="defaultChatModel"
                  value={formData.defaultChatModel}
                  onChange={handleChange("defaultChatModel")}
                  placeholder={DEFAULT_CHAT_MODEL}
                  disabled={!formData.enabled}
                />
              )
            })()}
            <p className="text-sm text-muted-foreground">
              Default model for AI chatbot responses. All users will use this model. Default: {DEFAULT_CHAT_MODEL}
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="embeddingModel">Embedding Model</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleFetchModels}
                disabled={!formData.enabled || isFetchingModels}
              >
                <IconDownload className="mr-1 h-3 w-3" />
                {isFetchingModels ? "Fetching..." : "Fetch Models"}
              </Button>
            </div>
            {(() => {
              const embeddingModels = availableModels.filter(
                (m) => m.id.toLowerCase().includes("embed") || m.id.toLowerCase().includes("embedding")
              )

              if (embeddingModels.length > 0) {
                return (
                  <Select
                    value={formData.embeddingModel || DEFAULT_EMBEDDING_MODEL}
                    onValueChange={handleEmbeddingModelChange}
                    disabled={!formData.enabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select embedding model" />
                    </SelectTrigger>
                    <SelectContent>
                      {embeddingModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }

              return (
                <Input
                  id="embeddingModel"
                  value={formData.embeddingModel}
                  onChange={handleChange("embeddingModel")}
                  placeholder={DEFAULT_EMBEDDING_MODEL}
                  disabled={!formData.enabled}
                />
              )
            })()}
            <p className="text-sm text-muted-foreground">
              Model for generating document embeddings (NOT for chat). Default: {DEFAULT_EMBEDDING_MODEL}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || isUpdating || !formData.enabled}
          >
            <IconPlugConnected className="mr-2 h-4 w-4" />
            {isTesting ? "Testing..." : "Test API Key"}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isResetting || isUpdating}
          >
            <IconRefresh className="mr-2 h-4 w-4" />
            {isResetting ? "Resetting..." : "Reset to Default"}
          </Button>
          <Button onClick={handleSave} disabled={isUpdating}>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {isUpdating ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
