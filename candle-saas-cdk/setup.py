import setuptools
import os

with open("README.md") as fp:
    long_description = fp.read()

# Determine the correct path based on where setup.py is located
script_dir = os.path.dirname(os.path.abspath(__file__))
package_dir = os.path.join(script_dir, "candle_saas")

setuptools.setup(
    name="candle_saas",
    version="0.1.0",
    description="AWS CDK project for candle refill SaaS platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Your Organization",
    packages=setuptools.find_packages(package_dir),
    package_dir={"": package_dir},
    install_requires=[
        "aws-cdk-lib==2.80.0",
        "constructs>=10.0.0",
    ],
    python_requires=">=3.9",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: Apache Software License",
        "Programming Language :: Python :: 3 :: Only",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
