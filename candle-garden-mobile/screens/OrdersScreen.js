import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { useCart } from '../lib/cart';
import { SHOP_BASE } from '../lib/shopCatalog';
import { useAuth } from '../lib/AuthContext';
import { listOrders } from '../lib/apiClient';

export default function OrdersScreen() {
  const { lines, itemCount, subtotal, setQuantity, removeItem, clearCart } = useCart();
  const { isAuthenticated } = useAuth();
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) {
      setHistory([]);
      setHistoryError(null);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await listOrders();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistoryError(e.message || 'Could not load orders');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const checkoutOnSite = () => {
    if (!lines.length) return;
    Alert.alert(
      'Continue on Squarespace',
      'Your saved list cannot be transferred automatically. Choose product options again on the official store, where payment and live inventory are confirmed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open official store',
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
        {item.url ? (
          <TouchableOpacity onPress={() => Linking.openURL(item.url).catch(() => {})}>
            <Text style={styles.productLink}>Choose options on Squarespace →</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.lineTotal}>
        ${(item.unitPrice * item.quantity).toFixed(2)}
      </Text>
    </View>
  );

  const renderHistory = ({ item }) => {
    const total =
      item.total_amount != null
        ? Number(item.total_amount)
        : item.total != null
          ? Number(item.total)
          : null;
    return (
      <View style={styles.historyCard}>
        <View style={styles.historyRow}>
          <Text style={styles.historyId} numberOfLines={1}>
            {item.id || 'Order'}
          </Text>
          <Text style={styles.historyStatus}>{item.status || '—'}</Text>
        </View>
        <Text style={styles.historyMeta}>
          {item.created_at
            ? String(item.created_at).slice(0, 19).replace('T', ' ')
            : 'Date unknown'}
        </Text>
        {total != null && !Number.isNaN(total) ? (
          <Text style={styles.historyTotal}>${total.toFixed(2)}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cart & orders</Text>
      <Text style={styles.subtitle}>
        Saved shopping list · payment and live inventory are confirmed on Squarespace
      </Text>

      <FlatList
        data={lines}
        keyExtractor={(item) => item.key}
        renderItem={renderLine}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={historyLoading} onRefresh={loadHistory} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Your cart is empty</Text>
            <Text style={styles.emptySubtext}>
              Browse the Shop tab and tap Add to cart
            </Text>
          </View>
        }
        ListFooterComponent={
          <View>
            {lines.length ? (
              <View style={styles.footer}>
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>
                    Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})
                  </Text>
                  <Text style={styles.subtotalValue}>${subtotal.toFixed(2)}</Text>
                </View>
                <TouchableOpacity style={styles.checkoutBtn} onPress={checkoutOnSite}>
                  <Text style={styles.checkoutText}>Continue on Squarespace</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
                  <Text style={styles.clearText}>Clear cart</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>Order history</Text>
              {!isAuthenticated ? (
                <Text style={styles.historyHint}>
                  Sign in on Profile to see orders placed from this app.
                </Text>
              ) : historyLoading && !history.length ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
              ) : historyError ? (
                <Text style={styles.historyError}>{historyError}</Text>
              ) : history.length === 0 ? (
                <Text style={styles.historyHint}>No orders yet for this account.</Text>
              ) : (
                history.map((h) => (
                  <View key={h.id || JSON.stringify(h)}>{renderHistory({ item: h })}</View>
                ))
              )}
            </View>
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
  productLink: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 8,
  },
  lineTotal: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyContainer: {
    paddingTop: 40,
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
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
  historySection: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.primary,
    marginBottom: 10,
  },
  historyHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  historyError: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.danger,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyId: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  historyStatus: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'capitalize',
  },
  historyMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 4,
  },
  historyTotal: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 6,
  },
});
