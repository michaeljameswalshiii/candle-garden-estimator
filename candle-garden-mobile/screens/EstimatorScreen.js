import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Image, ScrollView, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  calculateCost,
  isValidOunces,
  isAcceptableDetection,
} from '../lib/pricing';
import { prepareImageForDetect } from '../lib/prepareImage';
import { colors, fonts, radii, spacing } from '../lib/theme';

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
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualOunces, setManualOunces] = useState('');

  const continueToShipping = () => {
    if (result && result.estimated_ounces) {
      navigation.navigate('RefillStep4', {
        ounces: result.estimated_ounces,
        containerType: result.container_type,
        boxKey: result.box_key,
      });
    }
  };

  const DETECTOR_URL = 'https://yg1ec20ucf.execute-api.us-east-1.amazonaws.com/prod/detect';

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

      const detectResponse = await fetch(DETECTOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: prepared.base64 }),
      });

      const rawText = await detectResponse.text();
      let detectData;
      try {
        detectData = JSON.parse(rawText);
      } catch {
        promptManualFallback([
          detectResponse.ok
            ? 'Server returned an invalid response'
            : `Server error (${detectResponse.status}) — photo may be too large or network failed`,
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

      if (!detectResponse.ok && !detectData.estimated_ounces) {
        promptManualFallback(
          detectData.tips || [detectData.error || `Request failed (${detectResponse.status})`]
        );
        return;
      }

      const check = isAcceptableDetection(detectData);
      if (!check.ok) {
        promptManualFallback(check.tips || detectData.tips);
        return;
      }

      const costData = calculateCost(check.ounces);
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
      <Text style={styles.buildTag}>build: multi-vessel-v4</Text>
      <Text style={styles.instruction}>
        Take a clear photo of your empty (or mostly empty) candle vessel from above or the side. Good examples: mugs, jars, bowls, glasses.
      </Text>

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
            Shipping: ${result.shipping_cost} ({result.box_type})
          </Text>
          <Text style={styles.total}>Total: ${result.total_cost}</Text>
          <CustomButton
            title="Continue to Shipping & Quantity"
            onPress={continueToShipping}
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
});
