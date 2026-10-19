"""Verified Cognito identity for public Lambda routes (packaged in the auth layer)."""
import json
import time
import urllib.request

from jose import jwt

ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_WTA7ZWxcr"
CLIENT_ID = "19gc38poajblf8qsagv3s93nvu"
_keys = {"value": [], "expires": 0}


def _signing_keys(force=False):
    if _keys["expires"] <= time.time() or (force and time.time() - _keys.get("fetched", 0) >= 60):
        with urllib.request.urlopen(ISSUER + "/.well-known/jwks.json", timeout=5) as response:
            keys = json.load(response)["keys"]
        _keys.update(value=keys, expires=time.time() + 3600, fetched=time.time())
    return _keys["value"]


def verified_claims(event):
    # API Gateway's authorizer context is server-created, never taken from headers/body.
    authorizer = (event.get("requestContext") or {}).get("authorizer") or {}
    claims = authorizer.get("claims") or {}
    if isinstance(claims, dict) and claims.get("sub"):
        return claims
    headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
    authorization = headers.get("authorization", "")
    if not authorization:
        return {}
    if not authorization.lower().startswith("bearer "):
        raise ValueError("Please sign in again.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        if len(token) > 16000:
            raise ValueError("Token too large")
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str) or len(header["kid"]) > 256:
            raise ValueError("Unsupported algorithm")
        key = next((key for key in _signing_keys() if key.get("kid") == header.get("kid")), None)
        if key is None:
            # Refresh once on rotation; never fetch a URL supplied by the token.
            key = next(key for key in _signing_keys(force=True) if key.get("kid") == header.get("kid"))
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=ISSUER,
            options={"verify_aud": False, "verify_at_hash": False,
                "require_exp": True, "require_sub": True, "require_iat": True})
        if claims.get("token_use") == "id":
            if claims.get("aud") != CLIENT_ID:
                raise ValueError("Wrong audience")
        elif claims.get("token_use") == "access":
            if claims.get("client_id") != CLIENT_ID:
                raise ValueError("Wrong client")
        else:
            raise ValueError("Wrong token use")
        if not isinstance(claims.get("sub"), str) or not claims["sub"]:
            raise ValueError("Missing subject")
        return claims
    except Exception as error:
        raise ValueError("Please sign in again.") from error
