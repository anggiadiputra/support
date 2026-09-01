"use client"

import { useState, useEffect } from "react"
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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Save, AlertCircle } from "lucide-react"
import type { AIConfig, AIAgent } from "@/lib/api/ai-api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { useUpdateAIConfig } from "@/hooks/use-ai"

interface GeneralSettingsProps {
  initialConfig: AIConfig
  agents: AIAgent[]
}

export function GeneralSettings({
  initialConfig,
  agents,
}: GeneralSettingsProps) {
  const { toast } = useToast()
  const [config, setConfig] = useState<AIConfig>(initialConfig)
  const updateConfig = useUpdateAIConfig()

  // Sync with initial config when it changes
  useEffect(() => {
    setConfig(initialConfig)
  }, [initialConfig])

  const handleSave = () => {
    updateConfig.mutate(
      { data: config },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: "AI settings saved successfully",
          })
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to save settings",
          })
        },
      }
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
        <CardDescription>
          Control how the AI behaves and responds to customers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between space-x-4 border-b pb-4">
          <div className="space-y-0.5">
            <Label className="text-base">Enable AI Auto-Reply</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, the AI will attempt to answer incoming messages using the knowledge base.
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) =>
              setConfig({ ...config, enabled: checked })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>Active Agent</Label>
          <Select
            value={config.activeAgentId || "none"}
            onValueChange={(value) =>
              setConfig({ ...config, activeAgentId: value === "none" ? undefined : value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an agent..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (Disabled)</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Select which AI agent should handle incoming messages.
          </p>
        </div>

        {!config.activeAgentId && config.enabled && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You must select an active agent for the AI to work, even if it is enabled.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="temperature">Temperature ({config.temperature})</Label>
          <Input
            id="temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={config.temperature}
            onChange={(e) =>
              setConfig({
                ...config,
                temperature: parseFloat(e.target.value),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Higher values make output more random, lower values more deterministic.
          </p>
        </div>

        <Button size="sm" onClick={handleSave} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
