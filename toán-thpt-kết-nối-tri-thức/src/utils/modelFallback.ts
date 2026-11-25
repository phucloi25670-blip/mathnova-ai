import { ParsedGeminiError, parseGeminiApiError } from './aiError';

export const MODEL_FALLBACK_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.8-flash-lite',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
] as const;

export type FallbackModelName = (typeof MODEL_FALLBACK_CHAIN)[number];

export const FALLBACK_STATUS_MESSAGE =
  'Đang kết nối máy chủ dự phòng siêu tốc...';

export function isOverloadOrUnavailableStatus(status?: number): boolean {
  return (
    status === 503 ||
    status === 429 ||
    status === 404 ||
    status === 502 ||
    status === 504 ||
    status === 500
  );
}

export interface FallbackExecutionResult<T> {
  result: T;
  modelUsed: string;
  switchedFallback: boolean;
  attempts: number;
}

/**
 * Executes an async Gemini API call sequentially through MODEL_FALLBACK_CHAIN:
 * ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-flash'].
 *
 * Whenever a model fails with HTTP 503 (High Demand / Unavailable), 429 (Rate Limit / Overload),
 * 404, 500, 502, or 504 (or non-auth retryable errors), immediately advances to the next model
 * without bubbling an error until the entire chain is exhausted.
 */
export async function executeWithModelFallbackChain<T>(
  runner: (model: string, index: number) => Promise<T>,
  options?: {
    models?: readonly string[];
    onSwitchModel?: (
      nextModel: string,
      prevModel: string,
      error: ParsedGeminiError
    ) => void;
    classifyError?: (err: unknown, model: string) => ParsedGeminiError;
  }
): Promise<FallbackExecutionResult<T>> {
  const models =
    options?.models && options.models.length > 0
      ? options.models
      : MODEL_FALLBACK_CHAIN;
  const classify = options?.classifyError ?? parseGeminiApiError;

  let lastParsed: ParsedGeminiError | null = null;
  let prevModel = '';

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (i > 0 && lastParsed) {
      options?.onSwitchModel?.(model, prevModel, lastParsed);
    }

    try {
      const result = await runner(model, i);
      return {
        result,
        modelUsed: model,
        switchedFallback: i > 0,
        attempts: i + 1,
      };
    } catch (err) {
      const parsed = classify(err, model);
      lastParsed = parsed;
      prevModel = model;

      // Immediately stop on authentication / invalid API key errors
      if (parsed.isAuthError) {
        throw Object.assign(new Error(parsed.formatted), {
          status: parsed.status,
          parsedGeminiError: parsed,
        });
      }

      // If non-retryable 400 (except model/thinking incompatibility), stop early
      const lowerDetail = parsed.detail.toLowerCase();
      const isModelParamQuirk =
        parsed.status === 400 &&
        (lowerDetail.includes('thinking') ||
          lowerDetail.includes('model') ||
          lowerDetail.includes('not supported'));

      if (!parsed.isRetryable && !isModelParamQuirk) {
        throw Object.assign(new Error(parsed.formatted), {
          status: parsed.status,
          parsedGeminiError: parsed,
        });
      }
    }
  }

  if (lastParsed) {
    throw Object.assign(new Error(lastParsed.formatted), {
      status: lastParsed.status,
      parsedGeminiError: lastParsed,
    });
  }

  throw new Error(
    'HTTP 503 (Service Unavailable): Tất cả máy chủ AI dự phòng hiện đang bận, vui lòng thử lại sau giây lát.'
  );
}
