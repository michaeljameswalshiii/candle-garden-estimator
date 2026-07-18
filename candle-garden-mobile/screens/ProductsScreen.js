import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { lifestyle } from '../lib/images';

const PRODUCTS_API = 'https://horywm2kdi.execute-api.us-east-1.amazonaws.com/prod/products';

export default function ProductsScreen() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch(PRODUCTS_API);
      const data = await response.json();
      if (Array.isArray(data)) {
        setProducts(data);
      } else {
        setProducts([data]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderProduct = ({ item }) => (
    <TouchableOpacity style={styles.productCard} activeOpacity={0.85}>
      <View style={styles.productImageContainer}>
        <Text style={styles.placeholderImage}>🕯️</Text>
      </View>
      <Text style={styles.productName}>{item.name}</Text>
      <Text style={styles.productDescription}>{item.description}</Text>
      <Text style={styles.productPrice}>
        ${item.price ? item.price.toFixed(2) : '0.00'}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Error loading products</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id || item.name}
        renderItem={renderProduct}
        numColumns={2}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Image
              source={lifestyle.scentMoment}
              style={styles.headerImage}
              resizeMode="cover"
            />
            <View style={styles.headerOverlay} />
            <Text style={styles.headerTitle}>Our Candles</Text>
            <Text style={styles.headerSubtitle}>
              Signature scents from The Candle Garden
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No products available</Text>
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
    padding: 10,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: colors.textMuted,
    fontFamily: fonts.body,
  },
  errorText: {
    fontSize: 18,
    color: colors.danger,
    fontWeight: 'bold',
    fontFamily: fonts.body,
  },
  errorDetail: {
    color: colors.textMuted,
    marginTop: 5,
    fontFamily: fonts.body,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    fontFamily: fonts.body,
  },
  header: {
    height: 170,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    marginTop: 6,
    justifyContent: 'flex-end',
    backgroundColor: colors.surface,
  },
  headerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 56, 49, 0.38)',
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '400',
    color: colors.white,
    paddingHorizontal: 16,
    zIndex: 1,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 16,
    paddingBottom: 14,
    marginTop: 4,
    zIndex: 1,
  },
  list: {
    paddingBottom: 20,
  },
  productCard: {
    flex: 1,
    margin: 8,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    alignItems: 'center',
    maxWidth: '47%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  productImageContainer: {
    width: 100,
    height: 100,
    backgroundColor: colors.lightAccent,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  placeholderImage: {
    fontSize: 40,
  },
  productName: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.text,
  },
  productDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  productPrice: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 8,
  },
});
