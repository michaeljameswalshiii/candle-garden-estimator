import React from 'react';
import { StyleSheet, Text, View, Image, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { assets, brand, colors, fonts, radii, spacing } from '../lib/theme';

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image
        source={{ uri: assets.logo }}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="The Candle Garden flying pig logo"
      />

      <Text style={styles.title}>{brand.name}</Text>
      <Text style={styles.location}>{brand.location}</Text>
      <Text style={styles.tagline}>{brand.tagline}</Text>

      <Image
        source={{ uri: assets.hero }}
        style={styles.hero}
        resizeMode="cover"
        accessibilityLabel="The Candle Garden storefront"
      />

      <Text style={styles.subtitle}>
        Hand-poured soy candles with premium fragrances — and a little bit of
        “anything is possible.”
      </Text>

      <View style={styles.infoContainer}>
        <Text style={styles.infoHeading}>Why the flying pig?</Text>
        <Text style={styles.infoText}>
          We pour heart, stories, and determination into every candle — from our
          kitchen ten years ago to Atlantic Beach today.
        </Text>
      </View>

      <View style={styles.cardRow}>
        <View style={styles.featureCard}>
          <Text style={styles.featureEmoji}>🕯️</Text>
          <Text style={styles.featureTitle}>Shop</Text>
          <Text style={styles.featureBody}>Browse signature scents & best sellers</Text>
        </View>
        <View style={styles.featureCard}>
          <Text style={styles.featureEmoji}>📐</Text>
          <Text style={styles.featureTitle}>Refill</Text>
          <Text style={styles.featureBody}>Photo your vessel for a wax estimate</Text>
        </View>
        <View style={styles.featureCard}>
          <Text style={styles.featureEmoji}>🗓️</Text>
          <Text style={styles.featureTitle}>Classes</Text>
          <Text style={styles.featureBody}>Book a candle class on our schedule</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.siteButton}
        onPress={() => Linking.openURL(brand.siteUrl)}
        activeOpacity={0.8}
      >
        <Text style={styles.siteButtonText}>Visit thecandlegarden.co</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    paddingHorizontal: spacing.md + 4,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    fontWeight: '400',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  location: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 6,
  },
  tagline: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.darkAccent,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  hero: {
    width: '100%',
    height: 180,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '400',
    marginBottom: spacing.md,
    textAlign: 'center',
    color: colors.textSecondary,
    lineHeight: 24,
  },
  infoContainer: {
    backgroundColor: colors.lightAccent,
    padding: spacing.md,
    borderRadius: radii.md,
    width: '100%',
    marginBottom: spacing.md,
  },
  infoHeading: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '400',
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  cardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  featureCard: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm + 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 100,
  },
  featureEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  featureTitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  featureBody: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 15,
  },
  siteButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radii.sm,
    marginTop: spacing.sm,
  },
  siteButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'capitalize',
  },
});
