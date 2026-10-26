// audio.js — WebAudio wind + chimes, no assets
import { Save } from './save.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.enabled = Save.data.sound;
  }

  init() {
    if (this.ctx || !this.enabled) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const ctx = this.ctx;
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = buf;
    this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 300;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(ctx.destination);
    this.windSrc.start();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setWind(level, dt) {
    if (!this.ctx) return;
    const target = this.enabled ? Math.min(0.3, level * 0.26) : 0;
    this.windGain.gain.value += (target - this.windGain.gain.value) * Math.min(1, dt * 3);
    this.windFilter.frequency.value = 250 + level * 1300;
  }

  blip(freq, dur = 0.12, type = 'triangle', vol = 0.16) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  chime() { this.blip(880, 0.1); setTimeout(() => this.blip(1318, 0.12), 70); }
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'sine', 0.2), i * 110)); }
  ring() { this.blip(196, 0.4, 'sawtooth', 0.1); this.blip(392, 0.4, 'sine', 0.12); }
  crash() { this.blip(110, 0.28, 'square', 0.18); }

  setEnabled(v) {
    this.enabled = v;
    if (!v && this.ctx) this.windGain.gain.value = 0;
  }
}
