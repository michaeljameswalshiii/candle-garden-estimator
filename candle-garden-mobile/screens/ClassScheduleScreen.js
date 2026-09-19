import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ClassBookingWebView from '../components/AcuityScheduler';
import { colors, fonts, spacing } from '../lib/theme';

export default function ClassScheduleScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Book a class</Text>
        <Text style={styles.subtitle}>
          Pick a date and check out here. Seats and payment stay in the app.
        </Text>
      </View>
      <View style={styles.scheduler}>
        <ClassBookingWebView />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.primary, fontFamily: fonts.heading, fontSize: 19 },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  scheduler: { flex: 1 },
});
