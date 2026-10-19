export async function succeededRefundCents(paymentIntentId: string, key: string): Promise<number> {
  if (!paymentIntentId || !key) return 0;
  try {
    const response = await fetch(
      `https://api.stripe.com/v1/refunds?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=100`,
      { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!response.ok) return 0;
    const body = await response.json() as { data?: Array<{ amount?: number; status?: string }> };
    return (body.data || []).reduce((sum, refund) => {
      if (refund.status !== "succeeded" && refund.status !== "pending") return sum;
      return sum + Number(refund.amount || 0);
    }, 0);
  } catch {
    return 0;
  }
}
