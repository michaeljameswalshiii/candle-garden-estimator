import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

const CONTACT_URL = 'https://www.thecandlegarden.co/get-in-touch';
const SUPPORT_EMAIL = 'jordan@thecandlegarden.co';

const LEGAL_COPY = {
  privacy: {
    title: 'Privacy Policy',
    body: `The Candle Garden App uses account details you provide to create and manage your account, process orders, provide customer support, and prevent fraud. Camera or photo-library access is used only when you choose a photo for candle-volume estimation. You can enter ounces manually instead.\n\nPayments are processed securely by Stripe. Shipping information may be shared with UPS to calculate rates and create shipping labels. Authentication is provided by Amazon Cognito, and app infrastructure is hosted by Amazon Web Services. These providers process information only as needed to deliver their services.\n\nWe do not sell your personal information. Order and transaction records may be retained as required for accounting, fraud prevention, and legal compliance. You can delete your app account from the Profile screen.\n\nFor privacy questions or data requests, contact ${SUPPORT_EMAIL}.`,
  },
  terms: {
    title: 'Terms of Use',
    body: `By using The Candle Garden App, you agree to provide accurate account, payment, and shipping information and to use the app only for lawful purchases and refill estimates.\n\nPhoto-based volume estimates are approximate. Final refill pricing, shipping charges, availability, and fulfillment details shown at checkout control the order. Orders are subject to payment authorization and acceptance.\n\nCandle classes, cancellations, returns, and other purchases are subject to the policies presented with the applicable product or booking. Do not misuse the app, interfere with its operation, or attempt unauthorized access.\n\nQuestions about an order or these terms can be sent to ${SUPPORT_EMAIL}.`,
  },
};

export default function LegalLinks({ compact = false }) {
  const [legalPage, setLegalPage] = useState(null);

  const openSupportEmail = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Candle Garden App Support')}`
    ).catch(() => Alert.alert('Contact support', SUPPORT_EMAIL));
  };

  const openContactPage = () => {
    Linking.openURL(CONTACT_URL).catch(() =>
      Alert.alert('Contact us', `${SUPPORT_EMAIL}\n(904) 316-7608`)
    );
  };

  return (
    <>
      <View style={[styles.section, compact && styles.compactSection]}>
        {!compact ? <Text style={styles.sectionTitle}>Help & legal</Text> : null}
        <View style={styles.linkWrap}>
          <TouchableOpacity style={styles.linkButton} onPress={() => setLegalPage('privacy')}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} onPress={() => setLegalPage('terms')}>
            <Text style={styles.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} onPress={openSupportEmail}>
            <Text style={styles.legalLink}>Support</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} onPress={openContactPage}>
            <Text style={styles.legalLink}>Contact</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={Boolean(legalPage)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLegalPage(null)}
      >
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <Text style={styles.title}>{LEGAL_COPY[legalPage]?.title}</Text>
          <Text style={styles.body}>{LEGAL_COPY[legalPage]?.body}</Text>
          <Text style={styles.updated}>Effective September 16, 2026</Text>
          <TouchableOpacity style={styles.closeButton} onPress={() => setLegalPage(null)}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactSection: {
    marginHorizontal: spacing.md + 4,
    marginTop: spacing.md,
    marginBottom: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    marginBottom: 8,
    color: colors.primary,
  },
  linkWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 18,
    rowGap: 4,
  },
  linkButton: {
    paddingVertical: 8,
  },
  legalLink: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  modal: {
    flex: 1,
    backgroundColor: colors.white,
  },
  modalContent: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: colors.primary,
    textAlign: 'center',
    marginVertical: 16,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  updated: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 24,
  },
  closeButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: radii.sm,
    alignItems: 'center',
    marginTop: 20,
  },
  closeButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
