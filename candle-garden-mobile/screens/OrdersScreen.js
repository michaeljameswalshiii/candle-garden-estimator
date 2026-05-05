import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';

// Sample orders data - replace with API call in production
const SAMPLE_ORDERS = [
  { id: 'ORD-001', date: '2024-01-15', status: 'Delivered', total: 49.98, items: 2 },
  { id: 'ORD-002', date: '2024-01-20', status: 'Shipped', total: 24.99, items: 1 },
  { id: 'ORD-003', date: '2024-01-22', status: 'Processing', total: 74.97, items: 3 },
  { id: 'ORD-004', date: '2024-01-25', status: 'Pending', total: 29.99, items: 1 },
];

const getStatusColor = (status) => {
  switch (status) {
    case 'Delivered': return '#2e7d32';
    case 'Shipped': return '#1976d2';
    case 'Processing': return '#ffa000';
    case 'Pending': return '#757575';
    default: return '#666';
  }
};

export default function OrdersScreen() {
  const renderOrder = ({ item }) => (
    <TouchableOpacity style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>{item.id}</Text>
        <Text style={[styles.status, { color: getStatusColor(item.status) }]}>
          {item.status}
        </Text>
      </View>
      <Text style={styles.orderDate}>Order Date: {item.date}</Text>
      <View style={styles.orderDetails}>
        <Text style={styles.orderItems}>{item.items} item(s)</Text>
<Text style={styles.orderTotal}>${item.total ? item.total.toFixed(2) : '0.00'}</Text>
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
    backgroundColor: '#fff',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  list: {
    paddingBottom: 20,
  },
  orderCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
  },
  orderDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  orderDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderItems: {
    fontSize: 14,
    color: '#666',
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
