/** Serializable dictionary shapes (content ↔ background). */

export type DictEntry = {
  w: string;
  h: string;
  detail?: string;
  on?: string;
  kun?: string;
  level?: string[];
  stroke_count?: string;
  example_kun?: Record<string, Array<{ w: string; m: string; p: string }>>;
  example_on?: Record<string, Array<{ w: string; m: string; p: string }>>;
  examples?: Array<{
    w: string;
    m: string;
    p: string;
    h: string;
  }>;
};

export type VocabMeta = { r: string; m: string };

export type VocabEntry = {
  word: string;
  r: string;
  m: string;
};
