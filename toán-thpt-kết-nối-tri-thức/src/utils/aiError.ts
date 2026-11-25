export interface ParsedGeminiError {
  status: number;
  codeLabel: string;
  detail: string;
  formatted: string;
  isAuthError: boolean;
  isRetryable: boolean;
}

function tryExtractInnerJsonError(raw: string): {
  code?: number;
  statusText?: string;
  message?: string;
} | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      error?: { code?: number; status?: string; message?: string };
      code?: number;
      status?: string;
      message?: string;
    };
    const inner = parsed.error ?? parsed;
    if (inner && (inner.code || inner.status || inner.message)) {
      return {
        code: typeof inner.code === 'number' ? inner.code : undefined,
        statusText: typeof inner.status === 'string' ? inner.status : undefined,
        message: typeof inner.message === 'string' ? inner.message : undefined,
      };
    }
  } catch {
    // Ignore non-JSON payloads
  }
  return null;
}

export function parseGeminiApiError(
  err: unknown,
  modelName?: string
): ParsedGeminiError {
  const errObj =
    err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof errObj?.message === 'string'
      ? errObj.message
      : String(err ?? 'Unknown error');

  const inner = tryExtractInnerJsonError(rawMessage);
  const directStatus =
    typeof errObj?.status === 'number'
      ? errObj.status
      : typeof errObj?.statusCode === 'number'
      ? errObj.statusCode
      : typeof inner?.code === 'number'
      ? inner.code
      : undefined;

  const combinedText = `${rawMessage} ${inner?.statusText ?? ''} ${inner?.message ?? ''}`;
  const lower = combinedText.toLowerCase();

  let status = directStatus;
  if (!status) {
    if (
      lower.includes('api_key_invalid') ||
      lower.includes('api key not valid') ||
      lower.includes('invalid_argument') ||
      /\b400\b/.test(combinedText)
    ) {
      status = 400;
    } else if (lower.includes('unauthenticated') || /\b401\b/.test(combinedText)) {
      status = 401;
    } else if (
      lower.includes('permission_denied') ||
      lower.includes('forbidden') ||
      /\b403\b/.test(combinedText)
    ) {
      status = 403;
    } else if (
      lower.includes('not_found') ||
      lower.includes('is not found') ||
      /\b404\b/.test(combinedText)
    ) {
      status = 404;
    } else if (
      lower.includes('resource_exhausted') ||
      lower.includes('quota') ||
      lower.includes('rate limit') ||
      /\b429\b/.test(combinedText)
    ) {
      status = 429;
    } else if (
      lower.includes('unavailable') ||
      lower.includes('overloaded') ||
      /\b503\b/.test(combinedText)
    ) {
      status = 503;
    } else if (/\b500\b/.test(combinedText)) {
      status = 500;
    } else if (/\b502\b/.test(combinedText)) {
      status = 502;
    } else if (/\b504\b/.test(combinedText)) {
      status = 504;
    } else {
      status = 500;
    }
  }

  const isInvalidKey =
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key');

  const isAuthError =
    isInvalidKey ||
    status === 401 ||
    status === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated');

  const isRetryable =
    !isAuthError &&
    (status === 404 ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      lower.includes('unavailable') ||
      lower.includes('overloaded') ||
      lower.includes('timeout') ||
      lower.includes('econnreset'));

  let codeLabel = 'API Error';
  switch (status) {
    case 400:
      codeLabel = isInvalidKey ? 'Invalid API Key' : 'Bad Request';
      break;
    case 401:
      codeLabel = 'Unauthorized';
      break;
    case 403:
      codeLabel = 'Permission Denied';
      break;
    case 404:
      codeLabel = 'Model/Endpoint Not Found';
      break;
    case 429:
      codeLabel = 'Quota / Rate Limit Exceeded';
      break;
    case 502:
      codeLabel = 'Bad Gateway';
      break;
    case 503:
      codeLabel = 'Service Unavailable';
      break;
    case 504:
      codeLabel = 'Gateway Timeout';
      break;
    default:
      codeLabel = inner?.statusText || 'Internal Error';
      break;
  }

  const detail = (inner?.message || rawMessage).replace(/\s+/g, ' ').trim();
  const modelTag = modelName ? ` [${modelName}]` : '';
  const formatted = `HTTP ${status} (${codeLabel})${modelTag}: ${detail}`;

  return {
    status,
    codeLabel,
    detail,
    formatted,
    isAuthError,
    isRetryable,
  };
}
