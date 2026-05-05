#!/usr/bin/env python3

import sys
import os
# Add the project root to the path so we can import candle_saas
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import aws_cdk as cdk
from candle_saas.stacks.network import NetworkStack
from candle_saas.stacks.database import DatabaseStack
from candle_saas.stacks.storage import StorageStack
from candle_saas.stacks.api import APIStack

app = cdk.App()

# Get configuration from context
env = cdk.Environment(
    account=app.node.try_get_context("account") or "123456789012",
    region=app.node.try_get_context("region") or "us-east-1"
)

# Create network stack
network_stack = NetworkStack(app, "CandleSaasNetworkStack", env=env)

# Create database stack
database_stack = DatabaseStack(
    app, "CandleSaasDatabaseStack", 
    vpc=network_stack.vpc,
    database_sg=network_stack.database_sg,
    env=env
)

# Create storage stack
storage_stack = StorageStack(app, "CandleSaasStorageStack", env=env)

# Create API stack with Lambda functions
api_stack = APIStack(
    app, "CandleSaasAPIStack",
    vpc=network_stack.vpc,
    lambda_sg=network_stack.lambda_sg,
    database=database_stack.database,
    s3_bucket=storage_stack.image_bucket,
    env=env
)

app.synth()
