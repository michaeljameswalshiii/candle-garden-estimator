"""Cognito custom session exchange after the website verifies an Apple assertion.

Only the trusted website can read the random answer. Public Cognito clients get
a challenge ID, never its answer. Email passwords are preserved when linking.
"""
import hashlib
import hmac
import os
import secrets
import time
import uuid
import boto3

TABLE = os.environ.get("AUTH_TABLE", "candle-garden-detect-rate-limits")


def _table():
    return boto3.resource("dynamodb").Table(TABLE)


def handler(event, context):
    source = event.get("triggerSource")
    request = event.get("request") or {}
    response = event.setdefault("response", {})
    if source == "DefineAuthChallenge_Authentication":
        sessions = request.get("session") or []
        success = bool(sessions and sessions[-1].get("challengeName") == "CUSTOM_CHALLENGE" and sessions[-1].get("challengeResult"))
        response.update({"issueTokens": success, "failAuthentication": len(sessions) >= 3 and not success})
        if not success:
            response["challengeName"] = "CUSTOM_CHALLENGE"
    elif source == "CreateAuthChallenge_Authentication":
        challenge_id = uuid.uuid4().hex
        answer = secrets.token_urlsafe(32)
        _table().put_item(Item={"pk": "apple-auth:" + challenge_id, "answer": answer,
            "username": event["userName"], "expires": int(time.time()) + 120},
            ConditionExpression="attribute_not_exists(pk)")
        response.update({"publicChallengeParameters": {"challengeId": challenge_id},
            "privateChallengeParameters": {"challengeId": challenge_id,
                "answerHash": hashlib.sha256(answer.encode()).hexdigest()}, "challengeMetadata": "APPLE_SESSION"})
    elif source == "VerifyAuthChallengeResponse_Authentication":
        parameters = request.get("privateChallengeParameters") or {}
        answer_hash = hashlib.sha256(str(request.get("challengeAnswer") or "").encode()).hexdigest()
        valid = hmac.compare_digest(answer_hash, str(parameters.get("answerHash") or ""))
        if valid:
            try:
                _table().delete_item(Key={"pk": "apple-auth:" + str(parameters.get("challengeId") or "")},
                    ConditionExpression="username = :username AND expires > :now",
                    ExpressionAttributeValues={":username": event["userName"], ":now": int(time.time())})
            except Exception:
                valid = False
        response["answerCorrect"] = valid
    else:
        raise ValueError("Unsupported authentication trigger")
    return event
