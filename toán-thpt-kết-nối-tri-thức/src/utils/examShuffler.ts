import {
  ChapterData,
  ExamPaper,
  GradeLevel,
  QuestionFormat,
  QuizQuestion,
  ShuffledExamVariant,
  TrueFalseStatement,
} from '../types';
import { SEED_QUESTIONS } from '../data/seedQuestions';
import { fisherYatesShuffle } from './antiRepetition';
import { isShortAnswerCorrect, scoreTrueFalseStatements } from './gameLogic';
import { generateProceduralChapterQuestions } from './proceduralQuiz';

const LEGACY_TOPIC_PATTERNS: RegExp[] = [
  /số\s*phức/i,
  /phần\s*ảo/i,
  /phần\s*thực\s*của\s*số\s*phức/i,
  /liên\s*hợp\s*của\s*z/i,
  /mô\s*-?\s*đun\s*của\s*số\s*phức/i,
  /\bi\^2\s*=\s*-1\b/i,
  /\bz\s*=\s*[a-z0-9+\-]+\s*[+-]\s*[a-z0-9]*i\b/i,
  /\b\bar\{?z\}?\b/,
];

export function containsLegacyCurriculumContent(text: string): boolean {
  if (!text) return false;
  return LEGACY_TOPIC_PATTERNS.some((rx) => rx.test(text));
}

export function normalizeMathDelimiters(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner: string) => `$${inner.trim()}$`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => `$$${inner.trim()}$$`)
    .trim();
}

function stripOptionPrefix(text: string): string {
  return normalizeMathDelimiters(text).replace(/^[A-Da-d][.)]\s+/, '').trim();
}

function resolveMcCorrectIndex(
  rawCorrectIndex: unknown,
  rawCorrectAnswer: unknown,
  options: string[]
): number {
  if (
    typeof rawCorrectIndex === 'number' &&
    Number.isInteger(rawCorrectIndex) &&
    rawCorrectIndex >= 0 &&
    rawCorrectIndex < options.length
  ) {
    return rawCorrectIndex;
  }

  if (typeof rawCorrectAnswer === 'string') {
    const trimmed = rawCorrectAnswer.trim().toUpperCase();
    const letterIdx = ['A', 'B', 'C', 'D'].indexOf(trimmed.charAt(0));
    if (letterIdx !== -1 && (trimmed.length === 1 || /^[A-D][.)]/.test(trimmed))) {
      return letterIdx;
    }
    const matchedOpt = options.findIndex(
      (o) => o.toLowerCase() === stripOptionPrefix(rawCorrectAnswer).toLowerCase()
    );
    if (matchedOpt !== -1) return matchedOpt;
  }

  return 0;
}

export function normalizeRawQuestions(
  rawList: unknown[],
  fallbackGrade: GradeLevel = '12',
  fallbackChapterTitle = 'Tổng hợp GDPT 2018'
): QuizQuestion[] {
  if (!Array.isArray(rawList)) return [];

  const gradeTag: '10' | '11' | '12' =
    fallbackGrade === '10' || fallbackGrade === '11' || fallbackGrade === '12'
      ? fallbackGrade
      : '12';

  const result: QuizQuestion[] = [];

  rawList.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const raw = item as Record<string, unknown>;

    const prompt = normalizeMathDelimiters(String(raw.prompt ?? ''));
    const explanation = normalizeMathDelimiters(
      String(raw.explanation ?? 'Áp dụng công thức chuẩn chương trình GDPT 2018.')
    );
    if (!prompt) return;

    const rawFormat = String(raw.format ?? 'multiple_choice').trim().toLowerCase();
    let format: QuestionFormat = 'multiple_choice';
    if (rawFormat === 'true_false' || rawFormat === 'true-false') {
      format = 'true_false';
    } else if (rawFormat === 'short_answer' || rawFormat === 'short-answer') {
      format = 'short_answer';
    }

    const qGradeRaw = String(raw.grade ?? gradeTag);
    const qGrade: '10' | '11' | '12' =
      qGradeRaw === '10' || qGradeRaw === '11' || qGradeRaw === '12'
        ? qGradeRaw
        : gradeTag;

    const chapterTitle =
      typeof raw.chapterTitle === 'string' && raw.chapterTitle.trim()
        ? raw.chapterTitle.trim()
        : fallbackChapterTitle;

    if (format === 'multiple_choice') {
      const rawOptions = Array.isArray(raw.options)
        ? raw.options.map((o) => stripOptionPrefix(String(o ?? ''))).filter(Boolean)
        : [];
      if (rawOptions.length < 2) return;
      while (rawOptions.length < 4) {
        rawOptions.push(`Phương án ${rawOptions.length + 1}`);
      }
      const options = rawOptions.slice(0, 4);
      const correctIndex = resolveMcCorrectIndex(
        raw.correctIndex,
        raw.correctAnswer,
        options
      );

      const combinedText = [prompt, explanation, ...options].join(' ');
      if (containsLegacyCurriculumContent(combinedText)) return;

      result.push({
        id: String(raw.id || `exam-mc-${Date.now()}-${idx}`),
        grade: qGrade,
        chapterId: String(raw.chapterId || 'exam-custom'),
        chapterTitle,
        format: 'multiple_choice',
        prompt,
        options,
        correctIndex,
        explanation,
        isRealWorld: Boolean(raw.isRealWorld),
      });
      return;
    }

    if (format === 'true_false') {
      const rawStatements = Array.isArray(raw.statements) ? raw.statements : [];
      const ids: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];
      const statements: TrueFalseStatement[] = rawStatements
        .slice(0, 4)
        .map((st, sIdx) => {
          const obj = (st && typeof st === 'object' ? st : {}) as Record<string, unknown>;
          const text = normalizeMathDelimiters(String(obj.text ?? ''))
            .replace(/^[a-dA-D][.)]\s+/, '')
            .trim();
          return {
            id: ids[sIdx] ?? 'a',
            text,
            isTrue: Boolean(obj.isTrue),
          };
        })
        .filter((st) => st.text.length > 0);

      if (statements.length < 4) return;
      const combinedText = [
        prompt,
        explanation,
        ...statements.map((s) => s.text),
      ].join(' ');
      if (containsLegacyCurriculumContent(combinedText)) return;

      result.push({
        id: String(raw.id || `exam-tf-${Date.now()}-${idx}`),
        grade: qGrade,
        chapterId: String(raw.chapterId || 'exam-custom'),
        chapterTitle,
        format: 'true_false',
        prompt,
        statements,
        explanation,
        isRealWorld: Boolean(raw.isRealWorld),
      });
      return;
    }

    // short_answer
    const shortAnswer = String(raw.shortAnswer ?? '')
      .replace(/^\$+|\$+$/g, '')
      .trim();
    if (!shortAnswer) return;
    const combinedText = [prompt, explanation, shortAnswer].join(' ');
    if (containsLegacyCurriculumContent(combinedText)) return;

    result.push({
      id: String(raw.id || `exam-sa-${Date.now()}-${idx}`),
      grade: qGrade,
      chapterId: String(raw.chapterId || 'exam-custom'),
      chapterTitle,
      format: 'short_answer',
      prompt,
      shortAnswer,
      explanation,
      isRealWorld: Boolean(raw.isRealWorld),
    });
  });

  return result;
}

export function partitionExamQuestions(questions: QuizQuestion[]): {
  part1: QuizQuestion[];
  part2: QuizQuestion[];
  part3: QuizQuestion[];
  ordered: QuizQuestion[];
} {
  const part1 = questions.filter((q) => q.format === 'multiple_choice');
  const part2 = questions.filter((q) => q.format === 'true_false');
  const part3 = questions.filter((q) => q.format === 'short_answer');
  return {
    part1,
    part2,
    part3,
    ordered: [...part1, ...part2, ...part3],
  };
}

// Supplementary verified GDPT 2018 True/False & Short Answer pool for offline exams
const EXTRA_TF_SA_BANK: QuizQuestion[] = [
  {
    id: 'extra-12-tf-1',
    grade: '12',
    chapterId: '12-c1',
    chapterTitle: 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
    format: 'true_false',
    isRealWorld: false,
    prompt: 'Cho hàm số $y = x^3 - 3x^2 + 2$. Xét tính đúng/sai của các khẳng định sau:',
    statements: [
      { id: 'a', text: 'Đạo hàm của hàm số là $y\' = 3x^2 - 6x$.', isTrue: true },
      { id: 'b', text: 'Hàm số nghịch biến trên khoảng $(0; 2)$.', isTrue: true },
      { id: 'c', text: 'Giá trị cực đại của hàm số bằng $4$.', isTrue: false },
      { id: 'd', text: 'Đồ thị hàm số có điểm uốn tại $I(1; 0)$.', isTrue: true },
    ],
    explanation: '$y\' = 3x^2 - 6x = 0 \\Leftrightarrow x = 0$ hoặc $x = 2$. Hàm đạt cực đại tại $x=0$ với $y_{CĐ}=2$, cực tiểu tại $x=2$ với $y_{CT}=-2$.',
  },
  {
    id: 'extra-12-tf-2',
    grade: '12',
    chapterId: '12-c5',
    chapterTitle: 'Phương pháp tọa độ trong không gian',
    format: 'true_false',
    isRealWorld: false,
    prompt: 'Trong không gian $Oxyz$, cho mặt phẳng $(P): 2x - y + 2z - 6 = 0$ và điểm $M(1; 2; 3)$. Xét các khẳng định:',
    statements: [
      { id: 'a', text: 'Một vectơ pháp tuyến của $(P)$ là $\\vec{n} = (2; -1; 2)$.', isTrue: true },
      { id: 'b', text: 'Điểm $M(1; 2; 3)$ nằm trên mặt phẳng $(P)$.', isTrue: true },
      { id: 'c', text: 'Khoảng cách từ gốc tọa độ $O(0;0;0)$ đến $(P)$ bằng $3$.', isTrue: false },
      { id: 'd', text: 'Mặt phẳng $(P)$ cắt trục $Oz$ tại điểm có cao độ bằng $3$.', isTrue: true },
    ],
    explanation: 'Thay $M(1;2;3)$: $2(1)-2+2(3)-6 = 0$ nên $M \\in (P)$. Khoảng cách $d(O, (P)) = \\frac{|-6|}{\\sqrt{4+1+4}} = 2$.',
  },
  {
    id: 'extra-12-sa-1',
    grade: '12',
    chapterId: '12-c4',
    chapterTitle: 'Nguyên hàm và tích phân',
    format: 'short_answer',
    isRealWorld: false,
    prompt: 'Tính diện tích hình phẳng giới hạn bởi parabol $y = x^2$, trục hoành và hai đường thẳng $x = 0$, $x = 3$.',
    shortAnswer: '9',
    explanation: '$S = \\int_0^3 x^2\\,dx = \\left[\\frac{x^3}{3}\\right]_0^3 = 9$.',
  },
  {
    id: 'extra-12-sa-2',
    grade: '12',
    chapterId: '12-c5',
    chapterTitle: 'Phương pháp tọa độ trong không gian',
    format: 'short_answer',
    isRealWorld: false,
    prompt: 'Trong không gian $Oxyz$, tính bán kính $R$ của mặt cầu $(S): (x - 1)^2 + (y + 2)^2 + (z - 4)^2 = 36$.',
    shortAnswer: '6',
    explanation: 'Phương trình mặt cầu có dạng $(x-a)^2+(y-b)^2+(z-c)^2 = R^2$, suy ra $R = \\sqrt{36} = 6$.',
  },
  {
    id: 'extra-12-sa-3',
    grade: '12',
    chapterId: '12-c3',
    chapterTitle: 'Các số đặc trưng đo mức độ phân tán cho mẫu số liệu ghép nhóm',
    format: 'short_answer',
    isRealWorld: true,
    prompt: 'Cho mẫu số liệu ghép nhóm có tứ phân vị thứ nhất $Q_1 = 14{,}5$ và tứ phân vị thứ ba $Q_3 = 22{,}5$. Khoảng tứ phân vị $\\Delta_Q$ bằng bao nhiêu?',
    shortAnswer: '8',
    explanation: 'Khoảng tứ phân vị $\\Delta_Q = Q_3 - Q_1 = 22{,}5 - 14{,}5 = 8$.',
  },
  {
    id: 'extra-12-sa-4',
    grade: '12',
    chapterId: '12-c2',
    chapterTitle: 'Vectơ và hệ trục tọa độ trong không gian',
    format: 'short_answer',
    isRealWorld: false,
    prompt: 'Trong không gian $Oxyz$, cho $\\vec{a} = (2; -1; 3)$ và $\\vec{b} = (1; 4; -2)$. Tích vô hướng $\\vec{a}\\cdot\\vec{b}$ bằng bao nhiêu?',
    shortAnswer: '-8',
    explanation: '$\\vec{a}\\cdot\\vec{b} = 2\\cdot 1 + (-1)\\cdot 4 + 3\\cdot(-2) = 2 - 4 - 6 = -8$.',
  },
  {
    id: 'extra-12-sa-5',
    grade: '12',
    chapterId: '12-c1',
    chapterTitle: 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
    format: 'short_answer',
    isRealWorld: false,
    prompt: 'Giá trị lớn nhất của hàm số $y = -x^2 + 4x + 5$ trên đoạn $[0; 3]$ bằng bao nhiêu?',
    shortAnswer: '9',
    explanation: '$y\' = -2x + 4 = 0 \\Leftrightarrow x = 2 \\in [0;3]$. Tính $y(0)=5$, $y(2)=9$, $y(3)=8 \\Rightarrow \\max = 9$.',
  },
  {
    id: 'extra-11-tf-1',
    grade: '11',
    chapterId: '11-c7',
    chapterTitle: 'Quan hệ vuông góc trong không gian',
    format: 'true_false',
    isRealWorld: false,
    prompt: 'Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình vuông cạnh $a$, $SA \\perp (ABCD)$ và $SA = a\\sqrt{3}$. Xét tính đúng/sai:',
    statements: [
      { id: 'a', text: 'Đường thẳng $SA$ vuông góc với đường thẳng $BC$.', isTrue: true },
      { id: 'b', text: 'Đường thẳng $BD$ vuông góc với mặt phẳng $(SAC)$.', isTrue: true },
      { id: 'c', text: 'Góc giữa đường thẳng $SC$ và mặt phẳng $(ABCD)$ bằng $60^\\circ$.', isTrue: false },
      { id: 'd', text: 'Thể tích khối chóp $S.ABCD$ là $V = \\frac{a^3\\sqrt{3}}{3}$.', isTrue: true },
    ],
    explanation: '$AC = a\\sqrt{2} \\Rightarrow \\tan\\widehat{SCA} = \\frac{SA}{AC} = \\frac{\\sqrt{3}}{\\sqrt{2}}$. Thể tích $V = \\frac{1}{3}a^2\\cdot a\\sqrt{3} = \\frac{a^3\\sqrt{3}}{3}$.',
  },
  {
    id: 'extra-11-sa-1',
    grade: '11',
    chapterId: '11-c2',
    chapterTitle: 'Dãy số, cấp số cộng và cấp số nhân',
    format: 'short_answer',
    isRealWorld: false,
    prompt: 'Cho cấp số nhân $(u_n)$ có $u_1 = 3$ và công bội $q = 2$. Tính tổng $S_4$ của $4$ số hạng đầu tiên.',
    shortAnswer: '45',
    explanation: '$S_4 = 3\\cdot\\frac{2^4 - 1}{2 - 1} = 3\\cdot 15 = 45$.',
  },
  {
    id: 'extra-11-sa-2',
    grade: '11',
    chapterId: '11-c9',
    chapterTitle: 'Đạo hàm',
    format: 'short_answer',
    isRealWorld: false,
    prompt: 'Hệ số góc của tiếp tuyến đồ thị hàm số $y = x^3 - 2x + 1$ tại điểm có hoành độ $x_0 = 2$ bằng bao nhiêu?',
    shortAnswer: '10',
    explanation: '$y\' = 3x^2 - 2 \\Rightarrow k = y\'(2) = 3(4) - 2 = 10$.',
  },
  {
    id: 'extra-10-tf-1',
    grade: '10',
    chapterId: '10-c6',
    chapterTitle: 'Hàm số, đồ thị và ứng dụng',
    format: 'true_false',
    isRealWorld: false,
    prompt: 'Cho hàm số bậc hai $y = x^2 - 4x + 3$. Xét tính đúng/sai của các khẳng định sau:',
    statements: [
      { id: 'a', text: 'Đỉnh của parabol là $I(2; -1)$.', isTrue: true },
      { id: 'b', text: 'Trục đối xứng của đồ thị là đường thẳng $x = 2$.', isTrue: true },
      { id: 'c', text: 'Hàm số đồng biến trên khoảng $(-\\infty; 2)$.', isTrue: false },
      { id: 'd', text: 'Đồ thị cắt trục hoành tại hai điểm $x = 1$ và $x = 3$.', isTrue: true },
    ],
    explanation: 'Với $a = 1 > 0$, parabol quay bề lõm lên trên nên đồng biến trên $(2; +\\infty)$ và nghịch biến trên $(-\\infty; 2)$.',
  },
  {
    id: 'extra-10-sa-1',
    grade: '10',
    chapterId: '10-c7',
    chapterTitle: 'Phương pháp tọa độ trong mặt phẳng',
    format: 'short_answer',
    isRealWorld: false,
    prompt: 'Trong mặt phẳng $Oxy$, khoảng cách từ điểm $M(3; 4)$ đến đường thẳng $\\Delta: 3x + 4y - 5 = 0$ bằng bao nhiêu?',
    shortAnswer: '4',
    explanation: '$d(M, \\Delta) = \\frac{|3\\cdot 3 + 4\\cdot 4 - 5|}{\\sqrt{3^2 + 4^2}} = \\frac{20}{5} = 4$.',
  },
  {
    id: 'extra-10-sa-2',
    grade: '10',
    chapterId: '10-c8',
    chapterTitle: 'Đại số tổ hợp',
    format: 'short_answer',
    isRealWorld: true,
    prompt: 'Một tổ có $6$ học sinh nam và $4$ học sinh nữ. Có bao nhiêu cách chọn ra một ban đại diện gồm $3$ học sinh sao cho có đúng $2$ nam và $1$ nữ?',
    shortAnswer: '60',
    explanation: 'Số cách chọn là $C_6^2 \\cdot C_4^1 = 15 \\cdot 4 = 60$ cách.',
  },
];

function buildProceduralShortAnswerBank(
  chapters: ChapterData[],
  count: number,
  rng: () => number
): QuizQuestion[] {
  const created: QuizQuestion[] = [];
  if (chapters.length === 0 || count <= 0) return created;

  // Use procedural MCQ items whose correct option is a clean pure number like "$45$"
  const candidates: QuizQuestion[] = [];
  chapters.forEach((ch) => {
    const generated = generateProceduralChapterQuestions(ch, 8, rng);
    generated.forEach((q) => {
      if (q.format !== 'multiple_choice' || !q.options || typeof q.correctIndex !== 'number') {
        return;
      }
      const correctOpt = q.options[q.correctIndex] || '';
      const rawNum = correctOpt.replace(/^\$+|\$+$/g, '').trim();
      if (/^[+-]?\d+([.,]\d+)?$/.test(rawNum)) {
        candidates.push({
          ...q,
          id: `sa-${q.id}`,
          format: 'short_answer',
          prompt: `${q.prompt.replace(/:\s*$/, '')}. (Nhập kết quả bằng số)`,
          shortAnswer: rawNum.replace(/,/g, '.'),
          options: undefined,
          correctIndex: undefined,
        });
      }
    });
  });

  return fisherYatesShuffle(candidates, rng).slice(0, count);
}

export function buildLocalCurriculumExam(params: {
  grade: GradeLevel;
  chapters: ChapterData[];
  selectedChapterIds?: string[];
  mcCount: number;
  tfCount: number;
  saCount: number;
  durationMinutes: number;
  rng?: () => number;
}): ExamPaper {
  const rng = params.rng ?? Math.random;
  const targetChapters =
    params.selectedChapterIds && params.selectedChapterIds.length > 0
      ? params.chapters.filter((c) => params.selectedChapterIds!.includes(c.id))
      : params.chapters;
  const activeChapters = targetChapters.length > 0 ? targetChapters : params.chapters;

  const allowedGrades: Array<'10' | '11' | '12'> =
    params.grade === 'thpt' ? ['10', '11', '12'] : [params.grade];

  const allTfAndSaPool = [...SEED_QUESTIONS, ...EXTRA_TF_SA_BANK];

  // 1. Part I: Multiple Choice (round-robin across chapters for maximum topic diversity)
  const seedMcPool = fisherYatesShuffle(
    SEED_QUESTIONS.filter(
      (q) =>
        q.format === 'multiple_choice' &&
        allowedGrades.includes(q.grade) &&
        (activeChapters.length === params.chapters.length ||
          activeChapters.some((c) => c.id === q.chapterId))
    ),
    rng
  );
  const perChapterQueues = fisherYatesShuffle(activeChapters, rng).map((ch) =>
    fisherYatesShuffle(generateProceduralChapterQuestions(ch, 6, rng), rng)
  );
  const roundRobinProc: QuizQuestion[] = [];
  let roundIdx = 0;
  while (roundRobinProc.length < params.mcCount + 6 && roundIdx < 6) {
    for (const qList of perChapterQueues) {
      if (qList[roundIdx]) {
        roundRobinProc.push(qList[roundIdx]);
      }
    }
    roundIdx += 1;
  }

  const seenPrompts = new Set<string>();
  const part1: QuizQuestion[] = [];
  for (const q of [...seedMcPool.slice(0, Math.min(2, seedMcPool.length)), ...roundRobinProc]) {
    if (part1.length >= params.mcCount) break;
    const key = q.prompt.trim();
    if (seenPrompts.has(key)) continue;
    seenPrompts.add(key);
    part1.push(q);
  }

  // 2. Part II: True/False
  const matchingTf = allTfAndSaPool.filter(
    (q) =>
      q.format === 'true_false' &&
      allowedGrades.includes(q.grade) &&
      (activeChapters.length === params.chapters.length ||
        activeChapters.some((c) => c.id === q.chapterId))
  );
  const fallbackTf = allTfAndSaPool.filter(
    (q) => q.format === 'true_false' && allowedGrades.includes(q.grade)
  );
  const globalTf = allTfAndSaPool.filter((q) => q.format === 'true_false');
  const tfPool =
    matchingTf.length >= params.tfCount
      ? matchingTf
      : [...matchingTf, ...fallbackTf, ...globalTf];

  const part2: QuizQuestion[] = [];
  const usedTfIds = new Set<string>();
  for (const q of fisherYatesShuffle(tfPool, rng)) {
    if (part2.length >= params.tfCount) break;
    if (usedTfIds.has(q.id)) continue;
    usedTfIds.add(q.id);
    part2.push(q);
  }

  // 3. Part III: Short Answer
  const matchingSa = allTfAndSaPool.filter(
    (q) =>
      q.format === 'short_answer' &&
      allowedGrades.includes(q.grade) &&
      (activeChapters.length === params.chapters.length ||
        activeChapters.some((c) => c.id === q.chapterId))
  );
  const procSa = buildProceduralShortAnswerBank(activeChapters, params.saCount + 4, rng);
  const fallbackSa = allTfAndSaPool.filter(
    (q) => q.format === 'short_answer' && allowedGrades.includes(q.grade)
  );
  const globalSa = allTfAndSaPool.filter((q) => q.format === 'short_answer');

  const part3: QuizQuestion[] = [];
  const usedSaPrompts = new Set<string>();
  for (const q of fisherYatesShuffle(
    [...matchingSa, ...procSa, ...fallbackSa, ...globalSa],
    rng
  )) {
    if (part3.length >= params.saCount) break;
    const key = q.prompt.trim();
    if (usedSaPrompts.has(key)) continue;
    usedSaPrompts.add(key);
    part3.push(q);
  }

  const gradeTitle =
    params.grade === 'thpt' ? 'Ôn thi Tốt nghiệp THPT' : `Toán Lớp ${params.grade}`;

  return {
    id: `exam-local-${Date.now()}`,
    title: `Đề Kiểm Tra Chuẩn GDPT 2018 — ${gradeTitle}`,
    subtitle:
      activeChapters.length <= 2
        ? activeChapters.map((c) => c.title).join(' · ')
        : `SGK Kết nối tri thức với cuộc sống (${activeChapters.length} chuyên đề)`,
    grade: params.grade,
    durationMinutes: params.durationMinutes,
    sourceType: 'local',
    sources: [],
    questions: [...part1, ...part2, ...part3],
    createdAt: Date.now(),
  };
}

export function generateShuffledExamVariants(
  exam: ExamPaper,
  variantCount: number,
  startCode = 101,
  rng: () => number = Math.random
): ShuffledExamVariant[] {
  const safeCount = Math.max(1, Math.min(8, Math.floor(variantCount)));
  const { part1, part2, part3 } = partitionExamQuestions(exam.questions);
  const variants: ShuffledExamVariant[] = [];

  for (let v = 0; v < safeCount; v++) {
    const code = String(startCode + v);

    // 1. Shuffle Part I questions and their 4 options
    const shuffledP1 = fisherYatesShuffle(part1, rng).map((q) => {
      const origOpts = q.options && q.options.length === 4 ? q.options : ['', '', '', ''];
      const origCorrectIdx =
        typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < 4
          ? q.correctIndex
          : 0;
      const tagged = origOpts.map((text, idx) => ({
        text,
        isCorrect: idx === origCorrectIdx,
      }));
      const mixed = fisherYatesShuffle(tagged, rng);
      const newCorrectIdx = mixed.findIndex((item) => item.isCorrect);
      return {
        ...q,
        options: mixed.map((m) => m.text),
        correctIndex: newCorrectIdx >= 0 ? newCorrectIdx : 0,
      };
    });

    // 2. Shuffle Part II questions and their a/b/c/d statements
    const shuffledP2 = fisherYatesShuffle(part2, rng).map((q) => {
      const origStmts = q.statements || [];
      const mixedStmts = fisherYatesShuffle(origStmts, rng).map((st, sIdx) => ({
        ...st,
        id: (['a', 'b', 'c', 'd'][sIdx] ?? 'a') as 'a' | 'b' | 'c' | 'd',
      }));
      return {
        ...q,
        statements: mixedStmts,
      };
    });

    // 3. Shuffle Part III questions
    const shuffledP3 = fisherYatesShuffle(part3, rng).map((q) => ({ ...q }));

    const answerKey = {
      part1: shuffledP1.map((q, idx) => ({
        index: idx + 1,
        letter: ['A', 'B', 'C', 'D'][q.correctIndex ?? 0] ?? 'A',
      })),
      part2: shuffledP2.map((q, idx) => ({
        index: idx + 1,
        answers: (q.statements || [])
          .map((st) => `${st.id}:${st.isTrue ? 'Đ' : 'S'}`)
          .join(' · '),
      })),
      part3: shuffledP3.map((q, idx) => ({
        index: idx + 1,
        answer: q.shortAnswer || '—',
      })),
    };

    variants.push({
      code,
      questions: [...shuffledP1, ...shuffledP2, ...shuffledP3],
      answerKey,
    });
  }

  return variants;
}

export interface ExamUserAnswers {
  mc: Record<string, number | undefined>;
  tf: Record<string, Record<'a' | 'b' | 'c' | 'd', boolean | null>>;
  sa: Record<string, string>;
}

export interface ExamQuestionGradeResult {
  questionId: string;
  format: QuestionFormat;
  earnedPoints: number;
  maxPoints: number;
  isFullyCorrect: boolean;
  userAnswerText: string;
  correctAnswerText: string;
}

export interface ExamGradeSummary {
  score10: number;
  rawEarned: number;
  rawMax: number;
  mcCorrect: number;
  mcTotal: number;
  tfPoints: number;
  tfMaxPoints: number;
  saCorrect: number;
  saTotal: number;
  xpEarned: number;
  results: Record<string, ExamQuestionGradeResult>;
}

export function gradeExamSubmission(
  questions: QuizQuestion[],
  answers: ExamUserAnswers
): ExamGradeSummary {
  let rawEarned = 0;
  let rawMax = 0;
  let mcCorrect = 0;
  let mcTotal = 0;
  let tfPoints = 0;
  let tfMaxPoints = 0;
  let saCorrect = 0;
  let saTotal = 0;

  const results: Record<string, ExamQuestionGradeResult> = {};

  for (const q of questions) {
    if (q.format === 'multiple_choice') {
      mcTotal += 1;
      rawMax += 0.25;
      const chosen = answers.mc[q.id];
      const correctIdx = q.correctIndex ?? 0;
      const ok = chosen === correctIdx;
      const earned = ok ? 0.25 : 0;
      if (ok) mcCorrect += 1;
      rawEarned += earned;

      const letters = ['A', 'B', 'C', 'D'];
      const userAnswerText =
        typeof chosen === 'number' && q.options?.[chosen]
          ? `${letters[chosen]}. ${q.options[chosen]}`
          : 'Chưa trả lời';
      const correctAnswerText = q.options?.[correctIdx]
        ? `${letters[correctIdx]}. ${q.options[correctIdx]}`
        : letters[correctIdx] || 'A';

      results[q.id] = {
        questionId: q.id,
        format: q.format,
        earnedPoints: earned,
        maxPoints: 0.25,
        isFullyCorrect: ok,
        userAnswerText,
        correctAnswerText,
      };
    } else if (q.format === 'true_false') {
      const statements = q.statements || [];
      tfMaxPoints += 1.0;
      rawMax += 1.0;
      const userTf = answers.tf[q.id] ?? { a: null, b: null, c: null, d: null };
      const { correctCount, points } = scoreTrueFalseStatements(statements, userTf);
      tfPoints += points;
      rawEarned += points;

      const userAnswerText = statements
        .map((st) => {
          const val = userTf[st.id];
          return `${st.id}) ${val === null ? '?' : val ? 'Đúng' : 'Sai'}`;
        })
        .join(' | ');
      const correctAnswerText = statements
        .map((st) => `${st.id}) ${st.isTrue ? 'Đúng' : 'Sai'}`)
        .join(' | ');

      results[q.id] = {
        questionId: q.id,
        format: q.format,
        earnedPoints: points,
        maxPoints: 1.0,
        isFullyCorrect: correctCount === statements.length,
        userAnswerText,
        correctAnswerText,
      };
    } else {
      saTotal += 1;
      rawMax += 0.5;
      const rawInput = answers.sa[q.id] || '';
      const expected = q.shortAnswer || '';
      const ok = isShortAnswerCorrect(rawInput, expected);
      const earned = ok ? 0.5 : 0;
      if (ok) saCorrect += 1;
      rawEarned += earned;

      results[q.id] = {
        questionId: q.id,
        format: q.format,
        earnedPoints: earned,
        maxPoints: 0.5,
        isFullyCorrect: ok,
        userAnswerText: rawInput.trim() || 'Chưa trả lời',
        correctAnswerText: expected,
      };
    }
  }

  const score10 =
    rawMax > 0 ? Math.round(((rawEarned / rawMax) * 10) * 100) / 100 : 0;
  const xpEarned = Math.max(15, Math.round(score10 * 18));

  return {
    score10,
    rawEarned: Math.round(rawEarned * 100) / 100,
    rawMax: Math.round(rawMax * 100) / 100,
    mcCorrect,
    mcTotal,
    tfPoints: Math.round(tfPoints * 100) / 100,
    tfMaxPoints,
    saCorrect,
    saTotal,
    xpEarned,
    results,
  };
}
