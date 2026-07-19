import os
from aws_cdk import (
    Stack,
    aws_apigateway as apigw,
    aws_lambda as lambda_,
    aws_iam as iam,
    aws_logs as logs,
    aws_ec2 as ec2,
    aws_s3 as s3,
    aws_rds as rds,
    aws_cognito as cognito,
    Duration,
    Size,
    CfnOutput,
)
from constructs import Construct


def _get_db_endpoint(db):
    """Helper to get database host and port from either DatabaseInstance or DatabaseCluster."""
    if db is None:
        return "localhost", 5432
    if isinstance(db, rds.DatabaseCluster):
        return db.cluster_endpoint.address, db.cluster_endpoint.port
    else:
        return db.db_instance_endpoint_address, 5432


class APIStack(Stack):
    """Stack for API Gateway and Lambda functions."""
    
    def __init__(
        self,
        scope: Construct,
        id: str,
        vpc: ec2.Vpc,
        lambda_sg: ec2.SecurityGroup,
        database = None,
        s3_bucket: s3.Bucket = None,
        **kwargs
    ):
        super().__init__(scope, id, **kwargs)
        
        # Store database and s3 references (can be None)
        self._database = database
        self._s3_bucket = s3_bucket
        
        # Create shared IAM execution role for Lambda
        lambda_execution_role = iam.Role(
            self, "LambdaExecutionRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            description="Execution role for Candle SaaS Lambda functions"
        )
        
        # Add basic Lambda execution policy
        lambda_execution_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("service-role/AWSLambdaVPCAccessExecutionRole")
        )
        
        # Add permissions for database access (only if database exists)
        if database is not None:
            database.grant_connect(lambda_execution_role, "candleadmin")
        
        # Add permissions for S3 bucket (only if bucket exists)
        if s3_bucket is not None:
            s3_bucket.grant_read_write(lambda_execution_role)
        
        # Bedrock: Claude (primary detector + recommendations) and Nova (fallback).
        # Include foundation models + inference profiles (required for newer Claude on-demand).
        lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                ],
                resources=[
                    # Foundation models (any region account-less ARN)
                    f"arn:aws:bedrock:{self.region}::foundation-model/anthropic.*",
                    f"arn:aws:bedrock:{self.region}::foundation-model/amazon.nova*",
                    "arn:aws:bedrock:*::foundation-model/anthropic.*",
                    "arn:aws:bedrock:*::foundation-model/amazon.nova*",
                    # Inference profiles (cross-region / on-demand routing)
                    f"arn:aws:bedrock:{self.region}:{self.account}:inference-profile/*",
                    f"arn:aws:bedrock:*:{self.account}:inference-profile/*",
                ],
            )
        )
        # Newer Claude models require marketplace subscribe/view for first-time enablement
        lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "aws-marketplace:ViewSubscriptions",
                    "aws-marketplace:Subscribe",
                    "aws-marketplace:Unsubscribe",
                ],
                resources=["*"],
            )
        )
        
        # Add permissions for CloudWatch Logs
        lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                ],
                resources=["arn:aws:logs:*:*:*"],
            )
        )
        
        # Add permissions for Secrets Manager
        lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "secretsmanager:GetSecretValue",
                ],
                resources=[
                    f"arn:aws:secretsmanager:{self.region}:{self.account}:secret:candlesaas/*"
                ],
            )
        )
        
        # Use the Lambda security group passed from app.py
        # Create Lambda functions
        product_manager_fn = self._create_product_manager_function(
            lambda_execution_role, vpc, lambda_sg, database
        )
        
        order_processor_fn = self._create_order_processor_function(
            lambda_execution_role, vpc, lambda_sg, database
        )
        
        ai_recommendations_fn = self._create_ai_recommendations_function(
            lambda_execution_role, vpc, lambda_sg, database
        )
        
        image_processor_fn = self._create_image_processor_function(
            lambda_execution_role, vpc, lambda_sg
        )
        
        container_detector_fn = self._create_container_detector_function(
            lambda_execution_role, vpc, lambda_sg
        )
        
        # Cognito user pool for The Candle Garden App (import existing Phase 1 pool when set)
        pool_id = self.node.try_get_context("cognitoUserPoolId") or "us-east-1_WTA7ZWxcr"
        user_pool = cognito.UserPool.from_user_pool_id(self, "CandleGardenUserPool", pool_id)
        cognito_authorizer = apigw.CognitoUserPoolsAuthorizer(
            self, "CandleGardenAuthorizer",
            cognito_user_pools=[user_pool],
            authorizer_name="CandleGardenCognito",
            identity_source="method.request.header.Authorization",
        )
        auth_opts = apigw.MethodOptions(
            authorization_type=apigw.AuthorizationType.COGNITO,
            authorizer=cognito_authorizer,
        )

        # Create API Gateway
        api = apigw.RestApi(
            self, "CandleSaasAPI",
            rest_api_name="Candle SaaS API",
            description="API for candle refill SaaS platform",
            endpoint_types=[apigw.EndpointType.REGIONAL],
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"],
            ),
        )
        
        # Add API resources and integrations
        self._setup_products_endpoint(api, product_manager_fn)
        self._setup_orders_endpoint(api, order_processor_fn, auth_opts)
        self._setup_recommendations_endpoint(api, ai_recommendations_fn)
        self._setup_images_endpoint(api, image_processor_fn)
        # Detect stays public for guest estimator; client may still send JWT
        self._setup_detect_endpoint(api, container_detector_fn)

        CfnOutput(self, "CognitoUserPoolId", value=pool_id)
        CfnOutput(self, "ApiUrl", value=api.url)
    
    def _create_product_manager_function(
        self, role: iam.Role, vpc: ec2.Vpc, sg: ec2.SecurityGroup, db
    ) -> lambda_.Function:
        """Create Lambda function for product management."""
        db_host, db_port = _get_db_endpoint(db)
        
        fn = lambda_.Function(
            self, "ProductManagerFunction",
            code=lambda_.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "..", "..", "lambda_functions", "product_manager")
            ),
            handler="index.handler",
            runtime=lambda_.Runtime.PYTHON_3_10,
            role=role,
            vpc=vpc,
            security_groups=[sg],
            environment={
                "DB_HOST": db_host,
                "DB_PORT": str(db_port),
                "DB_NAME": "candledb",
            },
            timeout=Duration.seconds(60),
            memory_size=512,
            log_retention=logs.RetentionDays.TWO_WEEKS,
        )
        return fn
    
    def _create_order_processor_function(
        self, role: iam.Role, vpc: ec2.Vpc, sg: ec2.SecurityGroup, db
    ) -> lambda_.Function:
        """Create Lambda function for order processing."""
        db_host, db_port = _get_db_endpoint(db)
        
        fn = lambda_.Function(
            self, "OrderProcessorFunction",
            code=lambda_.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "..", "..", "lambda_functions", "order_processor")
            ),
            handler="index.handler",
            runtime=lambda_.Runtime.PYTHON_3_10,
            role=role,
            vpc=vpc,
            security_groups=[sg],
            environment={
                "DB_HOST": db_host,
                "DB_PORT": str(db_port),
                "DB_NAME": "candledb",
            },
            timeout=Duration.seconds(60),
            memory_size=512,
            log_retention=logs.RetentionDays.TWO_WEEKS,
        )
        return fn
    
    def _create_ai_recommendations_function(
        self, role: iam.Role, vpc: ec2.Vpc, sg: ec2.SecurityGroup, db
    ) -> lambda_.Function:
        """Create Lambda function for AI recommendations using Bedrock."""
        db_host, db_port = _get_db_endpoint(db)
        
        fn = lambda_.Function(
            self, "AIRecommendationsFunction",
            code=lambda_.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "..", "..", "lambda_functions", "ai_recommendations")
            ),
            handler="index.handler",
            runtime=lambda_.Runtime.PYTHON_3_10,
            role=role,
            vpc=vpc,
            security_groups=[sg],
            environment={
                "DB_HOST": db_host,
                "DB_PORT": str(db_port),
                "DB_NAME": "candledb",
            },
            timeout=Duration.seconds(120),
            memory_size=1024,
            log_retention=logs.RetentionDays.TWO_WEEKS,
        )
        return fn
    
    def _create_image_processor_function(
        self, role: iam.Role, vpc: ec2.Vpc, sg: ec2.SecurityGroup
    ) -> lambda_.Function:
        """Create Lambda function for image processing."""
        fn = lambda_.Function(
            self, "ImageProcessorFunction",
            code=lambda_.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "..", "..", "lambda_functions", "image_processor")
            ),
            handler="index.handler",
            runtime=lambda_.Runtime.PYTHON_3_10,
            role=role,
            vpc=vpc,
            security_groups=[sg],
            timeout=Duration.seconds(120),
            memory_size=1024,
            ephemeral_storage_size=Size.mebibytes(512),
            log_retention=logs.RetentionDays.TWO_WEEKS,
        )
        return fn
    
    def _create_container_detector_function(
        self, role: iam.Role, vpc: ec2.Vpc, sg: ec2.SecurityGroup
    ) -> lambda_.Function:
        """Create Lambda function for container detection using Bedrock Vision."""
        fn = lambda_.Function(
            self, "ContainerDetectorFunction",
            code=lambda_.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "..", "..", "lambda_functions", "container_detector")
            ),
            handler="index.handler",
            runtime=lambda_.Runtime.PYTHON_3_10,
            role=role,
            vpc=vpc,
            security_groups=[sg],
            environment={
                # Claude Sonnet 4.5 primary (US inference profile); Nova Pro fallback
                "CLAUDE_MODEL_ID": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                "NOVA_MODEL_ID": "amazon.nova-pro-v1:0",
                "MIN_CONFIDENCE": "0.5",
            },
            timeout=Duration.seconds(120),
            memory_size=1024,
            ephemeral_storage_size=Size.mebibytes(512),
            log_retention=logs.RetentionDays.TWO_WEEKS,
        )
        return fn
    
    def _setup_products_endpoint(self, api: apigw.RestApi, function: lambda_.Function):
        """Setup /products endpoint."""
        products = api.root.add_resource("products")
        integration = apigw.LambdaIntegration(function)
        
        products.add_method("GET", integration)
        products.add_method("POST", integration)
        
        product = products.add_resource("{id}")
        product.add_method("GET", integration)
        product.add_method("PUT", integration)
        product.add_method("DELETE", integration)
    
    def _setup_orders_endpoint(
        self,
        api: apigw.RestApi,
        function: lambda_.Function,
        auth_opts=None,
    ):
        """Setup /orders endpoint (Cognito JWT required)."""
        orders = api.root.add_resource("orders")
        integration = apigw.LambdaIntegration(function)
        method_kwargs = {}
        if auth_opts is not None:
            method_kwargs = {
                "authorization_type": auth_opts.authorization_type,
                "authorizer": auth_opts.authorizer,
            }

        orders.add_method("GET", integration, **method_kwargs)
        orders.add_method("POST", integration, **method_kwargs)
        
        order = orders.add_resource("{id}")
        order.add_method("GET", integration, **method_kwargs)
        order.add_method("PUT", integration, **method_kwargs)
        
        order_confirm = order.add_resource("confirm")
        order_confirm.add_method("POST", integration, **method_kwargs)
    
    def _setup_recommendations_endpoint(self, api: apigw.RestApi, function: lambda_.Function):
        """Setup /recommendations endpoint."""
        recommendations = api.root.add_resource("recommendations")
        integration = apigw.LambdaIntegration(function)
        
        recommendations.add_method("POST", integration)
    
    def _setup_images_endpoint(self, api: apigw.RestApi, function: lambda_.Function):
        """Setup /images endpoint."""
        images = api.root.add_resource("images")
        integration = apigw.LambdaIntegration(function)
        
        images.add_method("POST", integration)
        
        image = images.add_resource("{id}")
        image.add_method("GET", integration)
        image.add_method("DELETE", integration)
    
    def _setup_detect_endpoint(self, api: apigw.RestApi, function: lambda_.Function):
        """Setup /detect endpoint for container detection."""
        detect = api.root.add_resource("detect")
        integration = apigw.LambdaIntegration(function)
        
        detect.add_method("POST", integration)
