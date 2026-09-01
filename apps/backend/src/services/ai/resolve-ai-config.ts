/**
 * AI Config Resolution Helper
 *
 * Resolves the effective AI configuration for a user, optionally scoped
 * to a specific WhatsApp account. Per-account config takes priority,
 * falling back to the user-level default AIConfig.
 * 
 * IMPORTANT: Global AIConfig.enabled acts as a master switch.
 * If global is disabled, AI will not respond even if per-account is enabled.
 */

import { prisma } from '../../utils/database.js';

export interface ResolvedAIConfig {
  enabled: boolean;
  activeAgentId: string | null;
  temperature: number;
  filterWords: any;
  excludedCustomers: any;
  timezone: string;
  workingHours: any;
  escalationKeywords: any;
  escalationAutoAssign: boolean;
  source: 'whatsapp_account' | 'user_default';
}

/**
 * Resolve AI config for a given user, optionally scoped to a WhatsApp account.
 *
 * Priority:
 * 1. Check global AIConfig.enabled first - if disabled, return enabled: false
 *    (Global setting acts as master switch)
 * 2. WhatsAppAccountAIConfig (per-account override) if whatsappAccountId is provided
 * 3. If whatsappAccountId is provided but no per-account config exists → return null
 *    (AI is not assigned to this number, so it should not respond)
 * 4. AIConfig (user-level default) only when no whatsappAccountId is specified
 *    (used for test-chat and other non-number-specific contexts)
 */
export async function resolveAIConfig(
  userId: string,
  whatsappAccountId?: string | null
): Promise<ResolvedAIConfig | null> {
  // 0. Check global AIConfig first - acts as master switch
  const globalConfig = await prisma.aIConfig.findUnique({
    where: { userId },
    select: { enabled: true },
  });

  // If global AI is disabled, return early with enabled: false
  // This ensures the global toggle works as a master switch
  const isGloballyDisabled = globalConfig && !globalConfig.enabled;

  // 1. Try per-account config if whatsappAccountId is given
  if (whatsappAccountId) {
    const accountConfig = await prisma.whatsAppAccountAIConfig.findUnique({
      where: {
        userId_whatsappAccountId: { userId, whatsappAccountId },
      },
    });

    if (accountConfig) {
      // Type assertion needed until Prisma client is regenerated with new fields
      const config = accountConfig as typeof accountConfig & {
        timezone?: string;
        workingHours?: any;
        escalationKeywords?: any;
        escalationAutoAssign?: boolean;
        excludedCustomers?: any;
      };
      return {
        // Global disabled overrides per-account enabled
        enabled: isGloballyDisabled ? false : config.enabled,
        activeAgentId: config.activeAgentId,
        temperature: config.temperature,
        filterWords: config.filterWords,
        excludedCustomers: config.excludedCustomers ?? null,
        timezone: config.timezone ?? 'Asia/Jakarta',
        workingHours: config.workingHours ?? null,
        escalationKeywords: config.escalationKeywords ?? null,
        escalationAutoAssign: config.escalationAutoAssign ?? true,
        source: 'whatsapp_account',
      };
    }

    // No per-account config for this number → AI not assigned, don't respond
    return null;
  }

  // 2. Fall back to user-level AIConfig (only when no whatsappAccountId specified)
  const userConfig = await prisma.aIConfig.findUnique({
    where: { userId },
  });

  if (!userConfig) return null;

  // Type assertion needed until Prisma client is regenerated with new fields
  const config = userConfig as typeof userConfig & {
    timezone?: string;
    workingHours?: any;
    escalationKeywords?: any;
    escalationAutoAssign?: boolean;
    excludedCustomers?: any;
  };

  return {
    enabled: config.enabled,
    activeAgentId: config.activeAgentId,
    temperature: config.temperature,
    filterWords: config.filterWords,
    excludedCustomers: config.excludedCustomers ?? null,
    timezone: config.timezone ?? 'Asia/Jakarta',
    workingHours: config.workingHours ?? null,
    escalationKeywords: config.escalationKeywords ?? null,
    escalationAutoAssign: config.escalationAutoAssign ?? true,
    source: 'user_default',
  };
}
