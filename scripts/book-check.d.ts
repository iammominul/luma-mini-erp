export type Query = (text: string) => Promise<Record<string, unknown>[]>;
export type Shape = Record<string, string[]>;
export interface Fingerprint {
  shape: Shape;
  figures: Record<string, string>;
}
export interface BookChange {
  name: string;
  before: string;
  after: string;
}
export declare const BOOK: { table: string; columns: string[]; money: string | null }[];
export declare function readShape(query: Query): Promise<Shape>;
export declare function fingerprintBook(query: Query, shape?: Shape): Promise<Fingerprint>;
export declare function compareBooks(
  before: Fingerprint,
  after: Fingerprint,
  allow?: string[],
): BookChange[];
export declare function describeChanges(changes: BookChange[]): string;
export declare function allowedFromEnv(value?: string): string[];
