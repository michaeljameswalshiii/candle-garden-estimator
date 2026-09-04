import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AcuityScheduler from '../components/AcuityScheduler';
import { ACUITY_SCHEDULER_URL } from '../lib/schedulingConfig';
import { colors, fonts, spacing } from '../lib/theme';

export default function ClassScheduleScreen() {
  const openInBrowser = async () => {
    try {
      await Linking.openURL(ACUITY_SCHEDULER_URL);
    } catch {
      // The embedded scheduler remains available if an external browser cannot open.
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Schedule an appointment</Text>
          <Text style={styles.subtitle}>Choose a service and an available time below.</Text>
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
  scheduler: {
    flex: 1,
  },
});
