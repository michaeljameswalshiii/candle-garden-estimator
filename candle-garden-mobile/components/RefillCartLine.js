import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../lib/theme';

export default function RefillCartLine({ item, onQuantity, onRemove, label = 'Candle refill' }) {
  const qty = Number(item.quantity || 1);
  return <View style={s.card}>
    <View style={s.header}>
      {!!item.image && <Image source={{ uri: item.image }} style={s.image} resizeMode="cover" />}
      <View style={s.heading}><Text style={s.title}>{item.name}</Text><Text style={s.kind}>{label}</Text></View>
      <Text style={s.total}>${(item.unitPrice * qty).toFixed(2)}</Text>
    </View>
    {!!item.detail && <Text style={s.detail}>{item.detail}</Text>}
    {!!item.vesselScents?.length && <View style={s.scents}>
      <Text style={s.label}>Your vessels & scents</Text>
      {item.vesselScents.map((row, index) => <View key={row.vesselId || index} style={s.scentRow}>
        <Text style={s.vessel}>Vessel {index + 1}{Number(row.ounces) > 0 ? ` · ${row.ounces} oz` : ''}</Text>
        <Text style={s.scent}>{row.scentName || row.scent || 'Selected scent'}</Text>
      </View>)}
    </View>}
    {!item.vesselScents?.length && item.scents?.map((row, index) => <Text key={index} style={s.detail}>
      {row.vessel || `Vessel ${index + 1}`}: {row.scent}</Text>)}
    {Number.isFinite(item.waxUnitPrice) && Number.isFinite(item.returnShippingUnitPrice) && <View style={s.costs}>
      <View style={s.costRow}><Text style={s.detail}>Wax & refill</Text><Text style={s.cost}>${(item.waxUnitPrice * qty).toFixed(2)}</Text></View>
      <View style={s.costRow}><Text style={s.detail}>{item.shippingMethod === 'kit_roundtrip' ? 'Shipping & packing kit' : item.shippingMethod === 'prepaid_labels' ? 'Shipping · two trips' : 'Shipping'}</Text><Text style={s.cost}>${(item.returnShippingUnitPrice * qty).toFixed(2)}</Text></View>
    </View>}
    <View style={s.controls}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Decrease refill quantity" style={s.quantity} onPress={() => onQuantity(qty - 1)}><Text style={s.quantityText}>−</Text></TouchableOpacity>
      <Text style={s.count}>{qty}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Increase refill quantity" style={s.quantity} onPress={() => onQuantity(qty + 1)}><Text style={s.quantityText}>+</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove refill" style={s.remove} onPress={onRemove}><Text style={s.removeText}>Remove</Text></TouchableOpacity>
    </View>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, image: { width: 52, height: 62, borderRadius: radii.sm },
  heading: { flex: 1 }, title: { color: colors.primary, fontFamily: fonts.heading, fontSize: 18, lineHeight: 24 },
  kind: { color: colors.textMuted, fontSize: 12, marginTop: 4 }, total: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  detail: { color: colors.textMuted, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  scents: { marginTop: 16, marginBottom: 4 }, label: { color: colors.primary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  scentRow: { paddingVertical: 7, borderBottomWidth: 1, borderColor: colors.border },
  vessel: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, scent: { color: colors.text, fontSize: 15, lineHeight: 22 },
  costs: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border },
  costRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  cost: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  quantity: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  quantityText: { color: colors.white, fontSize: 22 }, count: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  remove: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }, removeText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});
