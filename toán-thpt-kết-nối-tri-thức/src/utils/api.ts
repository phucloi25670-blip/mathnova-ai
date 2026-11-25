import { ChatMessage, ExamSourceLink, GradeLevel, LabCommandSet, MatchPair, QuizQuestion, VisionLabResponse } from '../types';
import { DiversitySeed } from './antiRepetition';
import { safeParseJsonResponse } from './jsonUtils';
import { FALLBACK_STATUS_MESSAGE } from './modelFallback';

const API_KEY_STORAGE_KEY = 'toanthpt_gemini_api_key';
export const CLIENT_GEMINI_MODEL = 'gemini-3.8-flash';

export function getSavedApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const customKey = getSavedApiKey();
  if (customKey) {
    headers['x-gemini-api-key'] = customKey;
  }
  return headers;
}

interface NdjsonStatusEvent<T> {
  type: 'status' | 'result' | 'error';
  message?: string;
  modelTrying?: string;
  data?: T;
  error?: string;
}

/**
 * Calls a backend Gemini endpoint using NDJSON status streaming (`streamStatus: true`)
 * so that when the primary model hits HTTP 503 / 429 and server jumps along
 * MODEL_FALLBACK_CHAIN, the UI immediately displays the friendly status message
 * ('Đang kết nối máy chủ dự phòng siêu tốc...') instead of any error alert.
 */
async function fetchNdjsonWithStatus<T>(
  url: string,
  body: Record<string, unknown>,
  fallbackErrorLabel: string,
  onFallbackStatus?: (message: string) => void
): Promise<T> {
  const sendRequest = () =>
    fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ ...body, streamStatus: true }),
    });

  let res = await sendRequest();

  // Defense-in-depth: if an upstream proxy returned 503/429 before reaching NDJSON stream,
  // show friendly fallback status and automatically retry once.
  if (res.status === 503 || res.status === 429) {
    onFallbackStatus?.(FALLBACK_STATUS_MESSAGE);
    res = await sendRequest();
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/x-ndjson') || !res.body) {
    return await safeParseJsonResponse<T>(res, fallbackErrorLabel);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let resultData: T | undefined;
  let hasResult = false;

  const processLine = (rawLine: string) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    let evt: NdjsonStatusEvent<T>;
    try {
      evt = JSON.parse(trimmed) as NdjsonStatusEvent<T>;
    } catch {
      return;
    }

    if (evt.type === 'status') {
      onFallbackStatus?.(evt.message || FALLBACK_STATUS_MESSAGE);
      return;
    }
    if (evt.type === 'error') {
      throw new Error(evt.error || fallbackErrorLabel);
    }
    if (evt.type === 'result') {
      resultData = evt.data as T;
      hasResult = true;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      processLine(line);
    }
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  if (!hasResult) {
    throw new Error(fallbackErrorLabel);
  }

  return resultData as T;
}

export async function fetchHealthStatus(): Promise<{
  ok: boolean;
  hasServerKey: boolean;
  fallbackModels?: string[];
}> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return { ok: false, hasServerKey: false };
    return await safeParseJsonResponse<{
      ok: boolean;
      hasServerKey: boolean;
      fallbackModels?: string[];
    }>(res, 'Health check failed');
  } catch {
    return { ok: false, hasServerKey: false };
  }
}

export async function generateGameQuestionsApi(params: {
  grade: GradeLevel;
  chapterTitle: string;
  gameType: 'sprint' | 'challenge' | 'obstacle' | 'quick_30s';
  count?: number;
  seenQuestions?: string[];
  diversitySeeds?: DiversitySeed[];
  onFallbackStatus?: (message: string) => void;
}): Promise<QuizQuestion[]> {
  const { onFallbackStatus, ...payload } = params;
  const data = await fetchNdjsonWithStatus<{ questions?: QuizQuestion[] }>(
    '/api/gemini/generate-game',
    payload,
    'Không thể tạo câu hỏi AI.',
    onFallbackStatus
  );
  return data.questions || [];
}

export async function generateMatchingPairsApi(params: {
  grade: GradeLevel;
  chapterTitle: string;
  count?: number;
  seenQuestions?: string[];
  diversitySeeds?: DiversitySeed[];
  onFallbackStatus?: (message: string) => void;
}): Promise<MatchPair[]> {
  const { onFallbackStatus, ...payload } = params;
  const data = await fetchNdjsonWithStatus<{ pairs?: MatchPair[] }>(
    '/api/gemini/generate-game',
    { ...payload, gameType: 'matching' },
    'Không thể tạo cặp thẻ công thức AI.',
    onFallbackStatus
  );
  return data.pairs || [];
}

export async function sendTutorMessageApi(params: {
  grade: GradeLevel;
  messages: Array<Pick<ChatMessage, 'role' | 'content' | 'imageDataUrl'>>;
}): Promise<string> {
  const res = await fetch('/api/gemini/tutor', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  const data = await safeParseJsonResponse<{ reply?: string }>(
    res,
    'Gia sư AI hiện chưa thể phản hồi.'
  );
  return data.reply || '';
}

export async function streamTutorMessageApi(params: {
  grade: GradeLevel;
  messages: Array<Pick<ChatMessage, 'role' | 'content' | 'imageDataUrl'>>;
  onChunk: (deltaText: string) => void;
  onModel?: (modelName: string) => void;
  onFallbackStatus?: (message: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const sendStreamRequest = () =>
    fetch('/api/gemini/tutor/stream', {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        grade: params.grade,
        messages: params.messages,
      }),
      signal: params.signal,
    });

  let res = await sendStreamRequest();
  if (res.status === 503 || res.status === 429) {
    params.onFallbackStatus?.(FALLBACK_STATUS_MESSAGE);
    res = await sendStreamRequest();
  }

  if (!res.ok) {
    await safeParseJsonResponse(res, 'Gia sư AI hiện chưa thể phản hồi.');
  }

  if (!res.body) {
    const full = await sendTutorMessageApi({
      grade: params.grade,
      messages: params.messages,
    });
    if (params.onModel) params.onModel(CLIENT_GEMINI_MODEL);
    if (full) params.onChunk(full);
    return full;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part
        .split('\n')
        .find((l) => l.startsWith('data: '));
      if (!line) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;
      try {
        const evt = JSON.parse(jsonStr) as {
          delta?: string;
          modelUsed?: string;
          modelTrying?: string;
          fallbackStatus?: string;
          error?: string;
          done?: boolean;
        };
        if (evt.fallbackStatus) {
          params.onFallbackStatus?.(evt.fallbackStatus);
        }
        if (evt.modelTrying && params.onModel) {
          params.onModel(evt.modelTrying);
        }
        if (evt.modelUsed && params.onModel) {
          params.onModel(evt.modelUsed);
        }
        if (evt.error) {
          throw new Error(evt.error);
        }
        if (evt.delta) {
          fullText += evt.delta;
          params.onChunk(evt.delta);
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes('JSON')) {
          throw e;
        }
      }
    }
  }

  return fullText;
}

export async function translateLabCommandsApi(
  prompt: string,
  onFallbackStatus?: (message: string) => void
): Promise<LabCommandSet> {
  return await fetchNdjsonWithStatus<LabCommandSet>(
    '/api/gemini/translate-lab',
    { prompt },
    'Không thể dịch đề bài sang lệnh vẽ.',
    onFallbackStatus
  );
}

export async function translateLabFromImageApi(params: {
  imageBase64: string;
  mimeType: string;
  extraPrompt?: string;
  onFallbackStatus?: (message: string) => void;
}): Promise<VisionLabResponse> {
  const { onFallbackStatus, ...payload } = params;
  return await fetchNdjsonWithStatus<VisionLabResponse>(
    '/api/gemini/vision-lab',
    payload,
    'Không thể nhận diện bài toán từ ảnh.',
    onFallbackStatus
  );
}

export interface OnlineExamSearchResponse {
  title: string;
  subtitle: string;
  durationMinutes: number;
  questions: QuizQuestion[];
  sources: ExamSourceLink[];
  searchQueriesUsed?: string[];
  modelUsed?: string;
}

export async function searchOnlineExamApi(params: {
  query: string;
  grade: GradeLevel;
  mcCount: number;
  tfCount: number;
  saCount: number;
  onFallbackStatus?: (message: string) => void;
}): Promise<OnlineExamSearchResponse> {
  const { onFallbackStatus, ...payload } = params;
  return await fetchNdjsonWithStatus<OnlineExamSearchResponse>(
    '/api/gemini/search-exam',
    payload,
    'Không thể tìm kiếm và tổng hợp đề thi từ Internet.',
    onFallbackStatus
  );
}

export async function generateMatrixExamApi(params: {
  grade: GradeLevel;
  chapterTitles: string[];
  mcCount: number;
  tfCount: number;
  saCount: number;
  durationMinutes: number;
  onFallbackStatus?: (message: string) => void;
}): Promise<OnlineExamSearchResponse> {
  const { onFallbackStatus, ...payload } = params;
  return await fetchNdjsonWithStatus<OnlineExamSearchResponse>(
    '/api/gemini/generate-exam',
    payload,
    'Không thể tạo đề thi AI theo ma trận GDPT 2018.',
    onFallbackStatus
  );
}

export interface ReplenishPoolResponse {
  questions: QuizQuestion[];
  sources: ExamSourceLink[];
  searchQueriesUsed?: string[];
  modelUsed?: string;
}

export async function replenishExamPoolApi(params: {
  grade: GradeLevel;
  chapterTitles?: string[];
  mcPerExam?: number;
  tfPerExam?: number;
  saPerExam?: number;
  durationMinutes?: number;
  seedHint?: string;
  onFallbackStatus?: (message: string) => void;
}): Promise<ReplenishPoolResponse> {
  const { onFallbackStatus, ...payload } = params;
  return await fetchNdjsonWithStatus<ReplenishPoolResponse>(
    '/api/gemini/replenish-pool',
    payload,
    'Không thể nạp mới kho đề từ AI / Internet.',
    onFallbackStatus
  );
}
