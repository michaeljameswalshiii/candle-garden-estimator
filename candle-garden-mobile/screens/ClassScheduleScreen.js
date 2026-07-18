import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

const SAMPLE_CLASSES = [
  {
    id: '1',
    title: 'Candle Making 101',
    date: '2024-02-01',
    time: '10:00 AM',
    duration: '2 hours',
    price: 45.00,
    available: 8,
    description: 'Learn the basics of candle making',
  },
  {
    id: '2',
    title: 'Advanced Scent Blending',
    date: '2024-02-03',
    time: '2:00 PM',
    duration: '3 hours',
    price: 65.00,
    available: 5,
    description: 'Create your own signature scents',
  },
  {
    id: '3',
    title: 'Container Selection',
    date: '2024-02-05',
    time: '11:00 AM',
    duration: '1.5 hours',
    price: 35.00,
    available: 12,
    description: 'Choosing the right container for your candle',
  },
  {
    id: '4',
    title: 'Wick Training',
    date: '2024-02-08',
    time: '3:00 PM',
    duration: '2 hours',
    price: 40.00,
    available: 6,
    description: 'Understanding wick sizes and types',
  },
  {
    id: '5',
    title: 'Holiday Specials',
    date: '2024-02-10',
    time: '10:00 AM',
    duration: '4 hours',
    price: 85.00,
    available: 4,
    description: 'Create seasonal candles for gifts',
  },
];

export default function ClassScheduleScreen() {
  const handleBookClass = (classItem) => {
    Alert.alert(
      'Book Class',
      `Would you like to book "${classItem.title}" on ${classItem.date} at ${classItem.time}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book Now',
          onPress: () => Alert.alert('Booking Confirmed', `You're booked for ${classItem.title}!`),
        },
      ]
    );
  };

  const renderClass = ({ item }) => (
    <View style={styles.classCard}>
      <View style={styles.classHeader}>
        <Text style={styles.classTitle}>{item.title}</Text>
        <Text style={styles.classPrice}>
          ${item.price ? item.price.toFixed(2) : '0.00'}
        </Text>
      </View>

      <Text style={styles.classDescription}>{item.description}</Text>

      <View style={styles.classDetails}>
        <Text style={styles.detailText}>📅 {item.date}</Text>
        <Text style={styles.detailText}>🕐 {item.time}</Text>
        <Text style={styles.detailText}>⏱️ {item.duration}</Text>
      </View>

      <View style={styles.classFooter}>
        <Text
          style={[
            styles.availability,
            { color: item.available < 5 ? colors.warning : colors.primary },
          ]}
        >
          {item.available} spots left
        </Text>
        <TouchableOpacity
          style={styles.bookButton}
          onPress={() => handleBookClass(item)}
          activeOpacity={0.8}
        >
          <Text style={styles.bookButtonText}>Book</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Class Schedule</Text>
      <Text style={styles.subtitle}>Join one of our candle making classes!</Text>

      <FlatList
        data={SAMPLE_CLASSES}
        keyExtractor={(item) => item.id}
        renderItem={renderClass}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No classes scheduled</Text>
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
    padding: spacing.md,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 5,
    marginTop: 10,
    color: colors.primary,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  list: {
    paddingBottom: 20,
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
    alignItems: 'center',
    marginBottom: 8,
  },
  classTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '400',
    flex: 1,
    color: colors.darkAccent,
  },
  classPrice: {
    fontFamily: fonts.body,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  classDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  classDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  detailText: {
    fontFamily: fonts.body,
    fontSize: 14,
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
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.textMuted,
  },
});
