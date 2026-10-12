// Uploads that never became an application (2026-10-12).
//
// A coach application's documents go up through /api/apply/uploads before the application is
// sent, under website/<draftId>/. An applicant who uploads and then leaves leaves those files in
// the private bucket with no application to show them to, so once a day every draft folder with
// no provider_applications row of the same id, whose files are all older than a day, is removed.
// A folder with a row is an application's documents and is never touched.

import { APPLICATION_FILE_BUCKET, APPLICATION_FILE_KINDS } from '@/lib/application-files.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const ABANDONED_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;
const FOLDERS_PER_PAGE = 1000;
const MAX_FOLDERS_PER_RUN = 5000;

type StorageObject = { name: string; id?: string | null; created_at?: string | null };
type AdminLike = {
  storage: { from: (bucket: string) => {
    list: (path: string, opts?: { limit?: number; offset?: number }) => Promise<{ data: StorageObject[] | null; error: unknown }>;
    remove: (paths: string[]) => Promise<{ error: unknown }>;
  } };
  from: (table: string) => { select: (cols: string) => { in: (col: string, values: string[]) => PromiseLike<{ data: Array<{ id: string }> | null; error: unknown }> } };
};

/** Removes abandoned draft uploads. Returns what it looked at and what it removed. */
export async function removeAbandonedApplicationUploads(
  admin: AdminLike,
  now: number = Date.now()
): Promise<{ folders: number; abandoned: number; removed: number }> {
  const storage = admin.storage.from(APPLICATION_FILE_BUCKET);
  const ids: string[] = [];
  for (let offset = 0; offset < MAX_FOLDERS_PER_RUN; offset += FOLDERS_PER_PAGE) {
    const { data, error } = await storage.list('website', { limit: FOLDERS_PER_PAGE, offset });
    if (error) throw error;
    const page = data ?? [];
    for (const o of page) if (!o.id && UUID_RE.test(o.name)) ids.push(o.name);
    if (page.length < FOLDERS_PER_PAGE) break;
  }

  const withRow = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await admin.from('provider_applications').select('id').in('id', chunk);
    if (error) throw error;
    for (const r of data ?? []) withRow.add(String(r.id));
  }

  let abandoned = 0;
  let removed = 0;
  for (const id of ids) {
    if (withRow.has(id)) continue;
    const files: Array<{ path: string; at: number }> = [];
    for (const { kind } of APPLICATION_FILE_KINDS) {
      const { data, error } = await storage.list(`website/${id}/${kind}`, { limit: 100 });
      if (error) throw error;
      for (const o of data ?? []) {
        if (o.id) files.push({ path: `website/${id}/${kind}/${o.name}`, at: Date.parse(String(o.created_at ?? '')) });
      }
    }
    // A file with no readable time is treated as new: the next run looks again.
    if (!files.length || files.some((f) => !Number.isFinite(f.at) || now - f.at < ABANDONED_UPLOAD_AGE_MS)) continue;
    abandoned += 1;
    const { error } = await storage.remove(files.map((f) => f.path));
    if (error) throw error;
    removed += files.length;
  }
  return { folders: ids.length, abandoned, removed };
}
