import json
from aws_cdk import (
    Stack,
    aws_rds as rds,
    aws_ec2 as ec2,
    aws_secretsmanager as secretsmanager,
    RemovalPolicy,
)
from constructs import Construct


class DatabaseStack(Stack):
    """Stack for RDS PostgreSQL database."""
    
    def __init__(self, scope: Construct, id: str, vpc: ec2.Vpc, database_sg: ec2.SecurityGroup = None, **kwargs):
        super().__init__(scope, id, **kwargs)
        
        # Create security group if not provided
        if database_sg is None:
            database_sg = ec2.SecurityGroup(
                self, "DatabaseSecurityGroup",
                vpc=vpc,
                description="Security group for RDS database",
            )
            # Allow PostgreSQL from Lambda security group
            database_sg.add_ingress_rule(
                ec2.Peer.any_ipv4(),
                ec2.TcpPort(5432),
                "Allow PostgreSQL"
            )
        
# Create database credentials secret
        db_credentials = secretsmanager.Secret(
            self, "DBCredentialsSecret",
            description="Database credentials for Candle SaaS",
            secret_name="candlesaas/db/credentials",
        )
        
        # Create RDS database instance with credentials from the secret
        self.database = rds.DatabaseInstance(
            self, "CandleSaasDB",
            engine=rds.DatabaseInstanceEngine.postgres(
                version=rds.PostgresEngineVersion.VER_14_7
            ),
            instance_type=ec2.InstanceType("db.t3.micro"),
            vpc=vpc,
            security_groups=[database_sg],
            credentials=rds.Credentials.from_secret(db_credentials, "candleadmin"),
            database_name="candledb",
            removal_policy=RemovalPolicy.RETAIN,
        )
        
        # Store references
        self.security_group = database_sg
        self.db_secret = db_credentials
        self.db_endpoint = self.database.db_instance_endpoint_address
