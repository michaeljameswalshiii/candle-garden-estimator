import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/AuthContext';
import { createStripePaymentSheet, finalizeStripePayment, listOrders, trackEvent } from '../lib/apiClient';
import { useStripe } from '../lib/stripeBridge';
import { stripeConfigured } from '../lib/stripeConfig';

const ORDER_PROGRESS = ['paid', 'processing', 'shipped', 'completed'];
const STATUS_COPY = {
  payment_pending: ['Payment pending', 'Your payment has not been confirmed yet.'],
  payment_verification_pending: ['Verifying payment', 'We are confirming your payment.'],
  paid: ['Order received', 'Payment is confirmed and your order is waiting for our team.'],
  ready_for_fulfillment: ['Preparing order', 'Shipping details are ready and fulfillment can begin.'],
  processing: ['In progress', 'The Candle Garden team is preparing your order.'],
  shipped: ['Shipped', 'Your order is on its way.'],
  completed: ['Completed', 'Your order has been completed.'],
  cancelled: ['Cancelled', 'This order was cancelled. Contact us if you have questions.'],
  partially_refunded: ['Partially refunded', 'Part of this order was refunded to the original payment method.'],
  refunded: ['Refunded', 'This order was refunded to the original payment method.'],
};

function customerStatus(status) {
  return STATUS_COPY[status] || [String(status || 'Order received').replaceAll('_', ' '), 'Pull down to refresh for the latest update.'];
}

function progressIndex(status) {
  if (status === 'ready_for_fulfillment') return 1;
  const index = ORDER_PROGRESS.indexOf(status);
  return index;
}

export default function OrdersScreen() {
  if (stripeConfigured) {
    return <OrdersScreenCheckout />;
  }
  return <OrdersScreenBody stripe={null} />;
}

function OrdersScreenCheckout() {
  const stripe = useStripe();
  return <OrdersScreenBody stripe={stripe} />;
}

function OrdersScreenBody({ stripe }) {
  const { lines, itemCount, subtotal, setQuantity, removeItem, clearCart } = useCart();
  const { isAuthenticated, signIn, busy: authBusy, user } = useAuth();
  const initPaymentSheet = stripe?.initPaymentSheet;
  const presentPaymentSheet = stripe?.presentPaymentSheet;
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState('choice');
  const [lastCompletedOrder, setLastCompletedOrder] = useState(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [shipping, setShipping] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  });
  const asGuest = checkoutStep === 'guest' || (!isAuthenticated && checkoutStep !== 'account');

  const needsShipping = lines.some((line) => line.type !== 'class');

  const loadHistory = useCallback(async () => {
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  useEffect(() => {
    if (!lines.length && checkoutStep !== 'choice') {
      setCheckoutStep('choice');
    }
  }, [lines.length, checkoutStep]);

  const backToChoice = () => {
    setCheckoutStep('choice');
    setAccountPassword('');
  };

  const startGuestCheckout = () => {
    if (!lines.length || checkingOut) return;
    setCheckoutStep('guest');
  };

  const startAccountCheckout = () => {
    if (!lines.length || checkingOut) return;
    if (!isAuthenticated) {
      setCheckoutStep('account');
      return;
    }
    setShipping((current) => ({
      ...current,
      email: current.email || user?.email || '',
      name: current.name || user?.name || '',
      phone: current.phone || user?.phone || '',
    }));
    if (needsShipping) {
      setCheckoutStep('shipping');
      return;
    }
    void checkoutWithStripe({ saveOrder: true });
  };

  const submitAccountSignIn = async () => {
    if (!accountEmail.trim() || !accountPassword) {
      Alert.alert('Sign in needed', 'Enter the email and password for your account.');
      return;
    }
    try {
      const profile = await signIn({ email: accountEmail.trim(), password: accountPassword });
      setAccountPassword('');
      setShipping((current) => ({
        ...current,
        email: current.email || profile?.email || accountEmail.trim(),
        name: current.name || profile?.name || '',
      }));
      if (needsShipping) {
        setCheckoutStep('shipping');
        return;
      }
      void checkoutWithStripe({ saveOrder: true });
    } catch (error) {
      if (String(error.message || '').includes('UserNotConfirmed')) {
        Alert.alert(
          'Confirm email',
          'Open Profile and enter the verification code we emailed you, then come back to checkout.'
        );
        return;
      }
      Alert.alert('Sign in failed', error.message || 'Please try again');
    }
  };

  const submitShippingAndPay = () => {
    const guest = checkoutStep === 'guest' || !isAuthenticated;
    const required = needsShipping
      ? guest
        ? ['name', 'email', 'phone', 'address', 'city', 'state', 'zip']
        : ['name', 'phone', 'address', 'city', 'state', 'zip']
      : ['name', 'email', 'phone'];
    const missing = required.filter((key) => !String(shipping[key] || '').trim());
    if (missing.length) {
      Alert.alert(
        needsShipping ? 'Shipping needed' : 'Contact needed',
        guest
          ? 'Please add your name, email, and phone so we can complete this guest checkout.'
          : 'Please fill in your name, phone, and address so we can complete this order.'
      );
      return;
    }
    void checkoutWithStripe({ saveOrder: checkoutStep !== 'guest' && (isAuthenticated || checkoutStep === 'shipping') });
  };

  const checkoutWithStripe = async ({ saveOrder } = {}) => {
    if (!lines.length || checkingOut) return;
    if (!stripeConfigured || !initPaymentSheet || !presentPaymentSheet) {
      Alert.alert('Stripe test mode is not configured', 'Add the Stripe test publishable key to the app build, then try again.');
      return;
    }
    setCheckingOut(true);
    try {
      const sheet = await createStripePaymentSheet(
        lines.map((line) => ({
          type: line.type || 'product',
          productId: line.productId,
          quantity: line.quantity,
          size: line.size,
          variantId: line.variantId,
          ounces: line.ounces,
          boxKey: line.boxKey,
          destZip: line.destZip || shipping.zip,
          shippingMethod: line.shippingMethod || 'ship_own',
          vesselCount: line.vesselCount,
        })),
        { email: shipping.email, name: shipping.name, zip: shipping.zip, shipping }
      );
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'The Candle Garden',
        paymentIntentClientSecret: sheet.paymentIntentClientSecret,
        googlePay: { merchantCountryCode: 'US', testEnv: true },
        allowsDelayedPaymentMethods: false,
      });
      if (initError) throw initError;
      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) {
        if (paymentError.code !== 'Canceled') throw paymentError;
        return;
      }
      const paidTotal = Number(sheet.amount || 0) / 100;
      await finalizeStripePayment(sheet.paymentIntentId);
      trackEvent('payment_success');
      let labelNote = '';
      const refillLines = lines.filter(
        (line) => line.type === 'refill' && line.shippingMethod && line.shippingMethod !== 'ship_own'
      );
      if (refillLines.length) {
        labelNote = ' Shipping labels are queued for Candle Garden owner review.';
      }
      await loadHistory();
      const completedOrder = {
        paymentIntentId: sheet.paymentIntentId,
        total: paidTotal || subtotal,
        items: lines.map((item) => ({
          key: item.key,
          name: item.name,
          quantity: item.quantity,
          size: item.size,
          lineTotal: Number(item.unitPrice) * Number(item.quantity),
        })),
        customerName: shipping.name,
        email: shipping.email,
        shipping: needsShipping ? { ...shipping } : null,
        labelNote: labelNote.trim(),
      };
      setLastCompletedOrder(completedOrder);
      setCheckoutStep('choice');
      clearCart();
    } catch (error) {
      Alert.alert('Checkout unavailable', error.message || 'Stripe could not start checkout.');
    } finally {
      setCheckingOut(false);
    }
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
        <Text style={styles.lineMeta}>
          {item.type === 'class' ? 'Class' : item.type === 'refill' ? 'Refill' : 'Shop'}
        </Text>
        {item.size ? <Text style={styles.lineMeta}>{item.type === 'class' ? item.size : `Size: ${item.size}`}</Text> : null}
        {item.detail ? <Text style={styles.lineMeta}>{item.detail}</Text> : null}
        {item.type === 'refill' && Number.isFinite(item.waxUnitPrice) && Number.isFinite(item.returnShippingUnitPrice) ? (
          <Text style={styles.lineMeta}>
            ${item.waxUnitPrice.toFixed(2)} refill + ${item.returnShippingUnitPrice.toFixed(2)} return shipping
          </Text>
        ) : null}
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

  const renderHistory = ({ item }) => {
    const total =
      item.total_amount != null
        ? Number(item.total_amount)
        : item.total != null
          ? Number(item.total)
          : null;
    const [label, description] = customerStatus(item.status);
    const step = progressIndex(item.status);
    const stopped = ['cancelled', 'partially_refunded', 'refunded'].includes(item.status);
    return (
      <View style={styles.historyCard}>
        <View style={styles.historyRow}>
          <Text style={styles.historyId} numberOfLines={1}>
            Order #{String(item.id || '').slice(0, 8) || '—'}
          </Text>
          <Text style={[styles.historyStatus, stopped && styles.historyStatusStopped]}>{label}</Text>
        </View>
        <Text style={styles.historyMeta}>
          {item.created_at
            ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Date unknown'}
        </Text>
        {!stopped ? (
          <View style={styles.progressRow} accessibilityLabel={`Order progress: ${label}`}>
            {ORDER_PROGRESS.map((progressStatus, index) => <View key={progressStatus} style={[styles.progressSegment, index <= step && styles.progressSegmentOn]} />)}
          </View>
        ) : null}
        <Text style={styles.historyDescription}>{description}</Text>
        {(item.items || []).slice(0, 3).map((orderItem, index) => (
          <Text key={`${orderItem.name || 'item'}-${index}`} style={styles.historyItem}>
            {orderItem.quantity || 1}× {orderItem.name || 'Candle Garden item'}{orderItem.size ? ` · ${orderItem.size}` : ''}
          </Text>
        ))}
        {total != null && !Number.isNaN(total) ? (
          <Text style={styles.historyTotal}>${total.toFixed(2)}</Text>
        ) : null}
        {(item.tracking_numbers || []).map((tracking) => (
          <TouchableOpacity key={tracking} style={styles.trackingButton} onPress={() => Linking.openURL(`https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`)} accessibilityRole="link">
            <Text style={styles.trackingButtonText}>Track UPS package {tracking}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cart & orders</Text>
      <Text style={styles.subtitle}>
        Checkout as a guest, or sign in if you already have an account. Test cards only.
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
          lastCompletedOrder ? (
            <View style={styles.successCard}>
              <View style={styles.successIcon}>
                <Text style={styles.successIconText}>✓</Text>
              </View>
              <Text style={styles.successEyebrow}>PAYMENT CONFIRMED</Text>
              <Text style={styles.successTitle}>
                Thank you{lastCompletedOrder.customerName ? `, ${lastCompletedOrder.customerName}` : ''}!
              </Text>
              <Text style={styles.successMessage}>
                Your test order is complete. No real charge was made.
              </Text>

              <View style={styles.successSummary}>
                <View style={styles.successSummaryHeader}>
                  <Text style={styles.successSummaryTitle}>Order summary</Text>
                  <Text style={styles.testBadge}>TEST ORDER</Text>
                </View>
                {lastCompletedOrder.items.map((item) => (
                  <View key={item.key} style={styles.successItemRow}>
                    <View style={styles.successItemInfo}>
                      <Text style={styles.successItemName}>{item.name}</Text>
                      <Text style={styles.successItemMeta}>
                        Qty {item.quantity}{item.size ? ` · ${item.size}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.successItemPrice}>${item.lineTotal.toFixed(2)}</Text>
                  </View>
                ))}
                <View style={styles.successTotalRow}>
                  <Text style={styles.successTotalLabel}>Total paid</Text>
                  <Text style={styles.successTotal}>${lastCompletedOrder.total.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.successDetails}>
                <Text style={styles.successDetailLabel}>Confirmation</Text>
                <Text style={styles.successDetailValue}>
                  {lastCompletedOrder.paymentIntentId || 'Stripe test payment'}
                </Text>
                {lastCompletedOrder.email ? (
                  <>
                    <Text style={styles.successDetailLabel}>Contact email</Text>
                    <Text style={styles.successDetailValue}>{lastCompletedOrder.email}</Text>
                  </>
                ) : null}
                {lastCompletedOrder.shipping ? (
                  <>
                    <Text style={styles.successDetailLabel}>Ship to</Text>
                    <Text style={styles.successDetailValue}>
                      {lastCompletedOrder.shipping.address}{'\n'}
                      {lastCompletedOrder.shipping.city}, {lastCompletedOrder.shipping.state} {lastCompletedOrder.shipping.zip}
                    </Text>
                  </>
                ) : null}
                {lastCompletedOrder.labelNote ? (
                  <Text style={styles.successNote}>{lastCompletedOrder.labelNote}</Text>
                ) : null}
              </View>

              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setLastCompletedOrder(null)}>
                <Text style={styles.secondaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Your cart is empty</Text>
              <Text style={styles.emptySubtext}>
                Browse the Shop tab and tap Add to cart
              </Text>
            </View>
          )
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
                {checkoutStep === 'account' && !isAuthenticated ? (
                  <View style={styles.shippingBox}>
                    <Text style={styles.shippingTitle}>I have an account</Text>
                    <Text style={styles.shippingHint}>
                      Sign in to check out with your Candle Garden account. Your cart stays here.
                    </Text>
                    <TextInput
                      style={styles.shippingInput}
                      placeholder="Email"
                      placeholderTextColor={colors.textFaint}
                      value={accountEmail}
                      onChangeText={setAccountEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                    />
                    <TextInput
                      style={styles.shippingInput}
                      placeholder="Password"
                      placeholderTextColor={colors.textFaint}
                      value={accountPassword}
                      onChangeText={setAccountPassword}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.checkoutBtn}
                      onPress={submitAccountSignIn}
                      disabled={checkingOut || authBusy}
                    >
                      <Text style={styles.checkoutText}>
                        {authBusy || checkingOut ? 'Signing in…' : 'Sign in and continue'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={backToChoice}>
                      <Text style={styles.secondaryText}>Back to cart</Text>
                    </TouchableOpacity>
                  </View>
                ) : checkoutStep === 'guest' || checkoutStep === 'shipping' ? (
                  <View style={styles.shippingBox}>
                    <Text style={styles.shippingTitle}>
                      {checkoutStep === 'guest' ? 'Guest checkout' : needsShipping ? 'Shipping' : 'Contact'}
                    </Text>
                    <Text style={styles.shippingHint}>
                      {checkoutStep === 'guest'
                        ? needsShipping
                          ? 'Pay without creating an account. We need a way to reach you and where to send this order. Refill shipping uses the lowest-cost available UPS service, priced for this address.'
                          : 'Pay without creating an account. Add a way to reach you.'
                        : 'One address for this whole order. Refill shipping uses the lowest-cost available UPS service, priced for this address.'}
                    </Text>
                    {(needsShipping
                      ? asGuest
                        ? [['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['address', 'Street address'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP']]
                        : [['name', 'Name'], ['phone', 'Phone'], ['address', 'Street address'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP']]
                      : [['name', 'Name'], ['email', 'Email'], ['phone', 'Phone']]
                    ).map(([key, label]) => (
                      <TextInput
                        key={key}
                        style={styles.shippingInput}
                        placeholder={label}
                        placeholderTextColor={colors.textFaint}
                        value={shipping[key]}
                        onChangeText={(value) => setShipping((current) => ({ ...current, [key]: value }))}
                        autoCapitalize={key === 'email' ? 'none' : key === 'state' || key === 'zip' ? 'characters' : 'words'}
                        autoCorrect={key !== 'email'}
                        keyboardType={key === 'email' ? 'email-address' : key === 'phone' || key === 'zip' ? 'numbers-and-punctuation' : 'default'}
                      />
                    ))}
                    <TouchableOpacity style={styles.checkoutBtn} onPress={submitShippingAndPay} disabled={checkingOut}>
                      <Text style={styles.checkoutText}>
                        {checkingOut ? 'Opening secure checkout…' : 'Continue to payment'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={backToChoice}>
                      <Text style={styles.secondaryText}>Back to cart</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    {isAuthenticated ? (
                      <TouchableOpacity style={styles.checkoutBtn} onPress={startAccountCheckout} disabled={checkingOut}>
                        <Text style={styles.checkoutText}>
                          {checkingOut ? 'Opening secure checkout…' : 'Checkout with my account'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity style={styles.checkoutBtn} onPress={startGuestCheckout} disabled={checkingOut}>
                          <Text style={styles.checkoutText}>Checkout as guest</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={startAccountCheckout} disabled={checkingOut}>
                          <Text style={styles.secondaryText}>I have an account</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
                <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
                  <Text style={styles.clearText}>Clear cart</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>Order history</Text>
              {!isAuthenticated ? <Text style={styles.historyHint}>Guest orders placed on this device appear here. Sign in before checkout to keep order history across devices.</Text> : null}
              {historyLoading && !history.length ? (
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
  successCard: {
    marginTop: 12,
    padding: 20,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  successIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginBottom: 12,
  },
  successIconText: {
    color: colors.white,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 34,
  },
  successEyebrow: {
    fontFamily: fonts.body,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 5,
  },
  successTitle: {
    fontFamily: fonts.heading,
    color: colors.primary,
    fontSize: 26,
    textAlign: 'center',
  },
  successMessage: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  successSummary: {
    width: '100%',
    padding: 14,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  successSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  successSummaryTitle: {
    fontFamily: fonts.heading,
    color: colors.text,
    fontSize: 18,
  },
  testBadge: {
    fontFamily: fonts.body,
    color: colors.primary,
    backgroundColor: colors.lightAccent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  successItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  successItemInfo: {
    flex: 1,
  },
  successItemName: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  successItemMeta: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  successItemPrice: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  successTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  successTotalLabel: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  successTotal: {
    fontFamily: fonts.heading,
    color: colors.primary,
    fontSize: 20,
  },
  successDetails: {
    width: '100%',
    paddingVertical: 16,
  },
  successDetailLabel: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: 8,
  },
  successDetailValue: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  successNote: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
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
  shippingBox: {
    marginBottom: 12,
  },
  shippingTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.primary,
    marginBottom: 4,
  },
  shippingHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 10,
    lineHeight: 18,
  },
  shippingInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: colors.white,
    color: colors.text,
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
  },
  historyStatusStopped: {
    color: colors.danger,
  },
  historyMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 12,
    marginBottom: 10,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  progressSegmentOn: {
    backgroundColor: colors.primaryMid,
  },
  historyDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  historyItem: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  historyTotal: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 6,
  },
  trackingButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
  },
  trackingButtonText: {
    fontFamily: fonts.body,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
});
