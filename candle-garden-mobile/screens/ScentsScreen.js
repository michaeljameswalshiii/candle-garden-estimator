import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { REFILL_SCENTS } from '../lib/scents';
import { lifestyle } from '../lib/images';
import { colors, fonts, radii, spacing } from '../lib/theme';

export default function ScentsScreen() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>The Candle Garden</Text>
      <Text style={styles.title}>Scents</Text>
      <Text style={styles.lead}>
        These are the scents you can choose for a refill.
      </Text>
      <View style={styles.heroCard}>
        <Image
          source={lifestyle.scentAlmond}
          style={styles.hero}
          resizeMode="cover"
          accessibilityLabel="Almond candles with star anise"
        />
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>In the jar</Text>
          <Text style={styles.heroName}>Almond</Text>
          <Text style={styles.heroNotes}>Cinnamon, nutmeg, amaretto, and vanilla</Text>
        </View>
      </View>
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
  heroCard: { borderRadius: radii.md, overflow: 'hidden', marginBottom: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  hero: { width: '100%', aspectRatio: 684 / 1024 },
  heroCopy: { paddingHorizontal: 14, paddingVertical: 12 },
  heroKicker: { fontFamily: fonts.body, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.primaryMid, marginBottom: 2 },
  heroName: { fontFamily: fonts.heading, fontSize: 22, color: colors.primary },
  heroNotes: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  name: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  notes: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
});
