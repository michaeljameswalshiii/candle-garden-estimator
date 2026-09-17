import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Image, ScrollView, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  calculateCost,
  isValidOunces,
  isAcceptableDetection,
  quoteAllMethods,
  SHIPPING_METHODS,
  UPS_BOXES,
  DEFAULT_SHIPPING_METHOD,
} from '../lib/pricing';
import { BOX_FIT_ORDER, PACKING_INSTRUCTIONS } from '../lib/shippingConfig';
import { prepareImageForDetect, isImageManipulatorAvailable } from '../lib/prepareImage';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { postDetect, postShippingQuote } from '../lib/apiClient';
import { useAuth } from '../lib/AuthContext';
import { useCart } from '../lib/cart';
import { track } from '../lib/analytics';
import Constants from 'expo-constants';

// Custom Button component to avoid Fabric boolean prop issues
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

// EstimatorScreen for refill calculations
export default function EstimatorScreen() {
  const navigation = useNavigation();
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [reviewVessels, setReviewVessels] = useState(null);
  const [vesselChoice, setVesselChoice] = useState(1);
  const [hasScaleCan, setHasScaleCan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualOunces, setManualOunces] = useState('');
  const [destZip, setDestZip] = useState('');
  const [shippingMethod, setShippingMethod] = useState(DEFAULT_SHIPPING_METHOD);
  const [selectedBox, setSelectedBox] = useState(null);
  const [liveQuotes, setLiveQuotes] = useState([]);
  const manipulatorOk = isImageManipulatorAvailable();
  const expectedCount = vesselChoice === '3+' ? 3 : Number(vesselChoice);
  const isExpoGo = Constants.appOwnership === 'expo';

  const vesselCount = Array.isArray(result?.vessels) && result.vessels.length
    ? result.vessels.length
    : 1;
  const perVesselOz = Array.isArray(result?.vessels)
    ? result.vessels
        .map((v) => Number(v.wax_needed_oz ?? v.estimated_ounces ?? v.volume_oz))
        .filter((n) => Number.isFinite(n) && n > 0)
    : undefined;

  const cost = useMemo(() => {
    if (!result?.estimated_ounces) return null;
    return calculateCost(result.estimated_ounces, {
      vesselCount,
      perVesselOz,
      destZip,
      shippingMethod,
      boxKey: selectedBox,
    });
  }, [result, vesselCount, perVesselOz, destZip, shippingMethod, selectedBox]);

  useEffect(() => {
    const zip = String(destZip || '').replace(/\D/g, '');
    if (!result?.estimated_ounces || zip.length < 5) {
      setLiveQuotes([]);
      return undefined;
    }
    let cancelled = false;
    postShippingQuote({
      ounces: result.estimated_ounces,
      destZip: zip,
      boxKey: selectedBox,
      vesselCount,
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
  }, [result, destZip, selectedBox, vesselCount]);

  const methodQuotes = useMemo(() => {
    if (!result?.estimated_ounces) return [];
    return quoteAllMethods(result.estimated_ounces, {
      vesselCount,
      perVesselOz,
      destZip,
      boxKey: selectedBox,
    });
  }, [result, vesselCount, perVesselOz, destZip, selectedBox]);

  const addEstimateToCart = () => {
    if (!result?.estimated_ounces || !cost) return;
    if (!cost.quote_ok) {
      Alert.alert(
        'ZIP needed',
        cost.quote_reason || 'Enter your 5-digit ZIP so we can quote UPS Ground Saver.'
      );
      return;
    }
    const method = SHIPPING_METHODS[shippingMethod];
    addItem(
      {
        id: 'refill',
        type: 'refill',
        name: `Candle refill · ${result.estimated_ounces} oz`,
        price: Number(cost.total_cost),
      },
      {
        type: 'refill',
        quantity: 1,
        ounces: result.estimated_ounces,
        boxKey: cost.box_key,
        destZip: cost.dest_zip,
        shippingMethod,
        vesselCount,
        detail:
          shippingMethod === 'ship_own'
            ? `Ship empties on your own · Return shipping to you: UPS Ground Saver · $${cost.shipping_cost}`
            : `${method?.title || 'UPS Ground Saver'} · ${cost.shipping_label}`,
        unitPrice: Number(cost.total_cost),
        waxUnitPrice: cost.wax_cost_num,
        returnShippingUnitPrice: cost.shipping_cost_num,
      }
    );
    track('estimate_add_to_cart', {
      ounces: result.estimated_ounces,
      shippingMethod,
      total: Number(cost.total_cost),
    });
    Alert.alert(
      'Added to cart',
      'Your refill is in the cart. Add shop items or a class if you want, then check out. We’ll confirm your address at the end.',
      [
        { text: 'Keep estimating', style: 'cancel' },
        { text: 'Go to cart', onPress: () => navigation.navigate('Orders') },
      ]
    );
  };

  const pickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.85,
    exif: false,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible
      ?? 'compatible',
  };

  const onNewPhoto = (uri) => {
    setImage(uri);
    setReviewVessels(null);
    if (!result?.locked) setResult(null);
  };

  const pickImage = async () => {
    try {
      const pickerResult = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (!pickerResult.canceled) onNewPhoto(pickerResult.assets[0].uri);
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
      if (!cameraResult.canceled) onNewPhoto(cameraResult.assets[0].uri);
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo: ' + error.message);
    }
  };

  const promptManualFallback = (tips) => {
    const tipList = tips && tips.length
      ? tips.map((t) => `• ${t}`).join('\n')
      : '• Make sure the vessel is well-lit\n• Take photo from above or side\n• Empty the vessel if possible';

    track('estimate_fallback', { tips: Array.isArray(tips) ? tips.slice(0, 3) : [] });
    Alert.alert(
      'Could Not Auto-Estimate',
      `${tipList}\n\nEnter the volume manually for an accurate quote.`,
      [
        { text: 'Retake photo', style: 'cancel', onPress: () => { setImage(null); setReviewVessels(null); } },
        { text: 'Enter manually', onPress: () => setShowManualEntry(true) },
      ]
    );
  };

  const estimateCandle = async () => {
    if (!image) {
      Alert.alert('Error', 'Please select or take a photo first');
      return;
    }

    setLoading(true);
    try {
      // Critical: HEIC → JPEG + resize before upload (Bedrock rejects HEIC)
      let prepared;
      try {
        prepared = await prepareImageForDetect(image);
      } catch (convErr) {
        promptManualFallback([
          convErr.message || 'Could not convert photo to JPEG',
          'Try: Settings → Camera → Formats → Most Compatible',
          'Or export the photo as JPEG from Photos and pick again',
        ]);
        return;
      }

      if (!hasScaleCan) {
        promptManualFallback([
          'Put a 12 oz drink can in the photo for scale, then try again',
          'Or enter ounces manually',
        ]);
        return;
      }

      track('estimate_start', { expectedCount, vesselChoice });
      let detectData;
      try {
        detectData = await postDetect({
          image: prepared.base64,
          expected_vessel_count: expectedCount,
          expected_count_is_minimum: vesselChoice === '3+',
          has_scale_can: true,
        });
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
          apiErr.message || 'Server error — photo may be too large or network failed',
        ]);
        return;
      }

      // If server still sees HEIC, conversion failed — surface that clearly
      if (
        detectData.error === 'unsupported_image_format_heic'
        || (Array.isArray(detectData.tips) && detectData.tips.some((t) => /heic/i.test(t)))
      ) {
        promptManualFallback([
          'Photo was still HEIC after conversion',
          'Close Expo Go completely and reopen the project URL',
          'Or Settings → Camera → Formats → Most Compatible, then retake',
        ]);
        return;
      }

      if (detectData.success === false && !detectData.estimated_ounces) {
        promptManualFallback(
          detectData.tips || [detectData.error || 'Detection failed']
        );
        return;
      }

      if (detectData.error === 'vessel_count_mismatch') {
        promptManualFallback(
          detectData.tips || [
            `You said ${expectedCount} vessel${expectedCount === 1 ? '' : 's'}; the photo did not match.`,
            'Photograph one jar at a time, then add another.',
          ]
        );
        return;
      }

      const check = isAcceptableDetection(detectData);
      if (!check.ok) {
        promptManualFallback(check.tips || detectData.tips);
        return;
      }

      const vessels = Array.isArray(detectData.vessels) && detectData.vessels.length
        ? detectData.vessels.map((v, i) => ({
            id: v.id || `v${i + 1}`,
            description: v.description || `Jar ${i + 1}`,
            wax_needed_oz: String(v.wax_needed_oz ?? v.estimated_ounces ?? ''),
          }))
        : [{ id: 'v1', description: 'Jar 1', wax_needed_oz: String(check.ounces) }];
      setReviewVessels({
        vessels,
        confidence: check.confidence,
        explanation: detectData.explanation,
      });
      track('estimate_review', { vesselCount: vessels.length, confidence: check.confidence });
      setResult((prev) => (prev?.locked ? prev : null));
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to process image: ' + (error.message || String(error))
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmReview = () => {
    if (!reviewVessels?.vessels?.length) return;
    const parsed = reviewVessels.vessels.map((v, i) => ({
      ...v,
      description: v.description || `Jar ${i + 1}`,
      wax_needed_oz: parseFloat(v.wax_needed_oz),
    }));
    if (parsed.some((v) => !isValidOunces(v.wax_needed_oz))) {
      Alert.alert('Check ounces', 'Each jar needs a positive ounce amount (e.g. 8 or 12.5).');
      return;
    }
    const prior = result?.locked && Array.isArray(result.vessels) ? result.vessels : [];
    const vessels = [...prior, ...parsed];
    const ounces = vessels.reduce((sum, v) => sum + Number(v.wax_needed_oz), 0);
    const firstQuote = calculateCost(ounces, {
      vesselCount: vessels.length,
      perVesselOz: vessels.map((v) => v.wax_needed_oz),
    });
    setSelectedBox(firstQuote.box_key);
    setResult({
      estimated_ounces: Math.round(ounces * 10) / 10,
      container_type: `${vessels.length} candle vessel${vessels.length === 1 ? '' : 's'}`,
      confidence: reviewVessels.confidence,
      explanation: reviewVessels.explanation,
      vessels,
      locked: true,
    });
    setReviewVessels(null);
    setImage(null);
    track('estimate_confirmed', { ounces, vesselCount: vessels.length });
  };

  const addAnotherJar = () => {
    setVesselChoice(1);
    setHasScaleCan(false);
    setImage(null);
    setReviewVessels(null);
  };

  const submitManualEntry = () => {
    const ounces = parseFloat(manualOunces);
    if (!isValidOunces(ounces)) {
      Alert.alert(
        'Invalid Input',
        'Please enter a positive volume in ounces (e.g. 8, 12.5, 40)'
      );
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
        v1.1.0 · {isAuthenticated ? 'signed in' : 'guest'}
        {isExpoGo ? ' · Expo Go' : ''}
      </Text>
      <Text style={styles.sectionLabel}>How many vessels in this photo?</Text>
      <View style={styles.chipRow}>
        {[1, 2, '3+'].map((choice) => {
          const active = vesselChoice === choice;
          return (
            <TouchableOpacity
              key={String(choice)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setVesselChoice(choice)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{choice}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.instruction}>
        {vesselChoice === 1
          ? 'Photograph one jar. Crop so the jar and a 12 oz drink can fill the frame. Add another jar after this estimate if you have more.'
          : 'Photograph the cluster. Crop tightly around the jars and a 12 oz can. One jar per photo is more accurate if the count looks messy.'}
      </Text>
      <TouchableOpacity
        style={[styles.scaleToggle, hasScaleCan && styles.scaleToggleOn]}
        onPress={() => setHasScaleCan((v) => !v)}
      >
        <Text style={[styles.scaleToggleText, hasScaleCan && styles.scaleToggleTextOn]}>
          {hasScaleCan ? '12 oz can is in the photo' : 'Tap when a 12 oz can is in the photo'}
        </Text>
      </TouchableOpacity>
      {!hasScaleCan ? (
        <Text style={styles.shipNote}>
          Photo estimates need a 12 oz drink can for scale. Without it, enter ounces manually.
        </Text>
      ) : null}
      {!manipulatorOk && isExpoGo ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnTitle}>Limited photo conversion in Expo Go</Text>
          <Text style={styles.warnBody}>
            Use the TestFlight / Play build for full HEIC support. JPEG photos may still work —
            or enter ounces manually below.
          </Text>
          <CustomButton
            title="Enter ounces manually"
            onPress={() => setShowManualEntry(true)}
          />
        </View>
      ) : null}

      {image ? (
        <Image source={{ uri: image }} style={styles.image} />
      ) : (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>📷</Text>
          <Text style={styles.placeholderHint}>No photo selected</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <CustomButton title="Take Photo" onPress={takePhoto} />
        <CustomButton title="Pick from Gallery" onPress={pickImage} />

        {image && (
          <>
            <CustomButton
              title="Clear Photo"
              onPress={() => {
                setImage(null);
                setReviewVessels(null);
                if (!result?.locked) setResult(null);
              }}
              color={colors.danger}
            />
            <CustomButton
              title={
                loading
                  ? 'Estimating...'
                  : hasScaleCan
                    ? 'Get Estimate'
                    : 'Need a 12 oz can, or enter ounces'
              }
              onPress={() => {
                if (!hasScaleCan) {
                  setShowManualEntry(true);
                  return;
                }
                void estimateCandle();
              }}
              disabled={loading}
            />
          </>
        )}
      </View>

      {showManualEntry && (
        <View style={styles.manualEntryContainer}>
          <Text style={styles.manualEntryTitle}>Enter Volume Manually</Text>
          <Text style={styles.manualEntryHint}>
            Enter the wax volume needed in ounces (any positive amount)
          </Text>
          <View style={styles.inputRow}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={manualOunces}
                onChangeText={setManualOunces}
                keyboardType="decimal-pad"
                placeholder="12"
                placeholderTextColor={colors.textFaint}
              />
            </View>
            <Text style={styles.inputSuffix}>oz</Text>
          </View>
          <View style={styles.manualButtons}>
            <CustomButton title="Cancel" onPress={() => setShowManualEntry(false)} color={colors.textMuted} />
            <CustomButton title="Submit" onPress={submitManualEntry} />
          </View>
        </View>
      )}

      {reviewVessels ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Is this count right?</Text>
          <Text style={styles.shipNote}>
            Edit ounces if a jar looks off. We would rather you fix it than guess at the studio.
          </Text>
          {reviewVessels.vessels.map((vessel, index) => (
            <View key={vessel.id || index} style={styles.reviewRow}>
              <Text style={styles.reviewLabel} numberOfLines={2}>
                {vessel.description || `Jar ${index + 1}`}
              </Text>
              <TextInput
                style={styles.reviewInput}
                value={String(vessel.wax_needed_oz)}
                onChangeText={(text) => {
                  setReviewVessels((prev) => {
                    if (!prev) return prev;
                    const vessels = [...prev.vessels];
                    vessels[index] = { ...vessels[index], wax_needed_oz: text };
                    return { ...prev, vessels };
                  });
                }}
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputSuffix}>oz</Text>
            </View>
          ))}
          <CustomButton title="Looks right — show price" onPress={confirmReview} />
          <CustomButton
            title="Count is wrong — enter ounces"
            onPress={() => {
              setReviewVessels(null);
              setShowManualEntry(true);
            }}
            color={colors.textMuted}
          />
        </View>
      ) : null}

      {result && cost && !reviewVessels && (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Estimate</Text>
          <Text style={styles.resultText}>
            Total wax needed: {result.estimated_ounces} oz
            {result.vessels?.length
              ? ` (${result.vessels.length} container${result.vessels.length === 1 ? '' : 's'})`
              : ''}
          </Text>
          {Array.isArray(result.vessels) && result.vessels.length > 0 && (
            <View style={styles.vesselList}>
              {result.vessels.map((v, i) => (
                <Text key={i} style={styles.vesselLine}>
                  • {v.description || `Vessel ${i + 1}`}:{' '}
                  {v.wax_needed_oz != null ? `${v.wax_needed_oz} oz` : '—'}
                </Text>
              ))}
            </View>
          )}
          {result.confidence != null && result.confidence < 1 && (
            <Text style={styles.resultText}>
              Confidence: {Math.round(result.confidence * 100)}%
            </Text>
          )}
          <Text style={styles.resultText}>Wax: ${cost.wax_cost}</Text>

          <Text style={styles.sectionLabel}>Your ZIP</Text>
          <Text style={styles.shipNote}>
            UPS Ground Saver is priced by zone and packed weight from Atlantic Beach, FL (32233).
          </Text>
          <TextInput
            style={styles.zipInput}
            value={destZip}
            onChangeText={(t) => setDestZip(t.replace(/[^\d]/g, '').slice(0, 10))}
            keyboardType="number-pad"
            placeholder="32250"
            placeholderTextColor={colors.textFaint}
            maxLength={10}
          />

          <Text style={styles.sectionLabel}>How we’ll ship</Text>
          {methodQuotes.map(({ methodKey, method, cost: methodCost }) => {
            const selected = shippingMethod === methodKey;
            const live = liveQuotes.find((q) => q.method === methodKey);
            const liveShip = live && live.shipping_cents != null
              ? (live.shipping_cents / 100).toFixed(2)
              : null;
            const priceLabel = liveShip
              ? `$${liveShip}`
              : methodCost.quote_ok
              ? `$${methodCost.shipping_cost}`
              : methodCost.needs_zip
                ? 'Enter ZIP'
                : 'See note';
            return (
              <TouchableOpacity
                key={methodKey}
                style={[styles.methodCard, selected && styles.methodCardSelected]}
                onPress={() => setShippingMethod(methodKey)}
                activeOpacity={0.8}
              >
                <View style={styles.methodHeader}>
                  <Text style={styles.methodTitle}>{method.title}</Text>
                  <Text style={styles.methodPrice}>{priceLabel}</Text>
                </View>
                <Text style={styles.methodMeta}>
                  {live?.service_summary
                    ? `Live UPS lowest-cost service: ${live.service_summary}`
                    : methodKey === 'ship_own'
                      ? '1 UPS service return trip to you'
                      : `${method.chargeCount} UPS service trips`}
                </Text>
                <Text style={styles.methodBody}>{method.summary}</Text>
                {methodCost.quote_ok && methodCost.legs?.length
                  ? methodCost.legs.map((leg) => (
                      <Text key={leg.key} style={styles.legLine}>
                        • {leg.title}: ${leg.totalUsd.toFixed(2)} ({leg.billedLb} lb, zone {leg.zone})
                      </Text>
                    ))
                  : null}
                {!methodCost.quote_ok && methodCost.quote_reason && !methodCost.needs_zip ? (
                  <Text style={styles.methodWarn}>{methodCost.quote_reason}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}

          <Text style={styles.sectionLabel}>Carton</Text>
          <Text style={styles.shipNote}>
            Packed weight includes vessels, cardboard, and packing. UPS bills the greater of scale weight and dimensional weight.
          </Text>
          {BOX_FIT_ORDER.map((key) => {
            const box = UPS_BOXES[key];
            if (!box) return null;
            const active = (selectedBox || cost.box_key) === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.boxOption, active && styles.boxOptionSelected]}
                onPress={() => setSelectedBox(key)}
              >
                <Text style={styles.boxName}>{box.shortName}</Text>
                <Text style={styles.boxDetails}>
                  {box.lengthIn}×{box.widthIn}×{box.heightIn} in · empty ~{box.emptyBoxOz} oz
                </Text>
                <Text style={styles.boxDetails}>{box.notes}</Text>
              </TouchableOpacity>
            );
          })}

          {cost.packed_weight ? (
            <View style={styles.weightBlock}>
              <Text style={styles.resultText}>
                Refills packed: {cost.packed_weight.refillsOutboundLabel}
              </Text>
              <Text style={styles.weightBreakdown}>
                {cost.packed_weight.breakdownOutbound}
              </Text>
              <Text style={styles.resultText}>
                Empties packed: {cost.packed_weight.emptiesInboundLabel}
              </Text>
              {shippingMethod === 'kit_roundtrip' ? (
                <Text style={styles.resultText}>
                  Packing kit: {cost.packed_weight.kitLabel}
                </Text>
              ) : null}
            </View>
          ) : null}

          {shippingMethod === 'prepaid_labels' ? (
            <View style={styles.instructBox}>
              <Text style={styles.sectionLabel}>Packing instructions</Text>
              {PACKING_INSTRUCTIONS.map((line, i) => (
                <Text key={i} style={styles.instructLine}>
                  {i + 1}. {line}
                </Text>
              ))}
            </View>
          ) : null}

          {cost.customer_note ? (
            <Text style={styles.shipNote}>{cost.customer_note}</Text>
          ) : null}

          <Text style={styles.total}>
            Total: {cost.quote_ok ? `$${cost.total_cost}` : '—'}
          </Text>
          <Text style={styles.weightBreakdown}>
            Wax ${cost.wax_cost}
            {cost.quote_ok ? ` + return shipping to you ${cost.shipping_cost}` : ''}
          </Text>
          <CustomButton
            title="Add refill to cart"
            onPress={addEstimateToCart}
            disabled={!cost.quote_ok}
          />
          <CustomButton
            title="Add another jar from a new photo"
            onPress={addAnotherJar}
            color={colors.primaryMid}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md + 4,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '400',
    marginBottom: 4,
    color: colors.primary,
  },
  buildTag: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  chipTextActive: {
    color: colors.white,
  },
  scaleToggle: {
    width: '100%',
    padding: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  scaleToggleOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  scaleToggleText: {
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    color: colors.textMuted,
  },
  scaleToggleTextOn: {
    color: colors.primary,
    fontWeight: '700',
  },
  reviewRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  reviewLabel: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
  },
  reviewInput: {
    fontFamily: fonts.body,
    fontSize: 18,
    width: 72,
    textAlign: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 8,
    color: colors.text,
  },
  instruction: {
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: colors.textMuted,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  image: {
    width: 280,
    height: 280,
    marginBottom: 20,
    borderRadius: radii.md,
  },
  placeholderContainer: {
    width: 280,
    height: 280,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 60,
    marginBottom: 10,
  },
  placeholderHint: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.textFaint,
  },
  buttonContainer: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
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
  result: {
    backgroundColor: colors.lightAccent,
    padding: 20,
    borderRadius: radii.md,
    marginTop: 20,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '400',
    marginBottom: 10,
    color: colors.primary,
  },
  resultText: {
    fontFamily: fonts.body,
    fontSize: 16,
    marginBottom: 5,
    color: colors.textSecondary,
  },
  vesselList: {
    width: '100%',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  vesselLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
    textAlign: 'left',
  },
  total: {
    fontFamily: fonts.body,
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 10,
    marginBottom: 12,
  },
  manualEntryContainer: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: radii.md,
    marginTop: 20,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  manualEntryTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '400',
    marginBottom: 10,
    color: colors.primary,
  },
  manualEntryHint: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 15,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  inputContainer: {
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: 18,
    width: 80,
    textAlign: 'center',
    color: colors.text,
  },
  inputSuffix: {
    fontFamily: fonts.body,
    fontSize: 18,
    marginLeft: 10,
    color: colors.textMuted,
  },
  manualButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  warnBanner: {
    width: '100%',
    backgroundColor: colors.lightAccent,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
    gap: 10,
  },
  warnTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.primary,
    textAlign: 'center',
  },
  warnBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  shipNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  weightBreakdown: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 6,
  },
  sectionLabel: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.primary,
    marginTop: 16,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  zipInput: {
    fontFamily: fonts.body,
    fontSize: 20,
    letterSpacing: 2,
    textAlign: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: 160,
    color: colors.text,
    marginBottom: 8,
  },
  methodCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  methodCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  methodHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  methodTitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  methodPrice: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  methodMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.primaryMid,
    marginTop: 2,
  },
  methodBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 6,
  },
  methodWarn: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.danger,
    marginTop: 6,
  },
  legLine: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  boxOption: {
    width: '100%',
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    marginBottom: 8,
    backgroundColor: colors.white,
  },
  boxOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  boxName: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  boxDetails: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  weightBlock: {
    width: '100%',
    marginTop: 8,
    marginBottom: 4,
  },
  instructBox: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  instructLine: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 4,
    textAlign: 'left',
  },
});
