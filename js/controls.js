// controls.js — touch joystick + boost, keyboard fallback
export class Controls {
  constructor() {
    this.input = { x: 0, y: 0 };
    this.enabled = false;
    this.invertY = false;
    this.keys = new Set();

    this.stickEl = document.getElementById('stick');
    this.nubEl = document.getElementById('stick-nub');
    this.stickId = null;
    this.boostId = null;
    this.origin = { x: 0, y: 0 };
    this.touch = { x: 0, y: 0 };
    this.touchBoost = false;

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('pointerdown', e => this.onDown(e));
    window.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', e => this.onUp(e));
    window.addEventListener('pointercancel', e => this.onUp(e));
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  onDown(e) {
    if (!this.enabled) return;
    if (e.target.closest('button, .modal, #menu, #minimap, label, input')) return;
    const w = window.innerWidth;
    if (this.stickId === null && e.clientX < w * 0.55) {
      this.stickId = e.pointerId;
      this.origin.x = e.clientX; this.origin.y = e.clientY;
      this.touch.x = 0; this.touch.y = 0;
      this.stickEl.classList.remove('hidden');
      this.stickEl.style.left = (e.clientX - 62) + 'px';
      this.stickEl.style.top = (e.clientY - 62) + 'px';
      this.nubEl.style.transform = 'translate(-50%, -50%)';
    } else if (this.boostId === null) {
      this.boostId = e.pointerId;
      this.touchBoost = true;
    }
  }

  onMove(e) {
    if (e.pointerId !== this.stickId) return;
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    const R = 52;
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(1, len / R);
    this.touch.x = (dx / len) * cl;
    this.touch.y = (dy / len) * cl;
    this.nubEl.style.transform =
      `translate(calc(-50% + ${(dx / len) * cl * R}px), calc(-50% + ${(dy / len) * cl * R}px))`;
  }

  onUp(e) {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.touch.x = 0; this.touch.y = 0;
      this.stickEl.classList.add('hidden');
    } else if (e.pointerId === this.boostId) {
      this.boostId = null;
      this.touchBoost = false;
    }
  }

  // merge touch + keyboard each frame
  update() {
    const k = this.keys;
    let kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    // default: push up (W / ArrowUp / drag up) = climb
    let ky = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const usingKeys = kx !== 0 || ky !== 0;
    let x = usingKeys ? kx : this.touch.x;
    let y = usingKeys ? ky : -this.touch.y;
    if (this.invertY) y = -y;
    this.input.x = x;
    this.input.y = y;
  }

  get boostActive() {
    return this.touchBoost || this.keys.has('shift');
  }
}
