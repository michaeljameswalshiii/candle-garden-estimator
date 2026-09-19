import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { BOOKING_PAGE_URL } from '../lib/schedulingConfig';
import { colors, fonts } from '../lib/theme';

const ALLOWED = [
  'thecandlegarden.co',
  'squarespace.com',
  'squarespace-cdn.com',
  'stripe.com',
  'paypal.com',
];

const BLOCKED = ['acuityscheduling.com', 'embed.acuityscheduling.com'];

const STRIP_ACUITY = `
(function () {
  function zap() {
    document.querySelectorAll(
      'iframe[src*="acuity"], script[src*="acuity"], [id*="acuity"], [class*="acuity"]'
    ).forEach(function (el) { el.remove(); });
  }
  zap();
  new MutationObserver(zap).observe(document.documentElement, { childList: true, subtree: true });
})();
true;
`;

function isAllowed(url) {
  const value = String(url || '').toLowerCase();
  if (BLOCKED.some((host) => value.includes(host))) return false;
  if (value.startsWith('about:') || value.startsWith('data:')) return true;
  return ALLOWED.some((host) => value.includes(host)) || value.startsWith(String(BOOKING_PAGE_URL).toLowerCase());
}

export default function AcuityScheduler() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Open the website to book.</Text>
        <Text style={styles.errorText}>thecandlegarden.co/candle-garden-events</Text>
      </View>
    );
  }

  return (
    <WebView
      source={{ uri: BOOKING_PAGE_URL }}
      style={styles.webView}
      originWhitelist={['https://*', 'http://*']}
      javaScriptEnabled
      domStorageEnabled
      injectedJavaScript={STRIP_ACUITY}
      injectedJavaScriptBeforeContentLoaded={STRIP_ACUITY}
      setSupportMultipleWindows={false}
      startInLoadingState
      nestedScrollEnabled
      renderLoading={() => (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading class schedule…</Text>
        </View>
      )}
      onError={() => setFailed(true)}
      onShouldStartLoadWithRequest={(request) => isAllowed(request.url)}
    />
  );
}

const styles = StyleSheet.create({
  webView: { flex: 1, backgroundColor: colors.white },
  centered: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.white,
  },
  loadingText: { marginTop: 12, color: colors.textMuted, fontFamily: fonts.body },
  errorTitle: { color: colors.primary, fontFamily: fonts.heading, fontSize: 20 },
  errorText: { marginTop: 8, color: colors.textMuted, fontFamily: fonts.body, textAlign: 'center' },
});
