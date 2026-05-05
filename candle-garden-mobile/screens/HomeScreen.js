import React from 'react';
import { StyleSheet, Text, View, Image, ScrollView } from 'react-native';

// Simple HomeScreen with Welcome message and candle picture
export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome to the Candle Garden</Text>
      <Text style={styles.location}>Located in Atlantic Beach, Florida</Text>
      
      <View style={styles.imageContainer}>
        <Text style={styles.candleEmoji}>🕯️</Text>
      </View>

      <Text style={styles.subtitle}>
        Hand-poured candles with premium fragrances
      </Text>
      
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Visit our Products tab to browse our collection</Text>
        <Text style={styles.infoText}>Check out our Classes tab for upcoming workshops</Text>
      </View>
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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#2e7d32',
  },
  location: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
  },
  imageContainer: {
    width: 200,
    height: 200,
    backgroundColor: '#f5f5f5',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  candleEmoji: {
    fontSize: 100,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 30,
    textAlign: 'center',
  },
  infoContainer: {
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 10,
    width: '100%',
  },
  infoText: {
    fontSize: 16,
    color: '#444',
    marginBottom: 10,
    textAlign: 'center',
  },
});
