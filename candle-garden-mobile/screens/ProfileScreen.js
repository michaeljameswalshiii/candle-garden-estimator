import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { colors, fonts, radii, spacing } from '../lib/theme';

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
  const [name, setName] = React.useState('Demo User');
  const [email, setEmail] = React.useState('user@example.com');
  const [phone, setPhone] = React.useState('(555) 123-4567');
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);

  const handleSave = () => {
    setIsEditing(false);
    Alert.alert('Success', 'Profile saved successfully!');
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: () => Alert.alert('Logged out') },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>👤</Text>
        </View>
        <Text style={styles.avatarName}>{name}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personal Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            editable={Boolean(isEditing)}
            placeholder="Enter your name"
            placeholderTextColor={colors.textFaint}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            editable={Boolean(isEditing)}
            placeholder="Enter your email"
            placeholderTextColor={colors.textFaint}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            editable={Boolean(isEditing)}
            placeholder="Enter your phone"
            placeholderTextColor={colors.textFaint}
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={isEditing ? handleSave : () => setIsEditing(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {isEditing ? 'Save Changes' : 'Edit Profile'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Text style={styles.settingDescription}>Receive notifications about orders</Text>
          </View>
          <CustomSwitch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>📦 Order History</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>💳 Payment Methods</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>📍 Shipping Addresses</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>❓ Help & Support</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.logoutButton]}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Text style={[styles.buttonText, styles.logoutText]}>Logout</Text>
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
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 10,
    color: colors.primary,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 30,
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
    fontSize: 36,
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
  inputGroup: {
    marginBottom: 16,
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
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 1.2,
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
  menuItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuText: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  logoutButton: {
    backgroundColor: colors.danger,
    marginTop: 20,
  },
  logoutText: {
    color: colors.white,
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
