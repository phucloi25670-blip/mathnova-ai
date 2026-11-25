export type GradeLevel = '10' | '11' | '12' | 'thpt';

export type TabId =
  | 'dashboard'
  | 'formulas'
  | 'games'
  | 'exam'
  | 'tutor'
  | 'lab'
  | 'comics'
  | 'leaderboard';

export interface FormulaItem {
  id: string;
  title: string;
  latex: string;
  description: string;
  practicalNote?: string;
}

export interface ChapterData {
  id: string;
  grade: '10' | '11' | '12';
  order: number;
  title: string;
  summary: string;
  formulas: FormulaItem[];
  examWeight?: 'high' | 'medium';
}

export type QuestionFormat = 'multiple_choice' | 'true_false' | 'short_answer';

export interface TrueFalseStatement {
  id: 'a' | 'b' | 'c' | 'd';
  text: string;
  isTrue: boolean;
}

export interface QuizQuestion {
  id: string;
  grade: '10' | '11' | '12';
  chapterId: string;
  chapterTitle: string;
  format: QuestionFormat;
  prompt: string;
  // For multiple_choice
  options?: string[];
  correctIndex?: number;
  // For true_false (4 statements a, b, c, d)
  statements?: TrueFalseStatement[];
  // For short_answer
  shortAnswer?: string;
  explanation: string;
  isRealWorld?: boolean;
}

export interface MatchPair {
  id: string;
  leftTitle: string;
  rightLatex: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  imageDataUrl?: string;
  timestamp: number;
}

export interface LabSolutionStep {
  title: string;
  detail: string;
  formulaLatex?: string;
}

export interface LabCasioStep {
  title: string;
  keys: string[];
  explanation: string;
}

export interface LabCommandSet {
  title: string;
  desmos2d: string[];
  geogebra3d: string[];
  notes: string;
  source: 'ai' | 'local';
  problemSummary?: string;
  solutionTitle?: string;
  solutionSteps?: LabSolutionStep[];
  finalResultLatex?: string;
  casioSteps?: LabCasioStep[];
}

export interface VisionLabResponse extends LabCommandSet {
  recognizedProblem: string;
  recommendedMode: '2d' | '3d';
}

export type FormulaMasteryStatus = 'unlearned' | 'reviewing' | 'mastered';

export interface CustomReminder {
  id: string;
  title: string;
  targetDate: string;
  priority: 'high' | 'medium' | 'normal';
  completed: boolean;
  createdAt: number;
}

export interface UserProgress {
  xp: number;
  streak: number;
  lastActiveDate: string;
  lastCompletedActivityDate?: string;
  completedChapterIds: string[];
  completedTopicKeys?: string[];
  lastStudiedChapterId?: string;
  gamesPlayed: number;
  questionsAnswered: number;
  questionsCorrect: number;
  millionaireUrl: string;
  dailyXp?: Record<string, number>;
  formulaMastery?: Record<string, FormulaMasteryStatus>;
  customReminders?: CustomReminder[];
  energy?: number;
  lastEnergyRefillDate?: string;
  lastComicRewardDate?: string;
}

export interface UserAccountProfile {
  id: string;
  uid?: string;
  email?: string;
  provider?: 'google' | 'facebook' | 'password';
  displayName: string;
  grade: GradeLevel;
  avatar: string;
  createdAt: number;
  updatedAt: number;
}

export interface DrawnShapeRecord {
  id: string;
  title: string;
  prompt: string;
  mode: '2d' | '3d';
  commandSet: LabCommandSet;
  timestamp: number;
}

export interface WrongQuestionEntry {
  id: string;
  questionKey: string;
  prompt: string;
  format: QuestionFormat;
  userAnswerText: string;
  correctAnswerText: string;
  explanation: string;
  chapterTitle: string;
  grade: string;
  wrongCount: number;
  lastWrongAt: number;
  mastered?: boolean;
}

export interface AccountWorkspaceData {
  profile: UserAccountProfile;
  progress: UserProgress;
  chatHistory: ChatMessage[];
  drawnHistory: DrawnShapeRecord[];
  wrongNotebook: WrongQuestionEntry[];
}

export interface AccountStoreState {
  activeAccountId: string | null;
  accounts: Record<string, AccountWorkspaceData>;
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  avatar: string;
  grade: GradeLevel;
  xp: number;
  streak: number;
  isCurrentUser?: boolean;
  rank: number;
}

export interface ExamSourceLink {
  title: string;
  uri: string;
}

export interface ExamPaper {
  id: string;
  title: string;
  subtitle: string;
  grade: GradeLevel;
  durationMinutes: number;
  sourceType: 'search' | 'ai' | 'local';
  searchQuery?: string;
  searchQueriesUsed?: string[];
  sources: ExamSourceLink[];
  questions: QuizQuestion[];
  modelUsed?: string;
  createdAt: number;
}

export interface ShuffledExamVariant {
  code: string;
  questions: QuizQuestion[];
  answerKey: {
    part1: Array<{ index: number; letter: string }>;
    part2: Array<{ index: number; answers: string }>;
    part3: Array<{ index: number; answer: string }>;
  };
}
