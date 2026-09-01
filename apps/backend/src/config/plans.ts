import { SubscriptionTier } from '@prisma/client'

export interface PlanLimits {
  aiChatbot: boolean
  maxKnowledgeDocs: number
  maxAgents: number
  // Developer Features
  apiAccess: boolean
  webhooksEnabled: boolean
  maxApiKeys: number
  maxWebhookEndpoints: number
  // Team Features
  maxTeamMembers: number
  // Message Retention
  messageRetentionDays: number
  // Channel Limits
  maxWhatsappDevices: number
  maxInstagramAccounts: number
  maxMessengerAccounts: number
}

export const PLAN_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  [SubscriptionTier.FREE]: {
    aiChatbot: false,
    maxKnowledgeDocs: 0,
    maxAgents: 0,
    apiAccess: false,
    webhooksEnabled: false,
    maxApiKeys: 0,
    maxWebhookEndpoints: 0,
    maxTeamMembers: 0,
    messageRetentionDays: 7,
    maxWhatsappDevices: 1,
    maxInstagramAccounts: 1,
    maxMessengerAccounts: 1
  },
  [SubscriptionTier.BASIC]: {
    aiChatbot: false,
    maxKnowledgeDocs: 0,
    maxAgents: 0,
    apiAccess: true,
    webhooksEnabled: true,
    maxApiKeys: 2,
    maxWebhookEndpoints: 3,
    maxTeamMembers: 2,
    messageRetentionDays: 30,
    maxWhatsappDevices: 2,
    maxInstagramAccounts: 2,
    maxMessengerAccounts: 2
  },
  [SubscriptionTier.LITE]: {
    aiChatbot: true,
    maxKnowledgeDocs: 5,
    maxAgents: 1,
    apiAccess: true,
    webhooksEnabled: true,
    maxApiKeys: 5,
    maxWebhookEndpoints: 3,
    maxTeamMembers: 5,
    messageRetentionDays: 30,
    maxWhatsappDevices: 3,
    maxInstagramAccounts: 3,
    maxMessengerAccounts: 3
  },
  [SubscriptionTier.PRO]: {
    aiChatbot: true,
    maxKnowledgeDocs: 50,
    maxAgents: 10,
    apiAccess: true,
    webhooksEnabled: true,
    maxApiKeys: 10,
    maxWebhookEndpoints: 20,
    maxTeamMembers: 10,
    messageRetentionDays: 30,
    maxWhatsappDevices: 10,
    maxInstagramAccounts: 10,
    maxMessengerAccounts: 10
  }
}