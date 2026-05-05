#!/bin/bash

# Candle SaaS CDK - Quick Deploy Script
# Usage: ./deploy.sh [dev|staging|prod]

set -e

ENVIRONMENT=${1:-dev}

echo "🕯️  Deploying Candle SaaS CDK - $ENVIRONMENT environment"

# Validate environment
case $ENVIRONMENT in
  dev)
    ACCOUNT_ID=${DEV_ACCOUNT_ID:-123456789012}
    REGION=${AWS_REGION:-us-east-1}
    ;;
  staging)
    ACCOUNT_ID=${STAGING_ACCOUNT_ID:-234567890123}
    REGION=${AWS_REGION:-us-east-1}
    ;;
  prod)
    ACCOUNT_ID=${PROD_ACCOUNT_ID:-345678901234}
    REGION=${AWS_REGION:-us-east-1}
    ;;
  *)
    echo "Usage: ./deploy.sh [dev|staging|prod]"
    exit 1
    ;;
esac

echo "AWS Account: $ACCOUNT_ID"
echo "AWS Region: $REGION"

# Bootstrap if needed
echo "Bootstrapping CDK..."
cdk bootstrap aws://$ACCOUNT_ID/$REGION || true

# Show diff
echo "CDK Diff:"
cdk diff -c account=$ACCOUNT_ID -c region=$REGION

# Deploy
echo "Starting deployment..."
cdk deploy \
  -c account=$ACCOUNT_ID \
  -c region=$REGION \
  --require-approval=never

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Retrieve RDS endpoint"
echo "2. Get database credentials from Secrets Manager"
echo "3. Initialize database schema: python -m candle_saas.db.init_schema"
echo "4. Test API endpoints"
