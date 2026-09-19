import React from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AcuityScheduler from '../components/AcuityScheduler';
import { getUpcomingClasses } from '../lib/classesCatalog';
import { BOOKING_PAGE_URL } from '../lib/schedulingConfig';
import { colors, fonts, radii, spacing } from '../lib/theme';

export default function ClassScheduleScreen() {
  const upcoming = getUpcomingClasses().slice(0, 8);

  const openBooking = async (url) => {
    const target = url || BOOKING_PAGE_URL;
    try {
      await Linking.openURL(target);
    } catch {
      // Embedded Squarespace page remains available if an external browser cannot open.
    }
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
          <Text style={styles.subtitle}>Live availability from thecandlegarden.co</Text>
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
      {upcoming.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classList}>
          {upcoming.map((course) => (
            <View key={course.id} style={styles.classCard}>
              {course.image ? (
                <Image source={{ uri: course.image }} style={styles.classImage} />
              ) : null}
              <Text style={styles.classTitle} numberOfLines={2}>{course.title}</Text>
              <Text style={styles.classMeta}>{course.scheduleLabel}</Text>
              <Text style={styles.classPrice}>${Number(course.price).toFixed(0)}</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => bookClass(course)}>
                <Text style={styles.addBtnText}>{course.soldOut ? 'Sold out' : 'Book on site'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.scheduler}>
        <AcuityScheduler />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
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
  headingCopy: {
    flex: 1,
  },
  title: {
    color: colors.primary,
    fontFamily: fonts.heading,
    fontSize: 19,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  browserButton: {
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  browserButtonText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  classList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 10,
  },
  classCard: {
    width: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md || 10,
    padding: 10,
    backgroundColor: colors.surface,
  },
  classImage: {
    width: '100%',
    height: 88,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: colors.border,
  },
  classTitle: {
    color: colors.primary,
    fontFamily: fonts.heading,
    fontSize: 15,
  },
  classMeta: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 4,
  },
  classPrice: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: '700',
    marginTop: 4,
  },
  addBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addBtnText: {
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  scheduler: {
    flex: 1,
  },
});
