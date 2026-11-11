export type ClientBreak = { from: string; until: string };

export declare function pausesByClient(rows: unknown): Map<string, ClientBreak[]>;
export declare function pauseCovers(breaks: ClientBreak[] | null | undefined, from: string, to?: string): boolean;
