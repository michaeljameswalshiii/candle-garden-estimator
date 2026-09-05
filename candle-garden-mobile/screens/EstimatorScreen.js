import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Image, ScrollView, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  calculateCost,
  isValidOunces,
  isAcceptableDetection,
} from '../lib/pricing';
import { prepareImageForDetect, isImageManipulatorAvailable } from '../lib/prepareImage';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { postDetect } from '../lib/apiClient';
import { useAuth } from '../lib/AuthContext';
import { useCart } from '../lib/cart';

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
  const [loading, setLoading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualOunces, setManualOunces] = useState('');
  const manipulatorOk = isImageManipulatorAvailable();

  const addEstimateToCart = () => {
    if (!result?.estimated_ounces) return;
    addItem(
      {
        id: 'refill',
        type: 'refill',
        name: `Candle refill · ${result.estimated_ounces} oz`,
        price: Number(result.total_cost),
      },
      {
        type: 'refill',
        quantity: 1,
        ounces: result.estimated_ounces,
        boxKey: result.box_key,
        detail: `${result.box_type} return shipping included`,
        unitPrice: Number(result.total_cost),
      }
    );
    Alert.alert(
      'Added to cart',
      'Your refill is in the cart. Add shop items or a class if you want, then check out. We’ll ask for shipping at the end.',
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
    // iOS: ask Photos to hand us a compatible (JPEG) representation instead of HEIC
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible
      ?? 'compatible',
  };

  const pickImage = async () => {
    try {
      const pickerResult = await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (!pickerResult.canceled) {
        setImage(pickerResult.assets[0].uri);
        setResult(null);
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
        setImage(cameraResult.assets[0].uri);
        setResult(null);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo: ' + error.message);
    }
  };

  const promptManualFallback = (tips) => {
    const tipList = tips && tips.length
      ? tips.map((t) => `• ${t}`).join('\n')
      : '• Make sure the vessel is well-lit\n• Take photo from above or side\n• Empty the vessel if possible';

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

      const check = isAcceptableDetection(detectData);
      if (!check.ok) {
        promptManualFallback(check.tips || detectData.tips);
        return;
      }

      const vesselCount = Array.isArray(detectData.vessels) && detectData.vessels.length
        ? detectData.vessels.length
        : 1;
      const perVesselOz = Array.isArray(detectData.vessels)
        ? detectData.vessels
            .map((v) => Number(v.wax_needed_oz ?? v.estimated_ounces ?? v.volume_oz))
            .filter((n) => Number.isFinite(n) && n > 0)
        : undefined;
      const costData = calculateCost(check.ounces, { vesselCount, perVesselOz });
      setResult({
        estimated_ounces: check.ounces,
        container_type: check.container_type,
        confidence: check.confidence,
        explanation: detectData.explanation,
        vessels: detectData.vessels,
        ...costData,
      });
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to process image: ' + (error.message || String(error))
      );
    } finally {
      setLoading(false);
    }
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

    const costData = calculateCost(ounces);
    setResult({
      estimated_ounces: ounces,
      container_type: 'Manual Entry',
      confidence: 1.0,
      ...costData,
    });
    setShowManualEntry(false);
    setManualOunces('');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Refill Estimator</Text>
      <Text style={styles.buildTag}>
        build: multi-vessel-v5 · {isAuthenticated ? 'signed in' : 'guest'}
      </Text>
      <Text style={styles.instruction}>
        Put every vessel you want refilled in the foreground (include small jars). Place a 12 oz drink can beside them for scale only — we will not count the can. Empty glass with wick visible works best.
      </Text>
      {!manipulatorOk ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnTitle}>Limited photo conversion in this client</Text>
          <Text style={styles.warnBody}>
            Update Expo Go to the latest version, or use the TestFlight app for full HEIC
            support. JPEG photos may still work — or enter ounces manually below.
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
                setResult(null);
              }}
              color={colors.danger}
            />
            <CustomButton
              title={loading ? 'Estimating...' : 'Get Estimate'}
              onPress={estimateCandle}
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

      {result && (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Estimate Results:</Text>
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
          <Text style={styles.resultText}>Wax Cost: ${result.wax_cost}</Text>
          <Text style={styles.resultText}>
            Return shipping (included): ${result.shipping_cost} ({result.box_type})
          </Text>
          <Text style={styles.shipNote}>
            You ship empties to us (your postage). We ship refills back in this box size — that leg is in the estimate.
          </Text>
          <Text style={styles.total}>Total: ${result.total_cost}</Text>
          <CustomButton
            title="Add refill to cart"
            onPress={addEstimateToCart}
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
});
