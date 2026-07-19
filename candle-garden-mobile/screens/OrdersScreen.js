import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { useCart } from '../lib/cart';
import { SHOP_BASE } from '../lib/shopCatalog';

export default function OrdersScreen() {
  const { lines, itemCount, subtotal, setQuantity, removeItem, clearCart } = useCart();

  const checkoutOnSite = () => {
    if (!lines.length) return;
    Alert.alert(
      'Checkout on website',
      'Your mobile cart is ready. Complete purchase on thecandlegarden.co (Squarespace checkout).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open shop',
          onPress: () => Linking.openURL(`${SHOP_BASE}/shop`).catch(() => {}),
        },
      ]
    );
  };

  const renderLine = ({ item }) => (
    <View style={styles.lineCard}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Text>🕯️</Text>
        </View>
      )}
      <View style={styles.lineBody}>
        <Text style={styles.lineName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.size ? <Text style={styles.lineMeta}>Size: {item.size}</Text> : null}
        <Text style={styles.lineMeta}>
          ${Number(item.unitPrice).toFixed(2)} each
        </Text>
        <View style={styles.qtyRow}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQuantity(item.key, item.quantity - 1)}
          >
            <Text style={styles.qtyBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQuantity(item.key, item.quantity + 1)}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => removeItem(item.key)} style={styles.removeBtn}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.lineTotal}>
        ${(item.unitPrice * item.quantity).toFixed(2)}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your cart</Text>
      <Text style={styles.subtitle}>
        Add candles from Shop · checkout on the website for now
      </Text>

      <FlatList
        data={lines}
        keyExtractor={(item) => item.key}
        renderItem={renderLine}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Your cart is empty</Text>
            <Text style={styles.emptySubtext}>
              Browse the Shop tab and tap Add to cart
            </Text>
          </View>
        }
        ListFooterComponent={
          lines.length ? (
            <View style={styles.footer}>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>
                  Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})
                </Text>
                <Text style={styles.subtotalValue}>${subtotal.toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.checkoutBtn} onPress={checkoutOnSite}>
                <Text style={styles.checkoutText}>Checkout on website</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
                <Text style={styles.clearText}>Clear cart</Text>
              </TouchableOpacity>
            </View>
          ) : null
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
    marginBottom: 4,
    marginTop: 10,
    color: colors.primary,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  list: {
    paddingBottom: 28,
  },
  lineCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  thumb: {
    width: 64,
    height: 80,
    borderRadius: radii.sm,
    backgroundColor: colors.lightAccent,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  lineName: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.text,
    marginBottom: 2,
  },
  lineMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  qtyText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
    color: colors.text,
  },
  removeBtn: {
    marginLeft: 4,
  },
  removeText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
  },
  lineTotal: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
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
    textAlign: 'center',
  },
  footer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  subtotalLabel: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.textSecondary,
  },
  subtotalValue: {
    fontFamily: fonts.body,
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  checkoutBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  checkoutText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  clearBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  clearText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
