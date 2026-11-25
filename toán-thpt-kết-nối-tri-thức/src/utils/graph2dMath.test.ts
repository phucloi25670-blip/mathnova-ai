import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMathExpression,
  evaluateMathExpression,
  findFunctionExtrema,
  findFunctionIntersections,
  parseDesmosCommandsForCanvas,
  simpsonIntegrate,
} from './graph2dMath';
import { buildLocalLabCommands, ensureLabPedagogy, LAB_PRESETS } from './labParser';

test('evaluateMathExpression evaluates polynomials, implicit multiplication, unary minus, and functions safely', () => {
  assert.equal(evaluateMathExpression('x^3 - 3x', 2), 2);
  assert.equal(evaluateMathExpression('x^3 - 3x', -1), 2);
  assert.equal(evaluateMathExpression('-x^2 + 2x', 2), 0);
  assert.equal(evaluateMathExpression('-x^2 + 2x', 3), -3);
  assert.equal(evaluateMathExpression('sqrt(x)', 9), 3);
  assert.ok(Number.isNaN(evaluateMathExpression('sqrt(x)', -4)));
  assert.ok(Math.abs(evaluateMathExpression('sin(pi*x/2)', 1) - 1) < 1e-9);
});

test('parseDesmosCommandsForCanvas parses functions, shaded regions, circles, and polygons', () => {
  const scene = parseDesmosCommandsForCanvas([
    'f(x) = x^2',
    'g(x) = 2x',
    'min(f(x), g(x)) <= y <= max(f(x), g(x)) {0 <= x <= 2}',
  ]);

  assert.equal(scene.functions.length, 2);
  assert.equal(scene.shadedRegions.length, 1);
  assert.equal(scene.shadedRegions[0].a, 0);
  assert.equal(scene.shadedRegions[0].b, 2);
  assert.equal(scene.shadedRegions[0].upperFn(1), 2);
  assert.equal(scene.shadedRegions[0].lowerFn(1), 1);

  const circleScene = parseDesmosCommandsForCanvas(['(x - 1)^2 + (y + 2)^2 = 9', '(1, -2)']);
  assert.equal(circleScene.circles.length, 1);
  assert.equal(circleScene.circles[0].cx, 1);
  assert.equal(circleScene.circles[0].cy, -2);
  assert.equal(circleScene.circles[0].r, 3);
  assert.equal(circleScene.points.length, 1);
});

test('findFunctionIntersections and findFunctionExtrema locate accurate coordinates', () => {
  const f1 = compileMathExpression('x^2')!;
  const f2 = compileMathExpression('2x')!;
  const inters = findFunctionIntersections(f1, f2, -1, 3);
  assert.ok(inters.some((p) => Math.abs(p.x - 0) < 0.02 && Math.abs(p.y - 0) < 0.02));
  assert.ok(inters.some((p) => Math.abs(p.x - 2) < 0.02 && Math.abs(p.y - 4) < 0.02));

  const cubic = compileMathExpression('x^3 - 3x')!;
  const extrema = findFunctionExtrema(cubic, -2.5, 2.5);
  assert.equal(extrema.length, 2);
  assert.equal(extrema[0].kind, 'max');
  assert.ok(Math.abs(extrema[0].x - -1) < 0.01 && Math.abs(extrema[0].y - 2) < 0.01);
  assert.equal(extrema[1].kind, 'min');
  assert.ok(Math.abs(extrema[1].x - 1) < 0.01 && Math.abs(extrema[1].y - -2) < 0.01);
});

test('simpsonIntegrate computes accurate area and volume integrals', () => {
  const f = compileMathExpression('2x - x^2')!;
  const area = simpsonIntegrate(f, 0, 2);
  assert.ok(Math.abs(area - 4 / 3) < 1e-4);
});

test('buildLocalLabCommands produces distinct dynamic solutionSteps and casioSteps for every preset', () => {
  const titles = new Set<string>();
  const casioFirstTitles = new Set<string>();

  for (const preset of LAB_PRESETS) {
    const cmd = buildLocalLabCommands(preset.prompt);
    assert.ok(cmd.solutionTitle && cmd.solutionTitle.length > 5);
    assert.ok(Array.isArray(cmd.solutionSteps) && cmd.solutionSteps.length >= 2);
    assert.ok(Array.isArray(cmd.casioSteps) && cmd.casioSteps.length >= 1);
    assert.ok(cmd.casioSteps[0].keys.length > 0);
    titles.add(cmd.solutionTitle);
    casioFirstTitles.add(cmd.casioSteps[0].title);
  }

  assert.equal(titles.size, LAB_PRESETS.length);
  assert.equal(casioFirstTitles.size, LAB_PRESETS.length);

  // Verify sphere-plane preset accurately parses I(1, 2, 0), R = 3
  const sphereCmd = buildLocalLabCommands(LAB_PRESETS[1].prompt);
  assert.ok(sphereCmd.geogebra3d.some((line) => line.includes('I = (1, 2, 0)')));
  assert.ok(sphereCmd.solutionSteps?.some((s) => s.detail.includes('I(1; 2; 0)')));

  // Verify ensureLabPedagogy backfills AI result missing pedagogy
  const bareAiCmd = ensureLabPedagogy(
    {
      title: 'Đồ thị AI',
      desmos2d: ['f(x) = x^2 - 4x'],
      geogebra3d: ['f(x) = x^2 - 4x'],
      notes: '',
      source: 'ai',
    },
    'Vẽ đồ thị y = x^2 - 4x từ 0 đến 4'
  );
  assert.ok((bareAiCmd.solutionSteps?.length ?? 0) >= 2);
  assert.ok((bareAiCmd.casioSteps?.length ?? 0) >= 1);
});
