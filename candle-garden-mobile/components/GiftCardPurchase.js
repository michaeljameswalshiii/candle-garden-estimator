import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '../lib/theme';
import { useStripe } from '../lib/stripeBridge';
import { stripeConfigured, stripeTestMode } from '../lib/stripeConfig';
import { createStripePaymentSheet, finalizeStripePayment, cancelGiftCheckout, giftCheckoutStatus } from '../lib/apiClient';
import { loadGiftCheckout, saveGiftCheckout, clearGiftCheckout } from '../lib/giftCheckoutStorage';

const AMOUNTS = [25, 50, 75, 100, 250, 500];

export default function GiftCardPurchase(props) {
  return stripeConfigured ? <ConnectedPurchase {...props} /> : <Purchase {...props} />;
}

function ConnectedPurchase(props) {
  const stripe = useStripe();
  return <Purchase {...props} stripe={stripe} />;
}

function Purchase({ visible, onClose, stripe }) {
  const [amount, setAmount] = useState(50);
  const [sendTo, setSendTo] = useState('me');
  const [form, setForm] = useState({ email: '', recipientEmail: '', recipientName: '', senderName: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [complete, setComplete] = useState(null);
  const lock = useRef(false);
  const [loading, setLoading] = useState(true);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    loadGiftCheckout('purchase').then(value => { if (active) { setPending(value); setRecoveryFailed(false); } })
      .catch(() => { if (active) { setRecoveryFailed(true); setError('Could not recover checkout. Please reopen this sheet before paying.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible]);

  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  async function purchase() {
    if (lock.current || loading || recoveryFailed) return;
    if (!stripe) { setError('Gift card payment is not configured in this app build.'); return; }
    if (!pending && (!emailValid(form.email) || (sendTo === 'recipient' && !emailValid(form.recipientEmail)))) {
      setError('Enter a valid receipt email and, when sending a gift, a recipient email.'); return;
    }
    lock.current = true; setBusy(true); setError('');
    let checkout = pending;
    try {
      if (!checkout) {
        const delivery = { email: (sendTo === 'me' ? form.email : form.recipientEmail).trim(),
          recipientName: form.recipientName, senderName: form.senderName, message: form.message };
        checkout = await createStripePaymentSheet([{ type: 'gift_card', quantity: 1, giftAmount: amount, delivery }],
          { email: form.email, name: form.senderName, fulfillment: 'digital' });
        checkout = { ...checkout, deliveryEmail: delivery.email, giftAmount: amount };
        setPending(checkout);
        await saveGiftCheckout('purchase', checkout);
      }
      // A previous attempt might have paid successfully before the app closed.
      let result = await finalizeStripePayment(checkout.paymentIntentId, checkout);
      if (!result.paid) {
        const initialized = await stripe.initPaymentSheet({ merchantDisplayName: 'The Candle Garden',
          paymentIntentClientSecret: checkout.paymentIntentClientSecret,
          googlePay: { merchantCountryCode: 'US', testEnv: stripeTestMode },
          returnURL: 'candlegarden://stripe-redirect', allowsDelayedPaymentMethods: false });
        if (initialized.error) throw initialized.error;
        const presented = await stripe.presentPaymentSheet();
        if (presented.error) {
          if (presented.error.code === 'Canceled') {
            const cancelled = await cancelGiftCheckout(checkout);
            if (cancelled.paid) result = cancelled;
            else { await clearGiftCheckout('purchase'); setPending(null); return; }
          } else throw presented.error;
        } else result = await finalizeStripePayment(checkout.paymentIntentId, checkout);
      }
      if (!result.paid) throw new Error('Payment is still pending. Use Check payment before starting another purchase.');
      const status = await giftCheckoutStatus(checkout);
      setComplete({ ...checkout, emailSent: status.emailSent });
      await clearGiftCheckout('purchase'); setPending(null);
    } catch (failure) {
      setError(failure.message || 'Could not complete checkout. Check your payment before trying again.');
    } finally { lock.current = false; setBusy(false); }
  }

  async function cancelPending() {
    if (lock.current || !pending) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await cancelGiftCheckout(pending);
      if (result.paid) {
        const status = await giftCheckoutStatus(pending);
        setComplete({ ...pending, emailSent: status.emailSent });
      }
      await clearGiftCheckout('purchase'); setPending(null);
    } catch (failure) { setError(failure.message || 'Cancellation is pending. Please check again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  const field = (key, label, extra = {}) => <View style={styles.field} key={key}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} style={[styles.input, extra.multiline && styles.message]}
      value={form[key]} onChangeText={value => update(key, value)} editable={!busy && !pending}
      maxLength={key === 'message' ? 500 : key.toLowerCase().includes('email') ? 254 : 80} {...extra} />
  </View>;

  return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.top}>
          <Text style={styles.title}>Give a gift card</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close gift cards" disabled={busy}
            onPress={onClose} style={styles.close}><Ionicons name="close" size={26} color={colors.primary} /></TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {complete ? <View accessibilityLiveRegion="polite">
            <Ionicons name="checkmark-circle-outline" color={colors.primary} size={48} />
            <Text style={styles.title}>{stripeTestMode ? 'Test gift card purchased' : 'Your gift is on its way'}</Text>
            <Text style={styles.copy}>${complete.giftAmount} gift card for {complete.deliveryEmail}.</Text>
            <Text style={styles.copy}>{complete.emailSent ? 'The gift card email has been sent.' : 'Payment is confirmed. Your gift card email is being prepared; delivery retries automatically.'}</Text>
            <Text style={styles.copy}>The email contains the redemption code for candles, refills, and classes in the Candle Garden app.</Text>
            <TouchableOpacity style={styles.secondary} accessibilityRole="button" onPress={async () => {
              try { const status = await giftCheckoutStatus(complete); setComplete(value => ({ ...value, emailSent: status.emailSent })); }
              catch (failure) { setError(failure.message); }
            }}><Text style={styles.secondaryText}>Check email delivery</Text></TouchableOpacity>
          </View> : <>
            <View style={styles.preview}><Ionicons name="gift-outline" size={32} color={colors.primary} />
              <Text style={styles.brand}>The Candle Garden</Text><Text style={styles.value}>${pending?.giftAmount || amount}</Text>
              <Text style={styles.copy}>A little joy, delivered by email.</Text></View>
            <Text style={styles.copy}>For candles, refills, and classes in the app. Unused value stays on the card.</Text>
            {stripeTestMode && <Text style={styles.copy}>Test mode: no real charge. Test gift cards work only in test checkout.</Text>}
            {pending ? <View><Text style={styles.label}>You have an unfinished gift card checkout.</Text>
              <Text style={styles.copy}>Check or continue this payment before starting another purchase.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={cancelPending} disabled={busy} style={styles.secondary}>
                <Text style={styles.secondaryText}>Cancel pending purchase</Text></TouchableOpacity></View> : <>
              <Text style={styles.label}>Choose an amount</Text>
              <View style={styles.amounts}>{AMOUNTS.map(value => <TouchableOpacity key={value} accessibilityRole="radio"
                accessibilityState={{ selected: amount === value }} disabled={busy} onPress={() => setAmount(value)}
                style={[styles.amount, amount === value && styles.selected]}>
                <Text style={[styles.amountText, amount === value && styles.selectedText]}>${value}</Text></TouchableOpacity>)}</View>
              <Text style={styles.label}>Where should we send it?</Text>
              <View style={styles.delivery}>{[['me', 'Email to me'], ['recipient', 'Send to someone']].map(([value, label]) =>
                <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ selected: sendTo === value }}
                  disabled={busy} onPress={() => setSendTo(value)} style={[styles.deliveryChoice, sendTo === value && styles.selected]}>
                  <Text style={[styles.amountText, sendTo === value && styles.selectedText]}>{label}</Text></TouchableOpacity>)}</View>
              {field('email', 'Your email (receipt)', { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false, autoComplete: 'email' })}
              {sendTo === 'recipient' && field('recipientEmail', 'Recipient email', { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false })}
              {field('recipientName', 'Recipient name (optional)')}
              {field('senderName', 'Your name (optional)')}
              {field('message', 'Personal message (optional)', { multiline: true })}
              <Text style={styles.copy}>Email delivery after payment. Redeem in app checkout using the emailed code.</Text>
            </>}
          </>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </ScrollView>
        <View style={styles.bottom}>
          <TouchableOpacity accessibilityRole="button" disabled={busy || loading || recoveryFailed} style={[styles.pay, (busy || loading || recoveryFailed) && styles.disabled]}
            onPress={complete ? () => { setComplete(null); setError(''); onClose(); } : purchase}>
            {busy || loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.payText}>
              {complete ? 'Done' : pending ? 'Check payment / continue' : `Continue to payment · $${amount}`}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white }, fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: colors.border },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.primary, flexShrink: 1 },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  preview: { backgroundColor: colors.lightAccent, borderRadius: radii.lg, padding: 24, alignItems: 'center', marginBottom: 12 },
  brand: { fontFamily: fonts.heading, fontSize: 23, color: colors.primary, marginTop: 12 },
  value: { fontSize: 40, color: colors.primary, marginTop: 10 },
  copy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, marginVertical: 8 },
  label: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600', color: colors.primary, marginTop: 12, marginBottom: 8 },
  amounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amount: { width: '31%', minHeight: 52, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md },
  amountText: { fontSize: 16, color: colors.primary, fontWeight: '600', textAlign: 'center' },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary }, selectedText: { color: colors.white },
  delivery: { flexDirection: 'row', gap: 8 }, deliveryChoice: { flex: 1, minHeight: 52, padding: 8, justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md },
  field: { marginBottom: 4 }, input: { minHeight: 50, padding: 12, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, color: colors.text, fontSize: 16 },
  message: { minHeight: 100, textAlignVertical: 'top' }, error: { color: colors.danger, fontSize: 14, marginTop: 14 },
  bottom: { padding: 16, borderTopWidth: 1, borderColor: colors.border }, pay: { backgroundColor: colors.primary, minHeight: 52, borderRadius: radii.md, padding: 14, alignItems: 'center', justifyContent: 'center' },
  payText: { color: colors.white, fontSize: 16, fontWeight: '600' }, disabled: { opacity: 0.6 },
  secondary: { minHeight: 48, justifyContent: 'center', marginVertical: 8 }, secondaryText: { color: colors.primary, fontSize: 15, textDecorationLine: 'underline' },
});
