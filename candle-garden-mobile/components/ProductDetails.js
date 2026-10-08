import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, View, Text, Image, TouchableOpacity, StyleSheet, Linking, Dimensions } from 'react-native';
import { colors, fonts } from '../lib/theme';

const PHOTO_W = Dimensions.get('window').width;

export default function ProductDetails({ product, onClose, onAdd }) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const [selected, setSelected] = useState(null);
  useEffect(() => setSelected(variants.find((variant) => !variant.soldOut) || null), [product]);
  if (!product) return null;
  const images = [...new Set([...(product.images || []), product.image].filter(Boolean))];
  const soldOut = product.soldOut || selected?.soldOut;
  const size = selected?.size || product.sizes?.[0];
  const price = Number(selected?.price ?? product.price ?? 0);
  const notes = Array.isArray(product.scentNotes)
    ? product.scentNotes.join(' · ')
    : product.scentNotes || product.description || 'Hand-poured at The Candle Garden. Ask our team for more scent details.';
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={s.page} contentContainerStyle={{ paddingBottom: 45 }}>
        <View style={s.heading}>
          <Text style={s.brand}>THE CANDLE GARDEN</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close product details">
            <Text style={s.close}>Close ✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {images.map((url) => (
            <Image key={url} source={{ uri: url }} style={[s.photo, { width: PHOTO_W }]} accessibilityLabel={product.name} />
          ))}
        </ScrollView>
        <View style={s.body}>
          <Text style={s.title}>{product.name}</Text>
          <Text style={s.price}>${price.toFixed(2)}</Text>
          <Text style={s.section}>Scent notes & story</Text>
          <Text style={s.description}>{notes}</Text>
          <Text style={s.section}>Choose your size</Text>
          <View style={s.sizes}>
            {variants.length ? variants.map((variant) => (
              <TouchableOpacity
                key={variant.id}
                disabled={variant.soldOut}
                onPress={() => setSelected(variant)}
                style={[s.size, selected?.id === variant.id && s.selected, variant.soldOut && { opacity: 0.4 }]}
              >
                <Text style={{ color: selected?.id === variant.id ? colors.white : colors.primary }}>
                  {variant.size || 'Standard'} · ${Number(variant.price).toFixed(2)}{variant.soldOut ? ' · Sold out' : ''}
                </Text>
              </TouchableOpacity>
            )) : <Text>{size || 'Standard size'}</Text>}
          </View>
          <TouchableOpacity
            disabled={soldOut}
            style={[s.add, soldOut && { opacity: 0.5 }]}
            onPress={() => onAdd(product, { size, variantId: selected?.id, unitPrice: price })}
          >
            <Text style={s.addText}>{soldOut ? 'Sold out' : 'Add to cart'}</Text>
          </TouchableOpacity>
          {product.url ? (
            <TouchableOpacity onPress={() => Linking.openURL(product.url)}>
              <Text style={s.close}>More on the Candle Garden website →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:colors.white},heading:{padding:18,paddingTop:28,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{color:colors.primary,fontSize:11,letterSpacing:2},close:{color:colors.primary,paddingVertical:12,fontWeight:'600'},photo:{width:350,height:350,backgroundColor:colors.surface},body:{padding:22},title:{fontFamily:fonts.heading,fontSize:30,color:colors.primary},price:{fontSize:21,fontWeight:'600',color:colors.primary,marginVertical:14},section:{fontSize:16,fontWeight:'700',color:colors.primary,marginTop:20,marginBottom:10},description:{fontFamily:fonts.body,color:colors.textSecondary,fontSize:15,lineHeight:25},sizes:{flexDirection:'row',flexWrap:'wrap',gap:10},size:{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:8},selected:{backgroundColor:colors.primary},add:{backgroundColor:colors.primary,padding:16,alignItems:'center',borderRadius:8,marginVertical:25},addText:{color:colors.white,fontWeight:'700'}});
