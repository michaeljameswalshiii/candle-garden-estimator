import React, { useEffect, useState } from 'react';
import { useRoute } from '@react-navigation/native';
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
import {
  clearPushToken,
  getStoredPushToken,
  registerForPushNotificationsAsync,
  pushAvailable,
} from '../lib/notifications';
import { AppleAuthentication, appleSignInAvailable } from '../lib/appleSignIn';
import Constants from 'expo-constants';
import PoweredBy from '../components/PoweredBy';

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

function cognitoPhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (raw.startsWith('+') && digits.length >= 8) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export default function ProfileScreen() {
  const {
    user,
    isAuthenticated,
    booting,
    busy,
    signIn,
    signInWithApple,
    signUp,
    updateProfile,
    confirmSignUp,
    resendCode,
    signOut,
    deleteAccount,
    forgotPassword,
    confirmForgotPassword,
    changePassword,
  } = useAuth();
  const route = useRoute();

  const [appleAvailable,setAppleAvailable] = useState(false);
  React.useEffect(()=>{appleSignInAvailable().then(setAppleAvailable).catch(()=>{});},[]);
  const [mode, setMode] = useState('signin');
  const [joinStep, setJoinStep] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushToken, setPushToken] = useState(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!isAuthenticated && route.params?.intent === 'signup') {
      setMode('signup');
    }
  }, [isAuthenticated, route.params?.intent]);

  React.useEffect(() => {
    getStoredPushToken().then((t) => {
      if (t) {
        setPushToken(t);
        setNotificationsEnabled(true);
      }
    });
  }, []);

  React.useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setPhone(user.phone || '');
    setAddress(user.address || '');
    setMarketingOptIn(Boolean(user.marketingOptIn));
  }, [user]);

  const onToggleNotifications = async (on) => {
    if (!on) {
      setNotificationsEnabled(false);
      setPushToken(null);
      await clearPushToken({ syncToServer: isAuthenticated });
      return;
    }
    const result = await registerForPushNotificationsAsync({
      syncToServer: isAuthenticated,
    });
    if (result.token) {
      setNotificationsEnabled(true);
      setPushToken(result.token);
      Alert.alert(
        'Notifications on',
        isAuthenticated
          ? 'Device registered. You will get a push when an order is placed from this account.'
          : 'Device registered locally. Sign in to link push to your account for order alerts.'
      );
    } else {
      setNotificationsEnabled(false);
      Alert.alert('Could not enable', result.error || 'Use a physical device and allow notifications.');
    }
  };

  const onChangePassword = async () => {
    try {
      await changePassword({ previousPassword: oldPassword, proposedPassword: newPassword });
      setOldPassword('');
      setNewPassword('');
      Alert.alert('Password updated');
    } catch (e) {
      Alert.alert('Could not change password', e.message || 'Try again');
    }
  };

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
      if (!phone.trim() || !address.trim()) {
        Alert.alert('Add contact details', 'Phone and mailing address are required to create an account.');
        return;
      }
      const result = await signUp({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        phone: cognitoPhone(phone),
        address: address.trim(),
        marketingOptIn,
      });
      if (result.needsConfirmation) {
        setMode('confirm');
        Alert.alert('Check your email', 'Enter the 6-digit confirmation code to activate your account.');
      } else {
        await signIn({ email: email.trim(), password });
      }
    } catch (e) {
      Alert.alert('Sign up failed', e.message || 'Please try again');
    }
  };

  const onSaveProfile = async () => {
    try {
      await updateProfile({ name: name.trim(), phone: cognitoPhone(phone), address: address.trim(), marketingOptIn });
      Alert.alert('Saved', 'Checkout will use this phone and address.');
    } catch (e) {
      Alert.alert('Could not update profile', e.message || 'Try again');
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

  const onForgot = async () => {
    try {
      await forgotPassword(email.trim());
      setMode('reset');
      Alert.alert('Check your email', 'Enter the reset code and choose a new password.');
    } catch (e) {
      Alert.alert('Reset failed', e.message || 'Try again');
    }
  };

  const onResetPassword = async () => {
    try {
      await confirmForgotPassword({ email: email.trim(), code: code.trim(), password });
      setCode('');
      setMode('signin');
      Alert.alert('Password updated', 'Sign in with your new password.');
    } catch (e) {
      Alert.alert('Could not reset', e.message || 'Check the code and try again');
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Sign out of The Candle Garden App?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); Alert.alert('Signed out'); } },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your login and purges server rate-limit keys / soft-deletes orders when available. Local cart on this device is cleared after sign-out. Continue?',
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

  const onAppleSignIn = async (options) => {
    if (busy) return;
    try { await signInWithApple(options); }
    catch (error) {
      if (error.data?.code === 'APPLE_LINK_REQUIRED') {
        Alert.alert('Link your account?', 'Apple verified the email on your existing Candle Garden account. Link Apple sign-in to keep your orders and email password?', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Link Apple', onPress: () => onAppleSignIn({ linkExisting: true }) },
        ]);
      } else if (error.code !== 'ERR_REQUEST_CANCELED') Alert.alert('Sign-in unavailable', error.message);
    }
  };

  if (!isAuthenticated) {
    return (
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Account</Text>
        <Text style={styles.lead}>
          Become a member to keep your orders, phone, and shipping address together. You can still shop and check out as a guest.
        </Text>
        <View style={styles.modeRow}>
          {[{ id: 'signin', label: 'Sign in' }, { id: 'signup', label: 'Become a member' }].map((m) => {
            const memberPath = mode === 'signup' || mode === 'confirm';
            const on = m.id === 'signup' ? memberPath : !memberPath;
            return (
            <TouchableOpacity
              key={m.id}
              style={[styles.modeChip, on && styles.modeChipOn]}
              onPress={() => { setMode(m.id); if (m.id === 'signup') setJoinStep(1); }}
            >
              <Text style={[styles.modeChipText, on && styles.modeChipTextOn]}>{m.label}</Text>
            </TouchableOpacity>
            );
          })}
        </View>
        {appleAvailable && AppleAuthentication ? <View style={styles.section}><AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={8} style={{width:'100%',height:48,opacity:busy?0.6:1}} onPress={()=>onAppleSignIn()}/><Text style={styles.hint}>Members can also continue with Apple. Apple can keep your email private.</Text></View>:null}
        <View style={styles.section}>
          {mode !== 'signin' ? (
            <Text style={styles.stepKicker}>
              {mode === 'confirm' ? 'Step 3 of 3 · Confirm your email' : mode === 'forgot' || mode === 'reset' ? 'Reset your password' : joinStep === 1 ? 'Step 1 of 3 · How we reach you' : 'Step 2 of 3 · Choose a password'}
            </Text>
          ) : null}
          {mode === 'signup' && joinStep === 1 ? (
            <Text style={styles.hint}>Checkout uses this phone and address. Your email is the sign-in name.</Text>
          ) : null}
          {mode === 'signup' && joinStep === 1 ? (
            <>
              <View style={styles.inputGroup}><Text style={styles.label}>Name</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.textFaint} autoCapitalize="words" /></View>
              <View style={styles.inputGroup}><Text style={styles.label}>Phone</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+1 904 555 0123" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" autoComplete="tel" /></View>
              <View style={styles.inputGroup}><Text style={styles.label}>Mailing address</Text><TextInput style={[styles.input, styles.multiline]} value={address} onChangeText={setAddress} placeholder="Street, city, state, ZIP" placeholderTextColor={colors.textFaint} autoComplete="street-address" multiline /></View>
            </>
          ) : null}
          {mode === 'signup' && joinStep === 2 ? (
            <Text style={styles.hint}>Membership email: {email.trim()}</Text>
          ) : null}
          {mode === 'signup' && joinStep === 2 ? (
            <TouchableOpacity style={styles.consentRow} onPress={() => setMarketingOptIn((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: marketingOptIn }}>
              <View style={[styles.checkbox, marketingOptIn && styles.checkboxOn]}>{marketingOptIn ? <Text style={styles.checkmark}>✓</Text> : null}</View>
              <Text style={styles.consentText}>Yes, send me Candle Garden news, product updates, classes, and occasional offers. I can turn this off later.</Text>
            </TouchableOpacity>
          ) : null}
          {mode !== 'signup' || joinStep === 1 ? (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="you@example.com" placeholderTextColor={colors.textFaint} />
          </View>
          ) : null}
          {(mode === 'confirm' || mode === 'reset') && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{mode === 'reset' ? 'Reset code' : 'Confirmation code'}</Text>
              <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="Code from email" placeholderTextColor={colors.textFaint} />
            </View>
          )}
          {(mode === 'signin' || mode === 'reset' || (mode === 'signup' && joinStep === 2)) ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{mode === 'reset' ? 'New password' : 'Password'}</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Min 8 chars, upper, lower, number" placeholderTextColor={colors.textFaint} />
            </View>
          ) : null}
          {mode === 'confirm' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password (to sign in after confirm)</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" placeholderTextColor={colors.textFaint} />
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={() => {
              if (mode === 'signup' && joinStep === 1) {
                if (!email.trim() || !phone.trim() || !address.trim()) {
                  Alert.alert('Add contact details', 'Email, phone, and a mailing address are how a membership stays ready for checkout.');
                  return;
                }
                setJoinStep(2);
                return;
              }
              if (mode === 'signin') return onSignIn();
              if (mode === 'signup') return onSignUp();
              if (mode === 'confirm') return onConfirm();
              if (mode === 'forgot') return onForgot();
              return onResetPassword();
            }}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? <ActivityIndicator color={colors.white} /> : (
              <Text style={styles.buttonText}>
                {mode === 'signin' ? 'Sign in' : mode === 'signup' && joinStep === 1 ? 'Continue' : mode === 'signup' ? 'Create membership' : mode === 'confirm' ? 'Confirm & sign in' : mode === 'forgot' ? 'Send reset code' : 'Set new password'}
              </Text>
            )}
          </TouchableOpacity>
          {mode === 'signup' && joinStep === 2 ? <TouchableOpacity style={styles.linkBtn} onPress={() => setJoinStep(1)} disabled={busy}><Text style={styles.linkText}>Back to your details</Text></TouchableOpacity> : null}
          {mode === 'confirm' ? <TouchableOpacity style={styles.linkBtn} onPress={onResend} disabled={busy}><Text style={styles.linkText}>Resend code</Text></TouchableOpacity> : null}
          {mode === 'signin' ? <TouchableOpacity style={styles.linkBtn} onPress={() => setMode('forgot')} disabled={busy}><Text style={styles.linkText}>Forgot password?</Text></TouchableOpacity> : null}
        </View>
        <Text style={styles.version}>Version {Constants.expoConfig?.version} ({Constants.platform?.ios?.buildNumber || Constants.expoConfig?.ios?.buildNumber}) {'·'} The Candle Garden App</Text>
        <PoweredBy />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.lead}>You’re a Candle Garden member. Checkout uses the email and phone saved here.</Text>
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || user?.email || '?').charAt(0).toUpperCase()}</Text></View>
        <Text style={styles.avatarName}>{user?.name || 'Member'}</Text>
        <Text style={styles.muted}>{user?.email}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your membership</Text>
        {[
          ['Signed in', true],
          ['Phone and address for checkout', Boolean(String(user?.phone || '').trim() && String(user?.address || '').trim())],
          ['Order alerts', notificationsEnabled],
        ].map(([label, done]) => (
          <Text key={label} style={styles.infoLine}>{done ? '✓' : '○'}  {label}{label === 'Order alerts' ? ' · optional' : ''}</Text>
        ))}
        {!String(user?.phone || '').trim() || !String(user?.address || '').trim() ? (
          <Text style={styles.hint}>Add a phone and mailing address below. Checkout keeps those instead of an older order.</Text>
        ) : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact for checkout</Text>
        <View style={styles.inputGroup}><Text style={styles.label}>Name</Text><TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" /></View>
        <View style={styles.inputGroup}><Text style={styles.label}>Phone</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" /></View>
        <View style={styles.inputGroup}><Text style={styles.label}>Mailing address</Text><TextInput style={[styles.input, styles.multiline]} value={address} onChangeText={setAddress} multiline autoComplete="street-address" /></View>
        <TouchableOpacity style={styles.consentRow} onPress={() => setMarketingOptIn((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: marketingOptIn }}>
          <View style={[styles.checkbox, marketingOptIn && styles.checkboxOn]}>{marketingOptIn ? <Text style={styles.checkmark}>✓</Text> : null}</View>
          <Text style={styles.consentText}>Receive Candle Garden news, product updates, classes, and occasional offers.</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} onPress={onSaveProfile} disabled={busy || !phone.trim() || !address.trim()}><Text style={styles.buttonText}>Save contact details</Text></TouchableOpacity>
        {pushAvailable ? (
        <View style={styles.settingRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Text style={styles.settingDescription}>Order received / status updates</Text>
          </View>
          <CustomSwitch value={notificationsEnabled} onValueChange={onToggleNotifications} />
        </View>
        ) : null}
        {pushToken ? <Text style={styles.hint} numberOfLines={2}>Push linked{isAuthenticated ? ' to your account' : ' on this device only'}</Text> : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <Text style={styles.hint}>Use this when you sign in with a password. Apple sign-in does not use this password.</Text>
        <View style={styles.inputGroup}><Text style={styles.label}>Current password</Text><TextInput style={styles.input} value={oldPassword} onChangeText={setOldPassword} secureTextEntry placeholderTextColor={colors.textFaint} placeholder="Current password" /></View>
        <View style={styles.inputGroup}><Text style={styles.label}>New password</Text><TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholderTextColor={colors.textFaint} placeholder="Min 8 chars, upper, lower, number" /></View>
        <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} onPress={onChangePassword} disabled={busy || !oldPassword || !newPassword}><Text style={styles.buttonText}>Update password</Text></TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout} activeOpacity={0.8} disabled={busy}><Text style={[styles.buttonText, styles.logoutText]}>Sign out</Text></TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.8} disabled={busy}><Text style={styles.deleteText}>Delete account</Text></TouchableOpacity>
      <Text style={styles.version}>Version {Constants.expoConfig?.version} ({Constants.platform?.ios?.buildNumber || Constants.expoConfig?.ios?.buildNumber}) {'·'} The Candle Garden App</Text>
      <PoweredBy />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, padding: spacing.md },
  centered: { justifyContent: 'center', alignItems: 'center' },
  title: { fontFamily: fonts.heading, fontSize: 26, fontWeight: '400', textAlign: 'center', marginBottom: 12, marginTop: 10, color: colors.primary },
  lead: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  stepKicker: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 4 },
  avatarContainer: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.lightAccent, justifyContent: 'center', alignItems: 'center', marginBottom: 10, borderWidth: 2, borderColor: colors.primary },
  avatarText: { fontSize: 32, fontWeight: '700', color: colors.primary },
  avatarName: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '400', color: colors.darkAccent },
  section: { marginBottom: 24, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '400', marginBottom: 16, color: colors.primary },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeChip: { flex: 1, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.white },
  modeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeChipText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  modeChipTextOn: { color: colors.white },
  inputGroup: { marginBottom: 14 },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, padding: 12, fontSize: 16, backgroundColor: colors.white, color: colors.text, fontFamily: fonts.body },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  checkbox: { width: 22, height: 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4, backgroundColor: colors.white },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.white, fontSize: 15, fontWeight: '700' },
  consentText: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  button: { backgroundColor: colors.primary, padding: 14, borderRadius: radii.sm, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '500', letterSpacing: 1.2 },
  linkBtn: { alignItems: 'center', marginTop: 14 },
  linkText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  infoLine: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 8, lineHeight: 17 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  settingLabel: { fontFamily: fonts.body, fontSize: 16, fontWeight: '500', color: colors.text },
  settingDescription: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logoutButton: { backgroundColor: colors.danger, marginTop: 8 },
  logoutText: { color: colors.white },
  deleteBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 10 },
  deleteText: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, fontWeight: '600' },
  version: { fontFamily: fonts.body, textAlign: 'center', color: colors.textFaint, marginTop: 20, marginBottom: 40 },
  switch: { width: 60, height: 30, borderRadius: 15, justifyContent: 'center', padding: 2 },
  switchOn: { backgroundColor: colors.primary },
  switchOff: { backgroundColor: colors.disabled },
  switchThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, justifyContent: 'center', alignItems: 'center' },
  switchThumbOn: { alignSelf: 'flex-end' },
  switchThumbOff: { alignSelf: 'flex-start' },
  switchText: { fontSize: 10, fontWeight: 'bold', color: colors.text },
});
