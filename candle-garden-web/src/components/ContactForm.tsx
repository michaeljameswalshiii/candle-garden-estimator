"use client";

import { FormEvent, useState } from "react";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, phone, message }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not send that note.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return <p className="contact-thanks">Thanks — Jordan will see this in the garden desk.</p>;
  }

  return (
    <form className="contact-form" onSubmit={(event) => void onSubmit(event)}>
      <p className="eyebrow">Write us</p>
      <h2>A note for the shop</h2>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        Phone
        <input value={phone} onChange={(event) => setPhone(event.target.value)} />
      </label>
      <label>
        Message
        <textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} required />
      </label>
      {error ? <p className="admin-error">{error}</p> : null}
      <button className="button button-dark" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send to the garden"}
      </button>
    </form>
  );
}
