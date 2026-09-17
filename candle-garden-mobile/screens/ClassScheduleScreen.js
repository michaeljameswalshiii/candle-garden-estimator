import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AcuityScheduler from '../components/AcuityScheduler';
import { classes as bundledClasses, fetchLatestClasses, getUpcomingClasses } from '../lib/classesCatalog';
import { colors, fonts, radii, spacing } from '../lib/theme';

export default function ClassScheduleScreen() {
  const [classCatalog, setClassCatalog] = useState(bundledClasses);
  const [scheduleStatus, setScheduleStatus] = useState('Built-in schedule');
  const upcoming = useMemo(() => getUpcomingClasses(new Date(), classCatalog).slice(0, 8), [classCatalog]);

  const refreshClasses = useCallback(async () => {
    try {
      const latest = await fetchLatestClasses();
      setClassCatalog(latest.classes);
      setScheduleStatus('Live Squarespace schedule');
    } catch {
      setScheduleStatus('Offline schedule');
    }
  }, []);

  useEffect(() => { void refreshClasses(); }, [refreshClasses]);

  const bookClass = (course) => {
    if (course.soldOut) {
      Alert.alert('Sold out', 'That class is not available right now.');
      return;
    }
    Alert.alert(
      'Book below',
      'Use the in-app scheduler under these class cards to pick your time.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Schedule an appointment</Text>
          <Text style={styles.subtitle}>See live class availability, then book with the scheduler below.</Text>
          <Text style={styles.liveStatus}>{scheduleStatus}</Text>
        </View>
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
              <TouchableOpacity style={[styles.addBtn, course.soldOut && styles.addBtnDisabled]} onPress={() => bookClass(course)} disabled={course.soldOut}>
                <Text style={styles.addBtnText}>{course.soldOut ? 'Sold out' : 'Book below'}</Text>
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
  liveStatus: {
    color: colors.primaryMid,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
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
  addBtnDisabled: {
    backgroundColor: colors.disabled,
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
