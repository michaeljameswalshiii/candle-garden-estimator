import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../lib/theme';
import { privacySections, termsSections } from '../lib/legalCopy';

export default function LegalScreen({ route }) {
  const sections = route.params?.kind === 'terms' ? termsSections : privacySections;
  const title = route.params?.kind === 'terms' ? 'Terms' : 'Privacy';
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>The Candle Garden</Text>
      <Text style={styles.title}>{title}</Text>
      {sections.map((section, index) => (
        <View key={section.title || index} style={styles.block}>
          {section.title ? <Text style={styles.heading}>{section.title}</Text> : null}
          {section.body ? <Text style={styles.body}>{section.body}</Text> : null}
          {section.bullets?.map((item) => (
            <Text key={item} style={styles.bullet}>• {item}</Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.md, paddingBottom: 40 },
  kicker: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primaryMid,
    textAlign: 'center',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  block: { marginBottom: 18 },
  heading: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primary,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  bullet: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginBottom: 8,
  },
});
