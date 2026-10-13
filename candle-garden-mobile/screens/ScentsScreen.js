import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { REFILL_SCENTS } from '../lib/scents';
import { colors, fonts, radii, spacing } from '../lib/theme';

export default function ScentsScreen() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>The Candle Garden</Text>
      <Text style={styles.title}>Scents</Text>
      <Text style={styles.lead}>
        These are the scents you can choose for a refill. The notes are the ones published on the shop.
      </Text>
      {REFILL_SCENTS.map((scent) => (
        <View key={scent.name} style={styles.card}>
          <Text style={styles.name}>{scent.name}</Text>
          {scent.notes ? <Text style={styles.notes}>{scent.notes}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.white },
  container: { padding: spacing.md + 4, paddingBottom: 32 },
  kicker: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 1.2, color: colors.textMuted, textTransform: 'uppercase' },
  title: { fontFamily: fonts.heading, fontSize: 28, color: colors.primary, marginTop: 4, marginBottom: 8 },
  lead: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  name: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  notes: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
});
