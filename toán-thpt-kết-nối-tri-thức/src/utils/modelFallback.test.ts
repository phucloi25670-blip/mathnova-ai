import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeWithModelFallbackChain,
  FALLBACK_STATUS_MESSAGE,
  MODEL_FALLBACK_CHAIN,
} from './modelFallback';

test('MODEL_FALLBACK_CHAIN defines exact ordered priority list', () => {
  assert.deepEqual([...MODEL_FALLBACK_CHAIN], [
    'gemini-3.8-flash',
    'gemini-3.8-flash-lite',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
  ]);
  assert.equal(
    FALLBACK_STATUS_MESSAGE,
    'Đang kết nối máy chủ dự phòng siêu tốc...'
  );
});

test('executeWithModelFallbackChain switches cleanly across 503 and 429 until succeeding', async () => {
  const tried: string[] = [];
  const switches: Array<{ next: string; prev: string; status: number }> = [];

  const outcome = await executeWithModelFallbackChain(
    async (model) => {
      tried.push(model);
      if (model === 'gemini-3.8-flash') {
        throw Object.assign(new Error('503 Service Unavailable - High Demand'), {
          status: 503,
        });
      }
      if (model === 'gemini-3.8-flash-lite') {
        throw Object.assign(new Error('429 RESOURCE_EXHAUSTED'), {
          status: 429,
        });
      }
      return { ok: true, model };
    },
    {
      onSwitchModel: (next, prev, err) => {
        switches.push({ next, prev, status: err.status });
      },
    }
  );

  assert.deepEqual(tried, [
    'gemini-3.8-flash',
    'gemini-3.8-flash-lite',
    'gemini-3.6-flash',
  ]);
  assert.equal(outcome.modelUsed, 'gemini-3.6-flash');
  assert.equal(outcome.switchedFallback, true);
  assert.equal(outcome.attempts, 3);
  assert.deepEqual(outcome.result, { ok: true, model: 'gemini-3.6-flash' });
  assert.deepEqual(switches, [
    { next: 'gemini-3.8-flash-lite', prev: 'gemini-3.8-flash', status: 503 },
    { next: 'gemini-3.6-flash', prev: 'gemini-3.8-flash-lite', status: 429 },
  ]);
});

test('executeWithModelFallbackChain falls through to gemini-2.5-flash when first three return 503/429/404', async () => {
  const tried: string[] = [];

  const outcome = await executeWithModelFallbackChain(async (model) => {
    tried.push(model);
    if (model !== 'gemini-2.5-flash') {
      throw Object.assign(new Error('503 Unavailable'), { status: 503 });
    }
    return 'success-2.5';
  });

  assert.deepEqual(tried, [...MODEL_FALLBACK_CHAIN]);
  assert.equal(outcome.modelUsed, 'gemini-2.5-flash');
  assert.equal(outcome.result, 'success-2.5');
});

test('executeWithModelFallbackChain stops immediately on auth error (403)', async () => {
  const tried: string[] = [];

  await assert.rejects(
    () =>
      executeWithModelFallbackChain(async (model) => {
        tried.push(model);
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }),
    /HTTP 403/
  );

  assert.deepEqual(tried, ['gemini-3.8-flash']);
});
