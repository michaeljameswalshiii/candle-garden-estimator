import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../lib/theme';

const BUILDER_URL = 'https://tripleibusinesssolutions.com';

export default function PoweredBy() {
  const navigation = useNavigation();
  return (
    <View style={styles.wrap}>
      <Text style={styles.help}>Having a problem or question?</Text>
      <Pressable accessibilityRole="button" hitSlop={6} onPress={() => navigation.navigate('Support')}>
        <Text style={styles.link}>Contact us</Text>
      </Pressable>
      <View style={styles.legalRow}>
        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => navigation.navigate('Legal', { kind: 'privacy' })}>
          <Text style={styles.legal}>Privacy</Text>
        </Pressable>
        <Text style={styles.dot}>·</Text>
        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => navigation.navigate('Legal', { kind: 'terms' })}>
          <Text style={styles.legal}>Terms</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Powered by Triple I Business Solutions"
        onPress={() => Linking.openURL(BUILDER_URL)}
        style={styles.creditHit}
      >
        <View style={styles.creditRow}>
          <Image source={require('../assets/triple-i-logo.png')} style={styles.creditLogo} resizeMode="contain" />
          <Text style={styles.credit} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            Powered by Triple I Business Solutions
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
  },
  link: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.primary,
    textDecorationLine: 'underline',
    marginTop: 2,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  creditHit: {
    marginTop: 14,
    maxWidth: '100%',
  },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  creditLogo: {
    width: 54,
    height: 14,
  },
  credit: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  legal: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  dot: {
    marginHorizontal: 8,
    color: colors.textFaint,
    fontSize: 12,
  },
});
