import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView } from 'react-native';
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
        <Text style={styles.hint}>{vessel.description}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Choose scent for vessel ${index + 1}${chosen ? `, ${chosen.name}` : ''}`} style={styles.control} onPress={() => { setActive(index); setQuery(''); }}>
          <Text style={styles.title}>{chosen ? chosen.name : 'Choose scent'}</Text><Text style={styles.title}>⌄</Text>
        </TouchableOpacity>
        {chosen ? <Text style={styles.hint}>{chosen.notes}</Text> : null}
        {chosen && vessels.length > 1 ? <TouchableOpacity accessibilityRole="button" onPress={() => onChange(vessels.map(() => chosen.id))}><Text style={styles.link}>Use {chosen.name} for all vessels</Text></TouchableOpacity> : null}
      </View>;
    })}
    <Modal visible={active !== null} animationType="slide" transparent onRequestClose={() => setActive(null)}>
      <View style={styles.backdrop}><SafeAreaView style={styles.sheet}>
        <View style={styles.row}><Text accessibilityRole="header" style={styles.heading}>Scent for vessel {(active ?? 0) + 1}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setActive(null)}><Text style={styles.link}>Close</Text></TouchableOpacity></View>
        <TextInput autoFocus accessibilityLabel="Search scents" placeholder="Search scents or fragrance notes" value={query} onChangeText={setQuery} style={styles.search} />
        <FlatList data={options} keyboardShouldPersistTaps="handled" keyExtractor={scent => scent.id} ListEmptyComponent={<Text style={styles.hint}>No scents found. Try another search.</Text>} renderItem={({ item }) => <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: selected[active] === item.id }} style={styles.option} onPress={() => choose(item.id)}><View style={styles.optionCopy}><Text style={styles.title}>{item.name}</Text><Text style={styles.hint}>{item.notes}</Text></View><Text style={styles.title}>{selected[active] === item.id ? '●' : '○'}</Text></TouchableOpacity>} />
      </SafeAreaView></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { width: '100%', marginVertical: spacing.md },
  heading: { fontFamily: fonts.heading, fontSize: 21, color: colors.primary, marginBottom: 8 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginBottom: 8 },
  title: { fontFamily: fonts.body, fontSize: 16, color: colors.primary },
  card: { padding: 14, marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white },
  control: { minHeight: 48, padding: 12, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md, marginVertical: 8 },
  link: { fontFamily: fonts.body, color: colors.primary, paddingVertical: 10, fontSize: 14, textDecorationLine: 'underline' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { height: '80%', padding: 20, backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginVertical: 10, color: colors.text },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border },
  optionCopy: { flex: 1, paddingRight: 12 },
});
