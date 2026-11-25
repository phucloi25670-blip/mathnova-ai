export interface Parsed2DFunction {
  name: string;
  expr: string;
  domain?: [number, number];
  fn: (x: number) => number;
}

export interface Parsed2DShadedRegion {
  a: number;
  b: number;
  upperFn: (x: number) => number;
  lowerFn: (x: number) => number;
  label: string;
}

export interface Parsed2DCircle {
  cx: number;
  cy: number;
  r: number;
  label: string;
}

export interface Parsed2DPolygon {
  points: Array<[number, number]>;
  label: string;
}

export interface Parsed2DPoint {
  x: number;
  y: number;
  label?: string;
}

export interface Parsed2DScene {
  functions: Parsed2DFunction[];
  shadedRegions: Parsed2DShadedRegion[];
  circles: Parsed2DCircle[];
  polygons: Parsed2DPolygon[];
  points: Parsed2DPoint[];
  suggestedBounds: { xMin: number; xMax: number; yMin: number; yMax: number };
}

export interface GraphPointFeature {
  x: number;
  y: number;
  label: string;
  kind: 'intersection' | 'max' | 'min';
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function tokenizeMath(raw: string): Token[] {
  const input = raw
    .trim()
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([a-zA-Z0-9]+)/g, 'sqrt($1)');

  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      let hasDot = false;
      while (i < input.length && (/[0-9]/.test(input[i]) || (input[i] === '.' && !hasDot))) {
        if (input[i] === '.') hasDot = true;
        numStr += input[i];
        i += 1;
      }
      const val = Number(numStr);
      if (Number.isNaN(val)) throw new Error(`Invalid number: ${numStr}`);
      tokens.push({ type: 'number', value: val });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i += 1;
      }
      tokens.push({ type: 'ident', value: ident.toLowerCase() });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }

    throw new Error(`Unsupported character in expression: ${ch}`);
  }

  return tokens;
}

const KNOWN_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sqrt',
  'abs',
  'ln',
  'log',
  'exp',
  'min',
  'max',
  'floor',
  'ceil',
]);

type AstNode =
  | { kind: 'num'; value: number }
  | { kind: 'var' }
  | { kind: 'unary'; op: '+' | '-'; arg: AstNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: AstNode; right: AstNode }
  | { kind: 'call'; name: string; args: AstNode[] };

function parseTokensToAst(tokens: Token[]): AstNode {
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const startsImplicitFactor = (tok: Token | undefined): boolean => {
    if (!tok) return false;
    return tok.type === 'number' || tok.type === 'ident' || tok.type === 'lparen';
  };

  function parseExpression(): AstNode {
    let node = parseTerm();
    while (true) {
      const tok = peek();
      if (tok?.type === 'op' && (tok.value === '+' || tok.value === '-')) {
        consume();
        const right = parseTerm();
        node = { kind: 'binary', op: tok.value, left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  function parseTerm(): AstNode {
    let node = parseUnary();
    while (true) {
      const tok = peek();
      if (tok?.type === 'op' && (tok.value === '*' || tok.value === '/')) {
        consume();
        const right = parseUnary();
        node = { kind: 'binary', op: tok.value, left: node, right };
      } else if (startsImplicitFactor(tok)) {
        const right = parseUnary();
        node = { kind: 'binary', op: '*', left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  function parseUnary(): AstNode {
    const tok = peek();
    if (tok?.type === 'op' && (tok.value === '+' || tok.value === '-')) {
      consume();
      const arg = parseUnary();
      return { kind: 'unary', op: tok.value, arg };
    }
    return parsePower();
  }

  function parsePower(): AstNode {
    const base = parsePrimary();
    const tok = peek();
    if (tok?.type === 'op' && tok.value === '^') {
      consume();
      const exponent = parseUnary();
      return { kind: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  function parsePrimary(): AstNode {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of math expression');

    if (tok.type === 'number') {
      consume();
      return { kind: 'num', value: tok.value };
    }

    if (tok.type === 'lparen') {
      consume();
      const inner = parseExpression();
      const close = peek();
      if (close?.type !== 'rparen') throw new Error('Missing closing parenthesis');
      consume();
      return inner;
    }

    if (tok.type === 'ident') {
      consume();
      const name = tok.value;

      if (peek()?.type === 'lparen' && KNOWN_FUNCTIONS.has(name)) {
        consume(); // '('
        const args: AstNode[] = [];
        if (peek()?.type !== 'rparen') {
          args.push(parseExpression());
          while (peek()?.type === 'comma') {
            consume();
            args.push(parseExpression());
          }
        }
        const close = peek();
        if (close?.type !== 'rparen') throw new Error(`Missing ')' after ${name}(`);
        consume();
        return { kind: 'call', name, args };
      }

      if (name === 'x' || name === 't') {
        return { kind: 'var' };
      }
      if (name === 'pi') {
        return { kind: 'num', value: Math.PI };
      }
      if (name === 'e') {
        return { kind: 'num', value: Math.E };
      }

      throw new Error(`Unknown symbol: ${name}`);
    }

    throw new Error('Unexpected token in math expression');
  }

  const ast = parseExpression();
  if (pos < tokens.length) {
    throw new Error('Unexpected trailing tokens in math expression');
  }
  return ast;
}

function evalAst(node: AstNode, x: number): number {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'var':
      return x;
    case 'unary': {
      const v = evalAst(node.arg, x);
      return node.op === '-' ? -v : v;
    }
    case 'binary': {
      const l = evalAst(node.left, x);
      const r = evalAst(node.right, x);
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return r === 0 ? NaN : l / r;
        case '^': {
          // Handle fractional odd roots safely when l < 0? Standard JS Math.pow returns NaN for non-integer exp on negative base
          return Math.pow(l, r);
        }
      }
    }
    case 'call': {
      const a = node.args.map((arg) => evalAst(arg, x));
      const v = a[0];
      switch (node.name) {
        case 'sin':
          return Math.sin(v);
        case 'cos':
          return Math.cos(v);
        case 'tan':
          return Math.tan(v);
        case 'cot': {
          const t = Math.tan(v);
          return Math.abs(t) < 1e-9 ? NaN : 1 / t;
        }
        case 'sqrt':
          return v < 0 ? NaN : Math.sqrt(v);
        case 'abs':
          return Math.abs(v);
        case 'ln':
          return v <= 0 ? NaN : Math.log(v);
        case 'log':
          return v <= 0 ? NaN : Math.log10(v);
        case 'exp':
          return Math.exp(v);
        case 'floor':
          return Math.floor(v);
        case 'ceil':
          return Math.ceil(v);
        case 'min':
          return Math.min(...a);
        case 'max':
          return Math.max(...a);
        default:
          return NaN;
      }
    }
  }
}

export function compileMathExpression(rawExpr: string): ((x: number) => number) | null {
  try {
    const cleaned = rawExpr.trim();
    if (!cleaned) return null;
    const tokens = tokenizeMath(cleaned);
    if (tokens.length === 0) return null;
    const ast = parseTokensToAst(tokens);
    return (x: number) => {
      try {
        const res = evalAst(ast, x);
        return Number.isFinite(res) ? res : NaN;
      } catch {
        return NaN;
      }
    };
  } catch {
    return null;
  }
}

export function evaluateMathExpression(rawExpr: string, x: number): number {
  const fn = compileMathExpression(rawExpr);
  return fn ? fn(x) : NaN;
}

export function simpsonIntegrate(
  fn: (x: number) => number,
  a: number,
  b: number,
  steps = 200
): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return 0;
  const sign = a > b ? -1 : 1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (hi - lo) / n;

  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const x = lo + i * h;
    // Slight inward nudge at endpoints for sqrt(0) or boundary stability
    const safeX = i === 0 ? lo + 1e-9 : i === n ? hi - 1e-9 : x;
    const y = fn(safeX);
    if (!Number.isFinite(y)) continue;
    const weight = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    sum += weight * y;
  }
  return sign * (h / 3) * sum;
}

function formatNumVal(val: number): number {
  const rounded = Math.round(val * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function findFunctionExtrema(
  fn: (x: number) => number,
  xMin: number,
  xMax: number
): GraphPointFeature[] {
  const samples = 450;
  const step = (xMax - xMin) / samples;
  const h = Math.max(step * 0.25, 1e-4);
  const deriv = (x: number) => {
    const y1 = fn(x + h);
    const y0 = fn(x - h);
    if (!Number.isFinite(y1) || !Number.isFinite(y0)) return NaN;
    return (y1 - y0) / (2 * h);
  };

  const rawPoints: GraphPointFeature[] = [];
  for (let i = 1; i < samples - 1; i++) {
    const x1 = xMin + i * step;
    const x2 = x1 + step;
    const d1 = deriv(x1);
    const d2 = deriv(x2);
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) continue;

    if (d1 * d2 <= 0 && (Math.abs(d1) > 1e-7 || Math.abs(d2) > 1e-7)) {
      let lo = x1;
      let hi = x2;
      let dLo = d1;
      for (let iter = 0; iter < 24; iter++) {
        const mid = (lo + hi) / 2;
        const dMid = deriv(mid);
        if (!Number.isFinite(dMid)) break;
        if (dLo * dMid <= 0) {
          hi = mid;
        } else {
          lo = mid;
          dLo = dMid;
        }
      }
      const rx = (lo + hi) / 2;
      const ry = fn(rx);
      if (Number.isFinite(ry) && Math.abs(ry) < 1e4) {
        const kind: 'max' | 'min' = d1 > 0 && d2 < 0 ? 'max' : 'min';
        const fx = formatNumVal(rx);
        const fy = formatNumVal(ry);
        rawPoints.push({
          x: rx,
          y: ry,
          kind,
          label: `${kind === 'max' ? 'CĐ' : 'CT'}(${fx}; ${fy})`,
        });
      }
    }
  }

  // Deduplicate close extrema
  const deduped: GraphPointFeature[] = [];
  for (const pt of rawPoints) {
    if (!deduped.some((existing) => Math.abs(existing.x - pt.x) < 0.05)) {
      deduped.push(pt);
    }
  }
  return deduped;
}

export function findFunctionIntersections(
  f1: (x: number) => number,
  f2: (x: number) => number,
  xMin: number,
  xMax: number
): GraphPointFeature[] {
  const samples = 500;
  const step = (xMax - xMin) / samples;
  const diff = (x: number) => {
    const a = f1(x);
    const b = f2(x);
    return Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN;
  };

  const found: GraphPointFeature[] = [];

  for (let i = 0; i < samples; i++) {
    const x1 = xMin + i * step;
    const x2 = x1 + step;
    const d1 = diff(x1);
    const d2 = diff(x2);
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) continue;

    if (Math.abs(d1) < 1e-4) {
      const y = f1(x1);
      if (Number.isFinite(y)) {
        found.push({
          x: x1,
          y,
          kind: 'intersection',
          label: `(${formatNumVal(x1)}; ${formatNumVal(y)})`,
        });
      }
      continue;
    }

    if (d1 * d2 < 0) {
      let lo = x1;
      let hi = x2;
      let dLo = d1;
      for (let iter = 0; iter < 26; iter++) {
        const mid = (lo + hi) / 2;
        const dMid = diff(mid);
        if (!Number.isFinite(dMid)) break;
        if (dLo * dMid <= 0) {
          hi = mid;
        } else {
          lo = mid;
          dLo = dMid;
        }
      }
      const rx = (lo + hi) / 2;
      const ry = f1(rx);
      if (Number.isFinite(ry) && Math.abs(ry) < 1e4) {
        found.push({
          x: rx,
          y: ry,
          kind: 'intersection',
          label: `(${formatNumVal(rx)}; ${formatNumVal(ry)})`,
        });
      }
    }
  }

  // Also check exact right endpoint
  const dEnd = diff(xMax);
  if (Number.isFinite(dEnd) && Math.abs(dEnd) < 1e-4) {
    const yEnd = f1(xMax);
    if (Number.isFinite(yEnd)) {
      found.push({
        x: xMax,
        y: yEnd,
        kind: 'intersection',
        label: `(${formatNumVal(xMax)}; ${formatNumVal(yEnd)})`,
      });
    }
  }

  const deduped: GraphPointFeature[] = [];
  for (const pt of found) {
    if (!deduped.some((existing) => Math.abs(existing.x - pt.x) < 0.04)) {
      deduped.push(pt);
    }
  }
  return deduped;
}

function parseBoundValue(raw: string): number {
  const fn = compileMathExpression(raw);
  return fn ? fn(0) : Number(raw);
}

function expandFuncReferences(expr: string, fnMap: Record<string, string>): string {
  let out = expr;
  for (const [fnName, fnExpr] of Object.entries(fnMap)) {
    const re = new RegExp(`\\b${fnName}\\(\\s*x\\s*\\)`, 'gi');
    out = out.replace(re, `(${fnExpr})`);
  }
  return out;
}

export function parseDesmosCommandsForCanvas(commands: string[]): Parsed2DScene {
  const functions: Parsed2DFunction[] = [];
  const fnExprMap: Record<string, string> = {};
  const shadedRegions: Parsed2DShadedRegion[] = [];
  const circles: Parsed2DCircle[] = [];
  const polygons: Parsed2DPolygon[] = [];
  const points: Parsed2DPoint[] = [];

  for (const rawLine of commands) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // 1. Domain condition {a <= x <= b}
    let domain: [number, number] | undefined;
    const domainMatch = line.match(
      /\{\s*([^{}<>=]+?)\s*<=\s*x\s*<=\s*([^{}<>=]+?)\s*\}/i
    );
    if (domainMatch) {
      const a = parseBoundValue(domainMatch[1]);
      const b = parseBoundValue(domainMatch[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        domain = [Math.min(a, b), Math.max(a, b)];
      }
    }
    const lineNoDomain = line.replace(/\{[^}]*\}/g, '').trim();

    // 2. Shaded region: min(f(x), g(x)) <= y <= max(f(x), g(x))
    const betweenMatch = lineNoDomain.match(
      /min\(([^,]+),\s*([^)]+)\)\s*<=\s*y\s*<=\s*max\(/i
    );
    if (betweenMatch && domain) {
      const expr1 = expandFuncReferences(betweenMatch[1].trim(), fnExprMap);
      const expr2 = expandFuncReferences(betweenMatch[2].trim(), fnExprMap);
      const fn1 = compileMathExpression(expr1);
      const fn2 = compileMathExpression(expr2);
      if (fn1 && fn2) {
        shadedRegions.push({
          a: domain[0],
          b: domain[1],
          upperFn: (x) => Math.max(fn1(x), fn2(x)),
          lowerFn: (x) => Math.min(fn1(x), fn2(x)),
          label: `Miền [${formatNumVal(domain[0])}; ${formatNumVal(domain[1])}]`,
        });
      }
      continue;
    }

    // 3. Shaded region: A <= y <= B
    const ineqMatch = lineNoDomain.match(/^(.+?)\s*<=\s*y\s*<=\s*(.+)$/i);
    if (ineqMatch && domain) {
      const lowExpr = expandFuncReferences(ineqMatch[1].trim(), fnExprMap);
      const highExpr = expandFuncReferences(ineqMatch[2].trim(), fnExprMap);
      const lowFn = compileMathExpression(lowExpr);
      const highFn = compileMathExpression(highExpr);
      if (lowFn && highFn) {
        shadedRegions.push({
          a: domain[0],
          b: domain[1],
          upperFn: highFn,
          lowerFn: lowFn,
          label: `Miền [${formatNumVal(domain[0])}; ${formatNumVal(domain[1])}]`,
        });
      }
      continue;
    }

    // 4. GeoGebra IntegralBetween(f, g, a, b)
    const integralMatch = lineNoDomain.match(
      /^IntegralBetween\(\s*([a-zA-Z])\s*,\s*([a-zA-Z])\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i
    );
    if (integralMatch) {
      const f1 = fnExprMap[integralMatch[1].toLowerCase()];
      const f2 = fnExprMap[integralMatch[2].toLowerCase()];
      const a = parseBoundValue(integralMatch[3]);
      const b = parseBoundValue(integralMatch[4]);
      const fn1 = f1 ? compileMathExpression(f1) : null;
      const fn2 = f2 ? compileMathExpression(f2) : null;
      if (fn1 && fn2 && Number.isFinite(a) && Number.isFinite(b)) {
        shadedRegions.push({
          a: Math.min(a, b),
          b: Math.max(a, b),
          upperFn: (x) => Math.max(fn1(x), fn2(x)),
          lowerFn: (x) => Math.min(fn1(x), fn2(x)),
          label: `Miền [${formatNumVal(Math.min(a, b))}; ${formatNumVal(Math.max(a, b))}]`,
        });
      }
      continue;
    }

    // 5. Polygon: polygon((x1, y1), (x2, y2), ...)
    const polyMatch = lineNoDomain.match(/^polygon\((.+)\)$/i);
    if (polyMatch) {
      const pairMatches = [...polyMatch[1].matchAll(/\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\)/g)];
      const pts: Array<[number, number]> = pairMatches.map((m) => [Number(m[1]), Number(m[2])]);
      if (pts.length >= 3) {
        polygons.push({ points: pts, label: 'Đa giác đáy' });
      }
      continue;
    }

    // 6. Circle: (x - a)^2 + (y - b)^2 = r^2
    const compact = lineNoDomain.replace(/\s+/g, '');
    const circleMatch = compact.match(
      /^(?:\(x(?:-?\(?([+-]?\d+(?:\.\d+)?)\)?|\+([+-]?\d+(?:\.\d+)?))\)\^2|x\^2)\+(?:\(y(?:-?\(?([+-]?\d+(?:\.\d+)?)\)?|\+([+-]?\d+(?:\.\d+)?))\)\^2|y\^2)=(\d+(?:\.\d+)?)$/i
    );
    if (circleMatch) {
      const parseShift = (negGroup?: string, posGroup?: string) => {
        if (negGroup !== undefined) {
          // Check original string around x to see if it was (x - a) or (x + a)
          return Number(negGroup);
        }
        if (posGroup !== undefined) return -Number(posGroup);
        return 0;
      };
      // Explicit robust check on (x - val)^2 vs (x + val)^2
      const extractCenter = (sym: 'x' | 'y'): number => {
        const paren = compact.match(new RegExp(`\\(${sym}([^)]+)\\)\\^2`, 'i'));
        if (!paren) return 0;
        const inner = paren[1].replace(/[()]/g, '');
        // e.g. "-1", "+2", "--2"
        const normalized = inner.replace(/--/g, '+').replace(/\+-/g, '-');
        const val = Number(normalized);
        return Number.isFinite(val) ? -val : 0;
      };
      const cx = extractCenter('x');
      const cy = extractCenter('y');
      void parseShift;
      const rSq = Number(circleMatch[5]);
      if (rSq > 0) {
        circles.push({
          cx,
          cy,
          r: Math.sqrt(rSq),
          label: lineNoDomain,
        });
      }
      continue;
    }

    // 7. Standalone Point: (x, y) or I = (x, y)
    const ptMatch = lineNoDomain.match(
      /^(?:([A-Za-z]\w*)\s*=\s*)?\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\)$/
    );
    if (ptMatch) {
      points.push({
        x: Number(ptMatch[2]),
        y: Number(ptMatch[3]),
        label: ptMatch[1] || `(${ptMatch[2]}; ${ptMatch[3]})`,
      });
      continue;
    }

    // 8. Function restriction line only: f(x) {a <= x <= b}
    const fnRestrictOnly = lineNoDomain.match(/^([fghp])\s*\(\s*x\s*\)$/i);
    if (fnRestrictOnly && domain) {
      const fnName = fnRestrictOnly[1].toLowerCase();
      const target = functions.find((f) => f.name.toLowerCase() === fnName);
      if (target) {
        target.domain = domain;
      }
      continue;
    }

    // 9. Function definition: f(x) = ... or y = ... or If(a <= x <= b, expr)
    const defMatch = lineNoDomain.match(/^(?:([a-zA-Z]\w*)\(\s*x\s*\)|y)\s*=\s*(.+)$/i);
    if (defMatch) {
      const fnName = (defMatch[1] || 'f').toLowerCase();
      let rhs = defMatch[2].trim();
      const ifMatch = rhs.match(/^If\(\s*([^<>=]+?)\s*<=\s*x\s*<=\s*([^,]+?)\s*,\s*(.+)\)$/i);
      if (ifMatch) {
        const a = parseBoundValue(ifMatch[1]);
        const b = parseBoundValue(ifMatch[2]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          domain = [Math.min(a, b), Math.max(a, b)];
        }
        rhs = ifMatch[3].trim();
      }

      const expandedRhs = expandFuncReferences(rhs, fnExprMap);
      const compiled = compileMathExpression(expandedRhs);
      if (compiled) {
        fnExprMap[fnName] = expandedRhs;
        const existing = functions.find((f) => f.name === fnName);
        if (existing) {
          existing.expr = rhs;
          existing.fn = compiled;
          if (domain) existing.domain = domain;
        } else {
          functions.push({
            name: fnName,
            expr: rhs,
            domain,
            fn: compiled,
          });
        }
      }
      continue;
    }

    // 10. Implicit line like x + y = 0 or ax + by + c = 0
    const linearMatch = lineNoDomain.match(/^([^=]+)=([^=]+)$/);
    if (linearMatch && !lineNoDomain.includes('z') && /y/i.test(lineNoDomain)) {
      // Try simple x + y = c -> y = c - x or similar if trivial
      const lhs = linearMatch[1].replace(/\s+/g, '');
      const rhs = linearMatch[2].replace(/\s+/g, '');
      if (lhs === 'x+y') {
        const expr = `${rhs} - x`;
        const compiled = compileMathExpression(expr);
        if (compiled) {
          functions.push({ name: 'd', expr, domain, fn: compiled });
        }
      }
    }
  }

  // Compute smart suggested viewport bounds
  let xMin = -5;
  let xMax = 5;
  let yMin = -4;
  let yMax = 4;

  const xs: number[] = [];
  const ys: number[] = [];

  for (const s of shadedRegions) {
    xs.push(s.a, s.b);
    for (let i = 0; i <= 24; i++) {
      const x = s.a + ((s.b - s.a) * i) / 24;
      const u = s.upperFn(x);
      const l = s.lowerFn(x);
      if (Number.isFinite(u) && Math.abs(u) < 50) ys.push(u);
      if (Number.isFinite(l) && Math.abs(l) < 50) ys.push(l);
    }
  }

  // Only sample unbounded functions across [-4, 4] when no shaded region, circle, or polygon already defines the focus area
  if (shadedRegions.length === 0 && circles.length === 0 && polygons.length === 0) {
    for (const f of functions) {
      const [da, db] = f.domain ?? [-4, 4];
      xs.push(da, db);
      for (let i = 0; i <= 24; i++) {
        const x = da + ((db - da) * i) / 24;
        const y = f.fn(x);
        if (Number.isFinite(y) && Math.abs(y) < 30) ys.push(y);
      }
    }
  }

  for (const c of circles) {
    xs.push(c.cx - c.r, c.cx + c.r);
    ys.push(c.cy - c.r, c.cy + c.r);
  }

  for (const poly of polygons) {
    for (const [px, py] of poly.points) {
      xs.push(px);
      ys.push(py);
    }
  }

  for (const pt of points) {
    xs.push(pt.x);
    ys.push(pt.y);
  }

  if (xs.length > 0 && ys.length > 0) {
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs, 0);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys, 0);
    const spanX = Math.max(4, maxX - minX);
    const spanY = Math.max(3.5, maxY - minY);
    xMin = minX - spanX * 0.35;
    xMax = maxX + spanX * 0.35;
    yMin = minY - spanY * 0.35;
    yMax = maxY + spanY * 0.35;
  }

  return {
    functions,
    shadedRegions,
    circles,
    polygons,
    points,
    suggestedBounds: { xMin, xMax, yMin, yMax },
  };
}
