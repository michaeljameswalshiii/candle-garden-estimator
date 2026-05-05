from aws_cdk import (
    Stack,
    aws_s3 as s3,
    RemovalPolicy,
    Duration,
)
from constructs import Construct


class StorageStack(Stack):
    """Stack for S3 storage (images and assets)."""
    
    def __init__(self, scope: Construct, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)
        
        # Create S3 bucket for product images
        self.image_bucket = s3.Bucket(
            self, "CandleImageBucket",
            bucket_name=None,  # Auto-generate name
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            versioned=True,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            lifecycle_rules=[
                s3.LifecycleRule(
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.INTELLIGENT_TIERING,
                            transition_after=Duration.days(30),
                        ),
                        s3.Transition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(90),
                        ),
                    ],
                    noncurrent_version_transitions=[
                        s3.NoncurrentVersionTransition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(30),
                        ),
                    ],
                    noncurrent_version_expiration=Duration.days(365),
                ),
            ],
            cors=[
                s3.CorsRule(
                    allowed_headers=["*"],
                    allowed_methods=[s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                    allowed_origins=["*"],
                    max_age=3600,  # 1 hour in seconds
                ),
            ],
        )
        
        # Create bucket for backups and archives
        self.backup_bucket = s3.Bucket(
            self, "CandleBackupBucket",
            bucket_name=None,  # Auto-generate name
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            versioned=True,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            lifecycle_rules=[
                s3.LifecycleRule(
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(7),
                        ),
                    ],
                    expiration=Duration.days(2555),  # 7 years
                ),
            ],
        )
