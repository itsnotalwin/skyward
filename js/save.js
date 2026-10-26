// save.js — localStorage persistence
const KEY = 'skyward-save-v1';

const fresh = () => ({
  v: 1,
  sound: true,
  invertY: false,
  skin: 'delta',
  unlocked: ['delta'],
  seenTut: false,
  totalOrbs: 0,
  bestAlt: 0,
  bestDist: 0,
  orbs: {},   // orbId -> 1
  found: {}   // landmarkId -> {n:name, t:type, ts:timestamp}
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const base = fresh();
    return { ...base, ...d, orbs: { ...d.orbs }, found: { ...d.found }, unlocked: d.unlocked || base.unlocked };
  } catch (e) { return fresh(); }
}

export const Save = {
  data: load(),
  flush() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage full/blocked */ }
  },
  reset() {
    this.data = fresh();
    this.flush();
  }
};
