#!/bin/bash
# Production Validation Script for madrid-app
# Runs comprehensive checks before deployment

set -e

echo "═══════════════════════════════════════════════════════════════════════"
echo "  Madrid App - Production Deployment Validation"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Tracking
ERRORS=0
WARNINGS=0
PASSED=0

# ────────────────────────────────────────────────────────────────────────
# Helper functions
# ────────────────────────────────────────────────────────────────────────

check_env() {
  local var=$1
  local description=$2
  local required=${3:-true}
  
  if [ -z "${!var}" ]; then
    if [ "$required" = true ]; then
      echo -e "${RED}✗ MISSING${NC} $var - $description"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "${YELLOW}⚠ OPTIONAL${NC} $var - $description"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    echo -e "${GREEN}✓ FOUND${NC} $var"
    PASSED=$((PASSED + 1))
  fi
}

check_file() {
  local file=$1
  local description=$2
  
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓ EXISTS${NC} $file"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗ MISSING${NC} $file - $description"
    ERRORS=$((ERRORS + 1))
  fi
}

check_command() {
  local cmd=$1
  local description=$2
  
  if command -v "$cmd" &> /dev/null; then
    echo -e "${GREEN}✓ FOUND${NC} $cmd - $description"
    PASSED=$((PASSED + 1))
  else
    echo -e "${YELLOW}⚠ MISSING${NC} $cmd - $description (optional)"
    WARNINGS=$((WARNINGS + 1))
  fi
}

# ────────────────────────────────────────────────────────────────────────
# CRITICAL: Environment Variables
# ────────────────────────────────────────────────────────────────────────

echo ""
echo "📋 CRITICAL: Required Environment Variables"
echo "───────────────────────────────────────────────────────────────────────"

check_env "SESSION_SECRET" "JWT signing key"
check_env "ENCRYPTION_KEY" "AES-256 encryption key (64 hex chars)"
check_env "STRIPE_SECRET_KEY" "Stripe API secret key"
check_env "STRIPE_WEBHOOK_SECRET" "Stripe webhook signing secret"
check_env "SUPABASE_SERVICE_ROLE_KEY" "Supabase service role key"

# ────────────────────────────────────────────────────────────────────────
# HIGH: Security Configuration
# ────────────────────────────────────────────────────────────────────────

echo ""
echo "🔐 HIGH: Security Configuration"
echo "───────────────────────────────────────────────────────────────────────"

# Check dev flags
if [ "$NODE_ENV" = "production" ]; then
  if [ "${DEV_LOGIN_ENABLED}" = "true" ]; then
    echo -e "${RED}✗ SECURITY RISK${NC} DEV_LOGIN_ENABLED=true in production!"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}✓ SAFE${NC} DEV_LOGIN_ENABLED is false"
    PASSED=$((PASSED + 1))
  fi
  
  if [ "${ALLOW_INSECURE_DEV_WEBHOOKS}" = "true" ]; then
    echo -e "${RED}✗ SECURITY RISK${NC} ALLOW_INSECURE_DEV_WEBHOOKS=true in production!"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}✓ SAFE${NC} Insecure dev webhooks disabled"
    PASSED=$((PASSED + 1))
  fi
fi

# Check encryption key format
if [ ! -z "$ENCRYPTION_KEY" ]; then
  KEY_LENGTH=${#ENCRYPTION_KEY}
  if [ "$KEY_LENGTH" = "64" ]; then
    echo -e "${GREEN}✓ VALID${NC} ENCRYPTION_KEY length: 64 hex chars (256-bit)"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗ INVALID${NC} ENCRYPTION_KEY length: $KEY_LENGTH (expected 64 hex chars)"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ────────────────────────────────────────────────────────────────────────
# MEDIUM: Optional Production Features
# ────────────────────────────────────────────────────────────────────────

echo ""
echo "⚡ MEDIUM: Production Features (Optional)"
echo "───────────────────────────────────────────────────────────────────────"

check_env "REDIS_URL" "Redis for distributed rate limiting" false
check_env "UPSTASH_REDIS_URL" "Upstash Redis (serverless)" false
check_env "INNGEST_EVENT_KEY" "Inngest for async jobs" false

# ────────────────────────────────────────────────────────────────────────
# Code Quality
# ────────────────────────────────────────────────────────────────────────

echo ""
echo "📦 Code & Files"
echo "───────────────────────────────────────────────────────────────────────"

check_file "package.json" "Node.js configuration"
check_file "next.config.mjs" "Next.js configuration"
check_file ".env.production" "Production environment file"
check_file "src/lib/encryption.js" "Encryption module"
check_file "src/lib/redis-client.js" "Redis client module"

# ────────────────────────────────────────────────────────────────────────
# Tools & Dependencies
# ────────────────────────────────────────────────────────────────────────

echo ""
echo "🛠️  Tools & Dependencies"
echo "───────────────────────────────────────────────────────────────────────"

check_command "node" "Node.js runtime"
check_command "npm" "Node package manager"
check_command "docker" "Docker container runtime" 
check_command "redis-cli" "Redis command-line client"

# ────────────────────────────────────────────────────────────────────────
# Build Validation
# ────────────────────────────────────────────────────────────────────────

echo ""
echo "🏗️  Build Validation"
echo "───────────────────────────────────────────────────────────────────────"

if [ -d ".next" ]; then
  echo -e "${GREEN}✓ BUILD CACHED${NC} .next directory found"
  PASSED=$((PASSED + 1))
else
  echo -e "${YELLOW}⚠ NO BUILD CACHE${NC} Will require full build"
  WARNINGS=$((WARNINGS + 1))
fi

# ────────────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  VALIDATION SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}✓ Passed:${NC}   $PASSED"
echo -e "  ${YELLOW}⚠ Warnings:${NC} $WARNINGS"
echo -e "  ${RED}✗ Errors:${NC}   $ERRORS"
echo ""

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}❌ DEPLOYMENT BLOCKED: Fix $ERRORS error(s) before proceeding${NC}"
  echo ""
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  PROCEED WITH CAUTION: Resolve $WARNINGS warning(s) if possible${NC}"
  echo ""
  exit 0
else
  echo -e "${GREEN}✅ ALL CHECKS PASSED: Safe to deploy${NC}"
  echo ""
  exit 0
fi
