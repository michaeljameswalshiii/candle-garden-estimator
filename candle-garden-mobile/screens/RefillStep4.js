import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  BOX_PRICING,
  calculateCost,
  recommendBox,
  WAX_PRICE_PER_OZ,
} from '../lib/pricing';
import { colors, fonts, radii, spacing } from '../lib/theme';

// Custom Button component
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
  } = route.params || {};

  const recommendedBox = initialBoxKey || recommendBox(ounces);
  const [quantity, setQuantity] = useState(1);
  const [selectedBox, setSelectedBox] = useState(recommendedBox);

  const cost = useMemo(
    () => calculateCost(ounces, { quantity, boxKey: selectedBox }),
    [ounces, quantity, selectedBox]
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
      `Adding ${quantity} candle(s) to cart for $${cost.total_cost}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add to Cart',
          onPress: () => {
            Alert.alert('Success', 'Items added to cart!');
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Shipping & Quantity</Text>

      {/* Order Summary */}
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

      {/* Quantity Selector */}
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

      {/* Box Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Shipping Box</Text>
        <Text style={styles.hintText}>
          Shipping is charged once per order (not per candle).
        </Text>

        {Object.entries(BOX_PRICING).map(([key, box]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.boxOption,
              selectedBox === key && styles.boxOptionSelected,
              key === recommendedBox && selectedBox !== key && styles.boxOptionRecommended,
            ]}
            onPress={() => setSelectedBox(key)}
          >
            <View style={styles.boxInfo}>
              <Text style={styles.boxName}>{box.name}</Text>
              <Text style={styles.boxDetails}>Holds up to {box.maxOz} oz</Text>
            </View>
            <Text style={styles.boxPrice}>${box.cost.toFixed(2)}</Text>
            {key === recommendedBox && (
              <Text style={styles.recommendedBadge}>Recommended</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Total */}
      <View style={styles.totalSection}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>${cost.total_cost}</Text>
        <Text style={styles.totalBreakdown}>
          Wax: ${cost.wax_cost} + Shipping: ${cost.shipping_cost}
        </Text>
      </View>

      {/* Add to Cart Button */}
      <View style={styles.buttonContainer}>
        <CustomButton title="Add to Cart" onPress={handleAddToCart} />
        <CustomButton title="Back" onPress={() => navigation.goBack()} color={colors.textMuted} />
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
    marginBottom: 20,
    color: colors.primary,
    textAlign: 'center',
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
  },
  boxName: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  boxDetails: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
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
  buttonContainer: {
    gap: 12,
    marginTop: 20,
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
