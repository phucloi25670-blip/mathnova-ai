import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { normalizeDesmosCommand } from './src/utils/labParser';
import { parseGeminiApiError } from './src/utils/aiError';
import { parseCleanGeminiJson, stripMarkdownJsonFences } from './src/utils/jsonUtils';
import { normalizeRawQuestions } from './src/utils/examShuffler';
import {
  executeWithModelFallbackChain,
  FALLBACK_STATUS_MESSAGE,
  MODEL_FALLBACK_CHAIN,
} from './src/utils/modelFallback';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIMARY_MODEL = MODEL_FALLBACK_CHAIN[0];

const GDPT_2018_RULE = `
BẮT BUỘC TUÂN THỦ CHƯƠNG TRÌNH GDPT 2018 & SGK "KẾT NỐI TRI THỨC VỚI CUỘC SỐNG" (TOÁN 10-11-12):
- Tuyệt đối KHÔNG đưa vào kiến thức chương trình cũ: Số phức, Hệ phương trình bậc nhất 3 ẩn giải tay thủ công, Các công thức biến đổi lượng giác đánh đố (tích thành tổng/tổng thành tích phức tạp), Kỹ thuật tính tích phân đổi biến hay từng phần cồng kềnh, Khối đa diện đều hay mặt nón/mặt trụ/mặt cầu kiểu cũ.
- Với Toán 12 tích phân: Chỉ dùng bảng nguyên hàm cơ bản, tính chất tuyến tính, diện tích hình phẳng và thể tích khối tròn xoay quay quanh trục Ox.
- Với Hình không gian 11 & 12: Chú trọng góc nhị diện, quan hệ song song/vuông góc, thể tích chóp/lăng trụ/chóp cụt đều, và phương pháp tọa độ Oxyz (vectơ, mặt phẳng, đường thẳng, mặt cầu Oxyz).
- Viết công thức Toán học bằng cú pháp LaTeX chuẩn đặt trong cặp $...$ (inline) hoặc $$...$$ (block).
- Ưu tiên bài toán gắn với thực tế cuộc sống (vật lí, kinh tế, kiến trúc, y tế, công nghệ).
`.trim();

function sanitizeApiKey(raw?: string): string {
  const cleaned = raw?.trim() || '';
  if (!cleaned || cleaned === 'MY_GEMINI_API_KEY') return '';
  return cleaned;
}

function createAiClient(req: Request): GoogleGenAI | null {
  const userKey = sanitizeApiKey(req.header('x-gemini-api-key'));
  const apiKey = userKey || sanitizeApiKey(process.env.GEMINI_API_KEY);
  if (!apiKey) return null;

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function executeWithModelFallback<T>(
  runner: (model: string) => Promise<T>,
  onSwitchModel?: (nextModel: string) => void
): Promise<{ result: T; modelUsed: string; switchedFallback: boolean }> {
  const outcome = await executeWithModelFallbackChain(
    (model) => runner(model),
    {
      models: MODEL_FALLBACK_CHAIN,
      onSwitchModel: (nextModel) => {
        onSwitchModel?.(nextModel);
      },
    }
  );
  return {
    result: outcome.result,
    modelUsed: outcome.modelUsed,
    switchedFallback: outcome.switchedFallback,
  };
}

function handleAiError(res: Response, err: unknown) {
  const preParsed = (err as { parsedGeminiError?: ReturnType<typeof parseGeminiApiError> })
    ?.parsedGeminiError;
  const parsed = preParsed ?? parseGeminiApiError(err);
  res.status(parsed.status).json({
    error: parsed.formatted,
    statusCode: parsed.status,
    codeLabel: parsed.codeLabel,
    detail: parsed.detail,
  });
}

async function sendEndpointWithFallback<T extends Record<string, unknown>>(
  req: Request,
  res: Response,
  handler: (
    onSwitchModel: (nextModel: string) => void
  ) => Promise<T>
) {
  const wantsStream = Boolean((req.body as { streamStatus?: boolean })?.streamStatus);
  if (wantsStream) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
  }

  const emitStatus = (nextModel: string) => {
    if (wantsStream && !res.writableEnded) {
      res.write(
        `${JSON.stringify({
          type: 'status',
          message: FALLBACK_STATUS_MESSAGE,
          modelTrying: nextModel,
        })}\n`
      );
    }
  };

  try {
    const payload = await handler(emitStatus);
    if (wantsStream) {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'result', data: payload })}\n`);
        res.end();
      }
      return;
    }
    res.json(payload);
  } catch (err) {
    const preParsed = (err as { parsedGeminiError?: ReturnType<typeof parseGeminiApiError> })
      ?.parsedGeminiError;
    const parsed = preParsed ?? parseGeminiApiError(err);

    if (wantsStream) {
      if (!res.writableEnded) {
        res.write(
          `${JSON.stringify({
            type: 'error',
            statusCode: parsed.status,
            error: parsed.formatted,
          })}\n`
        );
        res.end();
      }
      return;
    }

    res.status(parsed.status).json({
      error: parsed.formatted,
      statusCode: parsed.status,
      codeLabel: parsed.codeLabel,
      detail: parsed.detail,
    });
  }
}

function buildModelConfig(
  model: string,
  extra: {
    systemInstruction?: string;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: unknown;
    tools?: Array<Record<string, unknown>>;
    maxOutputTokens?: number;
  }
) {
  const isGemini4 = model.startsWith('gemini-4-');
  const isGemini31Lite = model.startsWith('gemini-3.1-flash-lite');

  const config: Record<string, unknown> = {};
  if (extra.systemInstruction) config.systemInstruction = extra.systemInstruction;
  if (extra.responseMimeType) config.responseMimeType = extra.responseMimeType;
  if (extra.responseSchema) config.responseSchema = extra.responseSchema;
  if (extra.tools && extra.tools.length > 0) config.tools = extra.tools;
  if (typeof extra.maxOutputTokens === 'number') config.maxOutputTokens = extra.maxOutputTokens;

  if (isGemini4) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  } else if (isGemini31Lite) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
    if (typeof extra.temperature === 'number') config.temperature = extra.temperature;
  } else {
    config.thinkingConfig = { thinkingBudget: 0 };
    if (typeof extra.temperature === 'number') config.temperature = extra.temperature;
  }
  return config;
}

function parseGroundedExamJson<T>(rawText: string): T {
  try {
    return parseCleanGeminiJson<T>(rawText);
  } catch {
    const unfenced = stripMarkdownJsonFences(rawText);
    const firstObj = unfenced.indexOf('{');
    const lastObj = unfenced.lastIndexOf('}');
    const sliced =
      firstObj !== -1 && lastObj > firstObj ? unfenced.slice(firstObj, lastObj + 1) : unfenced;
    // Repair common single-escaped LaTeX commands inside JSON strings (e.g. \int, \sqrt, \pi)
    const repaired = sliced.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    return JSON.parse(repaired) as T;
  }
}

function extractGroundingSources(response: unknown): {
  sources: Array<{ title: string; uri: string }>;
  searchQueriesUsed: string[];
} {
  const respObj = response as {
    candidates?: Array<{
      groundingMetadata?: {
        webSearchQueries?: unknown[];
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };

  const meta = respObj?.candidates?.[0]?.groundingMetadata;
  const rawChunks = Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : [];
  const seenUris = new Set<string>();
  const sources: Array<{ title: string; uri: string }> = [];

  for (const chunk of rawChunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri || !/^https?:\/\//i.test(uri) || seenUris.has(uri)) continue;
    seenUris.add(uri);
    let title = chunk?.web?.title?.trim() || '';
    if (!title) {
      try {
        title = new URL(uri).hostname.replace(/^www\./, '');
      } catch {
        title = uri;
      }
    }
    sources.push({ title, uri });
  }

  const searchQueriesUsed = Array.isArray(meta?.webSearchQueries)
    ? meta.webSearchQueries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : [];

  return { sources, searchQueriesUsed };
}

function sanitizeImageDataUrl(raw?: string): { base64: string; mimeType: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1], base64: dataUrlMatch[2] };
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      hasServerKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
      primaryModel: PRIMARY_MODEL,
      fallbackModels: MODEL_FALLBACK_CHAIN,
    });
  });

  // 1. Generate AI Mini-game Questions or Formula Match Pairs
  app.post('/api/gemini/generate-game', async (req: Request, res: Response) => {
    const ai = createAiClient(req);
    if (!ai) {
      res.status(400).json({
        error: 'Chưa có Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt ở thanh trên cùng.',
      });
      return;
    }

    const {
      grade,
      chapterTitle,
      gameType,
      count = 4,
      seenQuestions = [],
      diversitySeeds = [],
    } = req.body as {
      grade: string;
      chapterTitle: string;
      gameType: 'sprint' | 'matching' | 'challenge' | 'obstacle' | 'quick_30s';
      count?: number;
      seenQuestions?: string[];
      diversitySeeds?: Array<{
        gradeTag?: string;
        chapterTitle?: string;
        subtopic: string;
        paramHint: string;
      }>;
    };

    const sanitizedSeen = Array.isArray(seenQuestions)
      ? seenQuestions.filter((s) => typeof s === 'string' && s.trim()).slice(-40)
      : [];

    const antiRepetitionBlock =
      sanitizedSeen.length > 0
        ? `\n\nTUYỆT ĐỐI KHÔNG tạo lại các câu hỏi có nội dung hoặc số liệu tương tự danh sách đã xuất hiện dưới đây:\n${sanitizedSeen
            .map((s, idx) => `${idx + 1}. ${s}`)
            .join('\n')}`
        : '';

    const diversityBlock =
      Array.isArray(diversitySeeds) && diversitySeeds.length > 0
        ? `\n\nPHÂN BỔ CHUYÊN ĐỀ CON & THAM SỐ NGẪU NHIÊN BẮT BUỘC (không ra liên tiếp 2 câu cùng dạng toán):\n${diversitySeeds
            .slice(0, count)
            .map(
              (seed, idx) =>
                `- Câu/Cặp ${idx + 1}: [Lớp ${seed.gradeTag || grade} · ${
                  seed.chapterTitle || chapterTitle
                }] Chuyên đề con: "${seed.subtopic}" | ${seed.paramHint}`
            )
            .join('\n')}`
        : '';

    await sendEndpointWithFallback(req, res, async (onSwitchModel) => {
      if (gameType === 'matching') {
        const { result: response, modelUsed } = await executeWithModelFallback(
          (model) =>
            ai.models.generateContent({
              model,
              contents: `Hãy tạo ${count} cặp thẻ "Tên khái niệm / Công thức" và "Biểu thức LaTeX tương ứng" MỚI HOÀN TOÀN cho Toán lớp ${grade}, chương "${chapterTitle}" theo SGK Kết nối tri thức với cuộc sống.${diversityBlock}${antiRepetitionBlock}`,
              config: buildModelConfig(model, {
                temperature: 0.9,
                systemInstruction: `${GDPT_2018_RULE}\nTrả về JSON đúng schema. Mỗi biểu thức rightLatex chỉ chứa nội dung toán học thuần LaTeX (không bọc $). Đảm bảo các cặp thẻ đa dạng và khác biệt hoàn toàn danh sách đã hỏi.`,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      leftTitle: {
                        type: Type.STRING,
                        description: 'Tên công thức hoặc khái niệm ngắn gọn tiếng Việt',
                      },
                      rightLatex: {
                        type: Type.STRING,
                        description: 'Biểu thức LaTeX thuần (không có dấu $)',
                      },
                    },
                    required: ['id', 'leftTitle', 'rightLatex'],
                  },
                },
              }),
            }),
          onSwitchModel
        );

        const pairs = parseCleanGeminiJson<unknown[]>(response.text ?? '[]');
        return { pairs: Array.isArray(pairs) ? pairs : [], modelUsed };
      }

      const formatGuide =
        gameType === 'quick_30s'
          ? 'Chỉ sinh câu hỏi định dạng "multiple_choice" (4 phương án gọn đẹp, KHÔNG dài dòng) cho chế độ "Kiểm tra nhanh 30 giây": kết hợp đa dạng ~40% câu hỏi nhận biết công thức/tính chất cốt lõi và ~60% bài tập vận dụng thay số ngắn gọn tính nhẩm được trong 15–20 giây. Mỗi câu phải đổi số liệu khác nhau.'
          : gameType === 'sprint'
          ? 'Chỉ sinh câu hỏi định dạng "multiple_choice" (4 phương án ngắn gọn, giải nhanh trong 60 giây).'
          : gameType === 'obstacle'
          ? 'Chỉ sinh câu hỏi định dạng "true_false" (mỗi câu gồm 1 bài toán bối cảnh thực tế ngắn gọn + đúng 4 ý a, b, c, d có isTrue đúng/sai rõ ràng chuẩn đề thi GDPT 2018).'
          : 'Sinh kết hợp các định dạng chuẩn đề thi 2025+: "multiple_choice" (4 lựa chọn), "true_false" (1 dẫn đề + đúng 4 ý a, b, c, d có đúng/sai rõ ràng), và "short_answer" (kết quả là 1 con số nguyên hoặc thập phân gọn).';

      const { result: response, modelUsed } = await executeWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Hãy tạo ${count} câu hỏi Toán lớp ${grade}, chủ đề "${chapterTitle}" chuẩn đề thi GDPT 2018. ${formatGuide}${diversityBlock}${antiRepetitionBlock}`,
            config: buildModelConfig(model, {
              temperature: 0.9,
              systemInstruction: `${GDPT_2018_RULE}\nMọi câu hỏi phải chính xác tuyệt đối về mặt toán học, có giải thích ngắn gọn rõ ràng. Thay đổi hoàn toàn số liệu, bối cảnh thực tế và không lặp lại câu hỏi đã xuất hiện.`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    format: {
                      type: Type.STRING,
                      description: 'Giá trị bắt buộc thuộc: multiple_choice | true_false | short_answer',
                    },
                    prompt: { type: Type.STRING, description: 'Đề bài tiếng Việt có dùng $...$ cho công thức' },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '4 phương án nếu format là multiple_choice',
                    },
                    correctIndex: {
                      type: Type.INTEGER,
                      description: 'Chỉ số đáp án đúng (0..3) nếu là multiple_choice',
                    },
                    statements: {
                      type: Type.ARRAY,
                      description: 'Đúng 4 ý a,b,c,d nếu format là true_false',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING, description: 'a, b, c, hoặc d' },
                          text: { type: Type.STRING },
                          isTrue: { type: Type.BOOLEAN },
                        },
                        required: ['id', 'text', 'isTrue'],
                      },
                    },
                    shortAnswer: {
                      type: Type.STRING,
                      description: 'Đáp án số ngắn gọn nếu format là short_answer',
                    },
                    explanation: { type: Type.STRING, description: 'Lời giải súc tích kèm LaTeX $...$' },
                    isRealWorld: { type: Type.BOOLEAN },
                  },
                  required: ['id', 'format', 'prompt', 'explanation'],
                },
              },
            }),
          }),
        onSwitchModel
      );

      const rawList = parseCleanGeminiJson<Array<Record<string, unknown>>>(response.text ?? '[]');
      const gradeTag = grade === 'thpt' ? '12' : grade;
      const questions = (Array.isArray(rawList) ? rawList : []).map((q, idx) => ({
        ...q,
        id: q.id || `ai-${Date.now()}-${idx}`,
        grade: gradeTag,
        chapterId: 'ai-generated',
        chapterTitle: chapterTitle || `Toán ${grade}`,
      }));

      return { questions, modelUsed };
    });
  });

  // 2A. Socratic AI Math Tutor (SSE Streaming with automatic model fallback)
  app.post('/api/gemini/tutor/stream', async (req: Request, res: Response) => {
    const ai = createAiClient(req);
    if (!ai) {
      res.status(400).json({
        error: 'Chưa có Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt ở thanh trên cùng.',
      });
      return;
    }

    const { grade, messages } = req.body as {
      grade: string;
      messages: Array<{ role: 'user' | 'model'; content: string; imageDataUrl?: string }>;
    };

    const systemInstruction = `
Bạn là Gia Sư Toán THPT thông minh theo phương pháp Socratic (gợi mở từng bước), giảng dạy bộ sách "Kết nối tri thức với cuộc sống" (Toán ${grade === 'thpt' ? 'Ôn thi THPT 10-11-12' : `Lớp ${grade}`}).
${GDPT_2018_RULE}
NGUYÊN TẮC SOCRATIC BẮT BUỘC:
1. KHÔNG giải trọn vẹn đáp án ngay lập tức khi học sinh mới hỏi đề bài (trừ khi học sinh đã làm đúng gần hết hoặc nài nỉ kiểm tra bước cuối). Nếu học sinh gửi ảnh đề bài, hãy đọc chính xác đề bài trong ảnh rồi gợi mở bước đầu tiên.
2. Chia nhỏ vấn đề: Xác nhận phần học sinh đã hiểu, chỉ ra bước tiếp theo cần làm, và đặt 1 câu hỏi gợi mở rõ ràng để học sinh tự tư duy.
3. Trình bày cực kỳ thoáng đãng: dùng gạch đầu dòng ngắn gọn, mỗi biểu thức toán học bọc gọn trong $...$ hoặc $$...$$ để KaTeX hiển thị đẹp.
4. Giọng văn thân thiện, khích lệ, chuẩn mực sư phạm, súc tích.
`.trim();

    const contents = (messages || []).map((m) => {
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      const img = sanitizeImageDataUrl(m.imageDataUrl);
      if (img) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
      parts.push({
        text: m.content?.trim() || (img ? 'Hãy đọc đề bài trong ảnh này và hướng dẫn em giải theo từng bước Socratic.' : ''),
      });
      return {
        role: m.role === 'model' ? 'model' : 'user',
        parts,
      };
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      let streamed = false;
      let primaryError: { err: unknown; model: string } | null = null;

      for (let i = 0; i < MODEL_FALLBACK_CHAIN.length; i++) {
        const model = MODEL_FALLBACK_CHAIN[i];
        if (i > 0) {
          sendEvent({
            fallbackStatus: FALLBACK_STATUS_MESSAGE,
            modelTrying: model,
          });
        }
        try {
          const stream = await ai.models.generateContentStream({
            model,
            contents,
            config: buildModelConfig(model, { systemInstruction }),
          });

          sendEvent({ meta: true, modelUsed: model });
          for await (const chunk of stream) {
            const delta = chunk.text ?? '';
            if (delta) {
              streamed = true;
              sendEvent({ delta });
            }
          }
          sendEvent({ done: true, modelUsed: model });
          res.end();
          return;
        } catch (err) {
          if (!primaryError) {
            primaryError = { err, model };
          }
          const parsed = parseGeminiApiError(err, model);
          const lowerDetail = parsed.detail.toLowerCase();
          const isModelParamQuirk =
            parsed.status === 400 &&
            (lowerDetail.includes('thinking') ||
              lowerDetail.includes('model') ||
              lowerDetail.includes('not supported'));

          if (streamed || parsed.isAuthError || (!parsed.isRetryable && !isModelParamQuirk)) {
            throw Object.assign(new Error(parsed.formatted), {
              status: parsed.status,
              parsedGeminiError: parsed,
            });
          }
          // Otherwise immediately try next fallback model in MODEL_FALLBACK_CHAIN
        }
      }

      const chosen = primaryError;
      if (chosen) {
        const parsed = parseGeminiApiError(chosen.err, chosen.model);
        throw Object.assign(new Error(parsed.formatted), {
          status: parsed.status,
          parsedGeminiError: parsed,
        });
      }
      throw new Error('HTTP 503 (Service Unavailable): Tất cả máy chủ AI dự phòng hiện đang bận.');
    } catch (err) {
      const preParsed = (err as { parsedGeminiError?: ReturnType<typeof parseGeminiApiError> })
        ?.parsedGeminiError;
      const parsed = preParsed ?? parseGeminiApiError(err);
      sendEvent({ error: parsed.formatted, statusCode: parsed.status });
      res.end();
    }
  });

  // 2B. Standard non-streaming Socratic AI Math Tutor (with fallback)
  app.post('/api/gemini/tutor', async (req: Request, res: Response) => {
    const ai = createAiClient(req);
    if (!ai) {
      res.status(400).json({
        error: 'Chưa có Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt ở thanh trên cùng.',
      });
      return;
    }

    const { grade, messages } = req.body as {
      grade: string;
      messages: Array<{ role: 'user' | 'model'; content: string; imageDataUrl?: string }>;
    };

    try {
      const systemInstruction = `
Bạn là Gia Sư Toán THPT thông minh theo phương pháp Socratic (gợi mở từng bước), giảng dạy bộ sách "Kết nối tri thức với cuộc sống" (Toán ${grade === 'thpt' ? 'Ôn thi THPT 10-11-12' : `Lớp ${grade}`}).
${GDPT_2018_RULE}
NGUYÊN TẮC SOCRATIC BẮT BUỘC:
1. KHÔNG giải trọn vẹn đáp án ngay lập tức khi học sinh mới hỏi đề bài (trừ khi học sinh đã làm đúng gần hết hoặc nài nỉ kiểm tra bước cuối).
2. Chia nhỏ vấn đề: Xác nhận phần học sinh đã hiểu, chỉ ra bước tiếp theo cần làm, và đặt 1 câu hỏi gợi mở rõ ràng để học sinh tự tư duy.
3. Trình bày cực kỳ thoáng đãng: dùng gạch đầu dòng ngắn gọn, mỗi biểu thức toán học bọc gọn trong $...$ hoặc $$...$$ để KaTeX hiển thị đẹp.
4. Giọng văn thân thiện, khích lệ, chuẩn mực sư phạm.
`.trim();

      const contents = (messages || []).map((m) => {
        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
        const img = sanitizeImageDataUrl(m.imageDataUrl);
        if (img) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        }
        parts.push({
          text: m.content?.trim() || (img ? 'Hãy đọc đề bài trong ảnh này và hướng dẫn em giải theo từng bước Socratic.' : ''),
        });
        return {
          role: m.role === 'model' ? 'model' : 'user',
          parts,
        };
      });

      const { result: response, modelUsed } = await executeWithModelFallback((model) =>
        ai.models.generateContent({
          model,
          contents,
          config: buildModelConfig(model, { systemInstruction }),
        })
      );

      res.json({
        reply: response.text ?? 'Thầy/Cô đang suy nghĩ, em thử diễn đạt lại ý vừa rồi nhé!',
        modelUsed,
      });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // 3. Parallel 2D (Desmos) & 3D (GeoGebra) Command Translator + Dynamic Calculus & Casio Guide
  app.post('/api/gemini/translate-lab', async (req: Request, res: Response) => {
    const ai = createAiClient(req);
    if (!ai) {
      res.status(400).json({
        error: 'Chưa có Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt ở thanh trên cùng.',
      });
      return;
    }

    const { prompt } = req.body as { prompt: string };

    await sendEndpointWithFallback(req, res, async (onSwitchModel) => {
      const { result: response, modelUsed } = await executeWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Phân tích bài toán sau và xuất JSON gồm: (1) bộ câu lệnh Desmos 2D & GeoGebra 3D chuẩn, (2) lời giải từng bước súc tích (bọc LaTeX bằng $...$), (3) hướng dẫn bấm máy tính Casio fx-580VNX chi tiết cho đúng bài toán này:\n"${prompt}"`,
            config: buildModelConfig(model, {
              systemInstruction: `Bạn là hệ thống dịch đề toán THPT sang JSON đồ họa & lời giải chuẩn xác. Trả về JSON thuần túy theo schema. Công thức trong detail/explanation dùng $...$, còn formulaLatex viết LaTeX thuần không kèm $. ${GDPT_2018_RULE}`.trim(),
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  desmos2d: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  geogebra3d: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  solutionTitle: { type: Type.STRING },
                  solutionSteps: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        detail: { type: Type.STRING },
                        formulaLatex: { type: Type.STRING },
                      },
                      required: ['title', 'detail'],
                    },
                  },
                  finalResultLatex: { type: Type.STRING },
                  casioSteps: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        keys: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        explanation: { type: Type.STRING },
                      },
                      required: ['title', 'keys', 'explanation'],
                    },
                  },
                },
                required: ['title', 'desmos2d', 'geogebra3d', 'solutionTitle', 'solutionSteps', 'casioSteps'],
              },
            }),
          }),
        onSwitchModel
      );

      const parsed = parseCleanGeminiJson<{
        title?: string;
        desmos2d?: unknown[];
        geogebra3d?: unknown[];
        notes?: string;
        solutionTitle?: string;
        solutionSteps?: unknown[];
        finalResultLatex?: string;
        casioSteps?: unknown[];
      }>(response.text ?? '{}');
      const desmos2d = Array.isArray(parsed.desmos2d)
        ? parsed.desmos2d.map((line) => normalizeDesmosCommand(String(line)))
        : [];
      const geogebra3d = Array.isArray(parsed.geogebra3d)
        ? parsed.geogebra3d.map((line) => String(line).trim())
        : [];

      return {
        ...parsed,
        problemSummary: prompt,
        desmos2d,
        geogebra3d,
        source: 'ai',
        modelUsed,
      };
    });
  });

  // 4. Multimodal Vision Lab Translator (Camera / Image -> 2D/3D Commands + Solution + Casio Guide)
  app.post('/api/gemini/vision-lab', async (req: Request, res: Response) => {
    const ai = createAiClient(req);
    if (!ai) {
      res.status(400).json({
        error: 'Chưa có Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt ở thanh trên cùng.',
      });
      return;
    }

    const { imageBase64, mimeType = 'image/jpeg', extraPrompt = '' } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      extraPrompt?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'Thiếu dữ liệu ảnh bài toán.' });
      return;
    }

    await sendEndpointWithFallback(req, res, async (onSwitchModel) => {
      const imagePart = {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      };
      const textPart = {
        text: `Đọc đề bài toán hoặc phương trình trong ảnh${extraPrompt.trim() ? ` (Ghi chú thêm: ${extraPrompt.trim()})` : ''}. Hãy trích xuất đề bài ngắn gọn (recognizedProblem), chọn chế độ hiển thị phù hợp nhất (2d hoặc 3d), sinh bộ câu lệnh Desmos 2D & GeoGebra 3D chuẩn xác, kèm lời giải từng bước (solutionSteps) và mẹo bấm máy Casio fx-580VNX (casioSteps) cho đúng đề bài này.`,
      };

      const { result: response, modelUsed } = await executeWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: { parts: [imagePart, textPart] },
            config: buildModelConfig(model, {
              systemInstruction: `Bạn là trợ lý Gemini Vision chuyên đọc ảnh bài toán THPT và dịch sang câu lệnh JSON đồ họa, lời giải từng bước và mẹo bấm máy Casio fx-580VNX. Công thức trong detail/explanation dùng $...$, còn formulaLatex viết LaTeX thuần không kèm $. ${GDPT_2018_RULE}`.trim(),
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  recognizedProblem: {
                    type: Type.STRING,
                    description: 'Đề bài / phương trình trích xuất ngắn gọn từ ảnh',
                  },
                  title: { type: Type.STRING },
                  recommendedMode: {
                    type: Type.STRING,
                    description: '2d hoặc 3d',
                  },
                  desmos2d: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  geogebra3d: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  solutionTitle: { type: Type.STRING },
                  solutionSteps: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        detail: { type: Type.STRING },
                        formulaLatex: { type: Type.STRING },
                      },
                      required: ['title', 'detail'],
                    },
                  },
                  finalResultLatex: { type: Type.STRING },
                  casioSteps: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        keys: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        explanation: { type: Type.STRING },
                      },
                      required: ['title', 'keys', 'explanation'],
                    },
                  },
                },
                required: ['recognizedProblem', 'title', 'recommendedMode', 'desmos2d', 'geogebra3d', 'solutionTitle', 'solutionSteps', 'casioSteps'],
              },
            }),
          }),
        onSwitchModel
      );

      const parsed = parseCleanGeminiJson<{
        recognizedProblem?: string;
        title?: string;
        recommendedMode?: string;
        desmos2d?: unknown[];
        geogebra3d?: unknown[];
        solutionTitle?: string;
        solutionSteps?: unknown[];
        finalResultLatex?: string;
        casioSteps?: unknown[];
      }>(response.text ?? '{}');

      const desmos2d = Array.isArray(parsed.desmos2d)
        ? parsed.desmos2d.map((line) => normalizeDesmosCommand(String(line)))
        : [];
      const geogebra3d = Array.isArray(parsed.geogebra3d)
        ? parsed.geogebra3d.map((line) => String(line).trim())
        : [];
      const recommendedMode = parsed.recommendedMode === '2d' ? '2d' : '3d';

      return {
        recognizedProblem: parsed.recognizedProblem || 'Bài toán từ ảnh chụp',
        problemSummary: parsed.recognizedProblem || 'Bài toán từ ảnh chụp',
        title: parsed.title || 'Mô hình từ ảnh chụp',
        recommendedMode,
        desmos2d,
        geogebra3d,
        solutionTitle: parsed.solutionTitle,
        solutionSteps: parsed.solutionSteps,
        finalResultLatex: parsed.finalResultLatex,
        casioSteps: parsed.casioSteps,
        notes: '',
        source: 'ai',
        modelUsed,
      };
    });
  });

  // 5. Google Search Grounding Exam Aggregator & Standardizer (GDPT 2018)
  app.post('/api/gemini/search-exam', async (req: Request, res: Response) => {
    const ai = createAiClient(req);
    if (!ai) {
      res.status(400).json({
        error: 'Chưa có Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt ở thanh trên cùng.',
      });
      return;
    }

    const {
      query,
      grade = '12',
      mcCount = 6,
      tfCount = 2,
      saCount = 2,
    } = req.body as {
      query?: string;
      grade?: '10' | '11' | '12' | 'thpt';
      mcCount?: number;
      tfCount?: number;
      saCount?: number;
    };

    const cleanQuery = (query || '').trim();
    if (!cleanQuery) {
      res.status(400).json({ error: 'Vui lòng nhập từ khóa hoặc yêu cầu tìm kiếm đề thi.' });
      return;
    }

    const safeMc = Math.max(1, Math.min(12, Number(mcCount) || 6));
    const safeTf = Math.max(0, Math.min(4, Number(tfCount) || 2));
    const safeSa = Math.max(0, Math.min(6, Number(saCount) || 2));

    const systemInstruction = `
Bạn là chuyên gia Khảo thí Toán THPT Việt Nam theo chương trình GDPT 2018 (SGK Kết nối tri thức với cuộc sống).
Nhiệm vụ: Dùng Google Search để tìm kiếm đề thi Toán thực tế, câu hỏi vận dụng/vận dụng cao và lời giải chuẩn từ các nguồn giáo dục uy tín trên Internet theo yêu cầu của người dùng, sau đó trích xuất, lọc sạch kiến thức cũ và tổng hợp thành 1 đề thi hoàn chỉnh.

QUY TẮC BẮT BUỘC:
${GDPT_2018_RULE}
1. Tự động LỌC BỎ hoàn toàn mọi câu hỏi thuộc chương trình cũ (Số phức, giải tay hệ 3 ẩn, tích phân từng phần/đổi biến phức tạp, mặt nón/trụ/cầu kiểu cũ).
2. Chuẩn hóa toàn bộ công thức Toán học sang cú pháp KaTeX bọc gọn trong $...$ (ví dụ: $\\int_0^1 x^2\\,dx$, $\\vec{u}=(1;2;3)$). Trong chuỗi JSON phải escape 2 dấu gạch chéo ngược (\\\\frac, \\\\int, \\\\sqrt...).
3. Trả về DUY NHẤT 1 khối JSON hợp lệ (không giải thích ngoài JSON) có cấu trúc chính xác:
{
  "title": "Tên đề thi tổng hợp ngắn gọn",
  "subtitle": "Mô tả nguồn/phạm vi chuyên đề GDPT 2018",
  "durationMinutes": 90,
  "questions": [
    {
      "id": "q1",
      "grade": "12",
      "chapterTitle": "Tên chương/chuyên đề",
      "format": "multiple_choice",
      "prompt": "Nội dung câu hỏi có $...$",
      "options": ["Phương án 1", "Phương án 2", "Phương án 3", "Phương án 4"],
      "correctIndex": 0,
      "explanation": "Lời giải chi tiết bằng $...$",
      "isRealWorld": true
    },
    {
      "id": "q2",
      "grade": "12",
      "chapterTitle": "Tên chương/chuyên đề",
      "format": "true_false",
      "prompt": "Đề bài dẫn nhập...",
      "statements": [
        { "id": "a", "text": "Khẳng định a...", "isTrue": true },
        { "id": "b", "text": "Khẳng định b...", "isTrue": false },
        { "id": "c", "text": "Khẳng định c...", "isTrue": true },
        { "id": "d", "text": "Khẳng định d...", "isTrue": false }
      ],
      "explanation": "Giải thích cả 4 ý..."
    },
    {
      "id": "q3",
      "grade": "12",
      "chapterTitle": "Tên chương/chuyên đề",
      "format": "short_answer",
      "prompt": "Đề bài trả lời ngắn...",
      "shortAnswer": "42",
      "explanation": "Lời giải chi tiết..."
    }
  ]
}
Lưu ý: options KHÔNG chứa tiền tố "A. ", "B. "; statements KHÔNG chứa "a) ". Đáp án shortAnswer chỉ là số nguyên hoặc số thập phân gọn.
`.trim();

    const userPrompt = `Hãy tìm kiếm đề thi thực tế trên mạng cho yêu cầu: "${cleanQuery}" (ưu tiên khối ${
      grade === 'thpt' ? 'Ôn thi THPT Quốc gia 2025/2026' : `Lớp ${grade}`
    }).
Tổng hợp thành một đề thi chuẩn 3 phần GDPT 2018 gồm:
- ${safeMc} câu format "multiple_choice" (4 lựa chọn)
- ${safeTf} câu format "true_false" (đúng 4 ý a, b, c, d)
- ${safeSa} câu format "short_answer" (đáp số gọn)
Đảm bảo lời giải chi tiết, chính xác toán học và chuẩn KaTeX.`;

    await sendEndpointWithFallback(req, res, async (onSwitchModel) => {
      const { result: response, modelUsed } = await executeWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: userPrompt,
            config: buildModelConfig(model, {
              systemInstruction,
              temperature: 0.3,
              tools: [{ googleSearch: {} }],
            }),
          }),
        onSwitchModel
      );

      const { sources, searchQueriesUsed } = extractGroundingSources(response);
      const parsed = parseGroundedExamJson<{
        title?: string;
        subtitle?: string;
        durationMinutes?: number;
        questions?: unknown[];
      }>(response.text ?? '{}');

      const normalizedQuestions = normalizeRawQuestions(
        Array.isArray(parsed.questions) ? parsed.questions : [],
        grade,
        cleanQuery
      );

      if (normalizedQuestions.length === 0) {
        throw Object.assign(
          new Error(
            'AI chưa trích xuất được câu hỏi hợp lệ chuẩn GDPT 2018 từ kết quả tìm kiếm. Hãy thử từ khóa cụ thể hơn (ví dụ: tên chương hoặc kỳ thi).'
          ),
          { status: 502 }
        );
      }

      return {
        title: parsed.title?.trim() || `Đề tổng hợp: ${cleanQuery}`,
        subtitle:
          parsed.subtitle?.trim() ||
          'Tổng hợp & chuẩn hóa GDPT 2018 từ nguồn đề thi trực tuyến',
        durationMinutes:
          typeof parsed.durationMinutes === 'number' && parsed.durationMinutes >= 10
            ? Math.min(180, Math.round(parsed.durationMinutes))
            : 60,
        questions: normalizedQuestions,
        sources,
        searchQueriesUsed,
        modelUsed,
      };
    });
  });

  // 6. Standard AI Matrix Exam Generator (GDPT 2018)
  app.post('/api/gemini/generate-exam', async (req: Request, res: Response) => {
    const ai = createAiClient(req);
    if (!ai) {
      res.status(400).json({
        error: 'Chưa có Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt ở thanh trên cùng.',
      });
      return;
    }

    const {
      grade = '12',
      chapterTitles = [],
      mcCount = 6,
      tfCount = 2,
      saCount = 2,
      durationMinutes = 45,
    } = req.body as {
      grade?: '10' | '11' | '12' | 'thpt';
      chapterTitles?: string[];
      mcCount?: number;
      tfCount?: number;
      saCount?: number;
      durationMinutes?: number;
    };

    const safeMc = Math.max(1, Math.min(12, Number(mcCount) || 6));
    const safeTf = Math.max(0, Math.min(4, Number(tfCount) || 2));
    const safeSa = Math.max(0, Math.min(6, Number(saCount) || 2));
    const topicsText =
      Array.isArray(chapterTitles) && chapterTitles.length > 0
        ? chapterTitles.join('; ')
        : grade === 'thpt'
        ? 'Tổng hợp kiến thức trọng tâm Toán 10-11-12 ôn thi THPT'
        : `Toàn bộ chuyên đề trọng tâm Toán lớp ${grade}`;

    await sendEndpointWithFallback(req, res, async (onSwitchModel) => {
      const { result: response, modelUsed } = await executeWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Tạo 1 đề kiểm tra Toán chuẩn cấu trúc 3 phần GDPT 2018 cho khối ${
              grade === 'thpt' ? 'Ôn thi THPT' : `Lớp ${grade}`
            }. Chuyên đề: ${topicsText}.
Số lượng bắt buộc:
- ${safeMc} câu "multiple_choice" (4 phương án không ghi tiền tố A/B/C/D)
- ${safeTf} câu "true_false" (đúng 4 ý a,b,c,d)
- ${safeSa} câu "short_answer" (đáp số gọn)
Tất cả công thức bọc $...$ để hiển thị KaTeX sắc nét.`,
            config: buildModelConfig(model, {
              temperature: 0.7,
              systemInstruction: `${GDPT_2018_RULE}\nTrả về JSON đúng schema. Đảm bảo tính chính xác tuyệt đối của đáp án và lời giải.`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        chapterTitle: { type: Type.STRING },
                        format: { type: Type.STRING },
                        prompt: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        correctIndex: { type: Type.INTEGER },
                        statements: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              id: { type: Type.STRING },
                              text: { type: Type.STRING },
                              isTrue: { type: Type.BOOLEAN },
                            },
                            required: ['id', 'text', 'isTrue'],
                          },
                        },
                        shortAnswer: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        isRealWorld: { type: Type.BOOLEAN },
                      },
                      required: ['id', 'format', 'prompt', 'explanation'],
                    },
                  },
                },
                required: ['title', 'questions'],
              },
            }),
          }),
        onSwitchModel
      );

      const parsed = parseCleanGeminiJson<{
        title?: string;
        subtitle?: string;
        questions?: unknown[];
      }>(response.text ?? '{}');

      const questions = normalizeRawQuestions(
        Array.isArray(parsed.questions) ? parsed.questions : [],
        grade,
        topicsText
      );

      return {
        title: parsed.title?.trim() || `Đề kiểm tra AI — Toán ${grade}`,
        subtitle: parsed.subtitle?.trim() || topicsText,
        durationMinutes,
        questions,
        sources: [],
        modelUsed,
      };
    });
  });

  // 7. Auto-Replenish 10-Exam Pool via Gemini 3.8 Flash + Google Search Grounding
  app.post('/api/gemini/replenish-pool', async (req: Request, res: Response) => {
    const ai = createAiClient(req);
    if (!ai) {
      res.status(400).json({
        error: 'Chưa có Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt ở thanh trên cùng.',
      });
      return;
    }

    const {
      grade = '12',
      chapterTitles = [],
      mcPerExam = 6,
      tfPerExam = 2,
      saPerExam = 2,
      durationMinutes = 45,
      seedHint = '',
    } = req.body as {
      grade?: '10' | '11' | '12' | 'thpt';
      chapterTitles?: string[];
      mcPerExam?: number;
      tfPerExam?: number;
      saPerExam?: number;
      durationMinutes?: number;
      seedHint?: string;
    };

    const topicsText =
      Array.isArray(chapterTitles) && chapterTitles.length > 0
        ? chapterTitles.slice(0, 6).join('; ')
        : grade === 'thpt'
        ? 'Tổng hợp Toán 10-11-12 Ôn thi THPT (Hàm số, Oxyz, Nguyên hàm Tích phân, Xác suất)'
        : `Toàn bộ chuyên đề trọng tâm Toán lớp ${grade} SGK Kết nối tri thức`;

    const systemInstruction = `
Bạn là chuyên gia Khảo thí Toán THPT Việt Nam theo chương trình GDPT 2018 (SGK Kết nối tri thức với cuộc sống).
Nhiệm vụ: Dùng Google Search để tham khảo các đề thi thử, ngân hàng câu hỏi mới nhất trên Internet năm 2025-2027, lọc sạch kiến thức chương trình cũ, và tổng hợp một lô câu hỏi ĐA DẠNG (không trùng lặp) để nạp vào Ngân hàng 10 Đề Dự Trữ của học sinh.

QUY TẮC BẮT BUỘC:
${GDPT_2018_RULE}
1. Trả về DUY NHẤT 1 khối JSON hợp lệ:
{
  "questions": [
    {
      "id": "pool-1",
      "grade": "${grade === 'thpt' ? '12' : grade}",
      "chapterTitle": "Tên chương",
      "format": "multiple_choice",
      "prompt": "Đề bài có $...$",
      "options": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"],
      "correctIndex": 0,
      "explanation": "Lời giải ngắn gọn có $...$",
      "isRealWorld": true
    },
    {
      "id": "pool-tf-1",
      "grade": "${grade === 'thpt' ? '12' : grade}",
      "chapterTitle": "Tên chương",
      "format": "true_false",
      "prompt": "Bài toán dẫn...",
      "statements": [
        { "id": "a", "text": "Ý a", "isTrue": true },
        { "id": "b", "text": "Ý b", "isTrue": false },
        { "id": "c", "text": "Ý c", "isTrue": true },
        { "id": "d", "text": "Ý d", "isTrue": false }
      ],
      "explanation": "Giải thích ngắn gọn..."
    },
    {
      "id": "pool-sa-1",
      "grade": "${grade === 'thpt' ? '12' : grade}",
      "chapterTitle": "Tên chương",
      "format": "short_answer",
      "prompt": "Bài toán trả lời ngắn...",
      "shortAnswer": "12",
      "explanation": "Giải thích..."
    }
  ]
}
Lưu ý: options KHÔNG chứa "A. ", "B. "; statements KHÔNG chứa "a) "; mọi ký tự backslash trong LaTeX chuỗi JSON phải double-escape (\\\\frac, \\\\int, \\\\sqrt).
`.trim();

    const userPrompt = `Hãy tìm kiếm đề thi Toán chuẩn GDPT 2018 mới nhất cho khối ${
      grade === 'thpt' ? 'Ôn thi Tốt nghiệp THPT 2027' : `Lớp ${grade}`
    } (${topicsText}). ${seedHint ? `Gợi ý đa dạng: ${seedHint}.` : ''}
Trả về một ngân hàng câu hỏi gồm:
- 18 câu format "multiple_choice" (4 lựa chọn, đổi dạng toán & số liệu liên tục)
- 6 câu format "true_false" (đúng 4 ý a, b, c, d)
- 6 câu format "short_answer" (đáp án số gọn)
Tất cả đều phải chính xác tuyệt đối, chuẩn KaTeX.`;

    await sendEndpointWithFallback(req, res, async (onSwitchModel) => {
      const { result: response, modelUsed } = await executeWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: userPrompt,
            config: buildModelConfig(model, {
              systemInstruction,
              temperature: 0.65,
              tools: [{ googleSearch: {} }],
            }),
          }),
        onSwitchModel
      );

      const { sources, searchQueriesUsed } = extractGroundingSources(response);
      const parsed = parseGroundedExamJson<{ questions?: unknown[] }>(
        response.text ?? '{}'
      );

      const normalizedQuestions = normalizeRawQuestions(
        Array.isArray(parsed.questions) ? parsed.questions : [],
        grade,
        topicsText
      );

      if (normalizedQuestions.length === 0) {
        throw Object.assign(
          new Error('AI chưa trích xuất được câu hỏi hợp lệ cho kho dự trữ.'),
          { status: 502 }
        );
      }

      return {
        questions: normalizedQuestions,
        sources,
        searchQueriesUsed,
        modelUsed,
        mcPerExam,
        tfPerExam,
        saPerExam,
        durationMinutes,
      };
    });
  });

  // Serve comic PDF via both canonical name and convenient aliases (/truyen-doraemon.html, /truyen-doraemon.pdf)
  const comicPdfPath = path.resolve(__dirname, 'public', 'truyen-doraemon.html.pdf');
  app.get(
    ['/truyen-doraemon.html', '/truyen-doraemon.pdf', '/truyen-doraemon.html.pdf'],
    (_req: Request, res: Response) => {
      res.type('application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="truyen-doraemon.pdf"');
      res.sendFile(comicPdfPath);
    }
  );

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

startServer();
