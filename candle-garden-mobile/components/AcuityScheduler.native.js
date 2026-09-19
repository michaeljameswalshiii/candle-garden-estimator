import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { BOOKING_PAGE_URL } from '../lib/schedulingConfig';
import { colors, fonts } from '../lib/theme';

const ALLOWED = [
  'thecandlegarden.co',
  'squarespace.com',
  'squarespace-cdn.com',
  'stripe.com',
  'paypal.com',
  'squareup.com',
  'squarecdn.com',
  'apple.com',
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
  return ALLOWED.some((host) => value.includes(host));
}

export default function AcuityScheduler() {
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  if (failed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Could not load classes.</Text>
        <Text style={styles.errorText}>Check your connection and try again.</Text>
        <TouchableOpacity
          style={styles.retry}
          onPress={() => {
            setFailed(false);
            setNonce((n) => n + 1);
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <WebView
      key={nonce}
      source={{ uri: BOOKING_PAGE_URL }}
      style={styles.webView}
      originWhitelist={['https://*', 'http://*']}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      injectedJavaScript={STRIP_ACUITY}
      injectedJavaScriptBeforeContentLoaded={STRIP_ACUITY}
      setSupportMultipleWindows={false}
      startInLoadingState
      nestedScrollEnabled
      allowsBackForwardNavigationGestures
      mixedContentMode="always"
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
  errorText: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  retry: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: colors.white, fontFamily: fonts.body, fontWeight: '700' },
});
