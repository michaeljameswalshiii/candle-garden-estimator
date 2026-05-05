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
                self, "DBSecurityGroup",
                vpc=vpc,
                description="Security group for RDS",
                allow_all_outbound=True,
            )
        
        # Create database subnet group
        db_subnet_group = rds.SubnetGroup(
            self, "CandleDBSubnetGroup",
            description="Subnet group for candle SaaS database",
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(
                subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS
            ),
        )
        
        # Create database credentials secret
        db_credentials_secret = secretsmanager.Secret(
            self, "DBCredentialsSecret",
            secret_name="candlesaas/db/credentials",
            generate_secret_string=secretsmanager.SecretStringGenerator(
                secret_string_template=json.dumps({
                    "username": "candleadmin"
                }),
                generate_string_key="password",
                password_length=32,
                exclude_characters="/@\\"
            ),
        )
        
        # Create RDS instance
        self.database = rds.DatabaseInstance(
            self, "CandleSaasDB",
            engine=rds.DatabaseInstanceEngine.postgres(
                version=rds.PostgresEngineVersion.VER_14_6
            ),
            instance_type=ec2.InstanceType.of(
                ec2.InstanceClass.T3,
                ec2.InstanceSize.SMALL
            ),
            allocated_storage=20,
            storage_type=rds.StorageType.GP2,
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(
                subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS
            ),
            security_groups=[database_sg],
            subnet_group=db_subnet_group,
            database_name="candledb",
            credentials=rds.Credentials.from_secret(db_credentials_secret),
            deletion_protection=False,
            removal_policy=RemovalPolicy.DESTROY,
            iam_authentication=True,
            backup_retention=None,
            delete_automated_backups=True,
            publicly_accessible=False,
            multi_az=False,
        )
        
        # Store database endpoint and secret
        self.db_endpoint = self.database.db_instance_endpoint_address
        self.db_secret = db_credentials_secret
