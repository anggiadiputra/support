# Multi-stage build for optimal image size and security
# Using tsx for runtime (same as PM2 development) to avoid TypeScript compilation issues

FROM node:20-alpine

WORKDIR /app/backend

# Install dumb-init for proper signal handling, OpenSSL for Prisma, and curl for API calls
RUN apk add --no-cache dumb-init openssl curl

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 backend

# Copy package files
COPY apps/backend/package.json ./

# Install all dependencies (including tsx for runtime)
RUN npm install --legacy-peer-deps

# Copy source code
COPY apps/backend ./

# Generate Prisma Client (db push runs at container startup via entrypoint)
RUN npx prisma generate

# Copy docker entrypoint script
COPY apps/backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create uploads and logs directories
RUN mkdir -p /app/uploads /app/backend/logs && \
    chown -R backend:nodejs /app/uploads /app/backend/logs

# Set ownership
RUN chown -R backend:nodejs /app/backend

# Switch to non-root user
USER backend

# Expose application port
EXPOSE 3005

# Health check to ensure container is running properly
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly (SIGTERM, SIGINT)
ENTRYPOINT ["dumb-init", "--"]

# Start with entrypoint script that handles DB setup (using tsx like PM2)
CMD ["./docker-entrypoint.sh"]
