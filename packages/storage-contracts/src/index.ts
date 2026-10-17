/** Temporary Gate 0 rows. The production branch/version schema is a later issue. */
export type ProbeMessage = Readonly<{
  id: string;
  sequence: number;
  role: 'user' | 'assistant';
  text: string;
}>;
export interface ProbeMessageStore {
  seed(messages: readonly ProbeMessage[]): Promise<void>;
  page(options: Readonly<{ limit: number; before?: number }>): Promise<ProbeMessage[]>;
}
