"""Local test dependencies; build the same portable auth layer used by CDK."""
import importlib.util
from pathlib import Path
import sys
import time

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_auth_layer", ROOT / "scripts" / "build_auth_layer.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
sys.path.insert(0, str(builder.build() / "python"))


@pytest.fixture
def signed_identity(monkeypatch):
    import base64
    import cognito_identity
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    from jose import jwt

    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = private.public_key().public_numbers()
    def encoded(value):
        return base64.urlsafe_b64encode(value.to_bytes((value.bit_length()+7)//8, "big")).decode().rstrip("=")
    key = {"kty": "RSA", "kid": "test-key", "use": "sig", "alg": "RS256", "n": encoded(numbers.n), "e": encoded(numbers.e)}
    monkeypatch.setattr(cognito_identity, "_keys", {"value": [key], "expires": time.time()+3600})
    pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    def sign(**overrides):
        claims = {"iss": cognito_identity.ISSUER, "aud": cognito_identity.CLIENT_ID,
            "token_use": "id", "sub": "user-123", "email": "tester@example.com",
            "iat": int(time.time()), "exp": int(time.time())+3600, **overrides}
        return jwt.encode(claims, pem, algorithm="RS256", headers={"kid": "test-key"})
    return sign
