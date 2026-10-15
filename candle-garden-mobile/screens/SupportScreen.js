import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { COMMERCE_BASE } from '../lib/apiClient';
import { useAuth } from '../lib/AuthContext';

const MIKE = 'mike@tripleibusinesssolutions.com';
const PIG = 'thepotentpig@gmail.com';

export default function SupportScreen() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const emailUs = () => {
    const subject = encodeURIComponent('Candle Garden app');
    const body = encodeURIComponent(message.trim());
    Linking.openURL(`mailto:${MIKE},${PIG}?subject=${subject}&body=${body}`);
  };

  const send = async () => {
    if (name.trim().length < 2 || message.trim().length < 8) {
      Alert.alert('Add a note', 'Include your name and a short message.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${COMMERCE_BASE}/api/app-support`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send that note.');
      setSent(true);
    } catch (error) {
      Alert.alert('Not sent', error.message || 'Use Email us so your mail app can send it.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>Having a problem or question? Contact us.</Text>
      <TouchableOpacity style={styles.secondary} onPress={emailUs} accessibilityRole="button">
        <Text style={styles.secondaryText}>Email us</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>Opens your mail app with a new message ready to send.</Text>
      <View style={styles.card}>
        <Text style={styles.heading}>Or send a note here</Text>
        {sent ? <Text style={styles.thanks}>Sent. We have your note.</Text> : (
          <>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.textFaint} autoCapitalize="words" />
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            <Text style={styles.label}>Message</Text>
            <TextInput style={[styles.input, styles.multiline]} value={message} onChangeText={setMessage} placeholder="What do you need?" placeholderTextColor={colors.textFaint} multiline />
            <TouchableOpacity style={styles.button} onPress={send} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Send</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.md, paddingBottom: 40 },
  lead: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center', marginBottom: 16 },
  secondary: { borderWidth: 1, borderColor: colors.primary, borderRadius: radii.sm, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: colors.primary, fontFamily: fonts.body, fontSize: 15, fontWeight: '600' },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  heading: { fontFamily: fonts.heading, fontSize: 22, color: colors.primary, marginBottom: 12 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, padding: 12, fontSize: 16, backgroundColor: colors.white, color: colors.text, fontFamily: fonts.body },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  button: { backgroundColor: colors.primary, borderRadius: radii.sm, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: colors.white, fontFamily: fonts.body, fontSize: 15, fontWeight: '600' },
  thanks: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
});
