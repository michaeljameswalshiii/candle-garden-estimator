import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { colors, fonts, radii } from '../lib/theme';
import { STORE } from '../lib/storeInfo';

const STATUS_COPY = {
  payment_pending: ['Awaiting payment', 'Payment has not been confirmed.', -1],
  paid: ['Order received', 'Your payment is confirmed. We are getting your order ready.', 0],
  ready_for_fulfillment: ['Preparing your order', 'Your order is with the Candle Garden team.', 1],
  processing: ['In progress', 'We are preparing your candles.', 1],
  refill_received: ['Vessels received', 'Your vessels arrived safely and are waiting to be refilled.', 1],
  refilling: ['Refilling your vessels', 'Your new candles are being poured and cured.', 1],
  shipped: ['On the way', 'Your package is on its way. Follow its progress below.', 2],
  refill_returning: ['Refills returning', 'Your refilled vessels are on their way back to you.', 2],
  ready_for_pickup: ['Ready for pickup', 'Your order is ready at our Atlantic Beach shop.', 2],
  completed: ['Completed', 'Thank you for shopping with The Candle Garden.', 3],
  complete: ['Completed', 'Thank you for shopping with The Candle Garden.', 3],
  cancelled: ['Cancelled', 'Contact us if you have questions about this order.', -1],
  refunded: ['Refunded', 'Your refund was sent to the original payment method.', -1],
  partially_refunded: ['Partially refunded', 'Part of your order was refunded to the original payment method.', -1],
};

export function orderStatus(order) {
  const raw = String(order.status || 'payment_pending').toLowerCase();
  const status = raw === 'paid_test' ? 'paid' : raw;
  const local = order.fulfillment_method === 'pickup'
    || (order.items || []).some((item) => item.shippingMethod === 'local_dropoff');
  const copy = STATUS_COPY[status] || ['Update pending', 'Pull down to check the latest update from our team.', -1];
  if (status === 'paid' && local) {
    copy[1] = 'Bring refill vessels to our Atlantic Beach shop. We will notify you when your order is ready.';
  }
  return { status, local, test: raw === 'paid_test', title: copy[0], description: copy[1], phase: copy[2] };
}

function itemKind(item) {
  if (item.type === 'refill') return 'Refill';
  if (item.type === 'class') return 'Class';
  if (item.type === 'gift_card' || String(item.name || '').toLowerCase().includes('gift card')) return 'Gift card';
  return 'Shop';
}

function itemDetail(item) {
  if (item.type === 'refill') {
    const ounces = item.ounces ? `${item.ounces} oz` : '';
    const vessels = `${item.vesselCount || 1} vessel${Number(item.vesselCount || 1) === 1 ? '' : 's'}`;
    const method = item.shippingMethod === 'local_dropoff'
      ? 'Atlantic Beach drop-off'
      : item.shippingMethod === 'prepaid_labels'
        ? 'Prepaid empties label'
        : item.shippingMethod === 'kit_roundtrip'
          ? 'Packing kit + labels'
          : 'You ship empties';
    return [ounces, vessels, method].filter(Boolean).join(' · ');
  }
  if (item.type === 'class') return item.size || item.scheduleLabel || 'Class reservation';
  return item.size || 'Shop item';
}

function shopAddress() {
  return `${STORE.name}\n${STORE.address}\n${STORE.city}, ${STORE.state} ${STORE.zip}`;
}

export default function OrderHistoryCard({ order, onPrintLabel, onReorderProduct, onReorderRefill }) {
  const [expanded, setExpanded] = useState(false);
  const { local, test, title, description, phase } = orderStatus(order);
  const items = order.items || [];
  const labels = order.shipping_labels || order.labels || [];
  const emptiesLabels = labels.filter((label) => label.key === 'empties_in' && (label.labelUrl || label.imageBase64));
  const tracked = labels.filter((label) => label.trackingNumber);
  const fallbackTracking = tracked.length ? [] : (order.tracking_numbers || []);
  const total = Number(order.total_amount ?? order.total ?? 0);
  const subtotal = Number(order.subtotal_amount ?? 0);
  const discount = Number(order.discount_amount ?? 0);
  const refunded = Number(order.refunded_amount ?? 0);
  const progress = ['Received', 'Preparing', local ? 'Ready to collect' : 'On the way', 'Complete'];
  const visibleItems = expanded ? items : items.slice(0, 3);
  const refillItems = items.filter((item) => item.type === 'refill');
  const productItems = items.filter((item) => !['refill', 'class'].includes(item.type));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ORDER #{String(order.id || order.orderId || '').slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.date}>
            {order.created_at
              ? new Date(order.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
              : 'Date unavailable'}
          </Text>
        </View>
        <View style={styles.totalWrap}>
          <Text style={styles.total}>${total.toFixed(2)}</Text>
          {local ? <Text style={styles.fulfillment}>Pickup</Text> : <Text style={styles.fulfillment}>Shipped</Text>}
        </View>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.status}>{title}</Text>
        {test ? <Text style={styles.badge}>TEST ORDER</Text> : null}
      </View>
      <Text style={styles.description}>{description}</Text>

      {phase >= 0 ? (
        <View style={styles.progress}>
          {progress.map((label, index) => (
            <View style={styles.step} key={label}>
              <View style={[styles.bar, index <= phase && styles.barOn]} />
              <Text style={[styles.stepText, index === phase && styles.stepCurrent]}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {visibleItems.map((item, index) => (
        <View style={styles.item} key={`${item.productId || item.name}-${index}`}>
          <View style={styles.itemCopy}>
            <Text style={styles.kind}>{itemKind(item)}</Text>
            <Text style={styles.itemTitle}>{item.quantity || 1} × {item.name || 'Candle Garden item'}</Text>
            <Text style={styles.meta}>{itemDetail(item)}</Text>
          </View>
          {item.price != null ? (
            <Text style={styles.amount}>${(Number(item.price) * Number(item.quantity || 1)).toFixed(2)}</Text>
          ) : null}
        </View>
      ))}
      {items.length > visibleItems.length ? (
        <Text style={styles.meta}>+ {items.length - visibleItems.length} more items</Text>
      ) : null}

      {emptiesLabels.map((label) => (
        <View key={label.labelUrl || label.trackingNumber} style={styles.labelBox}>
          <Text style={styles.labelKicker}>CUSTOMER SHIPPING LABEL</Text>
          <Text style={styles.itemTitle}>Ship your empty vessels to</Text>
          <Text style={styles.recipient}>The Candle Garden</Text>
          <Text style={styles.description}>{shopAddress()}</Text>
          {label.recipient && label.recipient !== STORE.name ? (
            <Text style={styles.meta}>Label recipient: {label.recipient}</Text>
          ) : null}
          <Text style={styles.meta}>Tape this prepaid label to the box. The package must be addressed to The Candle Garden, not to you.</Text>
          <TouchableOpacity onPress={() => onPrintLabel(label)} accessibilityRole="button" style={styles.printBtn}>
            <Text style={styles.printText}>Print prepaid empties label</Text>
          </TouchableOpacity>
        </View>
      ))}

      {local ? (
        <View style={styles.pickupBox}>
          <Text style={styles.itemTitle}>Atlantic Beach shop</Text>
          <Text style={styles.description}>{shopAddress()}{'\n'}{STORE.hours}</Text>
          <TouchableOpacity onPress={() => Linking.openURL(STORE.mapsUrl)}>
            <Text style={styles.link}>Map and directions</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {tracked.map((label) => (
        <TouchableOpacity
          key={`${label.key}-${label.trackingNumber}`}
          style={styles.track}
          onPress={() => Linking.openURL(label.trackingUrl || `https://www.ups.com/track?tracknum=${encodeURIComponent(label.trackingNumber)}`)}
        >
          <Text style={styles.link}>
            {label.key === 'empties_in'
              ? 'Track empties to The Candle Garden'
              : label.key === 'kit_out'
                ? 'Track packing kit'
                : 'Track refills / package'}
          </Text>
          <Text style={styles.meta}>{label.trackingNumber}</Text>
        </TouchableOpacity>
      ))}
      {fallbackTracking.map((tracking) => (
        <TouchableOpacity
          key={tracking}
          style={styles.track}
          onPress={() => Linking.openURL(`https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`)}
        >
          <Text style={styles.link}>Track package</Text>
          <Text style={styles.meta}>{tracking}</Text>
        </TouchableOpacity>
      ))}

      {refillItems.map((item, index) => (
        <TouchableOpacity key={`refill-${index}`} style={styles.reorder} onPress={() => onReorderRefill(item)}>
          <Text style={styles.reorderText}>Refill the same vessels again</Text>
          <Text style={styles.meta}>Review today’s refill price and return option</Text>
        </TouchableOpacity>
      ))}
      {productItems.map((item, index) => (
        <TouchableOpacity key={`product-${index}`} style={styles.reorder} onPress={() => onReorderProduct(item)}>
          <Text style={styles.reorderText}>Reorder {item.name || 'this scent'}</Text>
          <Text style={styles.meta}>Added to cart at today’s live price</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity onPress={() => setExpanded((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded }}>
        <Text style={styles.link}>{expanded ? 'Hide receipt details' : 'View receipt details'}</Text>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.details}>
          <Text style={styles.itemTitle}>Receipt</Text>
          <Text selectable style={styles.meta}>Reference: {order.id}</Text>
          {order.customer_email ? <Text style={styles.meta}>Receipt email: {order.customer_email}</Text> : null}
          {order.promotion_code ? <Text style={styles.meta}>Promo code: {order.promotion_code}</Text> : null}
          {subtotal > 0 ? <Text style={styles.meta}>Subtotal: ${subtotal.toFixed(2)}</Text> : null}
          {discount > 0 ? <Text style={styles.meta}>Promotion: −${discount.toFixed(2)}</Text> : null}
          <Text style={styles.meta}>Total paid: ${total.toFixed(2)}</Text>
          {refunded > 0 ? <Text style={styles.meta}>Refunded: ${refunded.toFixed(2)}</Text> : null}
          {order.shipping?.address && !local ? (
            <Text style={styles.meta}>
              Deliver to: {order.shipping.name}{'\n'}
              {order.shipping.address}{order.shipping.address2 ? `, ${order.shipping.address2}` : ''}{'\n'}
              {order.shipping.city}, {order.shipping.state} {order.shipping.zip}
            </Text>
          ) : null}
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${STORE.phone}`)}>
            <Text style={styles.link}>Need help? Call the shop</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 18,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  date: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 4,
  },
  totalWrap: { alignItems: 'flex-end' },
  total: { fontFamily: fonts.heading, fontSize: 26, color: colors.primary },
  fulfillment: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.primaryMid,
    fontWeight: '700',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  status: {
    fontFamily: fonts.body,
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
  },
  badge: {
    fontSize: 10,
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    overflow: 'hidden',
    fontWeight: '700',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 12,
  },
  progress: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  step: { flex: 1 },
  bar: { height: 5, backgroundColor: colors.border, borderRadius: 3, marginBottom: 6 },
  barOn: { backgroundColor: colors.primaryMid },
  stepText: { fontSize: 10, color: colors.textMuted },
  stepCurrent: { color: colors.primary, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemCopy: { flex: 1 },
  kind: {
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primaryMid,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  itemTitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  amount: { fontSize: 14, color: colors.primary, fontWeight: '700' },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: 3,
  },
  link: {
    fontFamily: fonts.body,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 8,
  },
  labelBox: {
    padding: 14,
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  labelKicker: {
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.primaryMid,
    marginBottom: 6,
  },
  recipient: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primary,
    marginTop: 4,
    marginBottom: 4,
  },
  printBtn: {
    marginTop: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  printText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  pickupBox: {
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginVertical: 8,
  },
  track: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  details: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  reorder: {
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reorderText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
