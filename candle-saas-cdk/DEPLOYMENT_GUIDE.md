# Deployment Guide

## Quick Start Deployment

### Prerequisites
- AWS Account with appropriate permissions
- AWS CLI configured
- Python 3.9+
- Node.js 14+
- AWS CDK: `npm install -g aws-cdk`

### Step 1: Install and Configure

```bash
cd candle-saas-cdk

# Install Python dependencies
pip install -r requirements.txt
pip install -e .

# Install AWS CDK (if not already installed)
npm install -g aws-cdk
```

### Step 2: Bootstrap CDK

Make sure CDK is bootstrapped in your region (required only once):

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1

cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
```

### Step 3: Deploy Stacks

Review the deployment plan:
```bash
cdk synth
cdk diff
```

Deploy the infrastructure:
```bash
cdk deploy --require-approval=never
```

**Note**: The first deployment may take 15-20 minutes for the RDS instance to fully initialize.

### Step 4: Retrieve RDS Credentials

The RDS instance uses an auto-generated password stored in Secrets Manager:

```bash
aws secretsmanager get-secret-value \
  --secret-id candlesaas/db/credentials \
  --query SecretString \
  --output text | python -m json.tool
```

### Step 5: Initialize Database Schema

Once RDS is fully available:

```bash
# Retrieve database endpoint
export DB_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier candlesaasdb \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Retrieve credentials
DB_CREDS=$(aws secretsmanager get-secret-value \
  --secret-id candlesaas/db/credentials \
  --query SecretString --output text)

export DB_USER=$(echo $DB_CREDS | python -c "import sys, json; print(json.load(sys.stdin)['username'])")
export DB_PASSWORD=$(echo $DB_CREDS | python -c "import sys, json; print(json.load(sys.stdin)['password'])")
export DB_NAME=candledb
export DB_PORT=5432

# Initialize schema
python -m candle_saas.db.init_schema
```

### Step 6: Test API

Get the API Gateway endpoint:

```bash
aws cloudformation describe-stacks \
  --stack-name CandleSaasAPIStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text
```

Test endpoint:
```bash
API_URL="https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com"

# Create a product
curl -X POST $API_URL/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Candle",
    "description": "A test candle",
    "price": 10.00,
    "stock": 50
  }'
```

## Lambda Function Packaging

The CDK automatically packages Lambda functions from the `lambda_functions/` directory. Dependencies in `requirements.txt` are installed during synth.

### Adding Dependencies to Lambda Functions

Edit the specific function's `requirements.txt`:

```bash
# For product manager Lambda
echo "requests==2.31.0" >> lambda_functions/product_manager/requirements.txt

# Redeploy to update Lambda
cdk deploy
```

## Environment Configuration

### Development
```bash
cdk deploy -c account=111111111111 -c region=us-east-1
```

### Staging
```bash
cdk deploy -c account=222222222222 -c region=us-east-1
```

### Production
```bash
cdk deploy -c account=333333333333 -c region=us-east-1 --require-approval=any-change
```

## Monitoring

### View Lambda Logs

```bash
# Recent logs for product manager
aws logs tail /aws/lambda/CandleSaasAPIStack-ProductManagerFunction* --follow

# All Lambda logs
aws logs tail /aws/lambda/ --follow
```

### Monitor RDS Performance

```bash
# Check CPU utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=candlesaasdb \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

## Scaling

### Increase RDS Capacity
```bash
aws rds modify-db-instance \
  --db-instance-identifier candlesaasdb \
  --db-instance-class db.t3.medium \
  --apply-immediately
```

### Increase Lambda Memory
Edit the stack in `candle_saas/stacks/api.py` and update `memory_size`:
```python
memory_size=1024  # Change from 512 to 1024
```

Then redeploy:
```bash
cdk deploy
```

## Backup and Restore

### Enable RDS Backups
RDS backups are automatically enabled with a retention period of 7 days by default. To modify:

```bash
aws rds modify-db-instance \
  --db-instance-identifier candlesaasdb \
  --backup-retention-period 30 \
  --apply-immediately
```

### Create Manual Snapshot
```bash
aws rds create-db-snapshot \
  --db-instance-identifier candlesaasdb \
  --db-snapshot-identifier candlesaasdb-snapshot-$(date +%s)
```

## Cleanup

Remove all resources:

```bash
# Review what will be destroyed
cdk destroy --dry-run

# Destroy resources
cdk destroy --force
```

## Troubleshooting

### Lambda Function Timeout

If Lambda functions timeout, increase the timeout in `candle_saas/stacks/api.py`:
```python
timeout=Duration.seconds(120)  # Increase from 60
```

### Database Connection Issues

Test connectivity:
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();"
```

### S3 Bucket Exists Error

If S3 bucket already exists, update the bucket name in `candle_saas/stacks/storage.py`:
```python
bucket_name=f"candle-images-{self.account}-{self.region}"
```

## Cost Estimation

Approximate monthly costs (development environment):
- RDS T3 Small: ~$30
- Lambda: ~$5-10 (depending on usage)
- S3: ~$1
- Data Transfer: ~$5-20
- **Total: ~$45-60/month**

Reduce costs by:
1. Using RDS free tier if eligible
2. Enabling Lambda reserved concurrency
3. Using S3 intelligent tiering

## Performance Optimization

1. **Connection Pooling**: Add pgBouncer for RDS connection pooling
2. **Lambda Cache**: Store frequently accessed data in Lambda memory
3. **API Caching**: Enable CloudFront distribution for API Gateway
4. **S3 CDN**: Use CloudFront for image delivery
5. **Database Indexing**: Review slow query logs and add indices

## Security Hardening

1. **Enable VPC Endpoints**: Reduce data transfer through internet
2. **Add WAF**: Protect API Gateway with AWS WAF
3. **Enable MFA**: For AWS console access
4. **Rotate Secrets**: Implement automatic secret rotation
5. **Enable Encryption**: Enable encryption at rest and in transit
