import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySurvivalCorrectAnswer,
  applySurvivalWrongOrTimeout,
  createInitialSurvivalState,
  getIslandStructureForDay,
  resolveSurvivalReviveAttempt,
  SURVIVAL_MAX_HEARTS,
  SURVIVAL_XP_PER_CORRECT,
} from './survivalLogic';
import {
  calculateDaysRemainingBadge,
  DEFAULT_EXAM_MILESTONES,
  EXAM_DATES_STORAGE_KEY,
} from './examCountdown';
import { SURVIVAL_QUESTIONS, REVIVE_FORMULA_QUESTIONS } from '../data/survivalQuestions';

test('survival question bank has 30 GDPT 2018 questions across grades 10-12', () => {
  assert.equal(SURVIVAL_QUESTIONS.length, 30);
  assert.ok(SURVIVAL_QUESTIONS.filter((q) => q.grade === '10').length === 10);
  assert.ok(SURVIVAL_QUESTIONS.filter((q) => q.grade === '11').length === 10);
  assert.ok(SURVIVAL_QUESTIONS.filter((q) => q.grade === '12').length === 10);
  assert.ok(REVIVE_FORMULA_QUESTIONS.length >= 5);
});

test('survival correct answer increments day, awards 15 XP, upgrades structure & grants shield at 100 resources', () => {
  let state = createInitialSurvivalState();
  assert.equal(state.day, 1);
  assert.equal(state.hearts, SURVIVAL_MAX_HEARTS);

  // Answer 3 questions -> Day 4 (Chòi Gỗ Thông Thái), 75 resources
  for (let i = 0; i < 3; i++) {
    const res = applySurvivalCorrectAnswer(state);
    state = res.nextState;
    assert.equal(res.xpGained, SURVIVAL_XP_PER_CORRECT);
  }
  assert.equal(state.day, 4);
  assert.equal(state.xpEarned, 45);
  assert.equal(state.resources, 75);
  assert.equal(state.shields, 0);
  assert.equal(getIslandStructureForDay(state.day).level, 2);

  // 4th correct answer -> 100 resources converts to +1 Shield
  const fourth = applySurvivalCorrectAnswer(state);
  assert.equal(fourth.shieldEarned, true);
  assert.equal(fourth.nextState.shields, 1);
  assert.equal(fourth.nextState.resources, 0);
});

test('survival wrong answer uses shield if available, otherwise deducts 1 heart and triggers 1-time revive at 0 hearts', () => {
  let state = { ...createInitialSurvivalState(), shields: 1, hearts: 2 };

  // Shield absorbs hit
  const shielded = applySurvivalWrongOrTimeout(state);
  assert.equal(shielded.shieldAbsorbed, true);
  assert.equal(shielded.nextState.shields, 0);
  assert.equal(shielded.nextState.hearts, 2);

  // Lose 1 heart -> 1 heart left
  const hit1 = applySurvivalWrongOrTimeout(shielded.nextState);
  assert.equal(hit1.shieldAbsorbed, false);
  assert.equal(hit1.nextState.hearts, 1);
  assert.equal(hit1.nextState.needsRevive, false);

  // Lose last heart -> triggers 1-time revive
  const hit2 = applySurvivalWrongOrTimeout(hit1.nextState);
  assert.equal(hit2.nextState.hearts, 0);
  assert.equal(hit2.nextState.needsRevive, true);
  assert.equal(hit2.nextState.isGameOver, false);

  // Passing revive restores 1 heart and marks hasUsedRevive
  const revived = resolveSurvivalReviveAttempt(hit2.nextState, true);
  assert.equal(revived.hearts, 1);
  assert.equal(revived.hasUsedRevive, true);
  assert.equal(revived.needsRevive, false);
  assert.equal(revived.isGameOver, false);

  // Next hit at 1 heart -> immediate Game Over (cannot revive twice)
  const finalHit = applySurvivalWrongOrTimeout(revived);
  assert.equal(finalHit.nextState.hearts, 0);
  assert.equal(finalHit.nextState.needsRevive, false);
  assert.equal(finalHit.nextState.isGameOver, true);
});

test('exam countdown milestones use v3 storage key and exact 2027 dates (197d THPT, 145d HK2)', () => {
  assert.equal(EXAM_DATES_STORAGE_KEY, 'mathnova_exam_dates_v3');
  const thpt = DEFAULT_EXAM_MILESTONES.find((m) => m.id === 'thpt2027');
  const hk2 = DEFAULT_EXAM_MILESTONES.find((m) => m.id === 'semester');
  const hn = DEFAULT_EXAM_MILESTONES.find((m) => m.id === 'hanoi2027');
  const hcm = DEFAULT_EXAM_MILESTONES.find((m) => m.id === 'tphcm2027');

  assert.equal(thpt?.date, '2027-06-10T07:30:00+07:00');
  assert.equal(hk2?.date, '2027-04-19T07:30:00+07:00');
  assert.equal(hn?.date, '2027-03-13T07:30:00+07:00');
  assert.equal(hcm?.date, '2027-03-28T07:30:00+07:00');

  const refNow = new Date('2026-11-25T13:21:44Z').getTime();
  assert.equal(calculateDaysRemainingBadge(thpt!.date, refNow), 197);
  assert.equal(calculateDaysRemainingBadge(hk2!.date, refNow), 145);
});
