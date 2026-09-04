import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fonts } from '../lib/theme';

export default function AcuityScheduler({ url }) {
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
      source={{ uri: url }}
      style={styles.webView}
      originWhitelist={['https://*']}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      setSupportMultipleWindows={false}
      startInLoadingState
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
      allowsBackForwardNavigationGestures
      allowsInlineMediaPlayback
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

