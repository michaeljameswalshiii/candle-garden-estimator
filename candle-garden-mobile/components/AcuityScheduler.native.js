import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { BOOKING_PAGE_URL } from '../lib/schedulingConfig';
import { colors, fonts } from '../lib/theme';

export default function AcuityScheduler() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>The class page could not load.</Text>
        <Text style={styles.errorText}>Check your connection, then try again.</Text>
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
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      setSupportMultipleWindows={false}
      startInLoadingState
      nestedScrollEnabled
      mixedContentMode="always"
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      renderLoading={() => (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading class schedule…</Text>
        </View>
      )}
      onError={() => setFailed(true)}
      onHttpError={({ nativeEvent }) => {
        if (nativeEvent.statusCode >= 400) setFailed(true);
      }}
      onShouldStartLoadWithRequest={(request) => {
        const url = String(request.url || '');
        return (
          url.startsWith('about:') ||
          url.startsWith('data:') ||
          url.includes('thecandlegarden.co') ||
          url.includes('squarespace.com') ||
          url.includes('squarespace-cdn.com') ||
          url.includes('stripe.com') ||
          url.includes('paypal.com') ||
          url.startsWith(BOOKING_PAGE_URL)
        );
      }}
      allowsBackForwardNavigationGestures
    />
  );
}

const styles = StyleSheet.create({
  webView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  centered: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.white,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textMuted,
    fontFamily: fonts.body,
  },
  errorTitle: {
    color: colors.primary,
    fontFamily: fonts.heading,
    fontSize: 20,
  },
  errorText: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
});
