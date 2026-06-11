// Live heart-rate monitor (Bluetooth LE) — the standard Heart Rate profile
// (service 0x180D / measurement characteristic 0x2A37), which every chest
// strap and most watches in broadcast mode speak (Polar, Garmin, Wahoo, …).
//
// One codepath covers both runtimes via @capacitor-community/bluetooth-le:
// the native plugin on an installed iOS/Android build, Web Bluetooth in
// browsers that have it (Chrome desktop/Android). Where neither exists
// (iOS WebView without the native build, Safari), available() is false and
// callers keep their demo behavior.
//
// Surface: window.ShapeHRM = { available, connected, current, connect,
// disconnect }. Live readings broadcast as `shape:hrm` window events with
// detail { bpm, connected } so screens can subscribe without prop-threading
// (same pattern as shape:follows / shape:identity).

import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

const state = { deviceId: null, bpm: null, initialized: false };

function emit(detail) {
  try { window.dispatchEvent(new CustomEvent('shape:hrm', { detail })); } catch { /* no-op */ }
}

export function hrmAvailable() {
  try {
    if (Capacitor?.isNativePlatform?.()) return true;
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  } catch {
    return false;
  }
}

export function hrmConnected() {
  return !!state.deviceId;
}

export function hrmCurrent() {
  return state.bpm;
}

// The HR measurement payload: flags byte, then 8- or 16-bit bpm (bit 0 of
// flags picks the width). Energy/RR fields may follow — not needed here.
function parseHeartRate(value) {
  try {
    const flags = value.getUint8(0);
    return flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
  } catch {
    return null;
  }
}

async function handleDisconnect() {
  const had = state.deviceId;
  state.deviceId = null;
  state.bpm = null;
  if (had) emit({ bpm: null, connected: false });
}

// Opens the system device picker (needs a user gesture on web) and starts
// streaming. Resolves once notifications are flowing; rejects when the user
// cancels or no transport exists.
export async function hrmConnect() {
  if (!hrmAvailable()) throw new Error('Bluetooth is not available here — use the installed app or Chrome.');
  if (state.deviceId) return { deviceId: state.deviceId };
  if (!state.initialized) {
    await BleClient.initialize({ androidNeverForLocation: true });
    state.initialized = true;
  }
  const device = await BleClient.requestDevice({ services: [HR_SERVICE] });
  await BleClient.connect(device.deviceId, () => handleDisconnect());
  await BleClient.startNotifications(device.deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
    const bpm = parseHeartRate(value);
    if (bpm != null && bpm > 0) {
      state.bpm = bpm;
      emit({ bpm, connected: true });
    }
  });
  state.deviceId = device.deviceId;
  emit({ bpm: state.bpm, connected: true });
  return { deviceId: device.deviceId };
}

export async function hrmDisconnect() {
  const id = state.deviceId;
  if (!id) return;
  try { await BleClient.stopNotifications(id, HR_SERVICE, HR_MEASUREMENT); } catch { /* already gone */ }
  try { await BleClient.disconnect(id); } catch { /* already gone */ }
  await handleDisconnect();
}
