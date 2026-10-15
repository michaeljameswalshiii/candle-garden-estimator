import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { giftCardBalance } from '../lib/apiClient';
import { colors, radii } from '../lib/theme';

export default function GiftCardRedeem({ appliedCode, onApply, disabled }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function apply() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await giftCardBalance(code.trim());
      if (result.balanceCents <= 0) throw new Error('This gift card has no available balance.');
      setBalance(result.balanceCents); onApply(code.trim());
    } catch (failure) { onApply(''); setError(failure.message || 'Could not check this gift card.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.box}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.toggle}>
      <Text style={styles.title}>{appliedCode ? 'Gift card ready to use' : 'Have a gift card?'}</Text>
      <Text style={styles.title}>{open ? '−' : '+'}</Text>
    </TouchableOpacity>
    {open && <>
      <TextInput accessibilityLabel="Gift card code" placeholder="Enter the code from your email" value={code}
        editable={!disabled && !busy} autoCapitalize="characters" autoCorrect={false} maxLength={48}
        onChangeText={value => { setCode(value); setBalance(null); onApply(''); setError(''); }} style={styles.input} />
      <TouchableOpacity accessibilityRole="button" onPress={apply} disabled={disabled || busy || !code.trim()} style={styles.apply}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.applyText}>Check balance & use card</Text>}
      </TouchableOpacity>
      {!!appliedCode && <TouchableOpacity accessibilityRole="button" disabled={disabled} style={styles.toggle}
        onPress={() => { onApply(''); setBalance(null); setCode(''); }}><Text style={styles.title}>Remove gift card</Text></TouchableOpacity>}
    </>}
    {balance !== null && !!appliedCode && <Text accessibilityLiveRegion="polite" style={styles.copy}>
      ${(balance / 100).toFixed(2)} available. Your card is applied when you pay; any remaining balance stays on the card.</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  box: { marginVertical: 10, backgroundColor: colors.lightAccent, paddingHorizontal: 14, borderRadius: radii.md },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  input: { backgroundColor: colors.white, minHeight: 50, padding: 12, fontSize: 16, color: colors.text, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong },
  apply: { minHeight: 48, marginVertical: 10, padding: 12, backgroundColor: colors.primary, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  copy: { color: colors.primary, fontSize: 13, lineHeight: 20, paddingBottom: 12 }, error: { color: colors.danger, fontSize: 13, paddingBottom: 12 },
});
