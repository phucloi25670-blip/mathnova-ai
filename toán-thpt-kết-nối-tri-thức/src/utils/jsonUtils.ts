export class HtmlResponseError extends Error {
  status: number;
  rawSnippet: string;

  constructor(message: string, status = 200, rawSnippet = '') {
    super(message);
    this.name = 'HtmlResponseError';
    this.status = status;
    this.rawSnippet = rawSnippet;
  }
}

/**
 * Strips leading/trailing Markdown code fences (e.g. ```json ... ```) from LLM output.
 */
export function stripMarkdownJsonFences(rawText: string): string {
  let cleaned = (rawText || '').trim();
  if (!cleaned) return '';

  const fencedMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch && fencedMatch[1] !== undefined) {
    cleaned = fencedMatch[1].trim();
  } else {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  return cleaned;
}

/**
 * Safely parses JSON returned by Gemini or backend proxies, rejecting HTML error pages
 * and extracting valid JSON payloads even if wrapped in Markdown fences or extra prose.
 */
export function parseCleanGeminiJson<T = unknown>(rawText: string): T {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    throw new Error('Phản hồi từ máy chủ rỗng, không có dữ liệu JSON.');
  }

  if (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<')
  ) {
    throw new HtmlResponseError(
      'Máy chủ trả về trang HTML thay vì JSON (kiểm tra đường dẫn API hoặc cấu hình Gemini API Key).',
      200,
      trimmed.slice(0, 160)
    );
  }

  const unfenced = stripMarkdownJsonFences(trimmed);

  try {
    return JSON.parse(unfenced) as T;
  } catch {
    // Attempt to locate outermost JSON object or array if prose leaked around it
    const firstObj = unfenced.indexOf('{');
    const firstArr = unfenced.indexOf('[');
    let start = -1;
    let end = -1;

    if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
      start = firstArr;
      end = unfenced.lastIndexOf(']');
    } else if (firstObj !== -1) {
      start = firstObj;
      end = unfenced.lastIndexOf('}');
    }

    if (start !== -1 && end > start) {
      const sliced = unfenced.slice(start, end + 1);
      return JSON.parse(sliced) as T;
    }

    throw new Error(
      `Dữ liệu JSON từ AI không hợp lệ: ${unfenced.slice(0, 120)}`
    );
  }
}

/**
 * Reads Response as text first (never calling response.json() blindly on HTML pages),
 * handles !res.ok clearly, and returns parsed JSON or throws HtmlResponseError / clear Error.
 */
export async function safeParseJsonResponse<T = unknown>(
  res: Response,
  fallbackLabel: string
): Promise<T> {
  const rawText = await res.text().catch(() => '');
  const trimmed = rawText.trim();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const looksLikeHtml =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<');

  if (!res.ok) {
    let serverMsg = '';
    if (trimmed && !looksLikeHtml) {
      try {
        const parsed = parseCleanGeminiJson<{ error?: string; message?: string }>(
          trimmed
        );
        serverMsg = parsed.error || parsed.message || '';
      } catch {
        serverMsg = trimmed.slice(0, 220);
      }
    } else if (looksLikeHtml) {
      serverMsg =
        'Đường dẫn API trả về trang HTML lỗi thay vì JSON. Hãy kiểm tra lại kết nối hoặc API Key.';
    }

    const msg = serverMsg || res.statusText || fallbackLabel;
    if (/HTTP\s+\d{3}/i.test(msg)) {
      throw new Error(msg);
    }
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }

  if (looksLikeHtml) {
    throw new HtmlResponseError(
      'Máy chủ API trả về định dạng HTML (<!doctype html>) thay vì JSON.',
      res.status,
      trimmed.slice(0, 160)
    );
  }

  return parseCleanGeminiJson<T>(rawText);
}
