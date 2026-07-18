import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

const SAMPLE_ORDERS = [
  { id: 'ORD-001', date: '2024-01-15', status: 'Delivered', total: 49.98, items: 2 },
  { id: 'ORD-002', date: '2024-01-20', status: 'Shipped', total: 24.99, items: 1 },
  { id: 'ORD-003', date: '2024-01-22', status: 'Processing', total: 74.97, items: 3 },
  { id: 'ORD-004', date: '2024-01-25', status: 'Pending', total: 29.99, items: 1 },
];

const getStatusColor = (status) => {
  switch (status) {
    case 'Delivered': return colors.primary;
    case 'Shipped': return colors.info;
    case 'Processing': return colors.warning;
    case 'Pending': return colors.textMuted;
    default: return colors.textMuted;
  }
};

export default function OrdersScreen() {
  const renderOrder = ({ item }) => (
    <TouchableOpacity style={styles.orderCard} activeOpacity={0.85}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>{item.id}</Text>
        <Text style={[styles.status, { color: getStatusColor(item.status) }]}>
          {item.status}
        </Text>
      </View>
      <Text style={styles.orderDate}>Order Date: {item.date}</Text>
      <View style={styles.orderDetails}>
        <Text style={styles.orderItems}>{item.items} item(s)</Text>
        <Text style={styles.orderTotal}>
          ${item.total ? item.total.toFixed(2) : '0.00'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Orders</Text>
      <FlatList
        data={SAMPLE_ORDERS}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No orders yet</Text>
            <Text style={styles.emptySubtext}>Your order history will appear here</Text>
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
    marginBottom: spacing.md,
    marginTop: 10,
    color: colors.primary,
  },
  list: {
    paddingBottom: 20,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderId: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  status: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  orderDate: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 8,
  },
  orderDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderItems: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  orderTotal: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
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
    fontWeight: '600',
    color: colors.textMuted,
  },
  emptySubtext: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textFaint,
    marginTop: 8,
  },
});
