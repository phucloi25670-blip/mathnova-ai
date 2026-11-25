import { LabCasioStep, LabCommandSet, LabSolutionStep } from '../types';
import {
  compileMathExpression,
  findFunctionExtrema,
  findFunctionIntersections,
  parseDesmosCommandsForCanvas,
  simpsonIntegrate,
} from './graph2dMath';

export interface LabPresetItem {
  id: string;
  label: string;
  recommendedMode: '2d' | '3d';
  prompt: string;
  badge: string;
  colorTheme: string;
}

export const LAB_PRESETS: LabPresetItem[] = [
  {
    id: 'solid-ox',
    label: 'Khối tròn xoay (Bình hoa)',
    recommendedMode: '3d',
    badge: '3D',
    prompt: 'Vẽ khối tròn xoay y = sqrt(x) từ 0 đến 4 quanh trục Ox.',
    colorTheme: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'sphere-plane',
    label: 'Mặt cầu & Mặt phẳng',
    recommendedMode: '3d',
    badge: '3D',
    prompt: 'Vẽ mặt cầu (x-1)^2 + (y-2)^2 + z^2 = 9 và mặt phẳng x + y + z = 0 trong Oxyz.',
    colorTheme: 'from-purple-600 to-indigo-600',
  },
  {
    id: 'pyramid',
    label: 'Hình chóp tứ giác đều',
    recommendedMode: '3d',
    badge: '3D',
    prompt: 'Vẽ hình chóp tứ giác đều S.ABCD có đáy cạnh 4 và chiều cao h = 5 trong không gian Oxyz.',
    colorTheme: 'from-amber-500 to-orange-600',
  },
  {
    id: 'area-2d',
    label: 'Miền diện tích Parabol',
    recommendedMode: '2d',
    badge: '2D',
    prompt: 'Tính diện tích hình phẳng giới hạn bởi y = x^2 và y = 2x từ 0 đến 2.',
    colorTheme: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'cubic-wave',
    label: 'Hàm số bậc ba uốn lượn',
    recommendedMode: '2d',
    badge: '2D',
    prompt: 'Vẽ đồ thị hàm số y = x^3 - 3x từ -2 đến 2.',
    colorTheme: 'from-blue-600 to-cyan-500',
  },
];

function normalizeMathChars(raw: string): string {
  return raw
    .trim()
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([a-zA-Z0-9]+)/g, 'sqrt($1)');
}

/**
 * Normalizes a Desmos expression so copy-paste works cleanly without LaTeX leakage.
 */
export function normalizeDesmosCommand(raw: string): string {
  return normalizeMathChars(raw)
    .replace(/\\le(?:q)?/g, '<=')
    .replace(/\\ge(?:q)?/g, '>=')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\min\b/g, 'min')
    .replace(/\\max\b/g, 'max')
    .replace(/\\abs\b/g, 'abs')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\pi\b/g, 'pi')
    .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\left\|/g, 'abs(')
    .replace(/\\right\|/g, ')')
    .replace(/\s{2,}/g, ' ');
}

function replaceBalancedCall(
  input: string,
  fnName: string,
  formatter: (inner: string) => string
): string {
  let out = input;
  const regex = new RegExp(`\\b${fnName}\\(`, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(out)) !== null) {
    const startIdx = match.index;
    const openParenIdx = startIdx + fnName.length;
    let depth = 1;
    let i = openParenIdx + 1;
    while (i < out.length && depth > 0) {
      if (out[i] === '(') depth += 1;
      else if (out[i] === ')') depth -= 1;
      i += 1;
    }
    if (depth !== 0) break;
    const inner = out.slice(openParenIdx + 1, i - 1);
    const replacement = formatter(inner);
    out = out.slice(0, startIdx) + replacement + out.slice(i);
    regex.lastIndex = startIdx + replacement.length;
  }

  return out;
}

/**
 * Converts clean human-readable Desmos ASCII commands (e.g. `0 <= y <= sqrt(x) {0 <= x <= 4}`)
 * into Desmos GraphingCalculator JS API `setExpression({ latex })` format.
 */
export function toDesmosApiLatex(asciiCmd: string): string {
  let out = normalizeMathChars(asciiCmd);
  out = out.replace(/\{([^}]+)\}/g, '\\left\\{$1\\right\\}');
  out = out.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge ');
  out = replaceBalancedCall(out, 'sqrt', (inner) => `\\sqrt{${inner}}`);
  out = replaceBalancedCall(out, 'abs', (inner) => `\\left|${inner}\\right|`);
  out = out.replace(/\^\(([^()]+)\)/g, '^{$1}');
  out = out.replace(/\^([+-][a-zA-Z0-9]+|[a-zA-Z0-9]{2,})/g, '^{$1}');
  out = out.replace(/\b(min|max|sin|cos|tan|cot|ln|log)\(/g, '\\$1(');
  out = out.replace(/\bpolygon\(/g, '\\operatorname{polygon}(');
  out = out.replace(/\bpi\b/g, '\\pi ');
  return out.replace(/\s{2,}/g, ' ').trim();
}

function toDisplayLatex(expr: string): string {
  let out = normalizeMathChars(expr);
  out = replaceBalancedCall(out, 'sqrt', (inner) => `\\sqrt{${inner}}`);
  out = replaceBalancedCall(out, 'abs', (inner) => `\\left|${inner}\\right|`);
  out = out.replace(/\^\(([^()]+)\)/g, '^{$1}');
  out = out.replace(/\^([+-]?\d+)/g, '^{$1}');
  out = out.replace(/\b(sin|cos|tan|cot|ln|log)\b/g, '\\$1');
  out = out.replace(/\bpi\b/g, '\\pi');
  out = out.replace(/\*/g, ' \\cdot ');
  return out.trim();
}

function fmtNum(val: number): string {
  const rounded = Math.round(val * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function extractBounds(
  text: string,
  defaultA: string,
  defaultB: string
): { bounds: [string, string]; hasExplicitBounds: boolean } {
  const eqBounds = text.match(
    /x\s*=\s*([+-]?\d+(?:\.\d+)?)\s*(?:,|và|đến)\s*x\s*=\s*([+-]?\d+(?:\.\d+)?)/i
  );
  if (eqBounds) return { bounds: [eqBounds[1], eqBounds[2]], hasExplicitBounds: true };

  const rangeBounds = text.match(
    /(?:từ|trên|đoạn)\s*(?:x\s*=\s*)?([+-]?\d+(?:\.\d+)?)\s*(?:đến|tới|->|-)\s*(?:x\s*=\s*)?([+-]?\d+(?:\.\d+)?)/i
  );
  if (rangeBounds) return { bounds: [rangeBounds[1], rangeBounds[2]], hasExplicitBounds: true };

  const bracketBounds = text.match(
    /[\[(]\s*([+-]?\d+(?:\.\d+)?)\s*[;,]\s*([+-]?\d+(?:\.\d+)?)\s*[\])]/
  );
  if (bracketBounds) return { bounds: [bracketBounds[1], bracketBounds[2]], hasExplicitBounds: true };

  return { bounds: [defaultA, defaultB], hasExplicitBounds: false };
}

const STOP_BOUNDARY_RE =
  /^\s+(?:và|với|trên|tại|từ|đến|đoạn|trục|quanh|bởi|lên|vào|cho|có|khi|tìm|tính|vẽ|giúp|khảo|cắt|tiếp|trong|khoảng|biết)(?=\s|$|[,;.!?])|^\s*(?:y|[fgh]\(\s*x\s*\))\s*=/i;

function scanBalancedExpr(text: string, startIdx: number): { expr: string; endIdx: number } {
  let i = startIdx;
  while (i < text.length && /\s/.test(text[i])) i += 1;

  const exprStart = i;
  let depth = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '(' || ch === '[') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ')' || ch === ']') {
      if (depth === 0) break;
      depth -= 1;
      i += 1;
      continue;
    }

    if (depth === 0) {
      if (ch === '\n' || ch === ';') break;
      if (ch === ',') break;
      if (ch === '.' && !/\d/.test(text[i + 1] || '')) break;
      const tail = text.slice(i);
      if (STOP_BOUNDARY_RE.test(tail)) break;
    }

    i += 1;
  }

  return {
    expr: text.slice(exprStart, i).trim(),
    endIdx: i,
  };
}

export function extractFunctionExpressions(rawInput: string): string[] {
  const input = normalizeMathChars(rawInput);
  const results: string[] = [];
  const lhsRegex = /(?:^|[\s,;.(])(?:y|[fgh]\(\s*x\s*\))\s*=/gi;
  let match: RegExpExecArray | null;

  while ((match = lhsRegex.exec(input)) !== null) {
    const eqIndex = match.index + match[0].length;
    const { expr, endIdx } = scanBalancedExpr(input, eqIndex);
    if (expr && /[x0-9a-zA-Z]/.test(expr)) {
      results.push(expr);
    }
    lhsRegex.lastIndex = Math.max(eqIndex + 1, endIdx);
  }

  return results;
}

function tryExtractBareMathExpression(rawInput: string): string | null {
  const cleaned = normalizeMathChars(rawInput)
    .replace(
      /^(?:hãy\s+)?(?:khảo sát(?:\s+và)?\s+)?(?:vẽ(?:\s+đồ thị)?(?:\s+hàm số)?|đồ thị(?:\s+hàm số)?|hàm số)\s*:?\s*/i,
      ''
    )
    .replace(/\s+(?:trên|từ|đoạn|trong|với|trục|quanh|tìm|và\s+tìm)(?=\s|$|[,;.!?]).*$/i, '')
    .replace(/[.;,]+$/, '')
    .trim();

  if (!cleaned || cleaned.includes('=')) return null;
  if (!/(?<![a-zA-Z])x(?![a-zA-Z])|x\^|\d\s*x|\([x0-9+-]/i.test(cleaned)) return null;

  const strippedTokens = cleaned
    .replace(/(?<![a-zA-Z])(?:sin|cos|tan|cot|sqrt|abs|ln|log|exp|pi|e)(?![a-zA-Z])/gi, '')
    .replace(/(?<![a-zA-Z])x(?![a-zA-Z])/gi, '')
    .replace(/[0-9+\-*/^().\s]/g, '');

  if (strippedTokens.length > 0) return null;
  return cleaned;
}

function parseSphereEquation(rawInput: string): { a: number; b: number; c: number; r: number } | null {
  const compact = normalizeMathChars(rawInput).replace(/\s+/g, '');

  const stdRegex =
    /(?:\(x([+-]\d+(?:\.\d+)?)\)\^2|x\^2)\+(?:\(y([+-]\d+(?:\.\d+)?)\)\^2|y\^2)\+(?:\(z([+-]\d+(?:\.\d+)?)\)\^2|z\^2)=(\d+(?:\.\d+)?)/i;
  const stdMatch = compact.match(stdRegex);
  if (stdMatch) {
    const a = stdMatch[1] ? -Number(stdMatch[1]) : 0;
    const b = stdMatch[2] ? -Number(stdMatch[2]) : 0;
    const c = stdMatch[3] ? -Number(stdMatch[3]) : 0;
    const rSq = Number(stdMatch[4]);
    if (rSq > 0) {
      return { a, b, c, r: Number(Math.sqrt(rSq).toFixed(3)) };
    }
  }

  if (
    compact.includes('x^2+y^2+z^2') &&
    compact.includes('=0') &&
    !/\([xyz][+-]/i.test(compact)
  ) {
    const tailMatch = compact.match(/x\^2\+y\^2\+z\^2(.+)=0/i);
    if (tailMatch) {
      const rest = tailMatch[1];
      const getCoeff = (varName: 'x' | 'y' | 'z') => {
        const m = rest.match(new RegExp(`([+-]?\\d*(?:\\.\\d+)?)${varName}(?![\\^a-zA-Z])`, 'i'));
        if (!m) return 0;
        const rawCoeff = m[1];
        if (!rawCoeff || rawCoeff === '+') return 1;
        if (rawCoeff === '-') return -1;
        return Number(rawCoeff);
      };
      const A = getCoeff('x');
      const B = getCoeff('y');
      const C = getCoeff('z');
      const strippedVars = rest.replace(/[+-]?\d*(?:\.\d+)?[xyz]/gi, '');
      const D = strippedVars ? Number(strippedVars) : 0;

      if (!Number.isNaN(D)) {
        const a = Number((-A / 2).toFixed(3));
        const b = Number((-B / 2).toFixed(3));
        const c = Number((-C / 2).toFixed(3));
        const rSq = a * a + b * b + c * c - D;
        if (rSq > 0) {
          return { a, b, c, r: Number(Math.sqrt(rSq).toFixed(3)) };
        }
      }
    }
  }

  return null;
}

function parsePlaneEquation(rawInput: string): { A: number; B: number; C: number; D: number; text: string } | null {
  const compact = normalizeMathChars(rawInput).replace(/\s+/g, '');
  const planeRegex = /([+-]?\d*(?:\.\d+)?x[+-]\d*(?:\.\d+)?y[+-]\d*(?:\.\d+)?z(?:[+-]\d+(?:\.\d+)?)?)=([+-]?\d+(?:\.\d+)?)/i;
  const match = compact.match(planeRegex);
  if (!match || compact.includes('x^2')) {
    if (compact.includes('x+y+z=0')) {
      return { A: 1, B: 1, C: 1, D: 0, text: 'x + y + z = 0' };
    }
    return null;
  }

  const lhs = match[1];
  const rhs = Number(match[2]);
  const getCoeff = (sym: 'x' | 'y' | 'z') => {
    const m = lhs.match(new RegExp(`([+-]?\\d*(?:\\.\\d+)?)${sym}`, 'i'));
    if (!m) return 0;
    if (!m[1] || m[1] === '+') return 1;
    if (m[1] === '-') return -1;
    return Number(m[1]);
  };
  const A = getCoeff('x');
  const B = getCoeff('y');
  const C = getCoeff('z');
  const stripped = lhs.replace(/[+-]?\d*(?:\.\d+)?[xyz]/gi, '');
  const lhsConst = stripped ? Number(stripped) : 0;
  const D = (Number.isFinite(lhsConst) ? lhsConst : 0) - (Number.isFinite(rhs) ? rhs : 0);
  return { A, B, C, D, text: `${match[1]} = ${match[2]}` };
}

function buildRevolutionPedagogy(expr: string, aStr: string, bStr: string): {
  solutionTitle: string;
  solutionSteps: LabSolutionStep[];
  finalResultLatex: string;
  casioSteps: LabCasioStep[];
} {
  const aNum = Number(aStr);
  const bNum = Number(bStr);
  const exprTex = toDisplayLatex(expr);
  const fn = compileMathExpression(expr);

  let exactFormula = `V = \\pi \\int_{${aStr}}^{${bStr}} \\left(${exprTex}\\right)^2 \\, dx`;
  let numericText = '';
  let exactValLatex = '';

  if (fn && Number.isFinite(aNum) && Number.isFinite(bNum)) {
    const integralNoPi = simpsonIntegrate((x) => {
      const y = fn(x);
      return Number.isFinite(y) ? y * y : 0;
    }, aNum, bNum);
    const volApprox = Math.PI * integralNoPi;
    const isSqrtX = expr.replace(/\s+/g, '') === 'sqrt(x)';
    if (isSqrtX) {
      const exactCoef = (bNum * bNum - aNum * aNum) / 2;
      exactFormula = `V = \\pi \\int_{${aStr}}^{${bStr}} x \\, dx = \\pi \\left.\\frac{x^2}{2}\\right|_{${aStr}}^{${bStr}} = ${fmtNum(exactCoef)}\\pi`;
      exactValLatex = `V = ${fmtNum(exactCoef)}\\pi \\approx ${fmtNum(volApprox)}`;
    } else {
      exactValLatex = `V \\approx ${fmtNum(integralNoPi)}\\pi \\approx ${fmtNum(volApprox)}`;
    }
    numericText = `Tính giá trị gần đúng: $\\int_{${aStr}}^{${bStr}} [f(x)]^2 dx \\approx ${fmtNum(integralNoPi)} \\Rightarrow V \\approx ${fmtNum(volApprox)}$.`;
  } else {
    exactValLatex = exactFormula;
    numericText = 'Tính nguyên hàm của $[f(x)]^2$, thế cận trên $b$ trừ cận dưới $a$ rồi nhân thêm $\\pi$.';
  }

  return {
    solutionTitle: `Tính thể tích khối tròn xoay $y = ${exprTex}$ quanh $Ox$ trên $[${aStr}; ${bStr}]$`,
    solutionSteps: [
      {
        title: 'Bước 1: Xác định hàm sinh và hai cận tích phân',
        detail: `Hình phẳng giới hạn bởi đường cong $y = ${exprTex}$, trục hoành $y = 0$ và hai đường thẳng $x = ${aStr}$, $x = ${bStr}$.`,
      },
      {
        title: 'Bước 2: Áp dụng công thức thể tích khối tròn xoay quanh Ox',
        detail: 'Khi quay hình phẳng quanh trục $Ox$, mặt cắt vuông góc với $Ox$ tại $x$ là hình tròn bán kính $R = |f(x)|$.',
        formulaLatex: `V = \\pi \\int_{${aStr}}^{${bStr}} \\left(${exprTex}\\right)^2 \\, dx`,
      },
      {
        title: 'Bước 3: Khai triển, lấy nguyên hàm và tính kết quả',
        detail: numericText,
        formulaLatex: exactFormula,
      },
    ],
    finalResultLatex: exactValLatex,
    casioSteps: [
      {
        title: 'Bấm tích phân không chứa $\\pi$ trước để so sánh đáp án trắc nghiệm',
        keys: ['MENU', '1', '∫', '(', expr, ')', 'x²', aStr, '▲', bStr, '='],
        explanation: `Nhập biểu thức $\\int_{${aStr}}^{${bStr}} (${exprTex})^2 dx$ trên Casio fx-580VNX để ra hệ số đi kèm $\\pi$ (tránh số thập phân lẻ khó nhận diện).`,
      },
      {
        title: 'Nhân thêm $\\pi$ để kiểm tra giá trị thập phân cuối cùng',
        keys: ['×', 'SHIFT', '×10ˣ', '='],
        explanation: 'So sánh kết quả xấp xỉ thu được với 4 phương án A, B, C, D sau khi bấm S⇔D.',
      },
    ],
  };
}

function buildAreaPedagogy(f1: string, f2: string, aStr: string, bStr: string): {
  solutionTitle: string;
  solutionSteps: LabSolutionStep[];
  finalResultLatex: string;
  casioSteps: LabCasioStep[];
} {
  const f1Tex = toDisplayLatex(f1);
  const f2Tex = toDisplayLatex(f2);
  const aNum = Number(aStr);
  const bNum = Number(bStr);
  const fn1 = compileMathExpression(f1);
  const fn2 = compileMathExpression(f2);

  let intersectionDetail = `Xét phương trình hoành độ giao điểm $${f1Tex} = ${f2Tex}$ trên đoạn $[${aStr}; ${bStr}]$.`;
  let areaLatex = `S = \\int_{${aStr}}^{${bStr}} \\left|${f1Tex} - (${f2Tex})\\right| \\, dx`;

  if (fn1 && fn2 && Number.isFinite(aNum) && Number.isFinite(bNum)) {
    const pts = findFunctionIntersections(fn1, fn2, aNum - 0.1, bNum + 0.1);
    if (pts.length > 0) {
      const coords = pts.map((p) => `x = ${fmtNum(p.x)}`).join(', ');
      intersectionDetail = `Giải phương trình $${f1Tex} = ${f2Tex}$ tìm được các giao điểm: $${coords}$.`;
    }
    const areaVal = simpsonIntegrate((x) => {
      const v1 = fn1(x);
      const v2 = fn2(x);
      return Number.isFinite(v1) && Number.isFinite(v2) ? Math.abs(v1 - v2) : 0;
    }, aNum, bNum);
    const isClassicParabola =
      (f1.replace(/\s+/g, '') === 'x^2' && f2.replace(/\s+/g, '') === '2x') ||
      (f2.replace(/\s+/g, '') === 'x^2' && f1.replace(/\s+/g, '') === '2x');
    if (isClassicParabola && aNum === 0 && bNum === 2) {
      areaLatex = `S = \\int_0^2 (2x - x^2)\\,dx = \\left.\\left(x^2 - \\frac{x^3}{3}\\right)\\right|_0^2 = \\frac{4}{3} \\approx 1.333`;
    } else {
      areaLatex = `S = \\int_{${aStr}}^{${bStr}} \\left|${f1Tex} - (${f2Tex})\\right| \\, dx \\approx ${fmtNum(areaVal)}`;
    }
  }

  return {
    solutionTitle: `Diện tích hình phẳng giới hạn bởi $y = ${f1Tex}$ và $y = ${f2Tex}$ trên $[${aStr}; ${bStr}]$`,
    solutionSteps: [
      {
        title: 'Bước 1: Tìm hoành độ giao điểm (nếu cần xác định cận)',
        detail: intersectionDetail,
        formulaLatex: `${f1Tex} = ${f2Tex}`,
      },
      {
        title: 'Bước 2: Thiết lập công thức diện tích có dấu giá trị tuyệt đối',
        detail: 'Đặt $|f(x) - g(x)|$ trong dấu tích phân để đảm bảo diện tích luôn dương dù đồ thị nào nằm trên.',
        formulaLatex: `S = \\int_{${aStr}}^{${bStr}} \\left|(${f1Tex}) - (${f2Tex})\\right| \\, dx`,
      },
      {
        title: 'Bước 3: Xét dấu phá trị tuyệt đối & tính tích phân',
        detail: 'Chia nhỏ khoảng (nếu có nghiệm nằm trong $(a; b)$) hoặc tính trực tiếp nguyên hàm hiệu hai hàm số.',
        formulaLatex: areaLatex,
      },
    ],
    finalResultLatex: areaLatex,
    casioSteps: [
      {
        title: 'Bấm tích phân trị tuyệt đối trực tiếp trên Casio fx-580VNX',
        keys: ['MENU', '1', '∫', 'SHIFT', '(', '(', f1, ')', '−', '(', f2, ')', ')', aStr, '▲', bStr, '='],
        explanation: 'Tổ hợp phím SHIFT + ( tạo dấu giá trị tuyệt đối Abs giúp máy tính tự động lấy $|f(x) - g(x)|$, không bao giờ bị sai dấu âm.',
      },
      {
        title: 'Mẹo tìm giao điểm nhanh không cần giải tay',
        keys: ['SHIFT', 'CALC', '='],
        explanation: `Nhập biểu thức $(${f1Tex}) - (${f2Tex})$ rồi dùng SOLVE (SHIFT CALC) để dò nhanh nghiệm giao điểm.`,
      },
    ],
  };
}

function buildSpherePedagogy(
  sphere: { a: number; b: number; c: number; r: number },
  plane: { A: number; B: number; C: number; D: number; text: string } | null
): {
  solutionTitle: string;
  solutionSteps: LabSolutionStep[];
  finalResultLatex: string;
  casioSteps: LabCasioStep[];
} {
  const { a, b, c, r } = sphere;
  const rSq = fmtNum(r * r);
  const steps: LabSolutionStep[] = [
    {
      title: 'Bước 1: Xác định tâm $I$ và bán kính $R$ của mặt cầu $(S)$',
      detail: `Từ phương trình chuẩn, đổi dấu các hằng số trong ngoặc để tìm tọa độ tâm $I(${a}; ${b}; ${c})$ và bán kính $R = \\sqrt{${rSq}} = ${r}$.`,
      formulaLatex: `(S): \\left(x ${a >= 0 ? `- ${a}` : `+ ${Math.abs(a)}`}\\right)^2 + \\left(y ${b >= 0 ? `- ${b}` : `+ ${Math.abs(b)}`}\\right)^2 + \\left(z ${c >= 0 ? `- ${c}` : `+ ${Math.abs(c)}`}\\right)^2 = ${rSq}`,
    },
  ];

  let finalResultLatex = `I(${a}; ${b}; ${c}), \\quad R = ${r}`;

  if (plane) {
    const { A, B, C, D, text } = plane;
    const num = Math.abs(A * a + B * b + C * c + D);
    const denSq = A * A + B * B + C * C;
    const d = denSq > 0 ? num / Math.sqrt(denSq) : 0;
    steps.push({
      title: 'Bước 2: Tính khoảng cách từ tâm $I$ đến mặt phẳng $(P)$',
      detail: `Áp dụng công thức khoảng cách từ $I(${a}; ${b}; ${c})$ đến $(P): ${text}$.`,
      formulaLatex: `d(I, (P)) = \\frac{|${A}\\cdot(${a}) + ${B}\\cdot(${b}) + ${C}\\cdot(${c}) + (${D})|}{\\sqrt{${A}^2 + ${B}^2 + ${C}^2}} = \\frac{${fmtNum(num)}}{\\sqrt{${denSq}}} \\approx ${fmtNum(d)}`,
    });

    if (d < r) {
      const rSmallSq = r * r - d * d;
      const rSmall = Math.sqrt(rSmallSq);
      steps.push({
        title: 'Bước 3: Kết luận giao tuyến & tính bán kính đường tròn $(C)$',
        detail: `Vì $d(I, (P)) \\approx ${fmtNum(d)} < R = ${r}$, mặt phẳng $(P)$ cắt mặt cầu $(S)$ theo giao tuyến là đường tròn bán kính $r = \\sqrt{R^2 - d^2}$.`,
        formulaLatex: `r = \\sqrt{${r}^2 - d^2} = \\sqrt{${fmtNum(rSmallSq)}} \\approx ${fmtNum(rSmall)}`,
      });
      finalResultLatex = `d(I,(P)) \\approx ${fmtNum(d)} < R \\Rightarrow r = \\sqrt{${fmtNum(rSmallSq)}} \\approx ${fmtNum(rSmall)}`;
    } else if (Math.abs(d - r) < 1e-4) {
      steps.push({
        title: 'Bước 3: Kết luận vị trí tương đối',
        detail: `Vì $d(I,(P)) = R = ${r}$, mặt phẳng $(P)$ tiếp xúc với mặt cầu $(S)$.`,
      });
      finalResultLatex = `d(I,(P)) = R = ${r} \\text{ (Tiếp xúc)}`;
    } else {
      steps.push({
        title: 'Bước 3: Kết luận vị trí tương đối',
        detail: `Vì $d(I,(P)) \\approx ${fmtNum(d)} > R = ${r}$, mặt phẳng $(P)$ không cắt mặt cầu $(S)$.`,
      });
      finalResultLatex = `d(I,(P)) \\approx ${fmtNum(d)} > R \\text{ (Không cắt)}`;
    }
  } else {
    steps.push({
      title: 'Bước 2: Công thức diện tích & thể tích mặt cầu $(S)$',
      detail: 'Áp dụng công thức tính nhanh diện tích mặt cầu và thể tích khối cầu bán kính $R$.',
      formulaLatex: `S_{mc} = 4\\pi R^2 = ${fmtNum(4 * r * r)}\\pi, \\quad V = \\frac{4}{3}\\pi R^3 = ${fmtNum((4 * r * r * r) / 3)}\\pi`,
    });
  }

  return {
    solutionTitle: plane
      ? `Vị trí tương đối Mặt cầu tâm $I(${a}; ${b}; ${c})$ & Mặt phẳng $(P)$`
      : `Phân tích Mặt cầu tâm $I(${a}; ${b}; ${c})$, bán kính $R = ${r}$`,
    solutionSteps: steps,
    finalResultLatex,
    casioSteps: [
      {
        title: 'Dùng phím CALC kiểm tra điểm thuộc mặt cầu / mặt phẳng trong 5 giây',
        keys: ['(', 'x', '−', String(a), ')', 'x²', '+', '(', 'y', '−', String(b), ')', 'x²', '+', '(', 'M', '−', String(c), ')', 'x²', 'CALC'],
        explanation: 'Dùng biến X, Y và M (hoặc C) đại diện cho $x, y, z$, bấm CALC nhập tọa độ điểm đáp án. Nếu bằng $R^2$ thì điểm đó nằm trên mặt cầu!',
      },
      {
        title: 'Tính nhanh khoảng cách $d(I, (P))$ bằng phân số',
        keys: ['MENU', '1', 'a/b', 'SHIFT', '(', '...', ')', '▼', '√', '■', '='],
        explanation: 'Bấm phân số với trị tuyệt đối trên tử và căn bậc hai của tổng bình phương hệ số pháp tuyến dưới mẫu.',
      },
    ],
  };
}

function buildPyramidPedagogy(a: number, h: number): {
  solutionTitle: string;
  solutionSteps: LabSolutionStep[];
  finalResultLatex: string;
  casioSteps: LabCasioStep[];
} {
  const baseArea = a * a;
  const vol = (baseArea * h) / 3;
  const oa = (a * Math.SQRT2) / 2;
  const sa = Math.sqrt(h * h + oa * oa);
  const slant = Math.sqrt(h * h + (a / 2) * (a / 2));
  const edgeAngle = (Math.atan2(h, oa) * 180) / Math.PI;
  const dihedralAngle = (Math.atan2(h, a / 2) * 180) / Math.PI;

  return {
    solutionTitle: `Phân tích Hình chóp tứ giác đều $S.ABCD$ (đáy $a = ${a}$, cao $h = ${h}$)`,
    solutionSteps: [
      {
        title: 'Bước 1: Tính diện tích đáy & bán kính đường tròn ngoại tiếp đáy',
        detail: `Đáy $ABCD$ là hình vuông cạnh $a = ${a}$, tâm $O$ là giao điểm hai đường chéo $AC, BD$.`,
        formulaLatex: `S_{ABCD} = a^2 = ${fmtNum(baseArea)}, \\quad OA = \\frac{a\\sqrt{2}}{2} \\approx ${fmtNum(oa)}`,
      },
      {
        title: 'Bước 2: Tính cạnh bên $SA$ và trung đoạn $SM$ theo định lí Pythagore',
        detail: `Do chóp đều nên $SO \\perp (ABCD)$. Tam giác $SOA$ vuông tại $O$ và tam giác $SOM$ vuông tại $O$ (với $OM = \\frac{a}{2}$).`,
        formulaLatex: `SA = \\sqrt{SO^2 + OA^2} \\approx ${fmtNum(sa)}, \\quad SM = \\sqrt{SO^2 + \\left(\\frac{a}{2}\\right)^2} \\approx ${fmtNum(slant)}`,
      },
      {
        title: 'Bước 3: Thể tích khối chóp & góc nhị diện (GDPT 2018)',
        detail: `Thể tích $V = \\frac{1}{3} S_{ABCD} \\cdot SO$. Góc giữa cạnh bên và đáy là $\\widehat{SAO} \\approx ${fmtNum(edgeAngle)}^\\circ$, góc nhị diện $[S, BC, O] = \\widehat{SMO} \\approx ${fmtNum(dihedralAngle)}^\\circ$.`,
        formulaLatex: `V = \\frac{1}{3} \\cdot ${fmtNum(baseArea)} \\cdot ${h} = \\frac{${fmtNum(baseArea * h)}}{3} \\approx ${fmtNum(vol)}`,
      },
    ],
    finalResultLatex: `V = \\frac{${fmtNum(baseArea * h)}}{3} \\approx ${fmtNum(vol)}, \\quad SA \\approx ${fmtNum(sa)}`,
    casioSteps: [
      {
        title: 'Tính nhanh thể tích và cạnh bên bằng biểu thức liên hoàn',
        keys: ['a/b', '1', '▼', '3', '×', String(a), 'x²', '×', String(h), '='],
        explanation: 'Luôn để kết quả dạng phân số tối giản trước khi bấm S⇔D để đối chiếu đáp án chuẩn.',
      },
      {
        title: 'Tìm nhanh số đo góc giữa cạnh bên / mặt bên với đáy',
        keys: ['SHIFT', 'tan', 'a/b', String(h), '▼', String(a / 2), ')', '='],
        explanation: `Với góc nhị diện $[S, BC, O]$, bấm $\\arctan\\left(\\frac{2h}{a}\\right)$ để ra ngay góc $\\approx ${fmtNum(dihedralAngle)}^\\circ$.`,
      },
    ],
  };
}

function buildFunctionAnalysisPedagogy(expr: string, aStr: string, bStr: string): {
  solutionTitle: string;
  solutionSteps: LabSolutionStep[];
  finalResultLatex: string;
  casioSteps: LabCasioStep[];
} {
  const exprTex = toDisplayLatex(expr);
  const fn = compileMathExpression(expr);
  const aNum = Number(aStr);
  const bNum = Number(bStr);
  const lo = Number.isFinite(aNum) ? aNum : -3;
  const hi = Number.isFinite(bNum) ? bNum : 3;

  const isCubicDemo = expr.replace(/\s+/g, '') === 'x^3-3x';
  let extremaText = 'Giải phương trình $f\'(x) = 0$ để tìm các điểm tới hạn và xét dấu $f\'(x)$.';
  let extremaFormula = `f'(x) = 0`;
  let finalResult = `\\text{Khảo sát trên } [${lo}; ${hi}]`;

  if (isCubicDemo) {
    extremaText = 'Tính đạo hàm $y\' = 3x^2 - 3 = 0 \\Leftrightarrow x = \\pm 1$. Điểm cực đại $(-1; 2)$, điểm cực tiểu $(1; -2)$.';
    extremaFormula = `y' = 3x^2 - 3 = 0 \\Leftrightarrow x = -1 \\text{ (CĐ } y=2\\text{)}, \\; x = 1 \\text{ (CT } y=-2\\text{)}`;
    finalResult = `y_{\\text{CĐ}} = 2 \\text{ tại } x = -1, \\quad y_{\\text{CT}} = -2 \\text{ tại } x = 1`;
  } else if (fn) {
    const extrema = findFunctionExtrema(fn, lo, hi);
    if (extrema.length > 0) {
      const list = extrema
        .slice(0, 4)
        .map((e) => `${e.kind === 'max' ? 'CĐ' : 'CT'}(${fmtNum(e.x)}; ${fmtNum(e.y)})`)
        .join(', ');
      extremaText = `Trên đoạn $[${lo}; ${hi}]$, đồ thị có các điểm cực trị: $${list}$.`;
      extremaFormula = list;
      finalResult = list;
    }
  }

  return {
    solutionTitle: `Khảo sát biến thiên & cực trị hàm số $y = ${exprTex}$ trên $[${lo}; ${hi}]$`,
    solutionSteps: [
      {
        title: 'Bước 1: Xác định tập xác định & tính đạo hàm $y\'$',
        detail: `Xét hàm số $y = ${exprTex}$ trên đoạn khảo sát $[${lo}; ${hi}]$.`,
        formulaLatex: `y = ${exprTex}`,
      },
      {
        title: 'Bước 2: Tìm cực trị từ phương trình $f\'(x) = 0$',
        detail: extremaText,
        formulaLatex: extremaFormula,
      },
      {
        title: 'Bước 3: Đối chiếu giá trị hai đầu mút để kết luận Max / Min',
        detail: fn
          ? `Tại hai biên: $f(${lo}) \\approx ${fmtNum(fn(lo))}$ và $f(${hi}) \\approx ${fmtNum(fn(hi))}$.`
          : 'Tính $f(a), f(b)$ cùng các điểm cực trị nằm trong $(a; b)$ để tìm giá trị lớn nhất / nhỏ nhất.',
      },
    ],
    finalResultLatex: finalResult,
    casioSteps: [
      {
        title: 'Dùng chế độ Table (MENU 8) dò bảng biến thiên & Max/Min trong 10 giây',
        keys: ['MENU', '8', expr, '=', 'Start:', String(lo), '=', 'End:', String(hi), '=', 'Step:', fmtNum((hi - lo) / 20), '='],
        explanation: 'Quan sát cột $f(x)$ tăng/giảm để nhận diện ngay điểm cực đại, cực tiểu và GTLN/GTNN.',
      },
      {
        title: 'Kiểm tra nhanh $f\'(x_0) = 0$ bằng đạo hàm tại điểm',
        keys: ['SHIFT', '∫', expr, ',', 'x₀', '='],
        explanation: 'Tổ hợp SHIFT + ∫ tạo $d/dx$, thay thử $x_0$ từ đáp án; nếu kết quả bằng 0 thì $x_0$ là điểm dừng!',
      },
    ],
  };
}

export function ensureLabPedagogy(commandSet: LabCommandSet, prompt = ''): LabCommandSet {
  if (
    Array.isArray(commandSet.solutionSteps) &&
    commandSet.solutionSteps.length > 0 &&
    Array.isArray(commandSet.casioSteps) &&
    commandSet.casioSteps.length > 0
  ) {
    return commandSet;
  }

  const fallback = buildLocalLabCommands(prompt || commandSet.title || '');
  return {
    ...commandSet,
    problemSummary: commandSet.problemSummary || fallback.problemSummary,
    solutionTitle: commandSet.solutionTitle || fallback.solutionTitle,
    solutionSteps:
      commandSet.solutionSteps && commandSet.solutionSteps.length > 0
        ? commandSet.solutionSteps
        : fallback.solutionSteps,
    finalResultLatex: commandSet.finalResultLatex || fallback.finalResultLatex,
    casioSteps:
      commandSet.casioSteps && commandSet.casioSteps.length > 0
        ? commandSet.casioSteps
        : fallback.casioSteps,
  };
}

function tryPassthroughCommands(rawInput: string): LabCommandSet | null {
  const lines = normalizeMathChars(rawInput)
    .split(/[\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const ggbCmdRegex =
    /^(?:[A-Z]\w*\s*=\s*\([^)]+\)|(?:[A-Za-z]\w*\s*:)?\s*(?:Sphere|Pyramid|Surface|Plane|Line|Segment|Polygon|Circle|Cylinder|Cone|Prism|Vector|PerpendicularVector|PerpendicularLine|Integral|IntegralBetween|Extremum)\s*\(.+\))$/i;

  if (!lines.every((l) => ggbCmdRegex.test(l))) {
    return null;
  }

  return {
    title: 'Lệnh GeoGebra 3D trực tiếp',
    desmos2d: lines.map(normalizeDesmosCommand),
    geogebra3d: lines,
    notes: 'Đã nhận diện lệnh chuẩn trực tiếp — bấm "Vẽ ngay lên đồ thị" để đẩy thẳng vào GeoGebra 3D.',
    source: 'local',
    solutionTitle: 'Thực thi chuỗi lệnh GeoGebra 3D / Desmos trực tiếp',
    solutionSteps: [
      {
        title: 'Bước 1: Đọc hệ tọa độ & đối tượng hình học từ câu lệnh',
        detail: `Hệ thống đang dựng ${lines.length} đối tượng trực tiếp trên không gian mô phỏng.`,
      },
      {
        title: 'Bước 2: Xoay 3D & bật chế độ Nét đứt Cạnh khuất (SGK)',
        detail: 'Quan sát giao tuyến, đường cao và các cạnh khuất tự động đổi nét đứt theo góc nhìn.',
      },
    ],
    casioSteps: [
      {
        title: 'Kiểm tra tọa độ và độ dài đoạn thẳng trên Casio fx-580VNX',
        keys: ['MENU', '5', '1', '3', '='],
        explanation: 'Dùng chế độ Vectơ (MENU 5) nhập tọa độ các điểm A, B, S để tính nhanh tích có hướng, thể tích tứ diện và góc.',
      },
    ],
  };
}

export function inferRecommendedLabMode(prompt: string): '2d' | '3d' {
  const lower = normalizeMathChars(prompt).toLowerCase();
  if (
    lower.includes('mặt cầu') ||
    lower.includes('mặt phẳng') ||
    lower.includes('hình chóp') ||
    lower.includes('tứ diện') ||
    lower.includes('hình hộp') ||
    lower.includes('lăng trụ') ||
    lower.includes('tròn xoay') ||
    lower.includes('oxyz') ||
    lower.includes('3d') ||
    lower.includes('z^2') ||
    lower.includes('sphere(') ||
    lower.includes('pyramid(') ||
    lower.includes('surface(') ||
    lower.includes('plane(') ||
    /\(z\s*[+-]|\bz\s*=/i.test(lower) ||
    /\(\s*[+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?\s*\)/.test(lower)
  ) {
    return '3d';
  }
  return '2d';
}

export function buildLocalLabCommands(rawPrompt: string): LabCommandSet {
  const text = normalizeMathChars(rawPrompt);
  const lower = text.toLowerCase();

  const passthrough = tryPassthroughCommands(text);
  if (passthrough) return passthrough;

  // Detect Sphere & Plane combination
  if (lower.includes('mặt cầu') && lower.includes('mặt phẳng')) {
    const parsedSphere = parseSphereEquation(text) || { a: 1, b: 2, c: 0, r: 3 };
    const parsedPlane = parsePlaneEquation(text) || { A: 1, B: 1, C: 1, D: 0, text: 'x + y + z = 0' };
    const { a, b, c, r } = parsedSphere;
    const rSq = Number((r * r).toFixed(3));
    const fmtShift = (v: number, sym: string) =>
      v === 0 ? `${sym}^2` : v > 0 ? `(${sym} - ${v})^2` : `(${sym} + ${Math.abs(v)})^2`;
    const pedagogy = buildSpherePedagogy(parsedSphere, parsedPlane);

    return {
      title: 'Giao tuyến Mặt cầu & Mặt phẳng trong Oxyz',
      desmos2d: [
        `${fmtShift(a, 'x')} + ${fmtShift(b, 'y')} = ${rSq}`,
        `(${a}, ${b})`,
        `x + y = 0`,
      ].map(normalizeDesmosCommand),
      geogebra3d: [
        `I = (${a}, ${b}, ${c})`,
        `Sphere(I, ${r})`,
        `P: ${parsedPlane.text}`,
        `Intersect(Sphere(I, ${r}), P)`,
      ],
      notes: `Dựng mặt cầu tâm I(${a}; ${b}; ${c}) bán kính R=${r} và mặt phẳng ${parsedPlane.text} cùng giao tuyến.`,
      source: 'local',
      problemSummary: rawPrompt,
      ...pedagogy,
    };
  }

  if (lower.includes('hình chóp') || lower.includes('tứ diện') || lower.includes('pyramid')) {
    const sideMatch = text.match(/cạnh\s*(?:đáy\s*)?(?:bằng\s*|=\s*)?(\d+(?:\.\d+)?)/i);
    const heightMatch = text.match(/(?:chiều cao|h)\s*(?:bằng\s*|=\s*)?(\d+(?:\.\d+)?)/i);
    const a = sideMatch ? Number(sideMatch[1]) : 4;
    const h = heightMatch ? Number(heightMatch[1]) : 5;
    const half = Number((a / 2).toFixed(2));
    const pedagogy = buildPyramidPedagogy(a, h);

    return {
      title: lower.includes('tứ diện') ? 'Hình Tứ diện S.ABC (Oxyz)' : 'Hình chóp tứ giác đều S.ABCD (Oxyz)',
      desmos2d: [
        `polygon((-${half}, -${half}), (${half}, -${half}), (${half}, ${half}), (-${half}, ${half}))`,
        `(0, 0)`,
      ].map(normalizeDesmosCommand),
      geogebra3d: [
        `A = (-${half}, -${half}, 0)`,
        `B = (${half}, -${half}, 0)`,
        `C = (${half}, ${half}, 0)`,
        `D = (-${half}, ${half}, 0)`,
        `S = (0, 0, ${h})`,
        `Pyramid(A, B, C, D, S)`,
      ],
      notes: `Hình chóp S.ABCD có đáy hình vuông cạnh ${a}, đường cao SO = ${h}.`,
      source: 'local',
      problemSummary: rawPrompt,
      ...pedagogy,
    };
  }

  const parsedSphere = parseSphereEquation(text);
  if (parsedSphere) {
    const { a, b, c, r } = parsedSphere;
    const rSq = Number((r * r).toFixed(3));
    const fmtShift = (v: number, sym: string) =>
      v === 0 ? `${sym}^2` : v > 0 ? `(${sym} - ${v})^2` : `(${sym} + ${Math.abs(v)})^2`;
    const pedagogy = buildSpherePedagogy(parsedSphere, null);
    return {
      title: `Mặt cầu tâm I(${a}; ${b}; ${c}), bán kính R = ${r}`,
      desmos2d: [
        `${fmtShift(a, 'x')} + ${fmtShift(b, 'y')} = ${rSq}`,
        `(${a}, ${b})`,
      ].map(normalizeDesmosCommand),
      geogebra3d: [`I = (${a}, ${b}, ${c})`, `Sphere(I, ${r})`],
      notes: `Mặt cầu tâm I(${a}; ${b}; ${c}), bán kính R = ${r}.`,
      source: 'local',
      problemSummary: rawPrompt,
      ...pedagogy,
    };
  }

  if (lower.includes('mặt cầu')) {
    const centerMatch = text.match(
      /(?:tâm\s*[A-Z]?\s*)?\(\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*\)/i
    );
    const radiusMatch = text.match(/(?:bán kính|r)\s*(?:bằng|=|:)?\s*(\d+(?:\.\d+)?)/i);
    const a = centerMatch ? Number(centerMatch[1]) : 1;
    const b = centerMatch ? Number(centerMatch[2]) : -2;
    const c = centerMatch ? Number(centerMatch[3]) : 3;
    const r = radiusMatch ? Number(radiusMatch[1]) : 4;
    const rSq = Number((r * r).toFixed(3));
    const pedagogy = buildSpherePedagogy({ a, b, c, r }, null);
    return {
      title: `Mặt cầu tâm I(${a}; ${b}; ${c}), bán kính R = ${r}`,
      desmos2d: [
        `(x - (${a}))^2 + (y - (${b}))^2 = ${rSq}`,
        `(${a}, ${b})`,
      ].map(normalizeDesmosCommand),
      geogebra3d: [`I = (${a}, ${b}, ${c})`, `Sphere(I, ${r})`],
      notes: `Mặt cầu tâm I(${a}; ${b}; ${c}), bán kính R = ${r}.`,
      source: 'local',
      problemSummary: rawPrompt,
      ...pedagogy,
    };
  }

  const compactText = text.replace(/\s+/g, '');
  const circle2dMatch = compactText.match(
    /(?:\(x([+-]\d+(?:\.\d+)?)\)\^2|x\^2)\+(?:\(y([+-]\d+(?:\.\d+)?)\)\^2|y\^2)=(\d+(?:\.\d+)?)/i
  );
  if (circle2dMatch && !compactText.includes('z')) {
    const a = circle2dMatch[1] ? -Number(circle2dMatch[1]) : 0;
    const b = circle2dMatch[2] ? -Number(circle2dMatch[2]) : 0;
    const rSq = Number(circle2dMatch[3]);
    const r = Number(Math.sqrt(rSq).toFixed(3));
    const eq = `${a === 0 ? 'x^2' : `(x - (${a}))^2`} + ${b === 0 ? 'y^2' : `(y - (${b}))^2`} = ${rSq}`;
    return {
      title: `Đường tròn tâm I(${a}; ${b}), bán kính R = ${r}`,
      desmos2d: [eq, `(${a}, ${b})`].map(normalizeDesmosCommand),
      geogebra3d: [`I = (${a}, ${b}, 0)`, eq],
      notes: `Đường tròn tâm I(${a}; ${b}), bán kính R = ${r}.`,
      source: 'local',
      problemSummary: rawPrompt,
      solutionTitle: `Xác định tâm & bán kính đường tròn $(C)$ trong Oxy`,
      solutionSteps: [
        {
          title: 'Bước 1: Đưa về phương trình chính tắc $(x - a)^2 + (y - b)^2 = R^2$',
          detail: `Tâm $I(${a}; ${b})$ và bình phương bán kính $R^2 = ${rSq}$.`,
          formulaLatex: eq,
        },
        {
          title: 'Bước 2: Chu vi & Diện tích hình tròn',
          detail: `Đường kính $2R = ${fmtNum(2 * r)}$.`,
          formulaLatex: `C = 2\\pi R = ${fmtNum(2 * r)}\\pi, \\quad S = \\pi R^2 = ${rSq}\\pi`,
        },
      ],
      finalResultLatex: `I(${a}; ${b}), \\quad R = ${r}`,
      casioSteps: [
        {
          title: 'Kiểm tra điểm thuộc đường tròn bằng phím CALC',
          keys: ['(', 'x', '−', String(a), ')', 'x²', '+', '(', 'y', '−', String(b), ')', 'x²', 'CALC'],
          explanation: `Thay tọa độ điểm cần xét; nếu kết quả bằng ${rSq} thì điểm nằm trên đường tròn.`,
        },
      ],
    };
  }

  const eqs = extractFunctionExpressions(text);
  const { bounds, hasExplicitBounds } = extractBounds(text, '0', '4');
  const [a, b] = bounds;

  if (lower.includes('tròn xoay') || lower.includes('quay quanh ox')) {
    const expr = eqs[0] || tryExtractBareMathExpression(text) || 'sqrt(x)';
    const pedagogy = buildRevolutionPedagogy(expr, a, b);
    return {
      title: `Khối tròn xoay y = ${expr} quanh Ox [${a}; ${b}]`,
      desmos2d: [`f(x) = ${expr}`, `0 <= y <= f(x) {${a} <= x <= ${b}}`].map(normalizeDesmosCommand),
      geogebra3d: [
        `f(x) = If(${a} <= x <= ${b}, ${expr})`,
        `Surface(t, f(t)*cos(u), f(t)*sin(u), t, ${a}, ${b}, u, 0, 2*pi)`,
      ],
      notes: 'Khối tròn xoay tích phân đa sắc màu.',
      source: 'local',
      problemSummary: rawPrompt,
      ...pedagogy,
    };
  }

  if (
    lower.includes('diện tích') ||
    lower.includes('hình phẳng') ||
    lower.includes('tích phân') ||
    lower.includes('giới hạn bởi')
  ) {
    const [areaA, areaB] = hasExplicitBounds ? [a, b] : ['0', '2'];
    const f1 = eqs[0] || tryExtractBareMathExpression(text) || 'x^2';
    const f2 = eqs[1] || '0';
    const pedagogy = buildAreaPedagogy(f1, f2, areaA, areaB);

    return {
      title: `Miền diện tích hình phẳng [${areaA}; ${areaB}]`,
      desmos2d: [
        `f(x) = ${f1}`,
        `g(x) = ${f2}`,
        `min(f(x), g(x)) <= y <= max(f(x), g(x)) {${areaA} <= x <= ${areaB}}`,
      ].map(normalizeDesmosCommand),
      geogebra3d: [
        `f(x) = ${f1}`,
        `g(x) = ${f2}`,
        `IntegralBetween(f, g, ${areaA}, ${areaB})`,
      ],
      notes: `Miền diện tích giữa y = ${f1} và y = ${f2}.`,
      source: 'local',
      problemSummary: rawPrompt,
      ...pedagogy,
    };
  }

  if (eqs.length > 0) {
    const fnNames = ['f', 'g', 'h', 'p'];
    const desmosLines = eqs.map((expr, idx) => `${fnNames[idx] || `f_${idx}`}(x) = ${expr}`);
    if (hasExplicitBounds) {
      desmosLines.push(`f(x) {${a} <= x <= ${b}}`);
    }

    const ggbLines = eqs.map((expr, idx) =>
      hasExplicitBounds && idx === 0
        ? `${fnNames[idx]}(x) = If(${a} <= x <= ${b}, ${expr})`
        : `${fnNames[idx] || `f_${idx}`}(x) = ${expr}`
    );

    const [loStr, hiStr] = hasExplicitBounds ? [a, b] : ['-3', '3'];
    const pedagogy =
      eqs.length >= 2
        ? buildAreaPedagogy(eqs[0], eqs[1], loStr, hiStr)
        : buildFunctionAnalysisPedagogy(eqs[0], loStr, hiStr);

    return {
      title: eqs.length === 1 ? `Đồ thị hàm số y = ${eqs[0]}` : `Đồ thị ${eqs.length} hàm số`,
      desmos2d: desmosLines.map(normalizeDesmosCommand),
      geogebra3d: ggbLines,
      notes: `Đã bóc tách biểu thức ${eqs.map((e) => `y = ${e}`).join(', ')}.`,
      source: 'local',
      problemSummary: rawPrompt,
      ...pedagogy,
    };
  }

  const bareExpr = tryExtractBareMathExpression(text);
  if (bareExpr) {
    const desmosLines = [`f(x) = ${bareExpr}`];
    if (hasExplicitBounds) {
      desmosLines.push(`f(x) {${a} <= x <= ${b}}`);
    }
    const [loStr, hiStr] = hasExplicitBounds ? [a, b] : ['-3', '3'];
    const pedagogy = buildFunctionAnalysisPedagogy(bareExpr, loStr, hiStr);
    return {
      title: `Đồ thị hàm số y = ${bareExpr}`,
      desmos2d: desmosLines.map(normalizeDesmosCommand),
      geogebra3d: [
        hasExplicitBounds ? `f(x) = If(${a} <= x <= ${b}, ${bareExpr})` : `f(x) = ${bareExpr}`,
      ],
      notes: `Đã nhận diện biểu thức y = ${bareExpr}.`,
      source: 'local',
      problemSummary: rawPrompt,
      ...pedagogy,
    };
  }

  const fallbackPedagogy = buildFunctionAnalysisPedagogy('x^3 - 3x', '-2', '2');
  return {
    title: 'Mẫu trực quan hóa 2D & 3D',
    desmos2d: [`f(x) = x^3 - 3x`, `f(x) {-2 <= x <= 2}`].map(normalizeDesmosCommand),
    geogebra3d: [`I = (1, 2, 0)`, `Sphere(I, 3)`],
    notes: 'Nhập hàm số hoặc phương trình mặt cầu.',
    source: 'local',
    problemSummary: rawPrompt,
    ...fallbackPedagogy,
  };
}

// Export helper reference to keep TypeScript aware of Canvas scene parsing usage
export { parseDesmosCommandsForCanvas };
