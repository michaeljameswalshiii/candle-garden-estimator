#!/usr/bin/env python3

import sys
import os
# Add the project root to the path so we can import candle_saas
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import aws_cdk as cdk
from candle_saas.stacks.api import APIStack

app = cdk.App()

# Get configuration from context
env = cdk.Environment(
    account=app.node.try_get_context("account") or "635449373837",
    region=app.node.try_get_context("region") or "us-east-1"
)

# Network + storage stacks stay down. The idle NAT gateway was ~$40/mo and the
# detector only needs public Bedrock/DynamoDB, not a VPC.
api_stack = APIStack(
    app, "CandleSaasAPIStack",
    vpc=None,
    lambda_sg=None,
    database=None,
    s3_bucket=None,
    env=env
)

app.synth()
