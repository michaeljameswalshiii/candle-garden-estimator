from aws_cdk import (
    Stack,
    aws_rds as rds,
    aws_ec2 as ec2,
    aws_secretsmanager as secretsmanager,
)
from constructs import Construct


class DatabaseStack(Stack):
    """Stack for RDS PostgreSQL database - imports existing DB."""
    
    # DB instance identifier
    DB_INSTANCE_ID = "candlesaasdatabasestack-candlesaasdb00f6dcb4-3oykflbwbhay"
    
    def __init__(self, scope: Construct, id: str, vpc: ec2.Vpc, database_sg: ec2.SecurityGroup = None, **kwargs):
        super().__init__(scope, id, **kwargs)
        
        # Import existing security group if not provided
        if database_sg is None:
            database_sg = ec2.SecurityGroup.from_security_group_id(
                self, "DBSecurityGroup",
                security_group_id="sg-070d91f4f4492199a",  # From previous deployment
            )
        
        # Import existing RDS DB instance using from_database_instance_attributes
        # Include instance_resource_id to enable grant_connect()
        self.database = rds.DatabaseInstance.from_database_instance_attributes(
            self, "CandleSaasDB",
            instance_endpoint_address="candlesaasdatabasestack-candlesaasdb00f6dcb4-3oykflbwbhay.cgrcay6k6hkd.us-east-1.rds.amazonaws.com",
            instance_identifier=self.DB_INSTANCE_ID,
            port=5432,
            security_groups=[database_sg],
            instance_resource_id=self.DB_INSTANCE_ID,
        )
        
        # Import existing secret for credentials
        self.db_secret = secretsmanager.Secret.from_secret_name_v2(
            self, "DBCredentialsSecret",
            secret_name="candlesaas/db/credentials"
        )
        
        # Store references
        self.database_sg = database_sg
        self.db_endpoint = self.database.db_instance_endpoint_address
