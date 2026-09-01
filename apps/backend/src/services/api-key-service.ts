import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { prisma } from '../utils/database.js';
import { cacheRedis, CACHE_TTL } from '../utils/cache.js';

/**
 * Input for creating a new API key
 */
export interface CreateApiKeyInput {
  userId: string;
  name: string;
  expiresInDays?: number; // Default 365
}

/**
 * API key response (without full key value)
 */
export interface ApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  key?: string; // Only returned on creation
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/**
 * Validated API key result
 */
export interface ValidatedApiKey {
  userId: string;
  apiKeyId: string;
}

// Cache TTL for validated API keys (5 minutes)
const API_KEY_CACHE_TTL = 300;

// API key prefix - configurable via environment variable
// Default: 'kc' for KirimChat, can be changed to match branding (e.g., 'otk' for Otika)
const API_KEY_PREFIX = `${process.env.API_KEY_PREFIX || 'kc'}_live_`;

// Legacy prefix for backward compatibility with existing keys
const LEGACY_API_KEY_PREFIX = 'kc_live_';

/**
 * Check if API key has valid prefix (current or legacy)
 */
function hasValidPrefix(apiKey: string): boolean {
  return apiKey.startsWith(API_KEY_PREFIX) || apiKey.startsWith(LEGACY_API_KEY_PREFIX);
}

/**
 * ApiKeyService
 * 
 * Handles API key generation, validation, and management for the Public API.
 * Uses SHA-256 hashing for secure storage and Redis caching for performance.
 */
export class ApiKeyService {
  /**
   * Generate a cryptographically secure API key
   * Creates a 256-bit (32 bytes) random key with prefix
   * 
   * @returns The full API key string
   */
  private generateKey(): string {
    const randomPart = randomBytes(32).toString('base64url');
    return `${API_KEY_PREFIX}${randomPart}`;
  }

  /**
   * Hash an API key using SHA-256
   * 
   * @param apiKey - The full API key to hash
   * @returns SHA-256 hash of the key
   */
  private hashKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Get cache key for API key validation
   */
  private getCacheKey(keyHash: string): string {
    return `apikey:${keyHash}`;
  }

  /**
   * Create a new API key for a user
   * 
   * @param input - CreateApiKeyInput with userId, name, and optional expiration
   * @returns ApiKeyResponse with the full key (only shown once)
   * @throws Error if user has reached maximum API key limit
   */
  async createApiKey(input: CreateApiKeyInput): Promise<ApiKeyResponse> {
    const { userId, name, expiresInDays = 365 } = input;

    // Note: Limit check is done at route level via checkUsageLimit()

    // Generate the API key
    const fullKey = this.generateKey();
    const keyHash = this.hashKey(fullKey);
    const keyPrefix = fullKey.substring(0, 16); // First 16 chars including prefix

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create the API key record
    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name,
        keyHash,
        keyPrefix,
        expiresAt,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      key: fullKey, // Only returned on creation
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
    };
  }

  /**
   * Validate an API key and return user info
   * Uses Redis caching for performance (5 min TTL)
   * 
   * @param apiKey - The full API key to validate
   * @returns ValidatedApiKey with userId and apiKeyId, or null if invalid
   */
  async validateApiKey(apiKey: string): Promise<ValidatedApiKey | null> {
    // Basic format validation - accept both current and legacy prefix
    if (!apiKey || !hasValidPrefix(apiKey)) {
      return null;
    }

    const keyHash = this.hashKey(apiKey);
    const cacheKey = this.getCacheKey(keyHash);

    // Check cache first
    try {
      const cached = await cacheRedis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Verify the cached data is still valid (not expired/revoked)
        if (parsed && parsed.userId && parsed.apiKeyId) {
          return parsed as ValidatedApiKey;
        }
      }
    } catch (error) {
      // Cache error, continue to database lookup
      console.error('API key cache read error:', error);
    }

    // Look up in database
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    // Validate the key
    if (!apiKeyRecord) {
      return null;
    }

    // Check if revoked
    if (apiKeyRecord.revokedAt) {
      return null;
    }

    // Check if expired
    if (new Date() > apiKeyRecord.expiresAt) {
      return null;
    }

    const result: ValidatedApiKey = {
      userId: apiKeyRecord.userId,
      apiKeyId: apiKeyRecord.id,
    };

    // Cache the validated key
    try {
      await cacheRedis.setex(cacheKey, API_KEY_CACHE_TTL, JSON.stringify(result));
    } catch (error) {
      // Cache error, continue without caching
      console.error('API key cache write error:', error);
    }

    return result;
  }

  /**
   * List all API keys for a user (without revealing full key values)
   * 
   * @param userId - The user ID
   * @returns Array of ApiKeyResponse without full key values
   */
  async listApiKeys(userId: string): Promise<ApiKeyResponse[]> {
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        expiresAt: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
    }));
  }

  /**
   * Revoke an API key
   * Immediately invalidates the key and removes from cache
   * 
   * @param userId - The user ID (for authorization)
   * @param apiKeyId - The API key ID to revoke
   * @throws Error if key not found or doesn't belong to user
   */
  async revokeApiKey(userId: string, apiKeyId: string): Promise<void> {
    // Find the key and verify ownership
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId,
        revokedAt: null,
      },
      select: {
        id: true,
        keyHash: true,
      },
    });

    if (!apiKey) {
      throw new Error('API key not found or already revoked');
    }

    // Revoke the key
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });

    // Remove from cache
    try {
      const cacheKey = this.getCacheKey(apiKey.keyHash);
      await cacheRedis.del(cacheKey);
    } catch (error) {
      // Cache error, key is still revoked in database
      console.error('API key cache delete error:', error);
    }
  }

  /**
   * Update the last used timestamp for an API key
   * Called asynchronously after successful API requests
   * 
   * @param apiKeyId - The API key ID
   */
  async updateLastUsed(apiKeyId: string): Promise<void> {
    try {
      await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      // Non-critical operation, log and continue
      console.error('Failed to update API key last used:', error);
    }
  }

  /**
   * Get API keys expiring within a specified number of days
   * Used for sending expiration notifications
   * 
   * @param days - Number of days to check for expiration
   * @returns Array of API keys with user info
   */
  async getExpiringKeys(days: number = 30): Promise<Array<{
    id: string;
    name: string;
    expiresAt: Date;
    userId: string;
    userEmail: string;
    userName: string;
  }>> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const expiringKeys = await prisma.apiKey.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          lte: futureDate,
          gt: new Date(), // Not already expired
        },
      },
      select: {
        id: true,
        name: true,
        expiresAt: true,
        userId: true,
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    return expiringKeys.map((key) => ({
      id: key.id,
      name: key.name,
      expiresAt: key.expiresAt,
      userId: key.userId,
      userEmail: key.user.email,
      userName: key.user.name,
    }));
  }

  /**
   * Get API key by ID (for internal use)
   * 
   * @param apiKeyId - The API key ID
   * @param userId - The user ID (for authorization)
   * @returns API key details or null
   */
  async getApiKeyById(apiKeyId: string, userId: string): Promise<ApiKeyResponse | null> {
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId,
        revokedAt: null,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        expiresAt: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    if (!apiKey) {
      return null;
    }

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
    };
  }
}

// Export singleton instance
export const apiKeyService = new ApiKeyService();
