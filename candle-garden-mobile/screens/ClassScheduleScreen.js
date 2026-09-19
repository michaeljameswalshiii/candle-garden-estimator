import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { classes as bundledClasses, fetchLatestClasses, getUpcomingClasses } from '../lib/classesCatalog';
import { useCart } from '../lib/cart';
import { colors, fonts, radii, spacing } from '../lib/theme';

export default function ClassScheduleScreen() {
  const navigation = useNavigation();
  const { addItem } = useCart();
  const [classCatalog, setClassCatalog] = useState(bundledClasses);
  const [status, setStatus] = useState('Loading schedule…');
  const upcoming = useMemo(
    () => getUpcomingClasses(new Date(), classCatalog),
    [classCatalog]
  );

  const refreshClasses = useCallback(async () => {
    try {
      const latest = await fetchLatestClasses();
      setClassCatalog(latest.classes);
      setStatus('Live class schedule');
    } catch {
      setStatus('Showing saved schedule');
    }
  }, []);

  useEffect(() => {
    void refreshClasses();
  }, [refreshClasses]);

  const bookClass = (course) => {
    if (course.soldOut || Number(course.available) === 0) {
      Alert.alert('Sold out', 'That class is not available right now.');
      return;
    }
    addItem(
      {
        id: course.id,
        name: course.title || 'Candle Making Class',
        price: course.price,
        image: course.image,
        url: course.url,
        date: course.date,
        type: 'class',
        scheduleLabel: course.scheduleLabel,
      },
      { type: 'class', quantity: 1, unitPrice: Number(course.price) || 0 }
    );
    Alert.alert(
      'Added to cart',
      `${course.scheduleLabel || course.title} is in your app cart.`,
      [
        { text: 'Keep browsing', style: 'cancel' },
        { text: 'Go to cart', onPress: () => navigation.navigate('Orders') },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Book a class</Text>
        <Text style={styles.subtitle}>
          Add a seat to your app cart and check out in Cart. This does not use the website cart.
        </Text>
        <Text style={styles.liveStatus}>{status}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {!upcoming.length ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.emptyText}>Looking up upcoming classes…</Text>
          </View>
        ) : (
          upcoming.map((course) => {
            const soldOut = Boolean(course.soldOut) || Number(course.available) === 0;
            return (
              <View key={course.id} style={styles.classCard}>
                {course.image ? (
                  <Image source={{ uri: course.image }} style={styles.classImage} />
                ) : null}
                <View style={styles.classBody}>
                  <Text style={styles.classTitle} numberOfLines={2}>
                    {course.title}
                  </Text>
                  <Text style={styles.classMeta}>{course.scheduleLabel}</Text>
                  <Text style={styles.classPrice}>${Number(course.price).toFixed(0)}</Text>
                  {course.available != null && !soldOut ? (
                    <Text style={styles.stock}>{course.available} seats left</Text>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.addBtn, soldOut && styles.addBtnDisabled]}
                    onPress={() => bookClass(course)}
                    disabled={soldOut}
                  >
                    <Text style={styles.addBtnText}>{soldOut ? 'Sold out' : 'Add to cart'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
  subtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  liveStatus: { color: colors.primary, fontFamily: fonts.body, fontSize: 10, fontWeight: '600', marginTop: 4 },
  list: { padding: spacing.md, gap: 12, paddingBottom: 32 },
  empty: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: { color: colors.textMuted, fontFamily: fonts.body },
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
  stock: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  addBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
  },
  addBtnDisabled: { backgroundColor: colors.disabled || '#9aa3a0' },
  addBtnText: { color: colors.white, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
});
