/**
 * services/immersive.js — 沉浸背景状态机（纯函数层）
 *
 * 零 DOM / 零 getUserMedia / 零 IndexedDB：转移表可直接 node --test。
 */

export const IDLE_TIMEOUT_MS = 300000

export const IMMERSIVE_GUM_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: 'environment',
    frameRate: { ideal: 10, max: 15 },
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
}

const TRANSITIONS = {
  closed: {
    OPEN: 'requesting',
  },
  requesting: {
    STREAM_OK: 'live',
    STREAM_FAIL: 'closed',
    HIDE: 'closed',
    CLOSE: 'closed',
  },
  live: {
    HIDE: 'idle',
    IDLE_TIMEOUT: 'idle',
    ROUTE_LEAVE: 'closed',
    CLOSE: 'closed',
  },
  idle: {
    RESUME: 'live',
    HIDE: 'idle',
    IDLE_TIMEOUT: 'idle',
    CLOSE: 'closed',
  },
}

export function transition(state, event) {
  return TRANSITIONS[state]?.[event] ?? state
}
