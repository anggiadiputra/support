import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { cacheRedis } from '../utils/cache.js';
import { auditLog } from '../utils/auditLog.js';

/**
 * Pending registration data stored in Redis
 */
export interface PendingRegistration {
  email: string;
  name: string;
  passwordHash: string;
  otpHash: string;
  otpExpiresAt: number; // Unix timestamp in ms
  attempts: number;
  resendCount: number;
  lastResendAt: number;
  createdAt: number;
  referralCode?: string; // Optional referral code for affiliate tracking
}

/**
 * OTP generation result
 */
export interface OTPGenerationResult {
  otp: string;
  expiresAt: Date;
}

/**
 * OTP verification result
 */
export interface OTPVerificationResult {
  valid: boolean;
  error?: string;
  attemptsRemaining?: number;
  pendingRegistration?: PendingRegistration;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds
}

// Constants
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const PENDING_REGISTRATION_TTL = 15 * 60; // 15 minutes in seconds
const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_OTP_REQUESTS_PER_EMAIL = 5;
const MAX_OTP_REQUESTS_PER_IP = 10;
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESENDS_PER_SESSION = 5;
const BCRYPT_ROUNDS = 10;

// Redis key prefixes (without cache: prefix since cacheRedis adds it)
const REDIS_KEYS = {
  pendingRegistration: (email: string) => `otp:pending:${email.toLowerCase()}`,
  pendingPasswordReset: (email: string) => `otp:reset:${email.toLowerCase()}`,
  emailRateLimit: (email: string) => `otp:rate:email:${email.toLowerCase()}`,
  ipRateLimit: (ip: string) => `otp:rate:ip:${ip}`,
};

/**
 * Pending password reset data stored in Redis
 */
export interface PendingPasswordReset {
  email: string;
  otpHash: string;
  otpExpiresAt: number;
  attempts: number;
  resendCount: number;
  lastResendAt: number;
  createdAt: number;
}

/**
 * OTP Service
 * 
 * Handles OTP generation, verification, storage, and rate limiting
 * for the email verification registration flow.
 */
export class OTPService {
  /**
   * Generate a cryptographically secure 6-digit OTP
   * Uses crypto.randomInt for secure random number generation
   */
  generateOTP(): string {
    const min = Math.pow(10, OTP_LENGTH - 1); // 100000
    const max = Math.pow(10, OTP_LENGTH); // 1000000
    const otp = randomInt(min, max);
    return otp.toString();
  }

  /**
   * Hash an OTP using bcrypt for secure storage
   */
  async hashOTP(otp: string): Promise<string> {
    return bcrypt.hash(otp, BCRYPT_ROUNDS);
  }

  /**
   * Verify an OTP against a stored hash using constant-time comparison
   */
  async verifyOTPHash(otp: string, hash: string): Promise<boolean> {
    return bcrypt.compare(otp, hash);
  }

  /**
   * Store pending registration data with OTP in Redis
   * 
   * @param email - User email
   * @param name - User name
   * @param passwordHash - Pre-hashed password
   * @param otp - Plain OTP (will be hashed before storage)
   * @param referralCode - Optional referral code for affiliate tracking
   * @returns OTP generation result with expiration time
   */
  async storePendingRegistration(
    email: string,
    name: string,
    passwordHash: string,
    otp: string,
    referralCode?: string
  ): Promise<OTPGenerationResult> {
    const otpHash = await this.hashOTP(otp);
    const now = Date.now();
    const expiresAt = new Date(now + OTP_EXPIRY_MINUTES * 60 * 1000);

    const pendingData: PendingRegistration = {
      email: email.toLowerCase(),
      name,
      passwordHash,
      otpHash,
      otpExpiresAt: expiresAt.getTime(),
      attempts: 0,
      resendCount: 0,
      lastResendAt: now,
      createdAt: now,
      referralCode,
    };

    const key = REDIS_KEYS.pendingRegistration(email);
    await cacheRedis.setex(key, PENDING_REGISTRATION_TTL, JSON.stringify(pendingData));

    return { otp, expiresAt };
  }

  /**
   * Get pending registration data from Redis
   */
  async getPendingRegistration(email: string): Promise<PendingRegistration | null> {
    const key = REDIS_KEYS.pendingRegistration(email);
    const data = await cacheRedis.get(key);
    
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as PendingRegistration;
    } catch {
      return null;
    }
  }

  /**
   * Update pending registration (e.g., after resend or verification attempt)
   */
  async updatePendingRegistration(
    email: string,
    updates: Partial<PendingRegistration>
  ): Promise<void> {
    const existing = await this.getPendingRegistration(email);
    if (!existing) {
      throw new Error('No pending registration found');
    }

    const updated = { ...existing, ...updates };
    const key = REDIS_KEYS.pendingRegistration(email);
    
    // Calculate remaining TTL
    const remainingTTL = Math.max(
      1,
      Math.floor((existing.createdAt + PENDING_REGISTRATION_TTL * 1000 - Date.now()) / 1000)
    );
    
    await cacheRedis.setex(key, remainingTTL, JSON.stringify(updated));
  }

  /**
   * Invalidate/remove pending registration from Redis
   */
  async invalidateOTP(email: string): Promise<void> {
    const key = REDIS_KEYS.pendingRegistration(email);
    await cacheRedis.del(key);
  }

  /**
   * Verify OTP code for a pending registration
   * 
   * @param email - User email
   * @param code - OTP code to verify
   * @returns Verification result with status and remaining attempts
   */
  async verifyOTP(email: string, code: string): Promise<OTPVerificationResult> {
    const pending = await this.getPendingRegistration(email);

    if (!pending) {
      return {
        valid: false,
        error: 'No pending registration found. Please start registration again.',
      };
    }

    // Check if OTP has expired
    if (Date.now() > pending.otpExpiresAt) {
      return {
        valid: false,
        error: 'OTP has expired. Please request a new code.',
      };
    }

    // Check max attempts
    if (pending.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await this.invalidateOTP(email);
      
      // Security log: Max verification attempts exceeded
      await auditLog('MAX_VERIFICATION_ATTEMPTS_EXCEEDED', 'OTPService', email, {
        email,
        attempts: pending.attempts,
        maxAttempts: MAX_VERIFICATION_ATTEMPTS,
        timestamp: new Date().toISOString()
      });
      
      return {
        valid: false,
        error: 'Maximum verification attempts exceeded. Please start registration again.',
      };
    }

    // Verify the OTP
    const isValid = await this.verifyOTPHash(code, pending.otpHash);

    if (!isValid) {
      // Increment attempts
      const newAttempts = pending.attempts + 1;
      await this.updatePendingRegistration(email, { attempts: newAttempts });

      const attemptsRemaining = MAX_VERIFICATION_ATTEMPTS - newAttempts;
      
      // Security log: Failed OTP verification attempt
      await auditLog('OTP_VERIFICATION_ATTEMPT_FAILED', 'OTPService', email, {
        email,
        attemptNumber: newAttempts,
        attemptsRemaining,
        timestamp: new Date().toISOString()
      });
      
      if (attemptsRemaining <= 0) {
        await this.invalidateOTP(email);
        
        // Security log: Max attempts reached after this failure
        await auditLog('MAX_VERIFICATION_ATTEMPTS_EXCEEDED', 'OTPService', email, {
          email,
          attempts: newAttempts,
          maxAttempts: MAX_VERIFICATION_ATTEMPTS,
          timestamp: new Date().toISOString()
        });
        
        return {
          valid: false,
          error: 'Maximum verification attempts exceeded. Please start registration again.',
          attemptsRemaining: 0,
        };
      }

      return {
        valid: false,
        error: 'Invalid OTP code.',
        attemptsRemaining,
      };
    }

    // OTP is valid - return pending registration data for user creation
    return {
      valid: true,
      pendingRegistration: pending,
    };
  }


  /**
   * Check rate limit for OTP generation by email
   * Limit: 5 requests per email per hour
   */
  async checkEmailRateLimit(email: string): Promise<RateLimitResult> {
    const key = REDIS_KEYS.emailRateLimit(email);
    
    try {
      const count = await cacheRedis.incr(key);
      
      // Set expiry on first request
      if (count === 1) {
        await cacheRedis.expire(key, RATE_LIMIT_WINDOW);
      }

      if (count > MAX_OTP_REQUESTS_PER_EMAIL) {
        const ttl = await cacheRedis.ttl(key);
        
        // Security log: Email rate limit exceeded
        await auditLog('EMAIL_RATE_LIMIT_EXCEEDED', 'OTPService', email, {
          email,
          requestCount: count,
          limit: MAX_OTP_REQUESTS_PER_EMAIL,
          windowSeconds: RATE_LIMIT_WINDOW,
          timestamp: new Date().toISOString()
        });
        
        return {
          allowed: false,
          retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Email rate limit check error:', error);
      // Allow on error to prevent blocking legitimate users
      return { allowed: true };
    }
  }

  /**
   * Check rate limit for OTP generation by IP
   * Limit: 10 requests per IP per hour
   */
  async checkIPRateLimit(ip: string): Promise<RateLimitResult> {
    const key = REDIS_KEYS.ipRateLimit(ip);
    
    try {
      const count = await cacheRedis.incr(key);
      
      // Set expiry on first request
      if (count === 1) {
        await cacheRedis.expire(key, RATE_LIMIT_WINDOW);
      }

      if (count > MAX_OTP_REQUESTS_PER_IP) {
        const ttl = await cacheRedis.ttl(key);
        
        // Security log: IP rate limit exceeded
        await auditLog('IP_RATE_LIMIT_EXCEEDED', 'OTPService', ip, {
          ip,
          requestCount: count,
          limit: MAX_OTP_REQUESTS_PER_IP,
          windowSeconds: RATE_LIMIT_WINDOW,
          timestamp: new Date().toISOString()
        }, undefined, ip);
        
        return {
          allowed: false,
          retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('IP rate limit check error:', error);
      // Allow on error to prevent blocking legitimate users
      return { allowed: true };
    }
  }

  /**
   * Combined rate limit check for both email and IP
   */
  async checkRateLimit(email: string, ip: string): Promise<RateLimitResult> {
    const [emailResult, ipResult] = await Promise.all([
      this.checkEmailRateLimit(email),
      this.checkIPRateLimit(ip),
    ]);

    if (!emailResult.allowed) {
      return emailResult;
    }

    if (!ipResult.allowed) {
      return ipResult;
    }

    return { allowed: true };
  }

  /**
   * Check if resend is allowed (60-second cooldown, max 5 resends)
   */
  async checkResendAllowed(email: string): Promise<{
    allowed: boolean;
    cooldownRemaining?: number;
    resendsRemaining?: number;
    error?: string;
  }> {
    const pending = await this.getPendingRegistration(email);

    if (!pending) {
      return {
        allowed: false,
        error: 'No pending registration found. Please start registration again.',
      };
    }

    // Check max resends
    if (pending.resendCount >= MAX_RESENDS_PER_SESSION) {
      return {
        allowed: false,
        resendsRemaining: 0,
        error: 'Maximum resend attempts reached. Please start registration again.',
      };
    }

    // Check cooldown
    const timeSinceLastResend = (Date.now() - pending.lastResendAt) / 1000;
    if (timeSinceLastResend < RESEND_COOLDOWN_SECONDS) {
      const cooldownRemaining = Math.ceil(RESEND_COOLDOWN_SECONDS - timeSinceLastResend);
      return {
        allowed: false,
        cooldownRemaining,
        resendsRemaining: MAX_RESENDS_PER_SESSION - pending.resendCount,
        error: `Please wait ${cooldownRemaining} seconds before requesting a new code.`,
      };
    }

    return {
      allowed: true,
      resendsRemaining: MAX_RESENDS_PER_SESSION - pending.resendCount,
    };
  }

  /**
   * Resend OTP - generates new OTP and updates pending registration
   */
  async resendOTP(email: string): Promise<{
    success: boolean;
    otp?: string;
    expiresAt?: Date;
    resendsRemaining?: number;
    error?: string;
  }> {
    const resendCheck = await this.checkResendAllowed(email);
    
    if (!resendCheck.allowed) {
      return {
        success: false,
        error: resendCheck.error,
        resendsRemaining: resendCheck.resendsRemaining,
      };
    }

    const pending = await this.getPendingRegistration(email);
    if (!pending) {
      return {
        success: false,
        error: 'No pending registration found.',
      };
    }

    // Generate new OTP
    const newOTP = this.generateOTP();
    const newOTPHash = await this.hashOTP(newOTP);
    const now = Date.now();
    const expiresAt = new Date(now + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Update pending registration
    await this.updatePendingRegistration(email, {
      otpHash: newOTPHash,
      otpExpiresAt: expiresAt.getTime(),
      attempts: 0, // Reset attempts on resend
      resendCount: pending.resendCount + 1,
      lastResendAt: now,
    });

    return {
      success: true,
      otp: newOTP,
      expiresAt,
      resendsRemaining: MAX_RESENDS_PER_SESSION - (pending.resendCount + 1),
    };
  }

  /**
   * Get resend cooldown in seconds
   */
  getResendCooldown(): number {
    return RESEND_COOLDOWN_SECONDS;
  }

  /**
   * Get OTP expiry in minutes
   */
  getOTPExpiryMinutes(): number {
    return OTP_EXPIRY_MINUTES;
  }

  // ==================== PASSWORD RESET METHODS ====================

  /**
   * Store pending password reset with OTP in Redis
   */
  async storePendingPasswordReset(email: string, otp: string): Promise<OTPGenerationResult> {
    const otpHash = await this.hashOTP(otp);
    const now = Date.now();
    const expiresAt = new Date(now + OTP_EXPIRY_MINUTES * 60 * 1000);

    const pendingData: PendingPasswordReset = {
      email: email.toLowerCase(),
      otpHash,
      otpExpiresAt: expiresAt.getTime(),
      attempts: 0,
      resendCount: 0,
      lastResendAt: now,
      createdAt: now,
    };

    const key = REDIS_KEYS.pendingPasswordReset(email);
    await cacheRedis.setex(key, PENDING_REGISTRATION_TTL, JSON.stringify(pendingData));

    return { otp, expiresAt };
  }

  /**
   * Get pending password reset from Redis
   */
  async getPendingPasswordReset(email: string): Promise<PendingPasswordReset | null> {
    const key = REDIS_KEYS.pendingPasswordReset(email);
    const data = await cacheRedis.get(key);
    
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as PendingPasswordReset;
    } catch {
      return null;
    }
  }

  /**
   * Update pending password reset
   */
  async updatePendingPasswordReset(
    email: string,
    updates: Partial<PendingPasswordReset>
  ): Promise<void> {
    const existing = await this.getPendingPasswordReset(email);
    if (!existing) {
      throw new Error('No pending password reset found');
    }

    const updated = { ...existing, ...updates };
    const key = REDIS_KEYS.pendingPasswordReset(email);
    
    const remainingTTL = Math.max(
      1,
      Math.floor((existing.createdAt + PENDING_REGISTRATION_TTL * 1000 - Date.now()) / 1000)
    );
    
    await cacheRedis.setex(key, remainingTTL, JSON.stringify(updated));
  }

  /**
   * Invalidate pending password reset
   */
  async invalidatePasswordReset(email: string): Promise<void> {
    const key = REDIS_KEYS.pendingPasswordReset(email);
    await cacheRedis.del(key);
  }

  /**
   * Verify OTP for password reset
   */
  async verifyPasswordResetOTP(email: string, code: string): Promise<{
    valid: boolean;
    error?: string;
    attemptsRemaining?: number;
  }> {
    const pending = await this.getPendingPasswordReset(email);

    if (!pending) {
      return {
        valid: false,
        error: 'No password reset request found. Please request a new code.',
      };
    }

    if (Date.now() > pending.otpExpiresAt) {
      return {
        valid: false,
        error: 'OTP has expired. Please request a new code.',
      };
    }

    if (pending.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await this.invalidatePasswordReset(email);
      return {
        valid: false,
        error: 'Maximum verification attempts exceeded. Please request a new code.',
      };
    }

    const isValid = await this.verifyOTPHash(code, pending.otpHash);

    if (!isValid) {
      const newAttempts = pending.attempts + 1;
      await this.updatePendingPasswordReset(email, { attempts: newAttempts });

      const attemptsRemaining = MAX_VERIFICATION_ATTEMPTS - newAttempts;
      
      if (attemptsRemaining <= 0) {
        await this.invalidatePasswordReset(email);
        return {
          valid: false,
          error: 'Maximum verification attempts exceeded. Please request a new code.',
          attemptsRemaining: 0,
        };
      }

      return {
        valid: false,
        error: 'Invalid OTP code.',
        attemptsRemaining,
      };
    }

    return { valid: true };
  }

  /**
   * Check if password reset resend is allowed
   */
  async checkPasswordResetResendAllowed(email: string): Promise<{
    allowed: boolean;
    cooldownRemaining?: number;
    resendsRemaining?: number;
    error?: string;
  }> {
    const pending = await this.getPendingPasswordReset(email);

    if (!pending) {
      return {
        allowed: false,
        error: 'No password reset request found. Please start again.',
      };
    }

    if (pending.resendCount >= MAX_RESENDS_PER_SESSION) {
      return {
        allowed: false,
        resendsRemaining: 0,
        error: 'Maximum resend attempts reached. Please try again later.',
      };
    }

    const timeSinceLastResend = (Date.now() - pending.lastResendAt) / 1000;
    if (timeSinceLastResend < RESEND_COOLDOWN_SECONDS) {
      const cooldownRemaining = Math.ceil(RESEND_COOLDOWN_SECONDS - timeSinceLastResend);
      return {
        allowed: false,
        cooldownRemaining,
        resendsRemaining: MAX_RESENDS_PER_SESSION - pending.resendCount,
        error: `Please wait ${cooldownRemaining} seconds before requesting a new code.`,
      };
    }

    return {
      allowed: true,
      resendsRemaining: MAX_RESENDS_PER_SESSION - pending.resendCount,
    };
  }

  /**
   * Resend password reset OTP
   */
  async resendPasswordResetOTP(email: string): Promise<{
    success: boolean;
    otp?: string;
    expiresAt?: Date;
    resendsRemaining?: number;
    error?: string;
  }> {
    const resendCheck = await this.checkPasswordResetResendAllowed(email);
    
    if (!resendCheck.allowed) {
      return {
        success: false,
        error: resendCheck.error,
        resendsRemaining: resendCheck.resendsRemaining,
      };
    }

    const pending = await this.getPendingPasswordReset(email);
    if (!pending) {
      return {
        success: false,
        error: 'No password reset request found.',
      };
    }

    const newOTP = this.generateOTP();
    const newOTPHash = await this.hashOTP(newOTP);
    const now = Date.now();
    const expiresAt = new Date(now + OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.updatePendingPasswordReset(email, {
      otpHash: newOTPHash,
      otpExpiresAt: expiresAt.getTime(),
      attempts: 0,
      resendCount: pending.resendCount + 1,
      lastResendAt: now,
    });

    return {
      success: true,
      otp: newOTP,
      expiresAt,
      resendsRemaining: MAX_RESENDS_PER_SESSION - (pending.resendCount + 1),
    };
  }
}

// Export singleton instance
export const otpService = new OTPService();
