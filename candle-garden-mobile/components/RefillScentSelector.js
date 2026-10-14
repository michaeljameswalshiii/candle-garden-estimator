import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { refillScents } from '../../packages/catalog/refillScents';
import { colors, fonts, radii, spacing } from '../lib/theme';

export default function RefillScentSelector({ vessels, selected, onChange, onScents }) {
  const [scents] = useState(() => refillScents());
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');
  useEffect(() => { onScents(scents); }, [scents, onScents]);
  const choose = id => {
    const next = [...selected]; next[active] = id;
    onChange(next); setActive(null);
  };
  const options = scents.filter(scent => `${scent.name} ${scent.notes}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <View style={styles.section}>
    <Text style={styles.heading}>Choose a scent for each vessel</Text>
    <Text style={styles.hint}>Match the vessel descriptions to your photo. Each vessel can have its own scent.</Text>
    {vessels.map((vessel, index) => {
      const chosen = scents.find(scent => scent.id === selected[index]);
      return <View style={styles.card} key={index}>
        <Text style={styles.title}>Vessel {index + 1} · {vessel.ounces} oz</Text>
        {vessel.description !== `Vessel ${index + 1}` ? <Text style={styles.hint}>{vessel.description}</Text> : null}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Choose scent for vessel ${index + 1}${chosen ? `, ${chosen.name}` : ''}`} style={styles.control} onPress={() => { setActive(index); setQuery(''); }}>
          <Text style={styles.title}>{chosen ? chosen.name : 'Choose scent'}</Text><Text style={styles.title}>⌄</Text>
        </TouchableOpacity>
        {chosen ? <Text style={styles.hint}>{chosen.notes}</Text> : null}
        {chosen && vessels.length > 1 ? <TouchableOpacity accessibilityRole="button" onPress={() => onChange(vessels.map(() => chosen.id))}><Text style={styles.link}>Use {chosen.name} for all vessels</Text></TouchableOpacity> : null}
      </View>;
    })}
    <Modal visible={active !== null} animationType="slide" transparent onRequestClose={() => setActive(null)}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.sheetContent}>
            <View style={styles.handle} />
            <View style={styles.row}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>Scent for vessel {(active ?? 0) + 1}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close scent picker" style={styles.close} onPress={() => setActive(null)}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
            </View>
            <TextInput accessibilityLabel="Search scents" placeholder="Search scents or notes" placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" style={styles.search} />
            <FlatList style={styles.list} data={options} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" keyExtractor={scent => scent.id} ListEmptyComponent={<Text style={styles.hint}>No scents found. Try another search.</Text>} renderItem={({ item }) => {
              const checked = selected[active] === item.id;
              return <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked }} style={[styles.option, checked && styles.optionSelected]} onPress={() => choose(item.id)}>
                <View style={styles.optionCopy}><Text style={styles.optionTitle}>{item.name}</Text><Text style={styles.optionNotes} numberOfLines={2}>{item.notes}</Text></View>
                <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={20} color={checked ? colors.primary : colors.textSecondary} />
              </TouchableOpacity>;
            }} />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { width: '100%', marginVertical: spacing.sm },
  heading: { fontFamily: fonts.heading, fontSize: 19, color: colors.primary, marginBottom: 4 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginBottom: 4 },
  title: { fontFamily: fonts.body, fontSize: 14, color: colors.primary },
  card: { padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white },
  control: { minHeight: 44, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md, marginVertical: 6 },
  link: { fontFamily: fonts.body, color: colors.primary, paddingVertical: 10, fontSize: 14, textDecorationLine: 'underline' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { height: '76%', maxHeight: 620, width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  sheetContent: { flex: 1, paddingHorizontal: 18, paddingTop: 10 },
  handle: { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { flex: 1, fontFamily: fonts.body, fontWeight: '600', fontSize: 18, color: colors.primary, paddingRight: 12 },
  close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.primary },
  search: { height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, marginBottom: 8, fontSize: 14, color: colors.text },
  list: { flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: colors.border },
  optionSelected: { backgroundColor: colors.lightAccent, borderRadius: radii.sm },
  optionCopy: { flex: 1, paddingRight: 10 },
  optionTitle: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600', color: colors.primary, marginBottom: 2 },
  optionNotes: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
});
