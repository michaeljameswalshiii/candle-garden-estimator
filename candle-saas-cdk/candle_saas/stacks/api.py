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
    Duration,
)
from constructs import Construct


class APIStack(Stack):
    """Stack for API Gateway and Lambda functions."""
    
    def __init__(
        self,
        scope: Construct,
        id: str,
        vpc: ec2.Vpc,
        lambda_sg: ec2.SecurityGroup,
        database: rds.DatabaseInstance,
        s3_bucket: s3.Bucket,
        **kwargs
    ):
        super().__init__(scope, id, **kwargs)
        
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
        
        # Add permissions for database access
        database.grant_connect(lambda_execution_role)
        
        # Add permissions for S3 bucket
        s3_bucket.grant_read_write(lambda_execution_role)
        
        # Add permissions for Bedrock
        lambda_execution_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                ],
                resources=[
                    f"arn:aws:bedrock:{self.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
                    f"arn:aws:bedrock:{self.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
                ],
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
        
        # Create API Gateway
        api = apigw.RestApi(
            self, "CandleSaasAPI",
            rest_api_name="Candle SaaS API",
            description="API for candle refill SaaS platform",
            endpoint_types=[apigw.EndpointType.REGIONAL],
        )
        
        # Add API resources and integrations
        self._setup_products_endpoint(api, product_manager_fn)
        self._setup_orders_endpoint(api, order_processor_fn)
        self._setup_recommendations_endpoint(api, ai_recommendations_fn)
        self._setup_images_endpoint(api, image_processor_fn)
        self._setup_detect_endpoint(api, container_detector_fn)
    
    def _create_product_manager_function(
        self, role: iam.Role, vpc: ec2.Vpc, sg: ec2.SecurityGroup, db: rds.DatabaseInstance
    ) -> lambda_.Function:
        """Create Lambda function for product management."""
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
                "DB_HOST": db.db_instance_endpoint_address,
                "DB_PORT": "5432",
                "DB_NAME": "candledb",
            },
            timeout=Duration.seconds(60),
            memory_size=512,
            log_retention=logs.RetentionDays.TWO_WEEKS,
        )
        return fn
    
    def _create_order_processor_function(
        self, role: iam.Role, vpc: ec2.Vpc, sg: ec2.SecurityGroup, db: rds.DatabaseInstance
    ) -> lambda_.Function:
        """Create Lambda function for order processing."""
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
                "DB_HOST": db.db_instance_endpoint_address,
                "DB_PORT": "5432",
                "DB_NAME": "candledb",
            },
            timeout=Duration.seconds(60),
            memory_size=512,
            log_retention=logs.RetentionDays.TWO_WEEKS,
        )
        return fn
    
    def _create_ai_recommendations_function(
        self, role: iam.Role, vpc: ec2.Vpc, sg: ec2.SecurityGroup, db: rds.DatabaseInstance
    ) -> lambda_.Function:
        """Create Lambda function for AI recommendations using Bedrock."""
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
                "DB_HOST": db.db_instance_endpoint_address,
                "DB_PORT": "5432",
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
            ephemeral_storage=512,
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
            timeout=Duration.seconds(120),
            memory_size=1024,
            ephemeral_storage=512,
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
    
    def _setup_orders_endpoint(self, api: apigw.RestApi, function: lambda_.Function):
        """Setup /orders endpoint."""
        orders = api.root.add_resource("orders")
        integration = apigw.LambdaIntegration(function)
        
        orders.add_method("GET", integration)
        orders.add_method("POST", integration)
        
        order = orders.add_resource("{id}")
        order.add_method("GET", integration)
        order.add_method("PUT", integration)
        
        order_confirm = order.add_resource("confirm")
        order_confirm.add_method("POST", integration)
    
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
