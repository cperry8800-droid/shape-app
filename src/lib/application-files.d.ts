// Types for application-files.mjs (hand-written, the .mjs + .d.ts pattern of age-derive.mjs).

export type ApplicationFileKind = { kind: string; label: string; help: string; max: number };
export type ApplicationFileMeta = { kind: string; name: string; type?: string | null; size: number };

export declare const APPLICATION_FILE_BUCKET: string;
export declare const APPLICATION_FILE_KINDS: readonly ApplicationFileKind[];
export declare const APPLICATION_MAX_FILES: number;
export declare const APPLICATION_MAX_FILE_BYTES: number;
export declare const APPLICATION_MAX_TOTAL_BYTES: number;
export declare const APPLICATION_FILE_TYPES: readonly string[];
export declare const APPLICATION_FILE_ACCEPT: string;

/** The category for a kind, or null when the kind is not one of ours. */
export declare function applicationFileKind(kind: unknown): ApplicationFileKind | null;
/** The content type a file is stored under, or null when it is not one we take. */
export declare function applicationFileType(name: unknown, type: unknown): string | null;
/** Why these files cannot go with an application, or '' when they can. */
export declare function applicationFilesProblem(files: ReadonlyArray<ApplicationFileMeta>): string;
/** A storage-safe file name. */
export declare function applicationSafeFileName(name: unknown): string;
/** Where an uploaded file lives: website/<applicationId>/<kind>/<index>-<name>. */
export declare function applicationUploadPath(applicationId: string, kind: string, index: number, name: string): string;
