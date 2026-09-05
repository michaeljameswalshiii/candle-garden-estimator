import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  calculateCost,
  recommendBox,
  WAX_PRICE_PER_OZ,
  USPS_FLAT_RATE_BOXES,
  SHIPPING_POLICY,
} from '../lib/pricing';
import { BOX_FIT_ORDER } from '../lib/shippingConfig';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { useCart } from '../lib/cart';

function CustomButton({ title, onPress, disabled, color }) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        disabled ? styles.buttonDisabled : null,
        color ? { backgroundColor: color } : null,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.buttonText, disabled ? styles.buttonTextDisabled : null]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

// RefillStep4 - Shipping & Quantity Screen
export default function RefillStep4() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    ounces = 12,
    containerType = 'Unknown',
    boxKey: initialBoxKey,
    vesselCount: vesselCountParam,
  } = route.params || {};

  const { addItem } = useCart();
  const vesselCount = Math.max(1, Number(vesselCountParam) || 1);
  const recommendedBox =
    initialBoxKey || recommendBox(ounces, { vesselCount });
  const [quantity, setQuantity] = useState(1);
  const [selectedBox, setSelectedBox] = useState(recommendedBox);

  const cost = useMemo(
    () =>
      calculateCost(ounces, {
        quantity,
        boxKey: selectedBox,
        vesselCount: Math.max(vesselCount, quantity),
      }),
    [ounces, quantity, selectedBox, vesselCount]
  );

  const increaseQuantity = () => {
    if (quantity < 10) setQuantity(quantity + 1);
  };

  const decreaseQuantity = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };

  const handleAddToCart = () => {
    Alert.alert(
      'Add to Cart',
      `Adding ${quantity} refill${quantity === 1 ? '' : 's'} for $${cost.total_cost}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add to Cart',
          onPress: () => {
            addItem(
              {
                id: 'refill',
                type: 'refill',
                name: `Candle refill · ${ounces} oz`,
                price: cost.total_cost_num / quantity,
              },
              {
                type: 'refill',
                quantity,
                ounces,
                boxKey: selectedBox,
                detail: `${cost.box_type} return shipping included`,
                unitPrice: cost.total_cost_num / quantity,
              }
            );
            Alert.alert('Added to cart', 'Open the Cart tab to pay with your shop items and classes.');
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Shipping & Quantity</Text>

      <View style={styles.policyBox}>
        <Text style={styles.policyTitle}>How shipping works</Text>
        <Text style={styles.policyText}>{SHIPPING_POLICY.summary}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order Summary</Text>
        <Text style={styles.infoText}>Container: {containerType}</Text>
        <Text style={styles.infoText}>Volume: {ounces} oz per candle</Text>
        <Text style={styles.infoText}>
          Rate: ${WAX_PRICE_PER_OZ.toFixed(2)}/oz
        </Text>
        <Text style={styles.totalText}>
          Wax Needed: {(ounces * quantity).toFixed(1)} oz (${cost.wax_cost})
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quantity</Text>
        <View style={styles.quantityContainer}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={decreaseQuantity}
            disabled={quantity <= 1}
          >
            <Text style={styles.quantityButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.quantityText}>{quantity}</Text>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={increaseQuantity}
            disabled={quantity >= 10}
          >
            <Text style={styles.quantityButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>Max 10 candles per order</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recommended box</Text>
        <Text style={styles.hintText}>
          Price shown is return shipping to you (included). Pack empties well —
          packing material uses space. Use this size when you ship to us.
        </Text>

        {BOX_FIT_ORDER.map((key) => {
          const box = USPS_FLAT_RATE_BOXES[key];
          if (!box) return null;
          const dims = `${box.lengthIn}×${box.widthIn}×${box.heightIn} in`;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.boxOption,
                selectedBox === key && styles.boxOptionSelected,
                key === recommendedBox &&
                  selectedBox !== key &&
                  styles.boxOptionRecommended,
              ]}
              onPress={() => setSelectedBox(key)}
            >
              <View style={styles.boxInfo}>
                <Text style={styles.boxName}>{box.shortName}</Text>
                <Text style={styles.boxDetails}>
                  Inside ~{dims}
                </Text>
                <Text style={styles.boxDetails} numberOfLines={2}>
                  {box.notes}
                </Text>
              </View>
              <Text style={styles.boxPrice}>
                ${box.postageOneLegUsd.toFixed(2)}
              </Text>
              {key === recommendedBox && (
                <Text style={styles.recommendedBadge}>Recommended</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.totalSection}>
        <Text style={styles.totalLabel}>Estimate total</Text>
        <Text style={styles.totalAmount}>${cost.total_cost}</Text>
        <Text style={styles.totalBreakdown}>
          Wax ${cost.wax_cost} + Return shipping ${cost.shipping_cost}
        </Text>
        <Text style={styles.totalNote}>
          Does not include your postage to ship empties to us
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <CustomButton title="Add to Cart" onPress={handleAddToCart} />
        <CustomButton
          title="Back"
          onPress={() => navigation.goBack()}
          color={colors.textMuted}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.white,
    padding: spacing.md + 4,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '400',
    marginBottom: 16,
    color: colors.primary,
    textAlign: 'center',
  },
  policyBox: {
    backgroundColor: colors.lightAccent,
    padding: 14,
    borderRadius: radii.md,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  policyTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.primary,
    marginBottom: 6,
  },
  policyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  section: {
    backgroundColor: colors.surface,
    padding: 15,
    borderRadius: radii.md,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '400',
    marginBottom: 10,
    color: colors.darkAccent,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: 5,
    color: colors.textMuted,
  },
  totalText: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    color: colors.primary,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  quantityButton: {
    width: 50,
    height: 50,
    backgroundColor: colors.primary,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 24,
    color: colors.white,
    fontWeight: 'bold',
  },
  quantityText: {
    fontFamily: fonts.body,
    fontSize: 32,
    fontWeight: 'bold',
    marginHorizontal: 30,
    color: colors.text,
  },
  hintText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 17,
  },
  boxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  boxOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  boxOptionRecommended: {
    borderColor: colors.warning,
  },
  boxInfo: {
    flex: 1,
    paddingRight: 8,
  },
  boxName: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text,
  },
  boxDetails: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  boxPrice: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  recommendedBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    fontSize: 10,
    color: colors.warning,
    fontWeight: 'bold',
  },
  totalSection: {
    backgroundColor: colors.lightAccent,
    padding: 20,
    borderRadius: radii.md,
    alignItems: 'center',
    marginVertical: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.textMuted,
  },
  totalAmount: {
    fontFamily: fonts.heading,
    fontSize: 32,
    fontWeight: '400',
    color: colors.primary,
    marginVertical: 5,
  },
  totalBreakdown: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  totalNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 8,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 12,
    marginTop: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: radii.sm,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
  buttonTextDisabled: {
    color: colors.textFaint,
  },
});
