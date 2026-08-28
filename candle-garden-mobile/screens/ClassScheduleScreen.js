import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  Linking,
} from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { classHero, classStrip } from '../lib/images';
import { getUpcomingClasses, CLASSES_PAGE_URL } from '../lib/classesCatalog';

export default function ClassScheduleScreen() {
  const classes = useMemo(() => getUpcomingClasses(), []);

  const handleBookClass = (classItem) => {
    const url = classItem.url || CLASSES_PAGE_URL;
    Alert.alert(
      'Book this class',
      `${classItem.scheduleLabel || classItem.title}\n\n$${Number(classItem.price).toFixed(2)} per seat\n\nContinue to thecandlegarden.co to reserve your spot?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book on website',
          onPress: () => Linking.openURL(url).catch(() => {}),
        },
      ]
    );
  };

  const renderClass = ({ item }) => {
    const availability = 'Check live availability';

    return (
      <View style={styles.classCard}>
        <View style={styles.classHeader}>
          <View style={styles.classTitles}>
            <Text style={styles.classTitle}>{item.title}</Text>
            <Text style={styles.scheduleLabel}>{item.scheduleLabel}</Text>
          </View>
          <Text style={styles.classPrice}>
            ${item.price != null ? Number(item.price).toFixed(2) : '—'}
          </Text>
        </View>

        {item.description ? (
          <Text style={styles.classDescription} numberOfLines={4}>
            {item.description}
          </Text>
        ) : null}

        <View style={styles.classDetails}>
          {item.dateDisplay ? (
            <Text style={styles.detailText}>📅 {item.dateDisplay}</Text>
          ) : null}
          {item.time ? <Text style={styles.detailText}>🕐 {item.time}</Text> : null}
          {item.duration ? <Text style={styles.detailText}>⏱️ {item.duration}</Text> : null}
          {item.location ? (
            <Text style={styles.detailText} numberOfLines={1}>
              📍 {item.location}
            </Text>
          ) : null}
        </View>

        <View style={styles.classFooter}>
          <Text
            style={styles.availability}
          >
            {availability}
          </Text>
          <TouchableOpacity
            style={styles.bookButton}
            onPress={() => handleBookClass(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.bookButtonText}>
              View & book
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={classes}
        keyExtractor={(item) => item.id || item.scheduleLabel}
        renderItem={renderClass}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Image source={classHero} style={styles.heroImage} resizeMode="cover" />
              <View style={styles.heroOverlay} />
              <Text style={styles.heroTitle}>Candle classes</Text>
              <Text style={styles.heroSubtitle}>
                Preview upcoming sessions and confirm live details online
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.strip}
            >
              {classStrip.map((src, i) => (
                <Image key={i} source={src} style={styles.stripImage} resizeMode="cover" />
              ))}
            </ScrollView>
            <Text style={styles.title}>Upcoming classes</Text>
            <Text style={styles.subtitle}>
              {`Pour two 8.5oz soy candles · about 1 hour · $${
                classes[0]?.price != null ? Number(classes[0].price).toFixed(0) : '60'
              }/seat`}
            </Text>
            <TouchableOpacity
              style={styles.siteLink}
              onPress={() => Linking.openURL(CLASSES_PAGE_URL).catch(() => {})}
            >
              <Text style={styles.siteLinkText}>View live schedule & availability on website →</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No classes listed right now</Text>
            <TouchableOpacity onPress={() => Linking.openURL(CLASSES_PAGE_URL)}>
              <Text style={styles.siteLinkText}>Check the website</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  hero: {
    height: 200,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    justifyContent: 'flex-end',
    backgroundColor: colors.surface,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 56, 49, 0.4)',
  },
  heroTitle: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: colors.white,
    paddingHorizontal: 16,
    zIndex: 1,
  },
  heroSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginTop: 4,
    zIndex: 1,
  },
  strip: {
    gap: 10,
    paddingBottom: spacing.md,
  },
  stripImage: {
    width: 120,
    height: 120,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 5,
    marginTop: 4,
    color: colors.primary,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  siteLink: {
    alignItems: 'center',
    marginBottom: 16,
  },
  siteLinkText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  list: {
    paddingBottom: 28,
  },
  classCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  classTitles: {
    flex: 1,
    paddingRight: 8,
  },
  classTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '400',
    color: colors.darkAccent,
  },
  scheduleLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 2,
  },
  classPrice: {
    fontFamily: fonts.body,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  classDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  classDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  detailText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  classFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  availability: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  bookButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: radii.sm,
  },
  bookButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  bookButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.textMuted,
  },
});
