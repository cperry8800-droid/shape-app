'use server';

// Nora's slots and the licence switch (the owner, 2026-10-10: Nora DJs at the times the owner
// sets). Every change re-syncs the schedule at once, so a new slot's sets appear without waiting
// for the hourly cron (src/lib/radio/noraSetStore.mjs syncNoraSets).
//
// Admin-guarded via requireAdminUser(); written with the service role.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { checkSlot } from '@/lib/radio/noraSlots.mjs';
import { syncNoraSets } from '@/lib/radio/noraSetStore.mjs';
import { checkStation } from '@/lib/radio/station.mjs';

const PAGE = '/dashboard/radio';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function done(updated: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?updated=${encodeURIComponent(updated)}#sets`);
}
function failed(error: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(error)}#sets`);
}

async function sync(db: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const r = await syncNoraSets(db, { now: Date.now() });
  return !!r.ok;
}

export async function addSlot(formData: FormData): Promise<void> {
  await requireAdminUser();
  const checked = checkSlot({
    days: formData.getAll('day').map(String),
    startTime: String(formData.get('start_time') ?? ''),
    durationMin: Number(formData.get('duration_min')),
    zone: String(formData.get('zone') ?? ''),
  });
  if (!checked.ok) failed(`slot_${checked.error}`);
  const db = createAdminClient();
  const { error } = await db.from('nora_slots').insert(checked.value);
  if (error) failed('slot_write_failed');
  done((await sync(db)) ? 'slot_added' : 'slot_added_sync_failed');
}

export async function setSlotEnabled(formData: FormData): Promise<void> {
  await requireAdminUser();
  const id = String(formData.get('slot_id') ?? '');
  if (!UUID.test(id)) failed('slot_missing');
  const enabled = formData.get('enabled') === 'true';
  const db = createAdminClient();
  const { error } = await db.from('nora_slots').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) failed('slot_write_failed');
  done((await sync(db)) ? (enabled ? 'slot_on' : 'slot_off') : 'sync_failed');
}

export async function deleteSlot(formData: FormData): Promise<void> {
  await requireAdminUser();
  const id = String(formData.get('slot_id') ?? '');
  if (!UUID.test(id)) failed('slot_missing');
  const db = createAdminClient();
  // Its future sets lose their slot (on delete set null) and the sync removes those not yet planned.
  const { error } = await db.from('nora_slots').delete().eq('id', id);
  if (error) failed('slot_write_failed');
  done((await sync(db)) ? 'slot_deleted' : 'sync_failed');
}

export async function confirmLicences(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  if (formData.get('confirm') !== 'yes') failed('licences_unticked');
  const db = createAdminClient();
  const { error } = await db.from('nora_dj_settings')
    .update({ licences_confirmed_at: new Date().toISOString(), licences_confirmed_by: admin.email, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) failed('licences_write_failed');
  done((await sync(db)) ? 'licences_confirmed' : 'sync_failed');
}

export async function withdrawLicences(): Promise<void> {
  await requireAdminUser();
  const db = createAdminClient();
  const { error } = await db.from('nora_dj_settings')
    .update({ licences_confirmed_at: null, licences_confirmed_by: null, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) failed('licences_write_failed');
  done((await sync(db)) ? 'licences_withdrawn' : 'sync_failed');
}

export async function syncNow(): Promise<void> {
  await requireAdminUser();
  done((await sync(createAdminClient())) ? 'synced' : 'sync_failed');
}

// ── The station (radio.co) ─────────────────────────────────────────────────────────────────
export async function connectStation(formData: FormData): Promise<void> {
  await requireAdminUser();
  const checked = checkStation({ streamUrl: String(formData.get('stream_url') ?? ''), stationId: String(formData.get('station_id') ?? '') });
  if (!checked.ok) failed(`station_${checked.error}`);
  const { error } = await createAdminClient().from('radio_station')
    .update({ ...checked.value, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) failed('station_write_failed');
  done('station_connected');
}

export async function disconnectStation(): Promise<void> {
  await requireAdminUser();
  const { error } = await createAdminClient().from('radio_station')
    .update({ provider: 'mock', stream_url: null, now_playing_url: null, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) failed('station_write_failed');
  done('station_disconnected');
}
