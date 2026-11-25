import { ChapterData, FormulaItem, GradeLevel } from '../types';

export const PROHIBITED_LEGACY_KEYWORDS = [
  'số phức',
  'so phuc',
  'môđun số phức',
  'phần ảo',
  'hệ phương trình bậc nhất 3 ẩn',
  'hệ 3 ẩn',
  'khối đa diện đều',
  'mặt nón',
  'mặt trụ',
  'mặt cầu ngoại tiếp khối đa diện',
  'tích phân từng phần',
  'tích phân đổi biến',
  'biến đổi tích thành tổng',
  'biến đổi tổng thành tích',
];

export function normalizeVietnamese(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterChaptersByGrade(
  chapters: ChapterData[],
  grade: GradeLevel
): ChapterData[] {
  if (grade === 'thpt') {
    // Ôn thi THPT focuses on all Grade 12 chapters plus high-weight Grade 10 & 11 chapters
    return chapters.filter(
      (ch) => ch.grade === '12' || ch.examWeight === 'high'
    );
  }
  return chapters.filter((ch) => ch.grade === grade);
}

export function searchFormulasInChapters(
  chapters: ChapterData[],
  query: string
): Array<{ chapter: ChapterData; formulas: FormulaItem[] }> {
  const normalizedQuery = normalizeVietnamese(query);
  if (!normalizedQuery) {
    return chapters.map((chapter) => ({
      chapter,
      formulas: chapter.formulas,
    }));
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return chapters
    .map((chapter) => {
      const chapterHaystack = normalizeVietnamese(
        `${chapter.title} ${chapter.summary}`
      );
      const chapterMatches = tokens.every((t) => chapterHaystack.includes(t));
      const chapterExact = chapterHaystack.includes(normalizedQuery);

      const matchedFormulas = chapter.formulas.filter((f) => {
        if (chapterMatches) return true;
        const formulaHaystack = normalizeVietnamese(
          `${f.title} ${f.description} ${f.practicalNote ?? ''} ${f.latex}`
        );
        return tokens.every((t) => formulaHaystack.includes(t));
      });

      const hasExactFormula = matchedFormulas.some((f) =>
        normalizeVietnamese(`${f.title} ${f.description}`).includes(normalizedQuery)
      );

      return {
        chapter,
        formulas: matchedFormulas,
        score: (chapterExact ? 2 : 0) + (hasExactFormula ? 1 : 0),
      };
    })
    .filter((entry) => entry.formulas.length > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ chapter, formulas }) => ({ chapter, formulas }));
}

export function hasProhibitedLegacyTopic(text: string): boolean {
  const normalized = normalizeVietnamese(text);
  const rawLower = text.toLowerCase();
  return PROHIBITED_LEGACY_KEYWORDS.some((kw) => {
    const normKw = normalizeVietnamese(kw);
    return rawLower.includes(kw) || normalized.includes(normKw);
  });
}
