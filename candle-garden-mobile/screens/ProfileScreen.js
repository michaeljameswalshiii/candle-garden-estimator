import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';
import { useAuth } from '../lib/AuthContext';

function CustomSwitch({ value, onValueChange }) {
  const isOn = Boolean(value);
  return (
    <TouchableOpacity
      style={[styles.switch, isOn ? styles.switchOn : styles.switchOff]}
      onPress={() => onValueChange(!isOn)}
      activeOpacity={0.7}
    >
      <View style={[styles.switchThumb, isOn ? styles.switchThumbOn : styles.switchThumbOff]}>
        <Text style={styles.switchText}>{isOn ? 'ON' : 'OFF'}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const {
    user,
    isAuthenticated,
    booting,
    busy,
    signIn,
    signUp,
    confirmSignUp,
    resendCode,
    signOut,
    deleteAccount,
  } = useAuth();

  const [mode, setMode] = useState('signin'); // signin | signup | confirm
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const onSignIn = async () => {
    try {
      await signIn({ email: email.trim(), password });
      setPassword('');
      Alert.alert('Welcome back', 'You are signed in.');
    } catch (e) {
      if (String(e.message || '').includes('UserNotConfirmed')) {
        setMode('confirm');
        Alert.alert('Confirm email', 'Enter the verification code we emailed you.');
        return;
      }
      Alert.alert('Sign in failed', e.message || 'Please try again');
    }
  };

  const onSignUp = async () => {
    try {
      const result = await signUp({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      if (result.needsConfirmation) {
        setMode('confirm');
        Alert.alert(
          'Check your email',
          'Enter the 6-digit confirmation code to activate your account.'
        );
      } else {
        await signIn({ email: email.trim(), password });
      }
    } catch (e) {
      Alert.alert('Sign up failed', e.message || 'Please try again');
    }
  };

  const onConfirm = async () => {
    try {
      await confirmSignUp({ email: email.trim(), code: code.trim() });
      await signIn({ email: email.trim(), password });
      setCode('');
      setPassword('');
      setMode('signin');
      Alert.alert('Account ready', 'You are signed in.');
    } catch (e) {
      Alert.alert('Confirmation failed', e.message || 'Check the code and try again');
    }
  };

  const onResend = async () => {
    try {
      await resendCode(email.trim());
      Alert.alert('Code sent', 'Check your email for a new code.');
    } catch (e) {
      Alert.alert('Could not resend', e.message || 'Try again later');
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Sign out of The Candle Garden App?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          Alert.alert('Signed out');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your Cognito login. Orders and local cart data may remain until support purge. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm delete',
              'Are you sure? You will need to create a new account to sign in again.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      Alert.alert('Account deleted', 'Your login has been removed.');
                    } catch (e) {
                      Alert.alert('Could not delete', e.message || 'Try again later');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  if (booting) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading account…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Account</Text>
        <Text style={styles.lead}>
          Sign in to save orders and attach refill quotes to your profile. You can still
          browse Shop and Classes as a guest.
        </Text>

        <View style={styles.section}>
          <View style={styles.modeRow}>
            {['signin', 'signup', 'confirm'].map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeChip, mode === m && styles.modeChipOn]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.modeChipText, mode === m && styles.modeChipTextOn]}>
                  {m === 'signin' ? 'Sign in' : m === 'signup' ? 'Create' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'signup' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="words"
              />
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor={colors.textFaint}
            />
          </View>

          {mode !== 'confirm' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Min 8 chars, upper, lower, number"
                placeholderTextColor={colors.textFaint}
              />
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirmation code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                placeholder="6-digit code from email"
                placeholderTextColor={colors.textFaint}
              />
            </View>
          )}

          {mode === 'confirm' && password ? null : mode === 'confirm' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password (to sign in after confirm)</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Your password"
                placeholderTextColor={colors.textFaint}
              />
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={
              mode === 'signin' ? onSignIn : mode === 'signup' ? onSignUp : onConfirm
            }
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Confirm & sign in'}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'confirm' ? (
            <TouchableOpacity style={styles.linkBtn} onPress={onResend} disabled={busy}>
              <Text style={styles.linkText}>Resend code</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.version}>Secured with Amazon Cognito · Phase 1</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.avatarName}>{user?.name || 'Customer'}</Text>
        <Text style={styles.muted}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.infoLine}>Email: {user?.email}</Text>
        {user?.sub ? (
          <Text style={styles.infoLine} numberOfLines={1}>
            ID: {user.sub}
          </Text>
        ) : null}
        <Text style={styles.hint}>
          Orders API calls use your secure session. Refill detect still works as guest
          when signed out.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Text style={styles.settingDescription}>Order and refill updates (soon)</Text>
          </View>
          <CustomSwitch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.logoutButton]}
        onPress={handleLogout}
        activeOpacity={0.8}
        disabled={busy}
      >
        <Text style={[styles.buttonText, styles.logoutText]}>Sign out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDeleteAccount}
        activeOpacity={0.8}
        disabled={busy}
      >
        <Text style={styles.deleteText}>Delete account</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Version 1.0.0 · The Candle Garden App</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 10,
    color: colors.primary,
  },
  lead: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.lightAccent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.primary,
  },
  avatarName: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '400',
    color: colors.darkAccent,
  },
  section: {
    marginBottom: 24,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '400',
    marginBottom: 16,
    color: colors.primary,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  modeChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  modeChipTextOn: {
    color: colors.white,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.text,
    fontFamily: fonts.body,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: radii.sm,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
  linkBtn: {
    alignItems: 'center',
    marginTop: 14,
  },
  linkText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  infoLine: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 8,
    lineHeight: 17,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  settingDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: colors.danger,
    marginTop: 8,
  },
  logoutText: {
    color: colors.white,
  },
  deleteBtn: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 10,
  },
  deleteText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.danger,
    fontWeight: '600',
  },
  version: {
    fontFamily: fonts.body,
    textAlign: 'center',
    color: colors.textFaint,
    marginTop: 20,
    marginBottom: 40,
  },
  switch: {
    width: 60,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    padding: 2,
  },
  switchOn: {
    backgroundColor: colors.primary,
  },
  switchOff: {
    backgroundColor: colors.disabled,
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  switchThumbOff: {
    alignSelf: 'flex-start',
  },
  switchText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.text,
  },
});
