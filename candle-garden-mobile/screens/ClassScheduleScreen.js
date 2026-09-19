import React from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getUpcomingClasses } from '../lib/classesCatalog';
import { BOOKING_PAGE_URL } from '../lib/schedulingConfig';
import { colors, fonts, radii, spacing } from '../lib/theme';

export default function ClassScheduleScreen() {
  const upcoming = getUpcomingClasses().slice(0, 12);

  const openBooking = async (url) => {
    const target = url || BOOKING_PAGE_URL;
    try {
      const supported = await Linking.canOpenURL(target);
      if (supported) {
        await Linking.openURL(target);
        return;
      }
    } catch {
      /* fall through */
    }
    Alert.alert(
      'Open classes',
      'Could not open the website. Visit thecandlegarden.co/candle-garden-events in Safari.'
    );
  };

  const bookClass = (course) => {
    if (course.soldOut) {
      Alert.alert('Sold out', 'That class is not available right now.');
      return;
    }
    openBooking(course.url || BOOKING_PAGE_URL);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Book a class</Text>
          <Text style={styles.subtitle}>
            Seats are sold on the Candle Garden website. Acuity is paused and is not used.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel="Open class schedule in browser"
          onPress={() => openBooking(BOOKING_PAGE_URL)}
          style={styles.browserButton}
        >
          <Text style={styles.browserButtonText}>Open website</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        <TouchableOpacity style={styles.heroBtn} onPress={() => openBooking(BOOKING_PAGE_URL)}>
          <Text style={styles.heroBtnText}>Book on thecandlegarden.co</Text>
          <Text style={styles.heroBtnSub}>Live seats and checkout</Text>
        </TouchableOpacity>
        {upcoming.map((course) => (
          <View key={course.id} style={styles.classCard}>
            {course.image ? (
              <Image source={{ uri: course.image }} style={styles.classImage} />
            ) : null}
            <View style={styles.classBody}>
              <Text style={styles.classTitle} numberOfLines={2}>{course.title}</Text>
              <Text style={styles.classMeta}>{course.scheduleLabel}</Text>
              <Text style={styles.classPrice}>${Number(course.price).toFixed(0)}</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => bookClass(course)}>
                <Text style={styles.addBtnText}>{course.soldOut ? 'Sold out' : 'Book this class'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headingCopy: { flex: 1 },
  title: { color: colors.primary, fontFamily: fonts.heading, fontSize: 19 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  browserButton: {
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  browserButtonText: { color: colors.primary, fontFamily: fonts.body, fontSize: 12, fontWeight: '600' },
  list: { padding: spacing.md, gap: 12, paddingBottom: 32 },
  heroBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md || 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  heroBtnText: { color: colors.white, fontFamily: fonts.heading, fontSize: 18 },
  heroBtnSub: { color: colors.white, fontFamily: fonts.body, fontSize: 12, marginTop: 4, opacity: 0.9 },
  classCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md || 10,
    padding: 10,
    backgroundColor: colors.surface,
    gap: 10,
  },
  classImage: { width: 88, height: 88, borderRadius: 8, backgroundColor: colors.border },
  classBody: { flex: 1 },
  classTitle: { color: colors.primary, fontFamily: fonts.heading, fontSize: 16 },
  classMeta: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
  classPrice: { color: colors.primary, fontFamily: fonts.body, fontWeight: '700', marginTop: 4 },
  addBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
  },
  addBtnText: { color: colors.white, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
});
