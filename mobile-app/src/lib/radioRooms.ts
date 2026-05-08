import { supabase } from './supabase';

export type ProviderRole = 'trainer' | 'nutritionist';

export type RadioRoom = {
  id: string;
  role: ProviderRole;
  host: string;
  topic: string;
  description: string;
  scheduledAt: string;
  date: string;
  time: string;
  audience: string;
  status: string;
  roomUrl: string;
};

type CreateRadioRoomPayload = {
  role: ProviderRole;
  topic: string;
  description: string;
  date: string;
  time: string;
  audience: string;
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'https://www.theshapecommunity.com').replace(/\/$/, '');

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchRadioRooms(role: ProviderRole): Promise<RadioRoom[]> {
  const response = await fetch(`${apiBaseUrl}/api/radio/rooms?role=${encodeURIComponent(role)}`, {
    headers: {
      Accept: 'application/json',
      ...(await authHeaders()),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Could not load radio rooms.');
  }
  return Array.isArray(data.rooms) ? data.rooms : [];
}

export async function createRadioRoom(payload: CreateRadioRoomPayload): Promise<RadioRoom> {
  const response = await fetch(`${apiBaseUrl}/api/radio/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Could not save radio room.');
  }
  return data.room as RadioRoom;
}

export function formatRadioRoomWhen(room: Pick<RadioRoom, 'scheduledAt' | 'date' | 'time'>) {
  const date = room.scheduledAt ? new Date(room.scheduledAt) : new Date(`${room.date}T${room.time}`);
  if (Number.isNaN(date.getTime())) return 'Scheduled';
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function radioAudienceLabel(audience: string) {
  if (audience === 'clients_only') return 'Clients only';
  if (audience === 'coaches_only') return 'Coaches only';
  if (audience === 'public_shape') return 'Public Shape members';
  return 'Clients + coaches';
}
