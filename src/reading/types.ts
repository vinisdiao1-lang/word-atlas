export interface ReadingQuestion {
  id: string;
  type: "tfng" | "choice" | "completion";
  prompt: string;
  answer: string;
  options?: string[];
  maxWords?: number;
  paragraph: number;
  evidence: string;
  explanation: string;
}

export interface ReadingPassage {
  id: string;
  title: string;
  topic: string;
  level: "B1" | "B2" | "C1";
  paragraphs: string[];
  questions: ReadingQuestion[];
}

export interface ReadingSession {
  answers: Record<string, string>;
  startedAt: number;
  submittedAt?: number;
}

export interface ReadingResult {
  passageId: string;
  title: string;
  at: number;
  score: number;
  total: number;
}

export interface ReadingProgress {
  sessions: Record<string, ReadingSession>;
  history: ReadingResult[];
  custom: ReadingPassage[];
}

export const emptyReading = (): ReadingProgress => ({
  sessions: {},
  history: [],
  custom: [],
});
