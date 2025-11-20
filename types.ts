export enum Language {
  JAPANESE = 'Japanese',
  KOREAN = 'Korean',
  FRENCH = 'French',
  ITALIAN = 'Italian',
  DUTCH = 'Dutch',
  ENGLISH = 'English',
  CANTONESE = 'Cantonese',
  SPANISH = 'Spanish'
}

export interface WordDefinition {
  word: string;
  phonetic: string;
  pronunciationGuide: string;
  dailyExample: string;
  academicExample: string;
  definitionCN: string;
  definitionEN: string;
  definitionSource: string;
}

export interface VocabularyItem extends WordDefinition {
  id: string;
  addedAt: number; // Timestamp
  nextReviewAt: number; // Timestamp
  reviewStage: number; // 0 to 5
  contextSentence?: string;
  lastReviewedAt?: number; // Timestamp of last manual review
}

export interface Article {
  id: string;
  date: string;
  title: string;
  content: string; // Markdown or HTML
  language: Language;
  audioBase64?: string; // Base64 PCM data
}

export interface AppState {
  selectedLanguage: Language | null;
  currentArticle: Article | null;
  history: Article[]; // Meta-data mostly
  vocabulary: VocabularyItem[];
  isLoading: boolean;
  loadingMessage: string;
}