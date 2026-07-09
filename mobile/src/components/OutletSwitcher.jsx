import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOutlet } from '../context/OutletContext';

export function OutletSwitcher() {
  const { outlets, currentOutlet, setOutletId } = useOutlet();
  const [visible, setVisible] = useState(false);
  const hasMultiple = outlets.length > 1;

  const name = currentOutlet?.name || 'Select Outlet';

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => hasMultiple && setVisible(true)}
        activeOpacity={hasMultiple ? 0.7 : 1}
      >
        <Ionicons name="storefront" size={16} color="#0070F3" />
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {hasMultiple && <Ionicons name="chevron-down" size={14} color="#888" />}
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Switch Outlet</Text>
            <FlatList
              data={outlets}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const selected = String(item.id) === String(currentOutlet?.id);
                return (
                  <TouchableOpacity
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => { setOutletId(item.id); setVisible(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, selected && { fontWeight: '700' }]}>{item.name}</Text>
                      {item.address_line1 && (
                        <Text style={styles.rowAddr} numberOfLines={1}>{item.address_line1}</Text>
                      )}
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={22} color="#00B341" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: 200,
  },
  name: { fontSize: 13, fontWeight: '600', color: '#0f172a', flexShrink: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  rowSelected: { backgroundColor: '#F0FFF4' },
  rowName: { fontSize: 15, color: '#0f172a' },
  rowAddr: { fontSize: 12, color: '#888', marginTop: 2 },
});
