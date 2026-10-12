// The documents a coach application carries, read the same way by the website's form (through its
// classic-script mirror, public/application-files.js, held equal by
// tests/application-files-mirror.test.mjs), the app's form, /api/apply/uploads, /api/apply and the
// review console.
//
// ⚠ THE FILES NO LONGER RIDE THE APPLICATION REQUEST. Owner, 2026-10-12: "make sure application
// process can upload resume, and other CV materials, as well as certifications and designation
// supportive paperwork, certificates, etc". One request carried every file, and the platform caps
// a request at 4.5 MB, so an application held 4 MB of documents in all: a resume and one scanned
// certificate. Each file now goes straight to the private bucket through a signed upload link
// (/api/apply/uploads), so the limits are per file and per application, not per request.
//
// Pure: no I/O.

export const APPLICATION_FILE_BUCKET = 'provider-credentials';

/** The categories, in the order the forms show them. `max` is files per category. */
export const APPLICATION_FILE_KINDS = [
  { kind: 'resume', label: 'Resume / CV', help: 'Your current resume or CV.', max: 2 },
  { kind: 'cv_materials', label: 'Other CV materials', help: 'Cover letter, portfolio, references, transcripts.', max: 6 },
  { kind: 'credential', label: 'Certifications and certificates', help: 'Each certification you hold (NASM, ACE, CSCS, CPR/AED…) and certificates of completion.', max: 10 },
  { kind: 'designation', label: 'Designations and supporting paperwork', help: 'Registration and license cards (RD/RDN, CDR, state licenses), degree certificates, CEU records.', max: 10 },
  { kind: 'insurance', label: 'Insurance', help: 'Your liability insurance certificate.', max: 2 },
];

export const APPLICATION_MAX_FILES = 25;
export const APPLICATION_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const APPLICATION_MAX_TOTAL_BYTES = 75 * 1024 * 1024;

/** The bucket's own allow-list (storage.buckets.allowed_mime_types for provider-credentials). */
export const APPLICATION_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
];

const EXTENSION_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const APPLICATION_FILE_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp';

const KIND_BY_NAME = new Map(APPLICATION_FILE_KINDS.map((k) => [k.kind, k]));

/** The category for a kind, or null when the kind is not one of ours. */
export function applicationFileKind(kind) {
  return KIND_BY_NAME.get(String(kind ?? '')) ?? null;
}

/**
 * The content type a file is stored under, or null when it is not one we take. A browser sends an
 * empty type (or application/octet-stream) for an extension it does not know, so an undeclared
 * type is read off the extension (L4, 2026-10-08).
 */
export function applicationFileType(name, type) {
  const declared = String(type ?? '').toLowerCase().split(';')[0].trim();
  if (declared && declared !== 'application/octet-stream') return APPLICATION_FILE_TYPES.includes(declared) ? declared : null;
  const ext = (/\.([a-z0-9]+)$/.exec(String(name ?? '').toLowerCase()) || [])[1] || '';
  return EXTENSION_TYPES[ext] ?? null;
}

function megabytes(bytes) {
  return (Math.ceil(Number(bytes || 0) / (1024 * 1024 / 10)) / 10).toFixed(1);
}

/**
 * Why these files cannot go with an application, or '' when they can. `files` is a list of
 * { kind, name, type, size }. The forms say it before uploading and the server says the same.
 */
export function applicationFilesProblem(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.length > APPLICATION_MAX_FILES) return `Attach at most ${APPLICATION_MAX_FILES} files to one application.`;
  const perKind = new Map();
  let total = 0;
  for (const f of list) {
    const category = applicationFileKind(f?.kind);
    const name = String(f?.name || 'A file');
    if (!category) return `${name} is in a section the application does not have.`;
    perKind.set(category.kind, (perKind.get(category.kind) || 0) + 1);
    if (perKind.get(category.kind) > category.max) return `Attach at most ${category.max} files under ${category.label}.`;
    const size = Number(f?.size);
    if (!Number.isFinite(size) || size <= 0) return `${name} is empty.`;
    if (size > APPLICATION_MAX_FILE_BYTES) return `${name} is ${megabytes(size)} MB; each file can be up to 10 MB.`;
    if (!applicationFileType(name, f?.type)) return `${name} must be a PDF, DOC, DOCX, PNG, JPEG or WebP file.`;
    total += size;
  }
  if (total > APPLICATION_MAX_TOTAL_BYTES) return `Your files add up to ${megabytes(total)} MB; one application can carry up to 75 MB.`;
  return '';
}

/** A storage-safe file name: letters, digits, dot, underscore and hyphen, at most 120 long. */
export function applicationSafeFileName(name) {
  return String(name ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'document';
}

/** Where an uploaded file lives: under the application's own id, by category. */
export function applicationUploadPath(applicationId, kind, index, name) {
  return `website/${applicationId}/${kind}/${index}-${applicationSafeFileName(name)}`;
}
