import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Image,
  Linking,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { lifestyle } from '../lib/images';
import {
  SHOP_CATEGORIES,
  SHOP_BASE,
  filterProducts,
  formatPrice,
} from '../lib/shopCatalog';
import { useCart } from '../lib/cart';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 10;
const CARD_GAP = 10;
const CARD_W = (SCREEN_W - H_PAD * 2 - CARD_GAP) / 2;

export default function ProductsScreen() {
  const [category, setCategory] = useState('all');
  const { addItem, itemCount } = useCart();

  const items = useMemo(() => filterProducts(category), [category]);
  const activeMeta = SHOP_CATEGORIES.find((c) => c.id === category) || SHOP_CATEGORIES[0];

  const openProduct = (product) => {
    const url = product.url || `${SHOP_BASE}/shop`;
    Linking.openURL(url).catch(() => {});
  };

  const openCollection = () => {
    Linking.openURL(`${SHOP_BASE}${activeMeta.sitePath}`).catch(() => {});
  };

  const handleAddToCart = (product) => {
    if (product.soldOut) {
      Alert.alert('Sold out', 'This item is not available right now.');
      return;
    }

    const sizes = Array.isArray(product.sizes) ? product.sizes.filter(Boolean) : [];

    const doAdd = (size) => {
      addItem(product, { size, quantity: 1 });
      const sizeNote = size ? ` (${size})` : '';
      Alert.alert(
        'Added to cart',
        `${product.name}${sizeNote} is in your cart.\n\nOpen the Orders tab to review your cart.`,
        [{ text: 'OK' }]
      );
    };

    if (sizes.length > 1) {
      Alert.alert(
        'Choose a size',
        product.name,
        [
          ...sizes.map((s) => ({
            text: s,
            onPress: () => doAdd(s),
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      doAdd(sizes[0] || null);
    }
  };

  const renderProduct = ({ item }) => {
    const priceLabel = formatPrice(item);
    const sizeLabel =
      Array.isArray(item.sizes) && item.sizes.length > 0
        ? item.sizes.join(' · ')
        : null;

    return (
      <View style={styles.productCard}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => openProduct(item)}>
          <View style={styles.imageWrap}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.productImage} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.placeholderEmoji}>🕯️</Text>
              </View>
            )}
            {item.soldOut ? (
              <View style={styles.soldBadge}>
                <Text style={styles.soldBadgeText}>Sold out</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          {item.description ? (
            <Text style={styles.productDescription} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          {sizeLabel ? <Text style={styles.sizeLabel}>{sizeLabel}</Text> : null}
          {priceLabel ? <Text style={styles.productPrice}>{priceLabel}</Text> : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addBtn, item.soldOut && styles.addBtnDisabled]}
          onPress={() => handleAddToCart(item)}
          disabled={Boolean(item.soldOut)}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>
            {item.soldOut ? 'Sold out' : 'Add to cart'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openProduct(item)}>
          <Text style={styles.shopLink}>View on site →</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id || item.name}
        renderItem={renderProduct}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Image
                source={lifestyle.scentMoment}
                style={styles.headerImage}
                resizeMode="cover"
              />
              <View style={styles.headerOverlay} />
              <Text style={styles.headerTitle}>Shop</Text>
              <Text style={styles.headerSubtitle}>
                The same collections as thecandlegarden.co
              </Text>
            </View>

            {itemCount > 0 ? (
              <View style={styles.cartBanner}>
                <Text style={styles.cartBannerText}>
                  Cart: {itemCount} item{itemCount === 1 ? '' : 's'}
                </Text>
                <Text style={styles.cartBannerHint}>Review in Orders tab</Text>
              </View>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {SHOP_CATEGORIES.map((cat) => {
                const active = cat.id === category;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCategory(cat.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.metaRow}>
              <Text style={styles.countText}>
                {items.length} product{items.length === 1 ? '' : 's'}
                {category !== 'all' ? ` · ${activeMeta.label}` : ''}
              </Text>
              <TouchableOpacity onPress={openCollection}>
                <Text style={styles.browseSite}>Open on website</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No products in this collection</Text>
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
  },
  list: {
    paddingHorizontal: H_PAD,
    paddingBottom: 28,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
  },
  header: {
    height: 160,
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
    backgroundColor: 'rgba(16, 56, 49, 0.4)',
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 28,
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
  cartBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  cartBannerText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  cartBannerHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  chips: {
    paddingBottom: spacing.sm,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 4,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  chipTextActive: {
    color: colors.white,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  countText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  browseSite: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  productCard: {
    width: CARD_W,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 0.85,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.lightAccent,
    marginBottom: 8,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 36,
  },
  soldBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(14,14,14,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  soldBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  productName: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '400',
    color: colors.text,
    marginBottom: 4,
    minHeight: 36,
  },
  productDescription: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginBottom: 4,
  },
  sizeLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.primaryMid,
    marginBottom: 4,
  },
  productPrice: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
    marginBottom: 8,
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 9,
    alignItems: 'center',
    marginBottom: 6,
  },
  addBtnDisabled: {
    backgroundColor: colors.disabled,
  },
  addBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  shopLink: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: colors.darkAccent,
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    fontFamily: fonts.body,
  },
});
