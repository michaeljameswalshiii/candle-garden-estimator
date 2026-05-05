import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

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
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

// Deployed Lambda Function URL
const DETECTOR_URL = 'https://9vewi8siei.execute-api.us-east-1.amazonaws.com/prod/detect';

// Pick image from gallery
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
        setResult(null);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image: ' + error.message);
    }
  };

  // Take photo with camera
  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      
      if (permission.status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permission to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
        setResult(null);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo: ' + error.message);
    }
  };

const calculateCost = (ounces) => {
  // Pricing: $0.50 per ounce for wax + shipping based on box type
  const waxCost = ounces * 0.50;
  let shippingCost = 0;
  let boxType = 'Small';
  
  if (ounces <= 8) {
    shippingCost = 8.99;
    boxType = 'Small Box';
  } else if (ounces <= 16) {
    shippingCost = 12.99;
    boxType = 'Medium Box';
  } else {
    shippingCost = 15.99;
    boxType = 'Large Box';
  }
  
  return {
    wax_cost: waxCost.toFixed(2),
    shipping_cost: shippingCost.toFixed(2),
    box_type: boxType,
    total_cost: (waxCost + shippingCost).toFixed(2)
  };
};

const estimateCandle = async () => {
  if (!image) {
    Alert.alert('Error', 'Please select or take a photo first');
    return;
  }

  setLoading(true);
  try {
    const imgResponse = await fetch(image);
    const imgBlob = await imgResponse.blob();
    const reader = new FileReader();
    reader.readAsDataURL(imgBlob);
    
    reader.onloadend = async () => {
      const base64data = reader.result.split(',')[1];
      
      // Detect if image contains a candle container
      const detectResponse = await fetch(DETECTOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64data }),
      });

      const detectData = await detectResponse.json();
      
      // If container detection failed or no container detected, show error and stop
      if (!detectData.success || !detectData.container_detected || detectData.confidence < 0.7) {
        Alert.alert(
          'No Container Detected',
          'We could not detect a candle container in this photo. Please take a clear photo of your empty candle container next to a 12oz soda can for size reference. The container should be empty or mostly empty.'
        );
        setLoading(false);
        return;
      }
      
      // Get estimated ounces from detection
      const estimatedOunces = detectData.estimated_ounces || 12;
      
      // Validate the estimation results
      // Must have realistic candle container sizes (4-32 oz typical)
      if (estimatedOunces >= 4 && estimatedOunces <= 32) {
        const costData = calculateCost(estimatedOunces);
        setResult({
          estimated_ounces: estimatedOunces,
          container_type: detectData.container_type || 'Unknown',
          confidence: detectData.confidence || 0,
          ...costData
        });
      } else {
        Alert.alert(
          'Unable to Determine',
          'We are unable to make a determination on this photo. Please try again. If this continues to be a problem please let us know via the contact icon and we will assist. Thank you.'
        );
      }
      setLoading(false);
    };
  } catch (error) {
    Alert.alert('Error', 'Failed to process image: ' + error.message);
    setLoading(false);
  }
};

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Refill Estimator</Text>
      <Text style={styles.instruction}>
        Take or select a photo of your candle container next to a 12oz soda can for size reference
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
              color="#ff3b30" 
            />
            <CustomButton
              title={loading ? "Estimating..." : "Get Estimate"}
              onPress={estimateCandle}
              disabled={loading}
            />
          </>
        )}
      </View>

      {result && (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Estimate Results:</Text>
          <Text style={styles.resultText}>Volume: {result.estimated_ounces} oz</Text>
          <Text style={styles.resultText}>Wax Cost: ${result.wax_cost}</Text>
          <Text style={styles.resultText}>Shipping: ${result.shipping_cost} ({result.box_type})</Text>
          <Text style={styles.total}>Total: ${result.total_cost}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#2e7d32',
  },
  instruction: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
    paddingHorizontal: 20,
  },
  image: {
    width: 280,
    height: 280,
    marginBottom: 20,
    borderRadius: 10,
  },
  placeholderContainer: {
    width: 280,
    height: 280,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 60,
    marginBottom: 10,
  },
  placeholderHint: {
    fontSize: 16,
    color: '#999',
  },
  buttonContainer: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
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
  result: {
    backgroundColor: '#f0f8ff',
    padding: 20,
    borderRadius: 10,
    marginTop: 20,
    alignItems: 'center',
    width: '100%',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  resultText: {
    fontSize: 16,
    marginBottom: 5,
  },
  total: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginTop: 10,
  },
});
