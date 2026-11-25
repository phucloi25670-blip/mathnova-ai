import { ChapterData, QuizQuestion } from '../types';
import { fisherYatesShuffle } from './antiRepetition';

type Rng = () => number;

function randInt(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickOne<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function makeQuestion(params: {
  idPrefix: string;
  chapter: ChapterData;
  prompt: string;
  correctOption: string;
  distractors: string[];
  explanation: string;
  rng: Rng;
  seq: number;
}): QuizQuestion {
  const uniqueDistractors: string[] = [];
  for (const d of params.distractors) {
    if (d !== params.correctOption && !uniqueDistractors.includes(d)) {
      uniqueDistractors.push(d);
    }
  }
  let fallbackOffset = 17;
  while (uniqueDistractors.length < 3) {
    const candidate = `$${params.seq + uniqueDistractors.length + fallbackOffset}$`;
    fallbackOffset += 1;
    if (candidate !== params.correctOption && !uniqueDistractors.includes(candidate)) {
      uniqueDistractors.push(candidate);
    }
  }

  const options = fisherYatesShuffle(
    [params.correctOption, ...uniqueDistractors.slice(0, 3)],
    params.rng
  );
  const correctIndex = options.indexOf(params.correctOption);

  return {
    id: `${params.idPrefix}-${params.seq}-${Math.floor(params.rng() * 1e6)}`,
    grade: params.chapter.grade,
    chapterId: params.chapter.id,
    chapterTitle: params.chapter.title,
    format: 'multiple_choice',
    prompt: params.prompt,
    options,
    correctIndex,
    explanation: params.explanation,
  };
}

function fmtCoeff(val: number, varName: string, isFirst = false): string {
  if (val === 0) return '';
  if (isFirst) {
    if (val === 1) return varName;
    if (val === -1) return `-${varName}`;
    return `${val}${varName}`;
  }
  if (val === 1) return ` + ${varName}`;
  if (val === -1) return ` - ${varName}`;
  return val > 0 ? ` + ${val}${varName}` : ` - ${Math.abs(val)}${varName}`;
}

function fmtSignedConst(val: number): string {
  if (val === 0) return '';
  return val > 0 ? ` + ${val}` : ` - ${Math.abs(val)}`;
}

// ---------- Grade 10 Generators ----------

function gen10C1(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const kind = seq % 3;
  if (kind === 0) {
    const a = randInt(-4, 2, rng);
    const len1 = randInt(3, 6, rng);
    const b = a + len1;
    const c = a + randInt(1, 3, rng);
    const d = b + randInt(1, 4, rng);
    return makeQuestion({
      idPrefix: 'proc-10c1',
      chapter,
      seq,
      rng,
      prompt: `Cho hai tập hợp $A = [${a}; ${b}]$ và $B = (${c}; ${d})$. Tập hợp $A \\cap B$ là:`,
      correctOption: `$(${c}; ${b}]$`,
      distractors: [`$[${a}; ${d})$`, `$[${a}; ${c}]$`, `$(${c}; ${d})$`],
      explanation: `Phần chung của $[${a}; ${b}]$ và $(${c}; ${d})$ lấy đầu trái lớn hơn là $(${c}$ và đầu phải nhỏ hơn là ${b}]$.`,
    });
  }
  if (kind === 1) {
    const k = randInt(2, 9, rng);
    const rhs = randInt(1, 8, rng);
    return makeQuestion({
      idPrefix: 'proc-10c1',
      chapter,
      seq,
      rng,
      prompt: `Phủ định của mệnh đề "$\\forall x \\in \\mathbb{R},\\; x^2 + ${k} > ${rhs}$" là:`,
      correctOption: `$\\exists x \\in \\mathbb{R},\\; x^2 + ${k} \\le ${rhs}$`,
      distractors: [
        `$\\exists x \\in \\mathbb{R},\\; x^2 + ${k} < ${rhs}$`,
        `$\\forall x \\in \\mathbb{R},\\; x^2 + ${k} \\le ${rhs}$`,
        `$\\exists x \\in \\mathbb{R},\\; x^2 + ${k} \\ge ${rhs}$`,
      ],
      explanation: `Phủ định của $\\forall$ là $\\exists$ và phủ định của $>$ là $\\le$.`,
    });
  }
  const n1 = randInt(1, 3, rng);
  const n2 = n1 + randInt(2, 4, rng);
  return makeQuestion({
    idPrefix: 'proc-10c1',
    chapter,
    seq,
    rng,
    prompt: `Cho $A = (-\\infty; ${n2})$ và $B = [${n1}; +\\infty)$. Khi đó $A \\setminus B$ bằng:`,
    correctOption: `$(-\\infty; ${n1})$`,
    distractors: [`$(-\\infty; ${n1}]$`, `$[${n1}; ${n2})$`, `$(${n2}; +\\infty)$`],
    explanation: `Các phần tử thuộc $A$ nhưng không thuộc $B = [${n1}; +\\infty)$ là $(-\\infty; ${n1})$.`,
  });
}

function gen10C2(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const kind = seq % 3;
  const a = pickOne([-3, -2, -1, 1, 2, 3, 4], rng);
  const b = pickOne([-3, -2, -1, 1, 2, 3], rng);

  if (kind === 0) {
    // Strictly less than: ax + by < c
    const c = randInt(-3, 7, rng);
    const candidates: Array<[number, number]> = [];
    for (let x = -4; x <= 4; x++) {
      for (let y = -4; y <= 4; y++) {
        candidates.push([x, y]);
      }
    }
    const shuffledPts = fisherYatesShuffle(candidates, rng);
    const validPt = shuffledPts.find(([x, y]) => a * x + b * y < c) || [0, -10];
    const invalidPts = shuffledPts
      .filter(([x, y]) => a * x + b * y >= c)
      .slice(0, 3);

    const lhs = `${fmtCoeff(a, 'x', true)}${fmtCoeff(b, 'y', false)}`;
    return makeQuestion({
      idPrefix: 'proc-10c2',
      chapter,
      seq,
      rng,
      prompt: `Điểm $M(x_0; y_0)$ nào sau đây thuộc miền nghiệm của bất phương trình $${lhs} < ${c}$?`,
      correctOption: `$M(${validPt[0]}; ${validPt[1]})$`,
      distractors: invalidPts.map(([x, y]) => `$M(${x}; ${y})$`),
      explanation: `Thay tọa độ điểm $(${validPt[0]}; ${validPt[1]})$ vào vế trái được $${a * validPt[0] + b * validPt[1]} < ${c}$ (đúng).`,
    });
  }

  if (kind === 1) {
    // Point NOT belonging to >= c
    const c = randInt(-2, 6, rng);
    const candidates: Array<[number, number]> = [];
    for (let x = -3; x <= 3; x++) {
      for (let y = -3; y <= 3; y++) {
        candidates.push([x, y]);
      }
    }
    const shuffledPts = fisherYatesShuffle(candidates, rng);
    const notBelongPt = shuffledPts.find(([x, y]) => a * x + b * y < c) || [-10, -10];
    const belongPts = shuffledPts
      .filter(([x, y]) => a * x + b * y >= c)
      .slice(0, 3);

    const lhs = `${fmtCoeff(a, 'x', true)}${fmtCoeff(b, 'y', false)}`;
    return makeQuestion({
      idPrefix: 'proc-10c2',
      chapter,
      seq,
      rng,
      prompt: `Điểm nào sau đây KHÔNG thuộc miền nghiệm của bất phương trình $${lhs} \\ge ${c}$?`,
      correctOption: `$N(${notBelongPt[0]}; ${notBelongPt[1]})$`,
      distractors: belongPts.map(([x, y]) => `$N(${x}; ${y})$`),
      explanation: `Thay $(${notBelongPt[0]}; ${notBelongPt[1]})$ vào vế trái được $${a * notBelongPt[0] + b * notBelongPt[1]} < ${c}$ nên không thỏa mãn $\\ge ${c}$.`,
    });
  }

  // System of inequalities in first quadrant + ax + by <= c
  const c1 = randInt(4, 10, rng);
  const absA = Math.abs(a) + 1;
  const absB = Math.abs(b) + 1;
  const validPt: [number, number] = [1, 1];
  const ptsCheck = absA * validPt[0] + absB * validPt[1] <= c1;
  const safeC = ptsCheck ? c1 : absA + absB + 2;
  const badPts: Array<[number, number]> = [
    [-1, 1],
    [1, -2],
    [safeC + 2, safeC + 1],
  ];
  const chosenPt: [number, number] = [0, 1];
  const lhs = `${fmtCoeff(absA, 'x', true)}${fmtCoeff(absB, 'y', false)}`;

  return makeQuestion({
    idPrefix: 'proc-10c2',
    chapter,
    seq,
    rng,
    prompt: `Điểm nào thuộc miền nghiệm của hệ bất phương trình $\\begin{cases} x \\ge 0 \\\\ y \\ge 0 \\\\ ${lhs} \\le ${safeC} \\end{cases}$?`,
    correctOption: `$(${chosenPt[0]}; ${chosenPt[1]})$`,
    distractors: badPts.map(([x, y]) => `$(${x}; ${y})$`),
    explanation: `Điểm $(${chosenPt[0]}; ${chosenPt[1]})$ có $x \\ge 0, y \\ge 0$ và $${absB} \\le ${safeC}$ nên thỏa mãn cả 3 bất phương trình.`,
  });
}

function gen10C3(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const kind = seq % 2;
  if (kind === 0) {
    const b = randInt(3, 8, rng);
    const c = randInt(3, 8, rng);
    // Angle 60 deg -> cos(60) = 1/2 => a^2 = b^2 + c^2 - bc
    const aSq = b * b + c * c - b * c;
    return makeQuestion({
      idPrefix: 'proc-10c3',
      chapter,
      seq,
      rng,
      prompt: `Cho $\\triangle ABC$ có $b = ${b},\\; c = ${c},\\; \\widehat{A} = 60^\\circ$. Bình phương cạnh $a^2$ bằng:`,
      correctOption: `$${aSq}$`,
      distractors: [
        `$${b * b + c * c + b * c}$`,
        `$${b * b + c * c}$`,
        `$${Math.abs(b * b + c * c - 2 * b * c) + 3}$`,
      ],
      explanation: `Theo định lí côsin: $a^2 = b^2 + c^2 - 2bc\\cos 60^\\circ = ${b}^2 + ${c}^2 - ${b}\\cdot${c} = ${aSq}$.`,
    });
  }
  const b = randInt(4, 10, rng);
  const c = randInt(4, 10, rng);
  const sinNum = b * c;
  const exactArea = Number(((b * c) / 4).toFixed(2));
  const areaStr = Number.isInteger(exactArea) ? `${exactArea}` : `\\dfrac{${sinNum}}{4}`;
  return makeQuestion({
    idPrefix: 'proc-10c3',
    chapter,
    seq,
    rng,
    prompt: `Cho $\\triangle ABC$ có $b = ${b},\\; c = ${c},\\; \\widehat{A} = 30^\\circ$. Diện tích $S_{\\triangle ABC}$ bằng:`,
    correctOption: `$${areaStr}$`,
    distractors: [
      `$${b * c}$`,
      `$${(b * c) / 2}$`,
      `$${b + c}$`,
    ],
    explanation: `$S = \\dfrac{1}{2}bc\\sin 30^\\circ = \\dfrac{1}{4}\\cdot${b}\\cdot${c} = ${areaStr}$.`,
  });
}

function gen10C4(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const lenA = randInt(2, 7, rng);
  const lenB = randInt(2, 7, rng);
  const angles = [
    { deg: 60, cosStr: '1/2', val: (lenA * lenB) / 2 },
    { deg: 90, cosStr: '0', val: 0 },
    { deg: 120, cosStr: '-1/2', val: -(lenA * lenB) / 2 },
  ];
  const chosen = pickOne(angles, rng);
  const ansStr = Number.isInteger(chosen.val) ? `${chosen.val}` : `${chosen.val > 0 ? '' : '-'}\\dfrac{${lenA * lenB}}{2}`;
  return makeQuestion({
    idPrefix: 'proc-10c4',
    chapter,
    seq,
    rng,
    prompt: `Cho $|\\vec{a}| = ${lenA},\\; |\\vec{b}| = ${lenB}$ và góc $(\\vec{a}, \\vec{b}) = ${chosen.deg}^\\circ$. Tích vô hướng $\\vec{a}\\cdot\\vec{b}$ bằng:`,
    correctOption: `$${ansStr}$`,
    distractors: [
      `$${lenA * lenB}$`,
      `$${-(lenA * lenB)}$`,
      `$${lenA + lenB}$`,
    ],
    explanation: `$\\vec{a}\\cdot\\vec{b} = |\\vec{a}||\\vec{b}|\\cos ${chosen.deg}^\\circ = ${lenA}\\cdot${lenB}\\cdot(${chosen.cosStr}) = ${ansStr}$.`,
  });
}

function gen10C5(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const base = [
    randInt(2, 5, rng),
    randInt(6, 9, rng),
    randInt(10, 14, rng),
    randInt(15, 19, rng),
    randInt(20, 25, rng),
  ];
  const shuffled = fisherYatesShuffle(base, rng);
  const rangeVal = base[4] - base[0];
  const medianVal = base[2];

  if (seq % 2 === 0) {
    return makeQuestion({
      idPrefix: 'proc-10c5',
      chapter,
      seq,
      rng,
      prompt: `Cho mẫu số liệu: $${shuffled.join(';\\; ')}$. Trung vị $M_e$ của mẫu số liệu là:`,
      correctOption: `$${medianVal}$`,
      distractors: [`$${base[1]}$`, `$${base[3]}$`, `$${rangeVal}$`],
      explanation: `Sắp xếp tăng dần: $${base.join('; ')}$ (cỡ mẫu $n=5$), số đứng chính giữa là $M_e = ${medianVal}$.`,
    });
  }
  return makeQuestion({
    idPrefix: 'proc-10c5',
    chapter,
    seq,
    rng,
    prompt: `Khoảng biến thiên $R$ của mẫu số liệu $${shuffled.join(';\\; ')}$ là:`,
    correctOption: `$${rangeVal}$`,
    distractors: [`$${medianVal}$`, `$${base[4]}$`, `$${rangeVal + 3}$`],
    explanation: `$R = x_{\\max} - x_{\\min} = ${base[4]} - ${base[0]} = ${rangeVal}$.`,
  });
}

function gen10C6(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const a = pickOne([1, 2, -1, -2], rng);
  const h = randInt(-4, 4, rng);
  const k = randInt(-5, 5, rng);
  // y = a(x - h)^2 + k = ax^2 - 2ah x + (ah^2 + k)
  const bCoeff = -2 * a * h;
  const cCoeff = a * h * h + k;
  const poly = `${fmtCoeff(a, 'x^2', true)}${fmtCoeff(bCoeff, 'x', false)}${fmtSignedConst(cCoeff)}`;

  return makeQuestion({
    idPrefix: 'proc-10c6',
    chapter,
    seq,
    rng,
    prompt: `Tọa độ đỉnh $I$ của parabol $(P):\\; y = ${poly}$ là:`,
    correctOption: `$I(${h}; ${k})$`,
    distractors: [
      `$I(${-h}; ${k})$`,
      `$I(${h}; ${-k + 1})$`,
      `$I(${2 * h}; ${cCoeff})$`,
    ],
    explanation: `Hoành độ đỉnh $x_I = -\\dfrac{b}{2a} = ${h}$, tung độ $y_I = y(${h}) = ${k}$.`,
  });
}

function gen10C7(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const x1 = randInt(-3, 3, rng);
  const y1 = randInt(-3, 3, rng);
  const ux = randInt(-4, 5, rng) || 2;
  const uy = randInt(-4, 5, rng) || -3;
  const x2 = x1 + ux;
  const y2 = y1 + uy;

  return makeQuestion({
    idPrefix: 'proc-10c7',
    chapter,
    seq,
    rng,
    prompt: `Trong mặt phẳng $Oxy$, cho $A(${x1}; ${y1})$ và $B(${x2}; ${y2})$. Tọa độ vectơ $\\overrightarrow{AB}$ là:`,
    correctOption: `$(${ux}; ${uy})$`,
    distractors: [
      `$(${-ux}; ${-uy})$`,
      `$(${x1 + x2}; ${y1 + y2})$`,
      `$(${ux + 1}; ${uy - 1})$`,
    ],
    explanation: `$\\overrightarrow{AB} = (x_B - x_A;\\; y_B - y_A) = (${x2} - (${x1});\\; ${y2} - (${y1})) = (${ux}; ${uy})$.`,
  });
}

function gen10C8(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const fact = (n: number) => {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  };
  const n = randInt(4, 6, rng);
  const k = randInt(2, 3, rng);
  const comb = Math.round(fact(n) / (fact(k) * fact(n - k)));
  const perm = Math.round(fact(n) / fact(n - k));

  if (seq % 2 === 0) {
    return makeQuestion({
      idPrefix: 'proc-10c8',
      chapter,
      seq,
      rng,
      prompt: `Số cách chọn $${k}$ học sinh bất kì từ một nhóm gồm $${n}$ học sinh là:`,
      correctOption: `$${comb}$`,
      distractors: [`$${perm}$`, `$${n * k}$`, `$${fact(n)}$`],
      explanation: `Số cách chọn không tính thứ tự là tổ hợp $C_${n}^${k} = ${comb}$.`,
    });
  }
  const shirts = randInt(3, 6, rng);
  const pants = randInt(2, 5, rng);
  return makeQuestion({
    idPrefix: 'proc-10c8',
    chapter,
    seq,
    rng,
    prompt: `Một bạn có $${shirts}$ áo khác nhau và $${pants}$ quần khác nhau. Số cách chọn một bộ gồm $1$ áo và $1$ quần là:`,
    correctOption: `$${shirts * pants}$`,
    distractors: [`$${shirts + pants}$`, `$${shirts * pants + 2}$`, `$${fact(pants)}$`],
    explanation: `Áp dụng quy tắc nhân: có $${shirts} \\times ${pants} = ${shirts * pants}$ bộ trang phục.`,
  });
}

function gen10C9(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const red = randInt(2, 9, rng);
  const blue = randInt(2, 8, rng);
  const total = red + blue;
  if (seq % 2 === 0) {
    return makeQuestion({
      idPrefix: 'proc-10c9',
      chapter,
      seq,
      rng,
      prompt: `Một hộp có $${red}$ bi đỏ và $${blue}$ bi xanh. Lấy ngẫu nhiên $1$ viên bi, xác suất để lấy được bi đỏ là:`,
      correctOption: `$\\dfrac{${red}}{${total}}$`,
      distractors: [
        `$\\dfrac{${blue}}{${total}}$`,
        `$\\dfrac{1}{${total}}$`,
        `$\\dfrac{${red}}{${blue}}$`,
      ],
      explanation: `$n(\\Omega) = ${total},\\; n(A) = ${red} \\Rightarrow P(A) = \\dfrac{${red}}{${total}}$.`,
    });
  }
  return makeQuestion({
    idPrefix: 'proc-10c9',
    chapter,
    seq,
    rng,
    prompt: `Một túi có $${red}$ thẻ trắng và $${blue}$ thẻ vàng. Rút ngẫu nhiên $1$ thẻ, xác suất để rút được thẻ vàng là:`,
    correctOption: `$\\dfrac{${blue}}{${total}}$`,
    distractors: [
      `$\\dfrac{${red}}{${total}}$`,
      `$\\dfrac{1}{${blue}}$`,
      `$\\dfrac{${blue}}{${red}}$`,
    ],
    explanation: `$n(\\Omega) = ${total},\\; n(B) = ${blue} \\Rightarrow P(B) = \\dfrac{${blue}}{${total}}$.`,
  });
}

// ---------- Grade 11 Generators ----------

function gen11C1(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const a = randInt(2, 6, rng);
  const b = randInt(-4, 5, rng);
  const maxVal = a + b;
  const minVal = -a + b;

  if (seq % 2 === 0) {
    return makeQuestion({
      idPrefix: 'proc-11c1',
      chapter,
      seq,
      rng,
      prompt: `Giá trị lớn nhất của hàm số $y = ${a}\\sin x ${fmtSignedConst(b)}$ trên $\\mathbb{R}$ là:`,
      correctOption: `$${maxVal}$`,
      distractors: [`$${minVal}$`, `$${a}$`, `$${maxVal + 2}$`],
      explanation: `Vì $-1 \\le \\sin x \\le 1$ nên $y \\le ${a}\\cdot 1 ${fmtSignedConst(b)} = ${maxVal}$.`,
    });
  }
  const k = randInt(2, 6, rng);
  const periodStr = k === 2 ? '\\pi' : `\\dfrac{2\\pi}{${k}}`;
  return makeQuestion({
    idPrefix: 'proc-11c1',
    chapter,
    seq,
    rng,
    prompt: `Chu kì tuần hoàn $T$ của hàm số $y = \\cos(${k}x)$ là:`,
    correctOption: `$${periodStr}$`,
    distractors: [`$2\\pi$`, `$${k}\\pi$`, `$\\dfrac{\\pi}{${k + 1}}$`],
    explanation: `Hàm số $y = \\cos(kx)$ có chu kì $T = \\dfrac{2\\pi}{|k|} = ${periodStr}$.`,
  });
}

function gen11C2(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  if (seq % 2 === 0) {
    const u1 = randInt(-3, 7, rng);
    const d = randInt(2, 6, rng);
    const n = randInt(4, 8, rng);
    const un = u1 + (n - 1) * d;
    return makeQuestion({
      idPrefix: 'proc-11c2',
      chapter,
      seq,
      rng,
      prompt: `Cho cấp số cộng $(u_n)$ có $u_1 = ${u1}$ và công sai $d = ${d}$. Giá trị của $u_${n}$ bằng:`,
      correctOption: `$${un}$`,
      distractors: [`$${un + d}$`, `$${un - d}$`, `$${u1 + n * d + 1}$`],
      explanation: `$u_${n} = u_1 + (${n}-1)d = ${u1} + ${n - 1}\\cdot${d} = ${un}$.`,
    });
  }
  const u1 = randInt(1, 5, rng);
  const q = pickOne([2, 3, -2], rng);
  const u4 = u1 * q * q * q;
  return makeQuestion({
    idPrefix: 'proc-11c2',
    chapter,
    seq,
    rng,
    prompt: `Cho cấp số nhân $(u_n)$ với $u_1 = ${u1}$ và công bội $q = ${q}$. Số hạng $u_4$ là:`,
    correctOption: `$${u4}$`,
    distractors: [`$${u1 * q * q}$`, `$${u1 + 3 * q}$`, `$${u4 * q}$`],
    explanation: `$u_4 = u_1 \\cdot q^3 = ${u1} \\cdot (${q})^3 = ${u4}$.`,
  });
}

function gen11C3(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const start = randInt(2, 10, rng) * 2;
  const width = pickOne([4, 6, 8, 10], rng);
  const end = start + width;
  const mid = (start + end) / 2;
  return makeQuestion({
    idPrefix: 'proc-11c3',
    chapter,
    seq,
    rng,
    prompt: `Trong mẫu số liệu ghép nhóm, giá trị đại diện của nhóm $[${start}; ${end})$ là:`,
    correctOption: `$${mid}$`,
    distractors: [`$${start}$`, `$${end}$`, `$${width}$`],
    explanation: `Giá trị đại diện của nhóm $[a; b)$ là $c = \\dfrac{a + b}{2} = \\dfrac{${start} + ${end}}{2} = ${mid}$.`,
  });
}

function gen11C4(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const nSides = randInt(3, 12, rng);
  const kind = seq % 3;
  if (kind === 0) {
    return makeQuestion({
      idPrefix: 'proc-11c4',
      chapter,
      seq,
      rng,
      prompt: `Một hình chóp có đáy là đa giác $${nSides}$ cạnh. Số mặt của hình chóp đó là:`,
      correctOption: `$${nSides + 1}$`,
      distractors: [`$${nSides}$`, `$${nSides + 2}$`, `$${2 * nSides}$`],
      explanation: `Hình chóp đáy $${nSides}$-giác gồm $${nSides}$ mặt bên và $1$ mặt đáy, tổng cộng $${nSides + 1}$ mặt.`,
    });
  }
  if (kind === 1) {
    return makeQuestion({
      idPrefix: 'proc-11c4',
      chapter,
      seq,
      rng,
      prompt: `Một hình lăng trụ có đáy là đa giác $${nSides}$ cạnh. Tổng số đỉnh của hình lăng trụ đó là:`,
      correctOption: `$${2 * nSides}$`,
      distractors: [`$${nSides + 1}$`, `$${nSides + 2}$`, `$${3 * nSides}$`],
      explanation: `Lăng trụ có hai đáy song song bằng nhau, mỗi đáy có $${nSides}$ đỉnh nên tổng là $${2 * nSides}$ đỉnh.`,
    });
  }
  return makeQuestion({
    idPrefix: 'proc-11c4',
    chapter,
    seq,
    rng,
    prompt: `Một hình lăng trụ có đáy là đa giác $${nSides}$ cạnh. Tổng số cạnh của hình lăng trụ đó là:`,
    correctOption: `$${3 * nSides}$`,
    distractors: [`$${2 * nSides}$`, `$${nSides + 2}$`, `$${3 * nSides + 2}$`],
    explanation: `Hình lăng trụ đáy $${nSides}$-giác có $${nSides}$ cạnh đáy trên, $${nSides}$ cạnh đáy dưới và $${nSides}$ cạnh bên nên có $${3 * nSides}$ cạnh.`,
  });
}

function gen11C5(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const a = randInt(2, 9, rng);
  const b = randInt(1, 9, rng);
  const c = randInt(1, 7, rng);
  const d = randInt(1, 8, rng);
  if (seq % 2 === 0) {
    return makeQuestion({
      idPrefix: 'proc-11c5',
      chapter,
      seq,
      rng,
      prompt: `Giới hạn $\\lim_{x \\to +\\infty} \\dfrac{${a}x + ${b}}{${c}x - ${d}}$ bằng:`,
      correctOption: `$\\dfrac{${a}}{${c}}$`,
      distractors: [`$-\\dfrac{${b}}{${d}}$`, `$0$`, `$+\\infty$`],
      explanation: `Chia cả tử và mẫu cho $x$, giới hạn bằng tỉ số hệ số bậc cao nhất: $\\dfrac{${a}}{${c}}$.`,
    });
  }
  const x0 = randInt(-2, 3, rng);
  const val = a * x0 + b;
  return makeQuestion({
    idPrefix: 'proc-11c5',
    chapter,
    seq,
    rng,
    prompt: `Tính giới hạn $\\lim_{x \\to ${x0}} (${a}x + ${b})$:`,
    correctOption: `$${val}$`,
    distractors: [`$${val + 2}$`, `$${a}$`, `$${b}$`],
    explanation: `Hàm đa thức liên tục tại $x = ${x0}$ nên thay trực tiếp $x = ${x0}$ được $${val}$.`,
  });
}

function gen11C6(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const base = pickOne([2, 3, 5, 7], rng);
  const k = randInt(1, 4, rng);
  const powVal = Math.pow(base, k);
  if (seq % 2 === 0) {
    const shift = randInt(1, 5, rng);
    const ans = k + shift;
    return makeQuestion({
      idPrefix: 'proc-11c6',
      chapter,
      seq,
      rng,
      prompt: `Nghiệm của phương trình $${base}^{x - ${shift}} = ${powVal}$ là:`,
      correctOption: `$x = ${ans}$`,
      distractors: [`$x = ${k}$`, `$x = ${Math.max(0, k - shift)}$`, `$x = ${ans + 1}$`],
      explanation: `$${base}^{x - ${shift}} = ${base}^${k} \\Leftrightarrow x - ${shift} = ${k} \\Leftrightarrow x = ${ans}$.`,
    });
  }
  const c = randInt(1, 7, rng);
  const xAns = powVal + c;
  return makeQuestion({
    idPrefix: 'proc-11c6',
    chapter,
    seq,
    rng,
    prompt: `Nghiệm của phương trình $\\log_${base}(x - ${c}) = ${k}$ là:`,
    correctOption: `$x = ${xAns}$`,
    distractors: [`$x = ${powVal - c}$`, `$x = ${base * k + c}$`, `$x = ${powVal}$`],
    explanation: `$x - ${c} = ${base}^${k} = ${powVal} \\Rightarrow x = ${xAns}$.`,
  });
}

function gen11C7(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const B = randInt(4, 15, rng) * 3;
  const h = randInt(2, 8, rng);
  const V = Math.round((B * h) / 3);
  return makeQuestion({
    idPrefix: 'proc-11c7',
    chapter,
    seq,
    rng,
    prompt: `Khối chóp có diện tích đáy $B = ${B}$ và chiều cao $h = ${h}$. Thể tích $V$ của khối chóp bằng:`,
    correctOption: `$${V}$`,
    distractors: [`$${B * h}$`, `$${Math.round((B * h) / 2)}$`, `$${V + 6}$`],
    explanation: `$V = \\dfrac{1}{3}Bh = \\dfrac{1}{3}\\cdot${B}\\cdot${h} = ${V}$.`,
  });
}

function gen11C8(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const pA = randInt(2, 6, rng) / 10;
  const pB = randInt(3, 7, rng) / 10;
  const prod = Number((pA * pB).toFixed(2));
  return makeQuestion({
    idPrefix: 'proc-11c8',
    chapter,
    seq,
    rng,
    prompt: `Cho hai biến cố độc lập $A, B$ với $P(A) = ${pA},\\; P(B) = ${pB}$. Xác suất $P(A \\cap B)$ bằng:`,
    correctOption: `$${prod}$`,
    distractors: [
      `$${Number((pA + pB).toFixed(2))}$`,
      `$${Number(Math.abs(pA - pB).toFixed(2))}$`,
      `$${Number((prod + 0.1).toFixed(2))}$`,
    ],
    explanation: `Hai biến cố độc lập nên $P(A \\cap B) = P(A) \\cdot P(B) = ${pA} \\cdot ${pB} = ${prod}$.`,
  });
}

function gen11C9(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const a = randInt(1, 4, rng);
  const b = randInt(-4, 5, rng) || 2;
  const x0 = randInt(-2, 3, rng);
  // f(x) = a x^3 + b x => f'(x) = 3a x^2 + b
  const slope = 3 * a * x0 * x0 + b;
  const poly = `${fmtCoeff(a, 'x^3', true)}${fmtCoeff(b, 'x', false)}`;
  return makeQuestion({
    idPrefix: 'proc-11c9',
    chapter,
    seq,
    rng,
    prompt: `Đạo hàm của hàm số $y = ${poly}$ tại điểm $x_0 = ${x0}$ có giá trị $y'(${x0})$ bằng:`,
    correctOption: `$${slope}$`,
    distractors: [
      `$${slope + 3}$`,
      `$${a * x0 * x0 + b}$`,
      `$${3 * a * x0 + b}$`,
    ],
    explanation: `$y' = ${3 * a}x^2 ${fmtSignedConst(b)}$, suy ra $y'(${x0}) = ${slope}$.`,
  });
}

// ---------- Grade 12 Generators ----------

function gen12C1(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const a = pickOne([-3, -2, 2, 3, 4], rng);
  const c = pickOne([1, 2], rng);
  const d = pickOne([-5, -3, -1, 1, 3], rng);
  const b = randInt(-4, 5, rng);
  if (a * d - b * c === 0) {
    // guarantee non-degenerate rational function
    return gen12C1(chapter, seq + 1, rng);
  }
  const asymptoteX = d % c === 0 ? `${-d / c}` : `\\dfrac{${-d}}{${c}}`;
  const asymptoteY = a % c === 0 ? `${a / c}` : `\\dfrac{${a}}{${c}}`;
  const numStr = `${fmtCoeff(a, 'x', true)}${fmtSignedConst(b)}`;
  const denStr = `${fmtCoeff(c, 'x', true)}${fmtSignedConst(d)}`;

  if (seq % 2 === 0) {
    return makeQuestion({
      idPrefix: 'proc-12c1',
      chapter,
      seq,
      rng,
      prompt: `Tiệm cận đứng của đồ thị hàm số $y = \\dfrac{${numStr}}{${denStr}}$ là đường thẳng:`,
      correctOption: `$x = ${asymptoteX}$`,
      distractors: [`$y = ${asymptoteY}$`, `$x = ${a}$`, `$y = ${d}$`],
      explanation: `Nghiệm của mẫu số ${denStr} = 0 cho đường tiệm cận đứng $x = ${asymptoteX}$.`,
    });
  }
  return makeQuestion({
    idPrefix: 'proc-12c1',
    chapter,
    seq,
    rng,
    prompt: `Tiệm cận ngang của đồ thị hàm số $y = \\dfrac{${numStr}}{${denStr}}$ là đường thẳng:`,
    correctOption: `$y = ${asymptoteY}$`,
    distractors: [`$x = ${asymptoteX}$`, `$y = ${b}$`, `$x = ${c}$`],
    explanation: `$\\lim_{x \\to \\pm\\infty} y = \\dfrac{${a}}{${c}} = ${asymptoteY}$.`,
  });
}

function gen12C2(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const triples: Array<[number, number, number, number]> = [
    [1, 2, 2, 3],
    [2, 3, 6, 7],
    [1, 4, 8, 9],
    [2, 1, 2, 3],
    [3, 4, 0, 5],
  ];
  const [x, y, z, norm] = pickOne(triples, rng);
  const sx = rng() > 0.5 ? x : -x;
  const sy = rng() > 0.5 ? y : -y;
  const sz = rng() > 0.5 ? z : -z;
  return makeQuestion({
    idPrefix: 'proc-12c2',
    chapter,
    seq,
    rng,
    prompt: `Trong không gian $Oxyz$, độ dài của vectơ $\\vec{u} = (${sx};\\; ${sy};\\; ${sz})$ bằng:`,
    correctOption: `$${norm}$`,
    distractors: [
      `$${norm * norm}$`,
      `$${Math.abs(sx) + Math.abs(sy) + Math.abs(sz)}$`,
      `$${norm + 2}$`,
    ],
    explanation: `$|\\vec{u}| = \\sqrt{(${sx})^2 + (${sy})^2 + (${sz})^2} = \\sqrt{${norm * norm}} = ${norm}$.`,
  });
}

function gen12C3(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  if (seq % 2 === 0) {
    const s = randInt(2, 9, rng);
    const variance = s * s;
    return makeQuestion({
      idPrefix: 'proc-12c3',
      chapter,
      seq,
      rng,
      prompt: `Một mẫu số liệu ghép nhóm có phương sai $s^2 = ${variance}$. Độ lệch chuẩn $s$ của mẫu đó là:`,
      correctOption: `$${s}$`,
      distractors: [`$${variance}$`, `$${s * 2}$`, `$${s + 1}$`],
      explanation: `Độ lệch chuẩn $s = \\sqrt{s^2} = \\sqrt{${variance}} = ${s}$.`,
    });
  }
  const uMin = randInt(10, 25, rng);
  const span = randInt(15, 45, rng);
  const uMax = uMin + span;
  return makeQuestion({
    idPrefix: 'proc-12c3',
    chapter,
    seq,
    rng,
    prompt: `Một bảng thống kê ghép nhóm có các đầu mút từ $[${uMin}; ${uMin + 10})$ đến $[${uMax - 10}; ${uMax})$. Khoảng biến thiên $R$ bằng:`,
    correctOption: `$${span}$`,
    distractors: [`$${uMax}$`, `$${uMin}$`, `$${span - 10}$`],
    explanation: `$R = u_{\\max} - u_{\\min} = ${uMax} - ${uMin} = ${span}$.`,
  });
}

function gen12C4(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  if (seq % 2 === 0) {
    const k = randInt(1, 9, rng) * 2;
    const b = randInt(1, 5, rng);
    const val = Math.round((k * b * b) / 2);
    return makeQuestion({
      idPrefix: 'proc-12c4',
      chapter,
      seq,
      rng,
      prompt: `Giá trị tích phân $I = \\int_0^{${b}} ${k}x\\,\\mathrm{d}x$ bằng:`,
      correctOption: `$${val}$`,
      distractors: [`$${k * b}$`, `$${val * 2}$`, `$${val + k}$`],
      explanation: `$I = \\left.${k / 2}x^2\\right|_0^{${b}} = ${k / 2}\\cdot ${b}^2 = ${val}$.`,
    });
  }
  const a = randInt(1, 5, rng) * 3;
  const c = randInt(1, 6, rng);
  const b = randInt(1, 3, rng);
  const val = Math.round((a / 3) * b * b * b + c * b);
  return makeQuestion({
    idPrefix: 'proc-12c4',
    chapter,
    seq,
    rng,
    prompt: `Tính tích phân $I = \\int_0^{${b}} (${a}x^2 + ${c})\\,\\mathrm{d}x$:`,
    correctOption: `$${val}$`,
    distractors: [`$${val + c}$`, `$${a * b * b + c}$`, `$${Math.max(1, val - b)}$`],
    explanation: `$I = \\left(${a / 3}x^3 + ${c}x\\right)_0^{${b}} = ${val}$.`,
  });
}

function gen12C5(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  if (seq % 2 === 0) {
    const a = randInt(-3, 4, rng);
    const b = randInt(-3, 4, rng);
    const c = randInt(-3, 4, rng);
    const r = randInt(2, 7, rng);
    const eqX = a === 0 ? 'x^2' : a > 0 ? `(x - ${a})^2` : `(x + ${Math.abs(a)})^2`;
    const eqY = b === 0 ? 'y^2' : b > 0 ? `(y - ${b})^2` : `(y + ${Math.abs(b)})^2`;
    const eqZ = c === 0 ? 'z^2' : c > 0 ? `(z - ${c})^2` : `(z + ${Math.abs(c)})^2`;
    return makeQuestion({
      idPrefix: 'proc-12c5',
      chapter,
      seq,
      rng,
      prompt: `Trong không gian $Oxyz$, mặt cầu $(S):\\; ${eqX} + ${eqY} + ${eqZ} = ${r * r}$ có tâm $I$ và bán kính $R$ là:`,
      correctOption: `$I(${a}; ${b}; ${c}),\\; R = ${r}$`,
      distractors: [
        `$I(${-a}; ${-b}; ${-c}),\\; R = ${r}$`,
        `$I(${a}; ${b}; ${c}),\\; R = ${r * r}$`,
        `$I(${-a}; ${-b}; ${-c}),\\; R = ${r * r}$`,
      ],
      explanation: `Mặt cầu $(x-a)^2+(y-b)^2+(z-c)^2=R^2$ có tâm $I(${a}; ${b}; ${c})$ và $R = \\sqrt{${r * r}} = ${r}$.`,
    });
  }
  const A = randInt(1, 5, rng);
  const B = pickOne([-4, -3, -2, -1, 1, 2, 3], rng);
  const C = pickOne([-4, -3, -2, -1, 1, 2, 3], rng);
  const D = randInt(-7, 7, rng);
  const eq = `${fmtCoeff(A, 'x', true)}${fmtCoeff(B, 'y', false)}${fmtCoeff(C, 'z', false)}${fmtSignedConst(D)} = 0`;
  return makeQuestion({
    idPrefix: 'proc-12c5',
    chapter,
    seq,
    rng,
    prompt: `Một vectơ pháp tuyến của mặt phẳng $(P):\\; ${eq}$ là:`,
    correctOption: `$\\vec{n} = (${A};\\; ${B};\\; ${C})$`,
    distractors: [
      `$\\vec{n} = (${A};\\; ${-B};\\; ${D})$`,
      `$\\vec{n} = (${B};\\; ${C};\\; ${D})$`,
      `$\\vec{n} = (${A + 1};\\; ${B};\\; ${C})$`,
    ],
    explanation: `Mặt phẳng $Ax + By + Cz + D = 0$ nhận $\\vec{n} = (A; B; C) = (${A}; ${B}; ${C})$ làm vectơ pháp tuyến.`,
  });
}

function gen12C6(chapter: ChapterData, seq: number, rng: Rng): QuizQuestion {
  const pB = pickOne([0.2, 0.4, 0.5, 0.6, 0.8], rng);
  const pAGivenB = pickOne([0.15, 0.25, 0.35, 0.5, 0.75, 0.85], rng);
  const pAB = Number((pB * pAGivenB).toFixed(3));
  if (seq % 2 === 0) {
    return makeQuestion({
      idPrefix: 'proc-12c6',
      chapter,
      seq,
      rng,
      prompt: `Biết $P(B) = ${pB}$ và $P(A \\cap B) = ${pAB}$. Xác suất có điều kiện $P(A \\mid B)$ bằng:`,
      correctOption: `$${pAGivenB}$`,
      distractors: [
        `$${Number((pB * pAB).toFixed(3))}$`,
        `$${Number((1 - pAGivenB).toFixed(2))}$`,
        `$${Number(Math.min(0.95, pAGivenB + 0.1).toFixed(2))}$`,
      ],
      explanation: `$P(A \\mid B) = \\dfrac{P(A \\cap B)}{P(B)} = \\dfrac{${pAB}}{${pB}} = ${pAGivenB}$.`,
    });
  }
  return makeQuestion({
    idPrefix: 'proc-12c6',
    chapter,
    seq,
    rng,
    prompt: `Cho $P(B) = ${pB}$ và $P(A \\mid B) = ${pAGivenB}$. Giá trị của $P(A \\cap B)$ là:`,
    correctOption: `$${pAB}$`,
    distractors: [
      `$${Number((pB + pAGivenB).toFixed(2))}$`,
      `$${Number((pAGivenB / pB).toFixed(3))}$`,
      `$${Number((pAB + 0.12).toFixed(3))}$`,
    ],
    explanation: `Theo công thức nhân xác suất: $P(A \\cap B) = P(B)\\cdot P(A \\mid B) = ${pB}\\cdot${pAGivenB} = ${pAB}$.`,
  });
}

const CHAPTER_GENERATORS: Record<
  string,
  (chapter: ChapterData, seq: number, rng: Rng) => QuizQuestion
> = {
  '10-c1': gen10C1,
  '10-c2': gen10C2,
  '10-c3': gen10C3,
  '10-c4': gen10C4,
  '10-c5': gen10C5,
  '10-c6': gen10C6,
  '10-c7': gen10C7,
  '10-c8': gen10C8,
  '10-c9': gen10C9,
  '11-c1': gen11C1,
  '11-c2': gen11C2,
  '11-c3': gen11C3,
  '11-c4': gen11C4,
  '11-c5': gen11C5,
  '11-c6': gen11C6,
  '11-c7': gen11C7,
  '11-c8': gen11C8,
  '11-c9': gen11C9,
  '12-c1': gen12C1,
  '12-c2': gen12C2,
  '12-c3': gen12C3,
  '12-c4': gen12C4,
  '12-c5': gen12C5,
  '12-c6': gen12C6,
};

/**
 * Generates randomized, non-duplicate algorithmic mental-math MCQs
 * tailored for any GDPT 2018 chapter (especially low-formula chapters like 10-c2).
 */
export function generateProceduralChapterQuestions(
  chapter: ChapterData,
  count: number,
  rng: Rng = Math.random,
  seenPromptSignatures: ReadonlySet<string> = new Set()
): QuizQuestion[] {
  const genFn = CHAPTER_GENERATORS[chapter.id];
  if (!genFn || count <= 0) return [];

  const result: QuizQuestion[] = [];
  const usedPrompts = new Set<string>(seenPromptSignatures);
  let attempts = 0;
  const maxAttempts = count * 8;

  while (result.length < count && attempts < maxAttempts) {
    attempts += 1;
    const q = genFn(chapter, attempts, rng);
    const normalized = q.prompt.replace(/\s+/g, ' ').trim();
    if (!usedPrompts.has(normalized)) {
      usedPrompts.add(normalized);
      result.push(q);
    }
  }

  return result;
}

function makeTfQuestion(params: {
  id: string;
  grade: '10' | '11' | '12';
  chapterId: string;
  chapterTitle: string;
  prompt: string;
  statements: Array<{ text: string; isTrue: boolean }>;
  explanation: string;
  rng: Rng;
}): QuizQuestion {
  const ids: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];
  const mixed = fisherYatesShuffle(params.statements, params.rng).map((st, idx) => ({
    id: ids[idx] ?? 'a',
    text: st.text,
    isTrue: st.isTrue,
  }));
  return {
    id: params.id,
    grade: params.grade,
    chapterId: params.chapterId,
    chapterTitle: params.chapterTitle,
    format: 'true_false',
    prompt: params.prompt,
    statements: mixed,
    explanation: params.explanation,
    isRealWorld: false,
  };
}

export function generateProceduralTrueFalseQuestions(
  grade: '10' | '11' | '12' | 'thpt',
  count: number,
  rng: Rng = Math.random
): QuizQuestion[] {
  const result: QuizQuestion[] = [];
  const seenPrompts = new Set<string>();
  const targetGrades: Array<'10' | '11' | '12'> =
    grade === 'thpt' ? ['12', '12', '11', '10'] : [grade];

  let attempt = 0;
  while (result.length < count && attempt < count * 12) {
    attempt += 1;
    const g = targetGrades[attempt % targetGrades.length];
    let q: QuizQuestion;

    if (g === '10') {
      if (attempt % 2 === 0) {
        // Quadratic parabola y = a(x - h)^2 + k
        const a = pickOne([1, 2, -1, -2], rng);
        const h = randInt(1, 5, rng);
        const k = randInt(-4, 4, rng);
        const bCoeff = -2 * a * h;
        const cCoeff = a * h * h + k;
        const poly = `${fmtCoeff(a, 'x^2', true)}${fmtCoeff(bCoeff, 'x', false)}${fmtSignedConst(cCoeff)}`;
        const isUp = a > 0;
        const y0 = cCoeff;
        q = makeTfQuestion({
          id: `proc-tf-10-${attempt}-${Math.floor(rng() * 1e5)}`,
          grade: '10',
          chapterId: '10-c6',
          chapterTitle: 'Hàm số, đồ thị và ứng dụng',
          prompt: `Cho hàm số bậc hai $y = ${poly}$ có đồ thị là parabol $(P)$. Xét tính đúng/sai của các khẳng định sau:`,
          statements: [
            { text: `Đỉnh của parabol $(P)$ có tọa độ $I(${h}; ${k})$.`, isTrue: true },
            { text: `Trục đối xứng của $(P)$ là đường thẳng $x = ${h}$.`, isTrue: true },
            {
              text: isUp
                ? `Hàm số đồng biến trên khoảng $(-\\infty; ${h})$.`
                : `Hàm số nghịch biến trên khoảng $(-\\infty; ${h})$.`,
              isTrue: false,
            },
            { text: `Đồ thị $(P)$ cắt trục tung tại điểm có tung độ bằng $${y0 + 2}$.`, isTrue: false },
          ],
          explanation: `Hoành độ đỉnh $x_I = -\\dfrac{b}{2a} = ${h}$, tung độ $y_I = ${k}$, trục đối xứng $x = ${h}$, giao trục tung tại $y(0) = ${y0}$.`,
          rng,
        });
      } else {
        // Line equation ax + by + c = 0 & vector normal
        const x0 = randInt(1, 4, rng);
        const y0 = randInt(1, 4, rng);
        const nx = randInt(2, 5, rng);
        const ny = pickOne([-3, -2, 2, 3], rng);
        const c = -(nx * x0 + ny * y0);
        const lineEq = `${fmtCoeff(nx, 'x', true)}${fmtCoeff(ny, 'y', false)}${fmtSignedConst(c)} = 0`;
        q = makeTfQuestion({
          id: `proc-tf-10-${attempt}-${Math.floor(rng() * 1e5)}`,
          grade: '10',
          chapterId: '10-c7',
          chapterTitle: 'Phương pháp tọa độ trong mặt phẳng',
          prompt: `Trong mặt phẳng $Oxy$, cho đường thẳng $\\Delta: ${lineEq}$ và điểm $M(${x0}; ${y0})$. Xét các khẳng định sau:`,
          statements: [
            { text: `Một vectơ pháp tuyến của $\\Delta$ là $\\vec{n} = (${nx}; ${ny})$.`, isTrue: true },
            { text: `Một vectơ chỉ phương của $\\Delta$ là $\\vec{u} = (${-ny}; ${nx})$.`, isTrue: true },
            { text: `Điểm $M(${x0}; ${y0})$ thuộc đường thẳng $\\Delta$.`, isTrue: true },
            { text: `Đường thẳng $\\Delta$ đi qua gốc tọa độ $O(0; 0)$ khi $c = ${c}$.`, isTrue: c === 0 },
          ],
          explanation: `Thay tọa độ $M(${x0}; ${y0})$ vào $\\Delta$ được $${nx * x0 + ny * y0 + c} = 0$ nên $M \\in \\Delta$. Vectơ pháp tuyến $\\vec{n}=(${nx};${ny}) \\perp \\vec{u}=(${-ny};${nx})$.`,
          rng,
        });
      }
    } else if (g === '11') {
      if (attempt % 2 === 0) {
        // Arithmetic progression
        const u1 = randInt(-3, 6, rng);
        const d = randInt(2, 6, rng);
        const u5 = u1 + 4 * d;
        const s5 = (5 * (u1 + u5)) / 2;
        q = makeTfQuestion({
          id: `proc-tf-11-${attempt}-${Math.floor(rng() * 1e5)}`,
          grade: '11',
          chapterId: '11-c2',
          chapterTitle: 'Dãy số, cấp số cộng và cấp số nhân',
          prompt: `Cho cấp số cộng $(u_n)$ có số hạng đầu $u_1 = ${u1}$ và công sai $d = ${d}$. Xét tính đúng/sai của các khẳng định sau:`,
          statements: [
            { text: `Số hạng thứ hai của cấp số cộng là $u_2 = ${u1 + d}$.`, isTrue: true },
            { text: `Số hạng thứ năm của cấp số cộng là $u_5 = ${u5}$.`, isTrue: true },
            { text: `Công thức số hạng tổng quát là $u_n = ${u1} + ${d}n$.`, isTrue: false },
            { text: `Tổng $5$ số hạng đầu tiên bằng $S_5 = ${s5 + d}$.`, isTrue: false },
          ],
          explanation: `Ta có $u_n = u_1 + (n-1)d$, suy ra $u_2 = ${u1 + d}$, $u_5 = ${u5}$ và $S_5 = \\dfrac{5(u_1 + u_5)}{2} = ${s5}$.`,
          rng,
        });
      } else {
        // Derivative of cubic y = a x^3 + b x
        const a = randInt(1, 3, rng);
        const b = pickOne([-3, -2, 2, 4], rng);
        const x0 = randInt(1, 3, rng);
        const slope = 3 * a * x0 * x0 + b;
        const poly = `${fmtCoeff(a, 'x^3', true)}${fmtCoeff(b, 'x', false)}`;
        q = makeTfQuestion({
          id: `proc-tf-11-${attempt}-${Math.floor(rng() * 1e5)}`,
          grade: '11',
          chapterId: '11-c9',
          chapterTitle: 'Đạo hàm',
          prompt: `Cho hàm số $y = ${poly}$ có đồ thị $(C)$. Xét các khẳng định sau:`,
          statements: [
            { text: `Đạo hàm của hàm số là $y' = ${3 * a}x^2 ${fmtSignedConst(b)}$.`, isTrue: true },
            { text: `Hệ số góc tiếp tuyến của $(C)$ tại điểm có hoành độ $x_0 = ${x0}$ bằng $${slope}$.`, isTrue: true },
            { text: `Giá trị $y'(0)$ bằng $${b + 1}$.`, isTrue: false },
            { text: `Đạo hàm cấp hai của hàm số là $y'' = ${6 * a}x$.`, isTrue: true },
          ],
          explanation: `$y' = ${3 * a}x^2 ${fmtSignedConst(b)} \\Rightarrow y'(${x0}) = ${slope}$, $y'(0) = ${b}$ và $y'' = ${6 * a}x$.`,
          rng,
        });
      }
    } else {
      if (attempt % 2 === 0) {
        // Grade 12 Oxyz Sphere & Plane
        const a = randInt(-3, 4, rng);
        const b = randInt(-3, 4, rng);
        const c = randInt(-3, 4, rng);
        const r = randInt(2, 6, rng);
        const eqX = a === 0 ? 'x^2' : a > 0 ? `(x - ${a})^2` : `(x + ${Math.abs(a)})^2`;
        const eqY = b === 0 ? 'y^2' : b > 0 ? `(y - ${b})^2` : `(y + ${Math.abs(b)})^2`;
        const eqZ = c === 0 ? 'z^2' : c > 0 ? `(z - ${c})^2` : `(z + ${Math.abs(c)})^2`;
        q = makeTfQuestion({
          id: `proc-tf-12-${attempt}-${Math.floor(rng() * 1e5)}`,
          grade: '12',
          chapterId: '12-c5',
          chapterTitle: 'Phương pháp tọa độ trong không gian',
          prompt: `Trong không gian $Oxyz$, cho mặt cầu $(S): ${eqX} + ${eqY} + ${eqZ} = ${r * r}$. Xét tính đúng/sai của các khẳng định sau:`,
          statements: [
            { text: `Tâm của mặt cầu $(S)$ là điểm $I(${a}; ${b}; ${c})$.`, isTrue: true },
            { text: `Bán kính của mặt cầu $(S)$ là $R = ${r}$.`, isTrue: true },
            { text: `Đường kính của mặt cầu $(S)$ bằng $${r * r}$.`, isTrue: false },
            { text: `Điểm $M(${a + r}; ${b}; ${c})$ nằm trên mặt cầu $(S)$.`, isTrue: true },
          ],
          explanation: `Mặt cầu $(S)$ có tâm $I(${a}; ${b}; ${c})$, bán kính $R = ${r}$ (đường kính $2R = ${2 * r}$) và $IM = ${r} = R$ nên $M \\in (S)$.`,
          rng,
        });
      } else {
        // Grade 12 Integral I = int_0^b (3a x^2 + c) dx
        const a = randInt(1, 3, rng);
        const c = randInt(1, 6, rng);
        const b = randInt(1, 3, rng);
        const val = a * b * b * b + c * b;
        q = makeTfQuestion({
          id: `proc-tf-12-${attempt}-${Math.floor(rng() * 1e5)}`,
          grade: '12',
          chapterId: '12-c4',
          chapterTitle: 'Nguyên hàm và tích phân',
          prompt: `Cho hàm số $f(x) = ${3 * a}x^2 + ${c}$ liên tục trên $\\mathbb{R}$. Xét tính đúng/sai của các khẳng định sau:`,
          statements: [
            { text: `Một nguyên hàm của $f(x)$ là $F(x) = ${fmtCoeff(a, 'x^3', true)} + ${c}x$.`, isTrue: true },
            { text: `Tích phân $\\int_0^{${b}} f(x)\\,\\mathrm{d}x$ bằng $${val}$.`, isTrue: true },
            { text: `Giá trị của $f(1)$ bằng $${3 * a + c + 2}$.`, isTrue: false },
            { text: `Tích phân $\\int_0^{${b}} 2f(x)\\,\\mathrm{d}x$ bằng $${2 * val}$.`, isTrue: true },
          ],
          explanation: `Nguyên hàm $F(x) = ${fmtCoeff(a, 'x^3', true)} + ${c}x$, nên $\\int_0^{${b}} f(x)\\,\\mathrm{d}x = F(${b}) - F(0) = ${val}$.`,
          rng,
        });
      }
    }

    const sig = q.prompt.replace(/\s+/g, ' ').trim();
    if (!seenPrompts.has(sig)) {
      seenPrompts.add(sig);
      result.push(q);
    }
  }

  return result;
}

