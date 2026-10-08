import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Image, ScrollView, TextInput, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  calculateCost,
  isValidOunces,
  isAcceptableDetection,
  quoteAllMethods,
  SHIPPING_METHODS,
  UPS_BOXES,
  DEFAULT_SHIPPING_METHOD,
  REFILL_SPEEDS,
  normalizeSpeed,
} from '../lib/pricing';
import { BOX_FIT_ORDER, PACKING_INSTRUCTIONS, shippingMethodSummary } from '../lib/shippingConfig';
import { STORE } from '../lib/storeInfo';
import { prepareImageForDetect, isImageManipulatorAvailable } from '../lib/prepareImage';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { postDetect, postShippingQuote } from '../lib/apiClient';
import { useAuth } from '../lib/AuthContext';
import { useCart } from '../lib/cart';

const PHOTO_STEPS = [
  {
    title: 'Gather vessels',
    body: 'Line up every jar, mug, or glass you want refilled. Include the small ones. Empty glass with the wick showing works best.',
  },
  {
    title: 'Add a scale can',
    body: 'Place a 12 oz drink can beside them. We use it for size only and will not count it as a vessel.',
  },
  {
    title: 'Photograph the group',
    body: 'Hold the phone upright and capture the whole group in one frame, then tap Get Estimate.',
  },
];

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

export default function EstimatorScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualOunces, setManualOunces] = useState('');
  const [destZip, setDestZip] = useState('');
  const [shippingMethod, setShippingMethod] = useState(DEFAULT_SHIPPING_METHOD);
  const [refillSpeed, setRefillSpeed] = useState(null);
  const [selectedBox, setSelectedBox] = useState(null);
  const [liveQuotes, setLiveQuotes] = useState([]);
  const [photoSize, setPhotoSize] = useState(null);
  const [loadingPhase, setLoadingPhase] = useState('');
  const preparedRef = useRef(null);
  const prepGen = useRef(0);
  const manipulatorOk = isImageManipulatorAvailable();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const photoFrameWidth = Math.max(240, windowWidth - (spacing.md + 4) * 2);
  const photoAspect = photoSize && photoSize.h > 0 ? photoSize.w / photoSize.h : 3 / 4;
  const previewHeight = Math.min(
    windowHeight * 0.62,
    Math.max(220, photoFrameWidth / Math.max(photoAspect, 0.45))
  );

  const vesselCount = Array.isArray(result?.vessels) && result.vessels.length
    ? result.vessels.length
    : 1;
  const perVesselOz = Array.isArray(result?.vessels)
    ? result.vessels
        .map((v) => Number(v.wax_needed_oz ?? v.estimated_ounces ?? v.volume_oz))
        .filter((n) => Number.isFinite(n) && n > 0)
    : undefined;

  useEffect(() => {
    const previous=route.params?.reorder;
    if (!previous || !Number(previous.ounces)) return;
    const count=Math.max(1,Number(previous.vesselCount)||1);
    setResult({estimated_ounces:Number(previous.ounces),vessels:Array.from({length:count},()=>({wax_needed_oz:Number(previous.ounces)/count}))});
    setShippingMethod(previous.shippingMethod || DEFAULT_SHIPPING_METHOD);
    setDestZip(previous.destZip || '');setSelectedBox(previous.boxKey || null);
    setRefillSpeed(previous.speed || 'standard');
  },[route.params?.reorder?.requestId]);
  const cost = useMemo(() => {
    if (!result?.estimated_ounces) return null;
    return calculateCost(result.estimated_ounces, {
      vesselCount,
      perVesselOz,
      destZip,
      shippingMethod,
      boxKey: selectedBox,
      speed: refillSpeed,
    });
  }, [result, vesselCount, perVesselOz, destZip, shippingMethod, selectedBox, refillSpeed]);

  useEffect(() => {
    if (!image) {
      setPhotoSize(null);
      return undefined;
    }
    let cancelled = false;
    Image.getSize(
      image,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setPhotoSize({ w, h });
      },
      () => {
        if (!cancelled) setPhotoSize(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [image]);

  const applyPickedPhoto = async (uri) => {
    const gen = prepGen.current + 1;
    prepGen.current = gen;
    preparedRef.current = null;
    setImage(uri);
    setResult(null);
    try {
      const prepared = await prepareImageForDetect(uri);
      if (prepGen.current !== gen) return;
      preparedRef.current = prepared;
      if (prepared.uri) setImage(prepared.uri);
      if (prepared.width && prepared.height) setPhotoSize({ w: prepared.width, h: prepared.height });
    } catch {
      /* Estimate will convert again if this background pass fails. */
    }
  };

  useEffect(() => {
    const zip = String(destZip || '').replace(/\D/g, '');
    if (!result?.estimated_ounces || zip.length < 5 || !refillSpeed) {
      setLiveQuotes([]);
      return undefined;
    }
    let cancelled = false;
    postShippingQuote({
      ounces: result.estimated_ounces,
      destZip: zip,
      boxKey: selectedBox,
      vesselCount,
      speed: refillSpeed,
      methods: ['ship_own', 'kit_roundtrip', 'prepaid_labels'],
    })
      .then((data) => {
        if (!cancelled) setLiveQuotes(Array.isArray(data?.quotes) ? data.quotes : []);
      })
      .catch(() => {
        if (!cancelled) setLiveQuotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [result, destZip, selectedBox, vesselCount, refillSpeed]);

  const methodQuotes = useMemo(() => {
    if (!result?.estimated_ounces) return [];
    return quoteAllMethods(result.estimated_ounces, {
      vesselCount,
      perVesselOz,
      destZip,
      boxKey: selectedBox,
      speed: refillSpeed,
    });
  }, [result, vesselCount, perVesselOz, destZip, selectedBox, refillSpeed]);

  const addEstimateToCart = () => {
    if (!result?.estimated_ounces || !cost || !refillSpeed) return;
    if (!cost.quote_ok) {
      Alert.alert(
        'ZIP needed',
        cost.quote_reason || 'Enter your 5-digit ZIP so we can estimate shipping.'
      );
      return;
    }
    const method = SHIPPING_METHODS[shippingMethod];
    const speed = normalizeSpeed(refillSpeed);
    const speedMeta = REFILL_SPEEDS[speed];
    addItem(
      {
        id: 'refill',
        type: 'refill',
        name: `Candle refill \u00b7 ${result.estimated_ounces} oz`,
        price: Number(cost.total_cost),
        image: image || undefined,
      },
      {
        type: 'refill',
        quantity: 1,
        ounces: result.estimated_ounces,
        boxKey: cost.box_key,
        destZip: cost.dest_zip,
        shippingMethod,
        speed,
        vesselCount,
        detail:
          `${speedMeta.title} \u00b7 ${speedMeta.timing}` +
          (shippingMethod === 'local_dropoff'
            ? ' · drop off and pick up in Atlantic Beach'
            : shippingMethod === 'ship_own'
            ? (speed === 'expedited'
              ? ' · you ship empties UPS 2nd Day Air'
              : ' · ship empties on your own')
            : ` · ${method?.title || 'Shipping'}`),
        unitPrice: Number(cost.total_cost),
        waxUnitPrice: cost.wax_cost_num,
        returnShippingUnitPrice: cost.shipping_cost_num,
      }
    );
    Alert.alert(
      'Added to cart',
      'Your refill is in the cart. Add shop items or a class if you want, then check out. We\u2019ll confirm your address at the end.',
      [
        { text: 'Keep estimating', style: 'cancel' },
        { text: 'Go to cart', onPress: () => navigation.navigate('Orders') },
      ]
    );
  };

  const pickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
    exif: false,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible
      ?? 'compatible',
  };

  const pickImage = async () => {
    try {
      const pickerResult = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (!pickerResult.canceled) {
        await applyPickedPhoto(pickerResult.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image: ' + error.message);
    }
  };

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permission to take photos');
        return;
      }
      const cameraResult = await ImagePicker.launchCameraAsync(pickerOptions);
      if (!cameraResult.canceled) {
        await applyPickedPhoto(cameraResult.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo: ' + error.message);
    }
  };

  const promptManualFallback = (tips) => {
    const tipList = tips && tips.length
      ? tips.map((t) => `\u2022 ${t}`).join('\n')
      : '\u2022 Make sure the vessel is well-lit\n\u2022 Take photo from above or side\n\u2022 Empty the vessel if possible';
    Alert.alert(
      'Could Not Auto-Estimate',
      `${tipList}\n\nEnter the volume manually for an accurate quote.`,
      [
        { text: 'Try Again', style: 'cancel' },
        { text: 'Enter Manually', onPress: () => setShowManualEntry(true) },
      ]
    );
  };

  const estimateCandle = async () => {
    if (!image) {
      Alert.alert('Error', 'Please select or take a photo first');
      return;
    }
    setLoading(true);
    setLoadingPhase('Preparing photo');
    try {
      let prepared = preparedRef.current;
      try {
        if (!prepared?.base64) {
          prepared = await prepareImageForDetect(image);
          preparedRef.current = prepared;
        }
      } catch (convErr) {
        promptManualFallback([
          convErr.message || 'Could not convert photo to JPEG',
          'Try: Settings \u2192 Camera \u2192 Formats \u2192 Most Compatible',
          'Or export the photo as JPEG from Photos and pick again',
        ]);
        return;
      }
      setLoadingPhase('Reading your vessels');
      let detectData;
      try {
        detectData = await postDetect({ image: prepared.base64 });
      } catch (apiErr) {
        if (apiErr.status === 429 || apiErr.data?.error === 'rate_limited') {
          promptManualFallback([
            apiErr.data?.message || apiErr.message || 'Too many estimates from this device',
            'Wait a bit and try again, or sign in for a higher limit',
            'You can still enter ounces manually',
          ]);
          return;
        }
        promptManualFallback([
          apiErr.message || 'Server error \u2014 photo may be too large or network failed',
        ]);
        return;
      }
      if (
        detectData.error === 'unsupported_image_format_heic'
        || (Array.isArray(detectData.tips) && detectData.tips.some((t) => /heic/i.test(t)))
      ) {
        promptManualFallback([
          'Photo was still HEIC after conversion',
          'Close Expo Go completely and reopen the project URL',
          'Or Settings \u2192 Camera \u2192 Formats \u2192 Most Compatible, then retake',
        ]);
        return;
      }
      if (detectData.success === false && !detectData.estimated_ounces) {
        promptManualFallback(detectData.tips || [detectData.error || 'Detection failed']);
        return;
      }
      const check = isAcceptableDetection(detectData);
      if (!check.ok) {
        promptManualFallback(check.tips || detectData.tips);
        return;
      }
      const detectedCount = Array.isArray(detectData.vessels) && detectData.vessels.length
        ? detectData.vessels.length
        : 1;
      const detectedPerVessel = Array.isArray(detectData.vessels)
        ? detectData.vessels
            .map((v) => Number(v.wax_needed_oz ?? v.estimated_ounces ?? v.volume_oz))
            .filter((n) => Number.isFinite(n) && n > 0)
        : undefined;
      const firstQuote = calculateCost(check.ounces, {
        vesselCount: detectedCount,
        perVesselOz: detectedPerVessel,
      });
      setSelectedBox(firstQuote.box_key);
      setResult({
        estimated_ounces: check.ounces,
        container_type: check.container_type,
        confidence: check.confidence,
        explanation: detectData.explanation,
        vessels: detectData.vessels,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to process image: ' + (error.message || String(error)));
    } finally {
      setLoading(false);
      setLoadingPhase('');
    }
  };

  const submitManualEntry = () => {
    const ounces = parseFloat(manualOunces);
    if (!isValidOunces(ounces)) {
      Alert.alert('Invalid Input', 'Please enter a positive volume in ounces (e.g. 8, 12.5, 40)');
      return;
    }
    const firstQuote = calculateCost(ounces);
    setSelectedBox(firstQuote.box_key);
    setResult({
      estimated_ounces: ounces,
      container_type: 'Manual Entry',
      confidence: 1.0,
    });
    setShowManualEntry(false);
    setManualOunces('');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Refill Estimator</Text>
      <Text style={styles.buildTag}>
        build: ups-ground-saver-v1 {'·'} {isAuthenticated ? 'signed in' : 'guest'}
      </Text>
      <View style={styles.stepsCard}>
        <Text style={styles.stepsHeading}>How to photograph</Text>
        {PHOTO_STEPS.map((step, index) => (
          <View key={step.title} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{index + 1}</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>
      {!manipulatorOk ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnTitle}>Limited photo conversion in this client</Text>
          <Text style={styles.warnBody}>
            Update Expo Go to the latest version, or use the TestFlight app for full HEIC support. JPEG photos may still work {'—'} or enter ounces manually below.
          </Text>
          <CustomButton title="Enter ounces manually" onPress={() => setShowManualEntry(true)} />
        </View>
      ) : null}
      {image ? (
        <View style={[styles.imageFrame, { width: photoFrameWidth, height: previewHeight }]}>
          <Image
            source={{ uri: image }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Estimate photo, shown full width"
          />
        </View>
      ) : (
        <View style={[styles.placeholderContainer, { width: photoFrameWidth, height: Math.min(windowHeight * 0.42, photoFrameWidth * (4 / 3)) }]}>
          <Text style={styles.placeholderText}>{'📷'}</Text>
          <Text style={styles.placeholderHint}>Photo fills this frame on iPhone</Text>
        </View>
      )}
      <View style={styles.buttonContainer}>
        <CustomButton title="Take Photo" onPress={takePhoto} />
        <CustomButton title="Pick from Gallery" onPress={pickImage} />
        {image && (
          <>
            <CustomButton title="Clear Photo" onPress={() => { setImage(null); setResult(null); setRefillSpeed(null); preparedRef.current = null; }} color={colors.danger} />
            <CustomButton title={loading ? (loadingPhase || 'Estimating...') : 'Get Estimate'} onPress={estimateCandle} disabled={loading} />
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingHint}>{loadingPhase || 'Estimating...'}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
      {showManualEntry && (
        <View style={styles.manualEntryContainer}>
          <Text style={styles.manualEntryTitle}>Enter Volume Manually</Text>
          <Text style={styles.manualEntryHint}>Enter the wax volume needed in ounces (any positive amount)</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputContainer}>
              <TextInput style={styles.input} value={manualOunces} onChangeText={setManualOunces} keyboardType="decimal-pad" placeholder="12" placeholderTextColor={colors.textFaint} />
            </View>
            <Text style={styles.inputSuffix}>oz</Text>
          </View>
          <View style={styles.manualButtons}>
            <CustomButton title="Cancel" onPress={() => setShowManualEntry(false)} color={colors.textMuted} />
            <CustomButton title="Submit" onPress={submitManualEntry} />
          </View>
        </View>
      )}
      {result && cost && (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Estimate</Text>
          <Text style={styles.resultText}>
            Total wax needed: {result.estimated_ounces} oz
            {result.vessels?.length ? ` (${result.vessels.length} container${result.vessels.length === 1 ? '' : 's'})` : ''}
          </Text>
          {Array.isArray(result.vessels) && result.vessels.length > 0 && (
            <View style={styles.vesselList}>
              {result.vessels.map((v, i) => (
                <Text key={i} style={styles.vesselLine}>
                  {'•'} {v.description || `Vessel ${i + 1}`}:{' '}
                  {v.wax_needed_oz != null ? `${v.wax_needed_oz} oz` : '\u2014'}
                </Text>
              ))}
            </View>
          )}
          {result.confidence != null && result.confidence < 1 && (
            <Text style={styles.resultText}>Confidence: {Math.round(result.confidence * 100)}%</Text>
          )}
          <Text style={styles.sectionLabel}>How fast should we turn this around?</Text>
          <Text style={styles.shipNote}>Choose a speed before we show postage or a total. The clock starts when your empties arrive.</Text>
          {Object.values(REFILL_SPEEDS).map((speed) => {
            const selected = refillSpeed === speed.key;
            return (
              <TouchableOpacity
                key={speed.key}
                style={[styles.methodCard, selected && styles.methodCardSelected]}
                onPress={() => setRefillSpeed(speed.key)}
                activeOpacity={0.8}
              >
                <View style={styles.methodHeader}>
                  <Text style={styles.methodTitle}>{speed.title}</Text>
                  <Text style={styles.methodPrice}>{speed.timing}</Text>
                </View>
                <Text style={styles.methodBody}>{speed.body}</Text>
              </TouchableOpacity>
            );
          })}
          {refillSpeed ? <Text style={styles.sectionLabel}>How the empties get to us</Text> : null}
          {refillSpeed ? (
            <>
          {methodQuotes.map(({ methodKey, method, cost: methodCost }) => {
            const selected = shippingMethod === methodKey;
            const live = liveQuotes.find((q) => q.method === methodKey);
            const liveShip = live && live.shipping_cents != null ? (live.shipping_cents / 100).toFixed(2) : null;
            const priceLabel = methodKey === 'local_dropoff'
              ? '$0.00'
              : liveShip
                ? `$${liveShip}`
                : methodCost.quote_ok
                  ? `$${methodCost.shipping_cost}`
                  : methodCost.needs_zip
                    ? 'Enter ZIP'
                    : 'See note';
            return (
              <TouchableOpacity key={methodKey} style={[styles.methodCard, selected && styles.methodCardSelected]} onPress={() => setShippingMethod(methodKey)} activeOpacity={0.8}>
                <View style={styles.methodHeader}>
                  <Text style={styles.methodTitle}>{method.title}</Text>
                  <Text style={styles.methodPrice}>{priceLabel}</Text>
                </View>
                <Text style={styles.methodMeta}>
                  {methodKey === 'local_dropoff'
                    ? 'Drop off and pick up in Atlantic Beach'
                    : methodKey === 'ship_own'
                      ? '1 return trip to you'
                      : `${method.chargeCount} shipping trips`}
                </Text>
                <Text style={styles.methodBody}>{shippingMethodSummary(methodKey, refillSpeed)}</Text>
                {methodKey === 'ship_own' && refillSpeed === 'expedited' ? (
                  <Text style={styles.methodWarn}>Send empties UPS 2nd Day Air so Expedited timing can start when they arrive.</Text>
                ) : null}
                {methodCost.quote_ok && methodCost.legs?.length ? methodCost.legs.map((leg) => (
                  <Text key={leg.key} style={styles.legLine}>{'•'} {leg.title}: ${leg.totalUsd.toFixed(2)} ({leg.billedLb} lb, zone {leg.zone})</Text>
                )) : null}
                {!methodCost.quote_ok && methodCost.quote_reason && !methodCost.needs_zip ? (
                  <Text style={styles.methodWarn}>{methodCost.quote_reason}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
          {shippingMethod === 'local_dropoff' ? (
            <View style={styles.instructBox}>
              <Text style={styles.sectionLabel}>The Candle Garden shop</Text>
              <Text style={styles.shipNote}>{STORE.address}{'\n'}{STORE.city}, {STORE.state} {STORE.zip}{'\n'}{STORE.hours}</Text>
            </View>
          ) : (
            <>
          <Text style={styles.sectionLabel}>Your ZIP</Text>
          <Text style={styles.shipNote}>Estimated shipping is based on ZIP and packed weight. Checkout confirms the lowest live carrier rate (USPS in Shippo test mode).</Text>
          <TextInput style={styles.zipInput} value={destZip} onChangeText={(t) => setDestZip(t.replace(/[^\d]/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="32250" placeholderTextColor={colors.textFaint} maxLength={10} />
          <Text style={styles.sectionLabel}>Carton</Text>
          <Text style={styles.shipNote}>Packed weight includes vessels, cardboard, and packing. Carriers bill the greater of scale weight and dimensional weight.</Text>
          {BOX_FIT_ORDER.map((key) => {
            const box = UPS_BOXES[key];
            if (!box) return null;
            const active = (selectedBox || cost.box_key) === key;
            return (
              <TouchableOpacity key={key} style={[styles.boxOption, active && styles.boxOptionSelected]} onPress={() => setSelectedBox(key)}>
                <Text style={styles.boxName}>{box.shortName}</Text>
                <Text style={styles.boxDetails}>{box.lengthIn}{'×'}{box.widthIn}{'×'}{box.heightIn} in {'·'} empty ~{box.emptyBoxOz} oz</Text>
                <Text style={styles.boxDetails}>{box.notes}</Text>
              </TouchableOpacity>
            );
          })}
          {cost.packed_weight ? (
            <View style={styles.weightBlock}>
              <Text style={styles.resultText}>Refills packed: {cost.packed_weight.refillsOutboundLabel}</Text>
              <Text style={styles.weightBreakdown}>{cost.packed_weight.breakdownOutbound}</Text>
              <Text style={styles.resultText}>Empties packed: {cost.packed_weight.emptiesInboundLabel}</Text>
              {shippingMethod === 'kit_roundtrip' ? (
                <Text style={styles.resultText}>Packing kit: {cost.packed_weight.kitLabel}</Text>
              ) : null}
            </View>
          ) : null}
          {shippingMethod === 'prepaid_labels' ? (
            <View style={styles.instructBox}>
              <Text style={styles.sectionLabel}>Packing instructions</Text>
              {PACKING_INSTRUCTIONS.map((line, i) => (
                <Text key={i} style={styles.instructLine}>{i + 1}. {line}</Text>
              ))}
            </View>
          ) : null}
            </>
          )}
          {cost.customer_note ? <Text style={styles.shipNote}>{cost.customer_note}</Text> : null}
          <Text style={styles.total}>Total: {cost.quote_ok ? `$${cost.total_cost}` : '\u2014'}</Text>
          <CustomButton title="Add refill to cart" onPress={addEstimateToCart} disabled={!cost.quote_ok || !refillSpeed} />
            </>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: spacing.md + 4 },
  title: { fontFamily: fonts.heading, fontSize: 26, fontWeight: '400', marginBottom: 4, color: colors.primary },
  buildTag: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginBottom: 10 },
  stepsCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16 },
  stepsHeading: { fontFamily: fonts.heading, fontSize: 16, color: colors.primary, marginBottom: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  stepCopy: { flex: 1 },
  stepTitle: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  stepBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  loadingHint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  imageFrame: { marginBottom: 20, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface, alignSelf: 'center' },
  image: { width: '100%', height: '100%' },
  placeholderContainer: { backgroundColor: colors.surface, borderRadius: radii.md, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 2, borderColor: colors.borderStrong, borderStyle: 'dashed', alignSelf: 'center' },
  placeholderText: { fontSize: 60, marginBottom: 10 },
  placeholderHint: { fontFamily: fonts.body, fontSize: 16, color: colors.textFaint },
  buttonContainer: { alignItems: 'center', gap: 12, width: '100%' },
  button: { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 30, borderRadius: radii.sm, minWidth: 200, alignItems: 'center' },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '500', letterSpacing: 1.2 },
  buttonTextDisabled: { color: colors.textFaint },
  result: { backgroundColor: colors.lightAccent, padding: 20, borderRadius: radii.md, marginTop: 20, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: colors.border },
  resultTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '400', marginBottom: 10, color: colors.primary },
  resultText: { fontFamily: fonts.body, fontSize: 16, marginBottom: 5, color: colors.textSecondary },
  vesselList: { width: '100%', marginBottom: 10, paddingHorizontal: 8 },
  vesselLine: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginBottom: 4, textAlign: 'left' },
  total: { fontFamily: fonts.body, fontSize: 24, fontWeight: 'bold', color: colors.primary, marginTop: 10, marginBottom: 12 },
  manualEntryContainer: { backgroundColor: colors.surface, padding: 20, borderRadius: radii.md, marginTop: 20, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: colors.border },
  manualEntryTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '400', marginBottom: 10, color: colors.primary },
  manualEntryHint: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: 15, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  inputContainer: { backgroundColor: colors.white, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 15, paddingVertical: 10 },
  input: { fontFamily: fonts.body, fontSize: 18, width: 80, textAlign: 'center', color: colors.text },
  inputSuffix: { fontFamily: fonts.body, fontSize: 18, marginLeft: 10, color: colors.textMuted },
  manualButtons: { flexDirection: 'row', gap: 12 },
  warnBanner: { width: '100%', backgroundColor: colors.lightAccent, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16, alignItems: 'center', gap: 10 },
  warnTitle: { fontFamily: fonts.heading, fontSize: 15, color: colors.primary, textAlign: 'center' },
  warnBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  shipNote: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 17, marginTop: 6, marginBottom: 4, paddingHorizontal: 8 },
  weightBreakdown: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 6 },
  sectionLabel: { fontFamily: fonts.heading, fontSize: 16, color: colors.primary, marginTop: 16, marginBottom: 6, alignSelf: 'flex-start' },
  zipInput: { fontFamily: fonts.body, fontSize: 20, letterSpacing: 2, textAlign: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: 16, width: 160, color: colors.text, marginBottom: 8 },
  methodCard: { width: '100%', backgroundColor: colors.white, borderWidth: 2, borderColor: colors.borderStrong, borderRadius: radii.md, padding: 12, marginBottom: 10, alignItems: 'flex-start' },
  methodCardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  methodHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  methodTitle: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  methodPrice: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700', color: colors.primary },
  methodMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.primaryMid, marginTop: 2 },
  methodBody: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: 6 },
  methodWarn: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 6 },
  legLine: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 4 },
  boxOption: { width: '100%', padding: 10, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, marginBottom: 8, backgroundColor: colors.white },
  boxOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  boxName: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700', color: colors.text },
  boxDetails: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  weightBlock: { width: '100%', marginTop: 8, marginBottom: 4 },
  instructBox: { width: '100%', backgroundColor: colors.white, borderRadius: radii.sm, padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  instructLine: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: 4, textAlign: 'left' },
});
