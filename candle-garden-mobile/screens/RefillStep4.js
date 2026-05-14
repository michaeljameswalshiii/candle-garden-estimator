import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

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
  const { ounces = 12, containerType = 'Unknown' } = route.params || {};
  
  const [quantity, setQuantity] = useState(1);
  const [selectedBox, setSelectedBox] = useState('medium');
  
  // Calculate prices
  const waxPricePerOz = 0.50;
  const boxPricing = {
    small: { cost: 8.99, maxOz: 8, name: 'Small Box' },
    medium: { cost: 12.99, maxOz: 16, name: 'Medium Box' },
    large: { cost: 15.99, maxOz: 32, name: 'Large Box' }
  };
  
  // Determine recommended box based on ounces
  const recommendedBox = ounces <= 8 ? 'small' : ounces <= 16 ? 'medium' : 'large';
  
  const waxCost = ounces * waxPricePerOz * quantity;
  const shippingCost = boxPricing[selectedBox].cost * quantity;
  const totalCost = waxCost + shippingCost;
  
  const increaseQuantity = () => {
    if (quantity < 10) setQuantity(quantity + 1);
  };
  
  const decreaseQuantity = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };
  
  const handleAddToCart = () => {
    Alert.alert(
      'Add to Cart',
      `Adding ${quantity} candle(s) to cart for $${totalCost.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Add to Cart', 
          onPress: () => {
            Alert.alert('Success', 'Items added to cart!');
            navigation.goBack();
          }
        }
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
        <Text style={styles.totalText}>
          Wax Needed: {(ounces * quantity)} oz (${waxCost.toFixed(2)})
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
        
        {Object.entries(boxPricing).map(([key, box]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.boxOption,
              selectedBox === key && styles.boxOptionSelected,
              key === recommendedBox && !selectedBox && styles.boxOptionRecommended
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
        <Text style={styles.totalAmount}>${totalCost.toFixed(2)}</Text>
        <Text style={styles.totalBreakdown}>
          Wax: ${waxCost.toFixed(2)} + Shipping: ${(boxPricing[selectedBox].cost * quantity).toFixed(2)}
        </Text>
      </View>
      
      {/* Add to Cart Button */}
      <View style={styles.buttonContainer}>
        <CustomButton 
          title="Add to Cart" 
          onPress={handleAddToCart}
        />
        <CustomButton 
          title="Back" 
          onPress={() => navigation.goBack()}
          color="#666"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#2e7d32',
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  infoText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#666',
  },
  totalText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    color: '#2e7d32',
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
    backgroundColor: '#2e7d32',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  quantityText: {
    fontSize: 32,
    fontWeight: 'bold',
    marginHorizontal: 30,
    color: '#333',
  },
  hintText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  boxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  boxOptionSelected: {
    borderColor: '#2e7d32',
    backgroundColor: '#e8f5e9',
  },
  boxOptionRecommended: {
    borderColor: '#ff9800',
  },
  boxInfo: {
    flex: 1,
  },
  boxName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  boxDetails: {
    fontSize: 12,
    color: '#666',
  },
  boxPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  recommendedBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    fontSize: 10,
    color: '#ff9800',
    fontWeight: 'bold',
  },
  totalSection: {
    backgroundColor: '#e8f5e9',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 15,
  },
  totalLabel: {
    fontSize: 18,
    color: '#666',
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginVertical: 5,
  },
  totalBreakdown: {
    fontSize: 12,
    color: '#666',
  },
  buttonContainer: {
    gap: 12,
    marginTop: 20,
  },
  button: {
    backgroundColor: '#2e7d32',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: '#888',
  },
});
