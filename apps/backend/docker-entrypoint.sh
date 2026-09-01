#!/bin/sh
set -e

echo "🚀 Starting KirimChat Backend..."

# Wait for database to be ready
echo "⏳ Waiting for PostgreSQL..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect().then(() => { console.log('DB OK'); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; then
        echo "✅ PostgreSQL is ready"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Waiting for database... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Database connection timeout"
    exit 1
fi

# Sync database schema (no migration files, using db push)
echo "📦 Syncing database schema..."
DB_PUSH_FAILED=0
npx prisma db push || {
    echo "⚠️  DB push failed, continuing anyway..."
    DB_PUSH_FAILED=1
    # Create marker file for install.sh to detect
    touch /tmp/.db_push_failed
}

# Enable pgvector extension
echo "🔧 Enabling pgvector extension..."
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector')
  .then(() => console.log('✅ pgvector extension enabled'))
  .catch(err => console.log('⚠️  pgvector:', err.message))
  .finally(() => prisma.\$disconnect());
" 2>/dev/null || echo "⚠️  Could not enable pgvector"

echo "✅ Database setup complete!"

# Start the application using tsx (same as PM2)
echo "🚀 Starting server with tsx..."
exec npx tsx src/index.ts
