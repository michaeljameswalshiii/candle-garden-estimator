from aws_cdk import (
    Stack,
    aws_ec2 as ec2,
)
from constructs import Construct


class NetworkStack(Stack):
    """Stack for VPC and networking resources."""
    
    def __init__(self, scope: Construct, id: str, env=None, **kwargs):
        super().__init__(scope, id, env=env, **kwargs)
        
        # Create VPC with 3 AZs using CDK v2 pattern
        self.vpc = ec2.Vpc(
            self, "CandleSaasVPC",
            max_azs=3,
            ip_addresses=ec2.IpAddresses.cidr("10.0.0.0/16"),
            nat_gateways=1,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    subnet_type=ec2.SubnetType.PUBLIC,
                    name="Public",
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    name="Private",
                    cidr_mask=24,
                ),
            ],
        )
        
        # Security group for database
        self.database_sg = ec2.SecurityGroup(
            self, "DatabaseSecurityGroup",
            vpc=self.vpc,
            description="Security group for RDS",
            allow_all_outbound=True,
        )
        
        # Security group for Lambda
        self.lambda_sg = ec2.SecurityGroup(
            self, "LambdaSecurityGroup",
            vpc=self.vpc,
            description="Security group for Lambda functions",
            allow_all_outbound=True,
        )
        
        # Allow Lambda to access database
        self.database_sg.connections.allow_from(
            self.lambda_sg,
            port=ec2.Port.tcp(5432),
            description="Allow Lambda to access PostgreSQL"
        )
