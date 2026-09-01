"use client"

import { useState } from "react"
import { BrainCircuit, Loader2 } from "lucide-react"
import { useSession } from "@/lib/auth-client"
import { useAIConfig, useAIDocuments, useAIAgents } from "@/hooks/use-ai"
import { useWhatsAppPhoneNumbers } from "@/hooks/use-whatsapp-phone-numbers"
import { RoleGuard } from "@/components/auth/role-guard"
import { Header } from "@/components/layout/header"
import { UpgradePrompt } from "@/components/subscription/upgrade-prompt"
import { AgentsList } from "./components/agents-list"
import { AISidebar, type AITabValue } from "./components/ai-sidebar"
import { ChatTest } from "./components/chat-test"
import { EscalationSettings } from "./components/escalation-settings"
import { FilterSettings } from "./components/filter-settings"
import { GeneralSettings } from "./components/general-settings"
import { HelpSection } from "./components/help-section"
import { KnowledgeBase } from "./components/knowledge-base"
import { MemoryManagement } from "./components/memory-management"
import { WorkingHoursSettings } from "./components/working-hours-settings"

export default function AIPage() {
  const [activeTab, setActiveTab] = useState<AITabValue>("settings")
  const { data: session, isPending } = useSession()

  // Multi-number support — phone numbers passed to AgentsList for assignment
  const { phoneNumbers } = useWhatsAppPhoneNumbers()

  // Get subscription tier
  const user = session?.user as any
  const tier = user?.subscriptionTier || user?.subscription?.tier || "FREE"
  const isRestrictedUser = tier === "FREE" || tier === "BASIC"

  // Only fetch data if user has access
  const shouldFetchData = !isPending && !isRestrictedUser

  // TanStack Query hooks
  const { data: configData, isLoading: isLoadingConfig } = useAIConfig(
    undefined,
    shouldFetchData
  )
  const { data: documents = [], isLoading: isLoadingDocs } =
    useAIDocuments(shouldFetchData)
  const { data: agents = [], isLoading: isLoadingAgents } =
    useAIAgents(shouldFetchData)

  const config = configData?.data || {
    enabled: false,
    model: "gpt-4.1-nano-2025-04-14",
    systemPrompt: "",
    temperature: 0.7,
    filterWords: [],
  }

  const loading = isLoadingConfig || isLoadingDocs || isLoadingAgents

  // Check loading state (both initial and session)
  if (loading || isPending) {
    return (
      <>
        <Header />
        <div className="flex h-full items-center justify-center p-8">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </>
    )
  }

  // Locked content component for FREE users
  const LockedContent = () => (
    <div className="max-w-md">
      <UpgradePrompt
        feature="aiChatbot"
        currentTier={tier}
        requiredTier="LITE"
      />
    </div>
  )

  // Render content based on active tab
  const renderContent = () => {
    if (isRestrictedUser && activeTab !== "help") {
      return <LockedContent />
    }

    switch (activeTab) {
      case "settings":
        return <GeneralSettings initialConfig={config} agents={agents} />
      case "agents":
        return (
          <AgentsList
            agents={agents}
            documents={documents}
            phoneNumbers={phoneNumbers}
          />
        )
      case "knowledge":
        return <KnowledgeBase documents={documents} />
      case "test":
        return <ChatTest agents={agents} />
      case "memory":
        return <MemoryManagement phoneNumbers={phoneNumbers} />
      case "filter":
        return <FilterSettings initialConfig={config} phoneNumbers={phoneNumbers} />
      case "working-hours":
        return (
          <WorkingHoursSettings
            initialConfig={config}
            phoneNumbers={phoneNumbers}
          />
        )
      case "escalation":
        return (
          <EscalationSettings
            initialConfig={config}
            phoneNumbers={phoneNumbers}
          />
        )
      case "help":
        return <HelpSection />
      default:
        return null
    }
  }

  return (
    <RoleGuard>
      <Header />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-foreground flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <BrainCircuit className="h-7 w-7" />
            AI Auto-Reply
          </h2>
          <p className="text-muted-foreground">
            Configure your AI assistant and manage its knowledge base.
          </p>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* Mini Sidebar (desktop) / Dropdown (mobile) */}
          <AISidebar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Content Area */}
          <div className="min-w-0 flex-1 space-y-6">{renderContent()}</div>
        </div>
      </div>
    </RoleGuard>
  )
}
