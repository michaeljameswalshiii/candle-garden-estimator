# Candle Refill SaaS Platform - AWS CDK Infrastructure

This project contains AWS CDK infrastructure as code for a candle refill SaaS platform with Python Lambda functions, RDS PostgreSQL, S3 for images, and Amazon Bedrock integration for AI recommendations.

## Architecture Overview

The infrastructure consists of the following AWS services:

- **VPC**: Multi-AZ VPC with private and public subnets
- **RDS**: PostgreSQL database for storing products, orders, and customer data
- **S3**: Buckets for product images and backups with versioning and lifecycle policies
- **Lambda**: Four Python-based Lambda functions for:
  - Product management (CRUD operations)
  - Order processing
  - AI-powered recommendations using Amazon Bedrock (Claude)
  - Image processing and S3 integration
- **API Gateway**: REST API exposing all functionality
- **CloudWatch**: Logging and monitoring
- **Secrets Manager**: Secure database credentials storage

## Prerequisites

- Python 3.9+
- AWS CLI configured with appropriate credentials
- AWS CDK CLI: `npm install -g aws-cdk`
- Node.js 14+

## Project Structure

```
candle-saas-cdk/
├── candle_saas/
│   ├── app.py                 # Main CDK app entry point
│   ├── stacks/
│   │   ├── network.py         # VPC and networking resources
│   │   ├── database.py        # RDS PostgreSQL setup
│   │   ├── storage.py         # S3 buckets configuration
│   │   └── api.py             # API Gateway and Lambda integration
│   └── db/
│       └── init_schema.py     # Database schema initialization
├── lambda_functions/
│   ├── product_manager/       # Product management Lambda
│   │   ├── index.py
│   │   └── requirements.txt
│   ├── order_processor/       # Order processing Lambda
│   │   ├── index.py
│   │   └── requirements.txt
│   ├── ai_recommendations/    # AI recommendations Lambda (Bedrock)
│   │   ├── index.py
│   │   └── requirements.txt
│   └── image_processor/       # Image processing Lambda
│       ├── index.py
│       └── requirements.txt
├── tests/                     # Unit tests
├── cdk.json                   # CDK configuration
├── setup.py                   # Python package setup
├── requirements.txt           # Python dependencies
└── README.md                  # This file
```

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd candle-saas-cdk
pip install -r requirements.txt
pip install -e .
```

### 2. Bootstrap CDK (First time only)

```bash
cdk bootstrap aws://ACCOUNT_ID/REGION
```

Replace `ACCOUNT_ID` with your AWS account ID and `REGION` with your desired region (e.g., `us-east-1`).

### 3. Deploy Infrastructure

```bash
# Synthesize CloudFormation template
cdk synth

# Deploy to AWS
cdk deploy

# Deploy with specific context
cdk deploy -c account=123456789012 -c region=us-east-1
```

The deployment will create all the stacks and output the API Gateway endpoint.

### 4. Initialize Database

After the RDS instance is created, initialize the database schema:

```bash
export DB_HOST=<rds-endpoint>
export DB_PORT=5432
export DB_NAME=candledb
export DB_USER=candleadmin
export DB_PASSWORD=<password-from-secrets-manager>

python -m candle_saas.db.init_schema
```

## Database Schema

The platform uses the following tables:

### Products
```sql
CREATE TABLE products (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Orders
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES customers(id),
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Customers
```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## API Endpoints

### Products
- `GET /products` - List all products
- `POST /products` - Create new product
- `GET /products/{id}` - Get product details
- `PUT /products/{id}` - Update product
- `DELETE /products/{id}` - Delete product

### Orders
- `GET /orders` - List all orders
- `POST /orders` - Create new order
- `GET /orders/{id}` - Get order details
- `PUT /orders/{id}` - Update order status
- `POST /orders/{id}/confirm` - Confirm order

### Recommendations (Bedrock)
- `POST /recommendations` - Get AI-powered product recommendations

### Images
- `POST /images` - Upload product image
- `GET /images/{id}` - Get image URL (presigned)
- `DELETE /images/{id}` - Delete image

## Example API Calls

### Create a Product
```bash
curl -X POST https://api-endpoint/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lavender Candle Refill",
    "description": "Premium lavender scent, 200g",
    "price": 12.99,
    "stock": 100,
    "image_url": "s3://bucket/image.jpg"
  }'
```

### Create an Order
```bash
curl -X POST https://api-endpoint/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "uuid-here",
    "items": [
      {
        "product_id": "product-uuid",
        "quantity": 2,
        "price": 12.99
      }
    ]
  }'
```

### Get AI Recommendations
```bash
curl -X POST https://api-endpoint/recommendations \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "uuid-here",
    "preferences": "floral scents, eco-friendly products"
  }'
```

### Upload Image
```bash
curl -X POST https://api-endpoint/images \
  -H "Content-Type: application/json" \
  -d '{
    "image_data": "base64-encoded-image-data",
    "content_type": "image/jpeg",
    "product_name": "Lavender Candle"
  }'
```

## Environment Variables

The Lambda functions use the following environment variables:

- `DB_HOST` - RDS instance endpoint
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name (default: candledb)
- `DB_USER` - Database user (default: candleadmin)
- `DB_PASSWORD` - Database password (from Secrets Manager)
- `AWS_REGION` - AWS region for Bedrock API calls
- `S3_BUCKET` - S3 bucket name for images

## Bedrock Integration

The AI recommendations Lambda function integrates with Amazon Bedrock using Claude 3 Haiku model. It:

1. Retrieves customer order history from the database
2. Fetches all available products
3. Sends a prompt to Claude with customer preferences and available products
4. Returns personalized recommendations in JSON format

### Bedrock Models Used
- `anthropic.claude-3-haiku-20240307-v1:0` - For cost-effective recommendations

## Security Features

- **VPC**: Lambda functions run in private subnets with controlled egress
- **Secrets Manager**: Database credentials securely stored and rotated
- **IAM**: Least privilege access for each Lambda function
- **S3**: Block public access, encryption at rest, versioning enabled
- **RDS**: Private database within VPC, no public internet access
- **Security Groups**: Detailed ingress/egress rules

## Monitoring and Logging

All Lambda functions log to CloudWatch Logs with 2-week retention. Monitor:

- Lambda execution logs
- Database connection errors
- API Gateway request/response metrics
- S3 access patterns

## Cost Optimization

- **RDS**: T3 small instance (burstable) suitable for dev/staging
- **Lambda**: Efficient Python code with appropriate memory allocation
- **S3**: Intelligent tiering lifecycle policy for cost savings
- **CloudWatch**: 2-week log retention to limit storage costs

## Cleanup

Remove all AWS resources:

```bash
cdk destroy
```

This will:
- Delete the RDS instance (if removal policy allows)
- Delete S3 buckets (if auto-delete objects is enabled)
- Remove Lambda functions and API Gateway
- Clean up VPC and security groups

## Troubleshooting

### Lambda Database Connection Issues
- Verify security group rules allow access from Lambda to RDS
- Check database credentials in Secrets Manager
- Ensure RDS is in the same VPC as Lambda

### Bedrock API Errors
- Verify Bedrock is available in your region
- Check IAM permissions include `bedrock:InvokeModel`
- Ensure you have access to Claude models in Bedrock

### S3 Image Upload Failures
- Verify S3 bucket exists and Lambda IAM role has write permissions
- Check bucket policies and CORS configuration
- Ensure base64 image data is properly formatted

### API Gateway 500 Errors
- Check CloudWatch Logs for Lambda execution errors
- Verify database connection strings and credentials
- Enable API Gateway request/response logging for debugging

## Development

### Running Tests
```bash
pytest tests/
```

### Local Development
```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Run CDK in watch mode
cdk watch

# Synth and view CloudFormation
cdk synth --json
```

## Deployment Strategies

### Development Environment
```bash
cdk deploy -c account=DEV_ACCOUNT -c region=us-east-1
```

### Production Environment
```bash
cdk deploy -c account=PROD_ACCOUNT -c region=us-east-1 --require-approval=any-change
```

## Contributing

1. Create feature branch
2. Update CDK stacks or Lambda functions
3. Test locally with `cdk synth`
4. Submit pull request

## License

MIT License

## Support

For issues and questions, refer to:
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/latest/guide/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
