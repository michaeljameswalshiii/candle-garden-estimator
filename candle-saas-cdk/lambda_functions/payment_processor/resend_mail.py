"""Resend transport compatible with the existing transactional email interface."""
import json
import urllib.error
import urllib.request


class ResendMailClient:
    def __init__(self, api_key):
        if not api_key:
            raise RuntimeError("Resend email is not configured yet.")
        self.api_key = api_key

    def send_email(self, Source, Destination, Message, ReplyToAddresses=None, IdempotencyKey=None):
        body = {"from": Source, "to": Destination["ToAddresses"], "subject": Message["Subject"]["Data"]}
        for source, target in (("Text", "text"), ("Html", "html")):
            if Message.get("Body", {}).get(source):
                body[target] = Message["Body"][source]["Data"]
        if ReplyToAddresses:
            body["reply_to"] = ReplyToAddresses
        headers = {"Authorization": "Bearer " + self.api_key, "Content-Type": "application/json",
            "User-Agent": "CandleGardenTransactionalEmail/1.0"}
        if IdempotencyKey:
            headers["Idempotency-Key"] = IdempotencyKey
        request = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(body).encode(),
            method="POST", headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                result = json.loads(response.read().decode())
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Resend email delivery failed (HTTP {error.code}).") from error
        if not result.get("id"):
            raise RuntimeError("Resend did not confirm email acceptance.")
        return {"MessageId": result["id"]}
