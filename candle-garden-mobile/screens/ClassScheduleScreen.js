import React from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AcuityScheduler from '../components/AcuityScheduler';
import { useCart } from '../lib/cart';
import { getUpcomingClasses } from '../lib/classesCatalog';
import { ACUITY_SCHEDULER_URL } from '../lib/schedulingConfig';
import { colors, fonts, radii, spacing } from '../lib/theme';

export default function ClassScheduleScreen() {
  const { addItem } = useCart();
  const upcoming = getUpcomingClasses().slice(0, 8);

  const openInBrowser = async () => {
    try {
      await Linking.openURL(ACUITY_SCHEDULER_URL);
    } catch {
      // The embedded scheduler remains available if an external browser cannot open.
    }
  };

  const addClass = (course) => {
    if (course.soldOut) {
      Alert.alert('Sold out', 'That class is not available right now.');
      return;
    }
    addItem(
      {
        id: course.id,
        type: 'class',
        name: course.title,
        price: course.price,
        image: course.image,
        url: course.url,
        date: course.date,
        scheduleLabel: course.scheduleLabel,
      },
      { type: 'class', quantity: 1, size: course.scheduleLabel }
    );
    Alert.alert(
      'Added to cart',
      `${course.title} (${course.scheduleLabel}) is in your cart. Pay with shop items and refills in the Cart tab.`
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Schedule an appointment</Text>
          <Text style={styles.subtitle}>Add a class to your cart, or pick a time below.</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel="Open scheduler in browser"
          onPress={openInBrowser}
          style={styles.browserButton}
        >
          <Text style={styles.browserButtonText}>Open in browser</Text>
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
              <TouchableOpacity style={styles.addBtn} onPress={() => addClass(course)}>
                <Text style={styles.addBtnText}>{course.soldOut ? 'Sold out' : 'Add to cart'}</Text>
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
