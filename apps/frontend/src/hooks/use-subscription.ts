import { useQuery } from "@tanstack/react-query"
import {
  subscriptionApi,
  type SubscriptionData,
  type SubscriptionTier,
  type SubscriptionStatus,
  type ChannelLimits,
  type ChannelUsage,
} from "@/lib/api/subscription-api"
import { queryKeys } from "@/lib/query-keys"
import { CACHE_TIMES } from "@/lib/cache-config"

type FeatureKey = keyof SubscriptionData["features"]
type ResourceKey = keyof SubscriptionData["usage"]
type ChannelKey = keyof SubscriptionData["channelUsage"]

// Map resource keys to their limit keys
const resourceToLimitMap: Record<ResourceKey, keyof SubscriptionData["limits"]> = {
  knowledgeDocs: "maxKnowledgeDocs",
  agents: "maxAgents",
  apiKeys: "maxApiKeys",
  webhookEndpoints: "maxWebhookEndpoints",
}

// Human-readable labels for resources
const resourceLabels: Record<ResourceKey, string> = {
  knowledgeDocs: "Knowledge Docs",
  agents: "Agents",
  apiKeys: "API Keys",
  webhookEndpoints: "Webhooks",
}

// Map channel keys to their limit keys
const channelToLimitMap: Record<ChannelKey, keyof ChannelLimits> = {
  whatsappDevices: "maxWhatsappDevices",
  instagramAccounts: "maxInstagramAccounts",
  messengerAccounts: "maxMessengerAccounts",
}

// Human-readable labels for channels
const channelLabels: Record<ChannelKey, string> = {
  whatsappDevices: "WhatsApp",
  instagramAccounts: "Instagram",
  messengerAccounts: "Messenger",
}

export interface UseSubscriptionReturn {
  tier: SubscriptionTier
  status: SubscriptionStatus
  expiresAt: string | null
  features: SubscriptionData["features"]
  limits: SubscriptionData["limits"]
  usage: SubscriptionData["usage"]
  channelLimits: SubscriptionData["channelLimits"]
  channelUsage: SubscriptionData["channelUsage"]

  /** Check if a feature is enabled for the current subscription */
  hasFeature: (feature: FeatureKey) => boolean
  /** Check if user can create more of a resource (under limit) */
  canCreate: (resource: ResourceKey) => boolean
  /** Get formatted usage text like "2/3 API Keys" */
  getUsageText: (resource: ResourceKey) => string
  /** Check if user can add more channels (under limit) */
  canAddChannel: (channel: ChannelKey) => boolean
  /** Get formatted channel usage text like "1/2" */
  getChannelUsageText: (channel: ChannelKey) => string

  isLoading: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void
}

const defaultData: SubscriptionData = {
  tier: "FREE",
  status: "ACTIVE",
  expiresAt: null,
  features: {
    aiChatbot: false,
    apiAccess: false,
    webhooksEnabled: false,
  },
  limits: {
    maxKnowledgeDocs: 0,
    maxAgents: 0,
    maxApiKeys: 0,
    maxWebhookEndpoints: 0,
  },
  usage: {
    knowledgeDocs: 0,
    agents: 0,
    apiKeys: 0,
    webhookEndpoints: 0,
  },
  channelLimits: {
    maxWhatsappDevices: 1,
    maxInstagramAccounts: 1,
    maxMessengerAccounts: 1,
  },
  channelUsage: {
    whatsappDevices: 0,
    instagramAccounts: 0,
    messengerAccounts: 0,
  },
}

export function useSubscription(): UseSubscriptionReturn {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.subscription.status(),
    queryFn: subscriptionApi.get,
    ...CACHE_TIMES.subscription,
    placeholderData: (previousData) => previousData,
    retry: 1,
  })

  const subscription = data ?? defaultData

  const hasFeature = (feature: FeatureKey): boolean => {
    return subscription.features[feature] ?? false
  }

  const canCreate = (resource: ResourceKey): boolean => {
    const limitKey = resourceToLimitMap[resource]
    const limit = subscription.limits[limitKey]
    const current = subscription.usage[resource]
    return current < limit
  }

  const getUsageText = (resource: ResourceKey): string => {
    const limitKey = resourceToLimitMap[resource]
    const limit = subscription.limits[limitKey]
    const current = subscription.usage[resource]
    const label = resourceLabels[resource]
    return `${current}/${limit} ${label}`
  }

  const canAddChannel = (channel: ChannelKey): boolean => {
    const limitKey = channelToLimitMap[channel]
    const limit = subscription.channelLimits[limitKey]
    const current = subscription.channelUsage[channel]
    return current < limit
  }

  const getChannelUsageText = (channel: ChannelKey): string => {
    const limitKey = channelToLimitMap[channel]
    const limit = subscription.channelLimits[limitKey]
    const current = subscription.channelUsage[channel]
    return `${current}/${limit}`
  }

  return {
    tier: subscription.tier,
    status: subscription.status,
    expiresAt: subscription.expiresAt,
    features: subscription.features,
    limits: subscription.limits,
    usage: subscription.usage,
    channelLimits: subscription.channelLimits,
    channelUsage: subscription.channelUsage,
    hasFeature,
    canCreate,
    getUsageText,
    canAddChannel,
    getChannelUsageText,
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
  }
}
