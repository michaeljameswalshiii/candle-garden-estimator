import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  ScrollView,
  Linking,
  TouchableOpacity,
  Dimensions,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { brand, colors, fonts, radii, spacing } from '../lib/theme';
import { lifestyle, homeGallery } from '../lib/images';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = spacing.md + 4;
const HERO_W = SCREEN_W - H_PAD * 2;
const HERO_H = Math.round(HERO_W * 1.15);
const CARD_W = Math.round(SCREEN_W * 0.72);
const CARD_H = Math.round(CARD_W * 1.15);

const HERO_SLIDES = [
  {
    key: 'gift',
    source: lifestyle.giftCandle,
    title: 'From our hands\nto your home',
    subtitle: 'Hand-poured soy · Atlantic Beach',
  },
  {
    key: 'scent',
    source: lifestyle.scentMoment,
    title: 'Scents that\ntravel through time',
    subtitle: 'Signature fragrances, poured with heart',
  },
  {
    key: 'class',
    source: lifestyle.classPourSmile,
    title: 'Book a candle\nclass',
    subtitle: 'Pour, laugh, and take it home',
  },
];

export default function HomeScreen() {
  const navigation = useNavigation();
  const [heroIndex, setHeroIndex] = useState(0);
  const heroRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => {
      setHeroIndex((i) => {
        const next = (i + 1) % HERO_SLIDES.length;
        try {
          heroRef.current?.scrollToIndex({ index: next, animated: true });
        } catch {
          /* ignore out-of-range during layout */
        }
        return next;
      });
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const onHeroScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / HERO_W);
    if (i >= 0 && i < HERO_SLIDES.length) setHeroIndex(i);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Brand header */}
      <View style={styles.header}>
        <Image
          source={lifestyle.giftCandle}
          style={styles.logoMark}
          resizeMode="cover"
          accessibilityLabel="The Candle Garden"
        />
        <View style={styles.headerText}>
          <Text style={styles.title}>{brand.name}</Text>
          <Text style={styles.location}>{brand.location}</Text>
        </View>
      </View>

      {/* Hero carousel */}
      <View style={styles.heroWrap}>
        <FlatList
          ref={heroRef}
          data={HERO_SLIDES}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onHeroScroll}
          getItemLayout={(_, index) => ({
            length: HERO_W,
            offset: HERO_W * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={styles.heroSlide}>
              <Image source={item.source} style={styles.heroImage} resizeMode="cover" />
              <View style={styles.heroOverlay} />
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>{item.title}</Text>
                <Text style={styles.heroSubtitle}>{item.subtitle}</Text>
              </View>
            </View>
          )}
        />
        <View style={styles.dots}>
          {HERO_SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === heroIndex && styles.dotActive]} />
          ))}
        </View>
      </View>

      <Text style={styles.tagline}>{brand.tagline}</Text>
      <Text style={styles.subtitle}>
        Hand-poured soy candles with premium fragrances — and a little bit of
        “anything is possible.”
      </Text>

      {/* Primary CTAs */}
      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={[styles.cta, styles.ctaPrimary]}
          onPress={() => navigation.navigate('Estimator')}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaPrimaryText}>Refill my vessel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.cta, styles.ctaSecondary]}
          onPress={() => navigation.navigate('Classes')}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaSecondaryText}>Book a class</Text>
        </TouchableOpacity>
      </View>

      {/* Lifestyle story strip */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Life at The Candle Garden</Text>
        <Text style={styles.sectionHint}>Classes, craft & signature scents</Text>
      </View>

      <FlatList
        data={homeGallery}
        keyExtractor={(item) => item.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.galleryList}
        renderItem={({ item }) => (
          <View style={styles.galleryCard}>
            <Image source={item.source} style={styles.galleryImage} resizeMode="cover" />
            <View style={styles.galleryBadge}>
              <Text style={styles.galleryBadgeText}>{item.label}</Text>
            </View>
            <Text style={styles.galleryCaption}>{item.caption}</Text>
          </View>
        )}
      />

      {/* Featured product moment */}
      <View style={styles.featureBlock}>
        <Image
          source={lifestyle.scentMoment}
          style={styles.featureImage}
          resizeMode="cover"
        />
        <View style={styles.featureCopy}>
          <Text style={styles.featureKicker}>Signature scents</Text>
          <Text style={styles.featureHeading}>Voyages in a jar</Text>
          <Text style={styles.featureBody}>
            Every candle is designed to match a mood, a moment, or a memory —
            from Atlantic Beach to Red Currant.
          </Text>
          <TouchableOpacity
            style={styles.inlineLink}
            onPress={() => navigation.navigate('Products')}
          >
            <Text style={styles.inlineLinkText}>Browse the shop →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Class promo with photo */}
      <View style={styles.classPromo}>
        <Image
          source={lifestyle.classTeaching}
          style={styles.classPromoImage}
          resizeMode="cover"
        />
        <View style={styles.classPromoBody}>
          <Text style={styles.classPromoTitle}>Have you booked your candle class?</Text>
          <Text style={styles.classPromoText}>
            Learn to pour, blend fragrance oils, and leave with a candle you made
            yourself.
          </Text>
          <TouchableOpacity
            style={styles.classPromoBtn}
            onPress={() => navigation.navigate('Classes')}
            activeOpacity={0.85}
          >
            <Text style={styles.classPromoBtnText}>See class schedule</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Why the pig */}
      <View style={styles.infoContainer}>
        <Image
          source={lifestyle.redCurrant}
          style={styles.infoThumb}
          resizeMode="cover"
        />
        <Text style={styles.infoHeading}>Why the flying pig?</Text>
        <Text style={styles.infoText}>
          We pour heart, stories, and determination into every candle — from our
          kitchen ten years ago to Atlantic Beach today. The flying pig logo was
          drawn by family, a reminder that anything is possible.
        </Text>
      </View>

      {/* Quick nav cards with photos */}
      <View style={styles.cardRow}>
        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => navigation.navigate('Products')}
          activeOpacity={0.9}
        >
          <Image source={lifestyle.giftCandle} style={styles.featureCardImg} resizeMode="cover" />
          <Text style={styles.featureTitle}>Shop</Text>
          <Text style={styles.featureBody}>Signature scents & best sellers</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => navigation.navigate('Estimator')}
          activeOpacity={0.9}
        >
          <Image source={lifestyle.pouringWax} style={styles.featureCardImg} resizeMode="cover" />
          <Text style={styles.featureTitle}>Refill</Text>
          <Text style={styles.featureBody}>Photo your vessel for an estimate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => navigation.navigate('Classes')}
          activeOpacity={0.9}
        >
          <Image source={lifestyle.classFragrance} style={styles.featureCardImg} resizeMode="cover" />
          <Text style={styles.featureTitle}>Classes</Text>
          <Text style={styles.featureBody}>Book a pour workshop</Text>
        </TouchableOpacity>
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
  scroll: {
    flex: 1,
    backgroundColor: colors.white,
  },
  container: {
    paddingBottom: spacing.xl + 8,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    marginBottom: spacing.md,
    gap: 12,
  },
  logoMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontWeight: '400',
    color: colors.primary,
  },
  location: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  heroWrap: {
    marginBottom: spacing.md,
  },
  heroSlide: {
    width: HERO_W,
    height: HERO_H,
    marginHorizontal: H_PAD,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 56, 49, 0.35)',
  },
  heroCopy: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
  },
  heroTitle: {
    fontFamily: fonts.heading,
    fontSize: 28,
    fontWeight: '400',
    color: colors.white,
    lineHeight: 34,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.3,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
  tagline: {
    fontFamily: fonts.heading,
    fontSize: 17,
    fontStyle: 'italic',
    color: colors.darkAccent,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: H_PAD,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: H_PAD + 8,
    marginBottom: spacing.md,
  },
  ctaRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: 10,
    marginBottom: spacing.lg,
  },
  cta: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  ctaPrimary: {
    backgroundColor: colors.primary,
  },
  ctaPrimaryText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  ctaSecondary: {
    backgroundColor: colors.lightAccent,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  ctaSecondaryText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  sectionHead: {
    paddingHorizontal: H_PAD,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '400',
    color: colors.primary,
  },
  sectionHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  galleryList: {
    paddingHorizontal: H_PAD,
    paddingBottom: spacing.lg,
    gap: 12,
  },
  galleryCard: {
    width: CARD_W,
    marginRight: 4,
  },
  galleryImage: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  galleryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(16, 56, 49, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  galleryBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  galleryCaption: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.darkAccent,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  featureBlock: {
    marginHorizontal: H_PAD,
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureImage: {
    width: '100%',
    height: 220,
  },
  featureCopy: {
    padding: spacing.md,
  },
  featureKicker: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: colors.primaryMid,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  featureHeading: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primary,
    marginBottom: 8,
  },
  featureBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 10,
  },
  inlineLink: {
    alignSelf: 'flex-start',
  },
  inlineLinkText: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  classPromo: {
    marginHorizontal: H_PAD,
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  classPromoImage: {
    width: '100%',
    height: 160,
  },
  classPromoBody: {
    padding: spacing.md,
  },
  classPromoTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.white,
    marginBottom: 8,
  },
  classPromoText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    marginBottom: 14,
  },
  classPromoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
  },
  classPromoBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  infoContainer: {
    backgroundColor: colors.lightAccent,
    padding: spacing.md,
    borderRadius: radii.md,
    marginHorizontal: H_PAD,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  infoThumb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.white,
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
    paddingHorizontal: H_PAD,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  featureCard: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 100,
    overflow: 'hidden',
  },
  featureCardImg: {
    width: '100%',
    height: 72,
    borderRadius: radii.sm,
    marginBottom: 8,
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
    marginHorizontal: H_PAD,
    alignItems: 'center',
  },
  siteButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'capitalize',
  },
});
