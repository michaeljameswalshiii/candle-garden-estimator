"""
Unit tests for Candle SaaS CDK infrastructure.
"""

import pytest
from aws_cdk import Stack
from aws_cdk.assertions import Template
from candle_saas.stacks.network import NetworkStack
from candle_saas.stacks.storage import StorageStack


def test_network_stack_creates_vpc():
    """Test that NetworkStack creates VPC with correct configuration."""
    stack = NetworkStack(Stack(None, "test"), "TestNetworkStack")
    
    template = Template.from_stack(stack)
    
    # Verify VPC is created
    template.resource_count_is("AWS::EC2::VPC", 1)
    
    # Verify security groups are created
    template.resource_count_is("AWS::EC2::SecurityGroup", 2)


def test_storage_stack_creates_buckets():
    """Test that StorageStack creates S3 buckets."""
    stack = StorageStack(Stack(None, "test"), "TestStorageStack")
    
    template = Template.from_stack(stack)
    
    # Verify S3 buckets are created
    template.resource_count_is("AWS::S3::Bucket", 2)


if __name__ == "__main__":
    pytest.main([__file__])
