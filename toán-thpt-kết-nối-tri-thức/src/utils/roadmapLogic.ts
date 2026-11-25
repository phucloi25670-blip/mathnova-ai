import { ChapterData, FormulaMasteryStatus } from '../types';
import { getChapterRoadmapMeta } from '../data/roadmapMeta';

export interface ChapterRoadmapStatus {
  chapterId: string;
  isCompleted: boolean;
  isUnlocked: boolean;
  progressPct: number;
  completedTopicsCount: number;
  totalTopicsCount: number;
  masteredFormulasCount: number;
  totalFormulasCount: number;
}

export interface RoadmapOverviewStats {
  unlockedCount: number;
  completedChaptersCount: number;
  totalChaptersCount: number;
  masteredFormulasCount: number;
  totalFormulasCount: number;
  resumeChapter: ChapterData | null;
}

export function buildTopicKey(chapterId: string, topicIndex: number): string {
  return `${chapterId}::${topicIndex}`;
}

export function getChapterRoadmapStatus(
  chapter: ChapterData,
  indexInGrade: number,
  prevChapterCompleted: boolean,
  completedChapterIds: string[],
  completedTopicKeys: string[],
  formulaMastery: Record<string, FormulaMasteryStatus>
): ChapterRoadmapStatus {
  const meta = getChapterRoadmapMeta(chapter.id);
  const totalTopicsCount = meta.topics.length;
  let completedTopicsCount = 0;
  for (let i = 0; i < totalTopicsCount; i++) {
    if (completedTopicKeys.includes(buildTopicKey(chapter.id, i))) {
      completedTopicsCount += 1;
    }
  }

  const totalFormulasCount = chapter.formulas.length;
  const masteredFormulasCount = chapter.formulas.filter(
    (f) => formulaMastery[f.id] === 'mastered'
  ).length;

  const isCompleted = completedChapterIds.includes(chapter.id);
  const hasAnyProgress =
    isCompleted || completedTopicsCount > 0 || masteredFormulasCount > 0;
  const isUnlocked = indexInGrade === 0 || prevChapterCompleted || hasAnyProgress;

  let progressPct = 0;
  if (isCompleted) {
    progressPct = 100;
  } else {
    const totalUnits = totalTopicsCount + totalFormulasCount;
    if (totalUnits > 0) {
      progressPct = Math.round(
        ((completedTopicsCount + masteredFormulasCount) / totalUnits) * 100
      );
    }
  }

  return {
    chapterId: chapter.id,
    isCompleted,
    isUnlocked,
    progressPct,
    completedTopicsCount,
    totalTopicsCount,
    masteredFormulasCount,
    totalFormulasCount,
  };
}

export function computeRoadmapOverview(
  chapters: ChapterData[],
  completedChapterIds: string[],
  completedTopicKeys: string[],
  formulaMastery: Record<string, FormulaMasteryStatus>,
  lastStudiedChapterId?: string
): {
  overview: RoadmapOverviewStats;
  statuses: Record<string, ChapterRoadmapStatus>;
} {
  const statuses: Record<string, ChapterRoadmapStatus> = {};
  let unlockedCount = 0;
  let completedChaptersCount = 0;
  let masteredFormulasCount = 0;
  let totalFormulasCount = 0;

  chapters.forEach((chapter, idx) => {
    const prevCompleted =
      idx > 0 ? completedChapterIds.includes(chapters[idx - 1].id) : true;
    const st = buildStatusSafe(
      chapter,
      idx,
      prevCompleted,
      completedChapterIds,
      completedTopicKeys,
      formulaMastery
    );
    statuses[chapter.id] = st;
    if (st.isUnlocked) unlockedCount += 1;
    if (st.isCompleted) completedChaptersCount += 1;
    masteredFormulasCount += st.masteredFormulasCount;
    totalFormulasCount += st.totalFormulasCount;
  });

  // Determine best "Học tiếp bài đang dở" chapter:
  // 1. Explicitly lastStudiedChapterId if in current list and not completed
  // 2. First unlocked & partially started (progressPct > 0 && !isCompleted)
  // 3. First unlocked incomplete chapter
  // 4. First chapter in list
  const explicitLast = lastStudiedChapterId
    ? chapters.find(
        (c) => c.id === lastStudiedChapterId && !statuses[c.id]?.isCompleted
      )
    : undefined;

  const partialMatch = chapters.find(
    (c) => statuses[c.id]?.progressPct > 0 && !statuses[c.id]?.isCompleted
  );

  const firstIncompleteUnlocked = chapters.find(
    (c) => statuses[c.id]?.isUnlocked && !statuses[c.id]?.isCompleted
  );

  const resumeChapter =
    explicitLast ?? partialMatch ?? firstIncompleteUnlocked ?? chapters[0] ?? null;

  return {
    overview: {
      unlockedCount,
      completedChaptersCount,
      totalChaptersCount: chapters.length,
      masteredFormulasCount,
      totalFormulasCount,
      resumeChapter,
    },
    statuses,
  };
}

function buildStatusSafe(
  chapter: ChapterData,
  idx: number,
  prevCompleted: boolean,
  completedChapterIds: string[],
  completedTopicKeys: string[],
  formulaMastery: Record<string, FormulaMasteryStatus>
): ChapterRoadmapStatus {
  return getChapterRoadmapStatus(
    chapter,
    idx,
    prevCompleted,
    completedChapterIds,
    completedTopicKeys,
    formulaMastery
  );
}
