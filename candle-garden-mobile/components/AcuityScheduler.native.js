import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ACUITY_EMBED_HTML, ACUITY_SCHEDULER_URL } from '../lib/schedulingConfig';
import { colors, fonts } from '../lib/theme';

export default function AcuityScheduler() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>The scheduler could not load.</Text>
        <Text style={styles.errorText}>Check your connection, then try again.</Text>
      </View>
    );
  }

  return (
    <WebView
      source={{ html: ACUITY_EMBED_HTML, baseUrl: 'https://app.acuityscheduling.com' }}
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
          <Text style={styles.loadingText}>Loading appointment times…</Text>
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
          url.includes('acuityscheduling.com') ||
          url.includes('squarespace.com') ||
          url.includes('stripe.com') ||
          url.startsWith(ACUITY_SCHEDULER_URL.slice(0, 40))
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
