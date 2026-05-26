/**
 * QRScanner — Camera-based QR code scanner for table identification.
 * QR format: petpooja://table/{outlet_id}/{table_id}
 *
 * Props:
 *   onScan(tableId, outletId) — called when a valid PetPooja table QR is scanned
 *   onClose() — called to dismiss the scanner
 *   visible — boolean controlling display
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Graceful degradation — expo-barcode-scanner may not be available in all build configs
let BarCodeScanner = null;
try {
  BarCodeScanner = require('expo-barcode-scanner').BarCodeScanner;
} catch (_) {}

const SCAN_AREA_SIZE = 240;

export default function QRScanner({ onScan, onClose, visible }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    if (!visible) {
      setScanned(false);
      return;
    }
    requestPermission();
  }, [visible]);

  async function requestPermission() {
    if (!BarCodeScanner) {
      setHasPermission(false);
      return;
    }
    const { status } = await BarCodeScanner.requestPermissionsAsync();
    setHasPermission(status === 'granted');
  }

  function handleBarCodeScanned({ type, data }) {
    if (scanned) return;
    setScanned(true);

    // Parse petpooja://table/{outlet_id}/{table_id}
    const match = data.match(/^petpooja:\/\/table\/([^/]+)\/([^/]+)$/);
    if (match) {
      const [, outletId, tableId] = match;
      onScan(tableId, outletId);
      onClose();
    } else {
      Alert.alert(
        'Invalid QR Code',
        'This QR code is not a PetPooja table code. Please scan a table QR code.',
        [{ text: 'Try Again', onPress: () => setScanned(false) }]
      );
    }
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.title}>Scan Table QR</Text>
          {BarCodeScanner && (
            <TouchableOpacity onPress={() => setFlashOn(v => !v)} style={s.flashBtn}>
              <Ionicons name={flashOn ? 'flash' : 'flash-outline'} size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Camera or fallback */}
        {!BarCodeScanner ? (
          <View style={s.fallback}>
            <Ionicons name="qr-code-outline" size={64} color="#888" />
            <Text style={s.fallbackTitle}>Camera Not Available</Text>
            <Text style={s.fallbackSub}>
              Barcode scanner is not available in this build. Use Expo Go or a production build for QR scanning.
            </Text>
            <TouchableOpacity onPress={onClose} style={s.fallbackBtn}>
              <Text style={s.fallbackBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : hasPermission === false ? (
          <View style={s.fallback}>
            <Ionicons name="camera-outline" size={64} color="#888" />
            <Text style={s.fallbackTitle}>Camera Permission Denied</Text>
            <Text style={s.fallbackSub}>Please allow camera access in your device settings to scan QR codes.</Text>
            <TouchableOpacity onPress={onClose} style={s.fallbackBtn}>
              <Text style={s.fallbackBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : hasPermission === true ? (
          <View style={s.cameraWrap}>
            <BarCodeScanner
              onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
              style={StyleSheet.absoluteFillObject}
              flashMode={flashOn ? 'torch' : 'off'}
              barCodeTypes={[BarCodeScanner.Constants.BarCodeType.qr]}
            />

            {/* Viewfinder overlay */}
            <View style={s.overlay}>
              <View style={s.overlayTop} />
              <View style={s.overlayMiddle}>
                <View style={s.overlaySide} />
                <View style={s.scanArea}>
                  {/* Corner markers */}
                  <View style={[s.corner, s.cornerTL]} />
                  <View style={[s.corner, s.cornerTR]} />
                  <View style={[s.corner, s.cornerBL]} />
                  <View style={[s.corner, s.cornerBR]} />
                </View>
                <View style={s.overlaySide} />
              </View>
              <View style={s.overlayBottom}>
                <Text style={s.hint}>
                  {scanned ? 'Processing...' : 'Point camera at table QR code'}
                </Text>
                {scanned && (
                  <TouchableOpacity onPress={() => setScanned(false)} style={s.rescanBtn}>
                    <Text style={s.rescanText}>Tap to scan again</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={s.fallback}>
            <Ionicons name="hourglass-outline" size={48} color="#888" />
            <Text style={s.fallbackSub}>Requesting camera permission...</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const OVERLAY_COLOR = 'rgba(0,0,0,0.6)';
const CORNER_SIZE = 22;
const CORNER_THICKNESS = 3;
const CORNER_COLOR = '#6366f1';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 10,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flashBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  cameraWrap: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'column' },
  overlayTop: { flex: 1, backgroundColor: OVERLAY_COLOR },
  overlayMiddle: { flexDirection: 'row', height: SCAN_AREA_SIZE },
  overlaySide: { flex: 1, backgroundColor: OVERLAY_COLOR },
  scanArea: { width: SCAN_AREA_SIZE, height: SCAN_AREA_SIZE },
  overlayBottom: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
    alignItems: 'center',
    paddingTop: 24,
  },
  hint: { color: '#fff', fontSize: 14, textAlign: 'center' },
  rescanBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#6366f1', borderRadius: 8 },
  rescanText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Corner markers
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: CORNER_COLOR,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },

  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  fallbackTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  fallbackSub: { color: '#aaa', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  fallbackBtn: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#6366f1',
    borderRadius: 10,
  },
  fallbackBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
