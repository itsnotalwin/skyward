// ui.js — HUD, toasts, menus, journal, settings, install prompt
import { Save } from './save.js';
import { SKINS } from './player.js';
import { TYPE_ICON } from './discoveries.js';

const $ = id => document.getElementById(id);
const hex = n => '#' + n.toString(16).padStart(6, '0');

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), menu: $('menu'), pause: $('pause'), journal: $('journal'), settings: $('settings'),
      speed: $('speed'), alt: $('alt'), dist: $('dist'), orbs: $('orbs'),
      toasts: $('toasts'), vignette: $('vignette'), minimap: $('minimap'),
      play: $('btn-play'), menuStats: $('menu-stats'),
      journalList: $('journal-list'), journalProgress: $('journal-progress'), skins: $('skins')
    };
    this.mm = this.el.minimap.getContext('2d');
    this.deferredInstall = null;

    // callbacks wired by main
    this.onStart = null; this.onPause = null; this.onResume = null;
    this.onRespawn = null; this.onQuit = null; this.onSkin = null;
    this.onSound = null; this.onInvert = null;

    this.el.play.addEventListener('click', () => this.onStart && this.onStart());
    $('btn-pause').addEventListener('click', () => this.onPause && this.onPause());
    $('btn-resume').addEventListener('click', () => this.onResume && this.onResume());
    $('btn-respawn').addEventListener('click', () => this.onRespawn && this.onRespawn());
    $('btn-p-quit').addEventListener('click', () => this.onQuit && this.onQuit());
    $('btn-journal').addEventListener('click', () => this.openJournal());
    $('btn-p-journal').addEventListener('click', () => this.openJournal());
    $('btn-j-close').addEventListener('click', () => this.el.journal.classList.add('hidden'));
    $('btn-settings').addEventListener('click', () => this.openSettings());
    $('btn-p-settings').addEventListener('click', () => this.openSettings());
    $('btn-s-close').addEventListener('click', () => this.el.settings.classList.add('hidden'));

    $('set-sound').checked = Save.data.sound;
    $('set-sound').addEventListener('change', e => {
      Save.data.sound = e.target.checked; Save.flush();
      this.onSound && this.onSound(e.target.checked);
    });
    $('set-invert').checked = Save.data.invertY;
    $('set-invert').addEventListener('change', e => {
      Save.data.invertY = e.target.checked; Save.flush();
      this.onInvert && this.onInvert(e.target.checked);
    });

    let armed = false, tmr;
    $('btn-reset').addEventListener('click', () => {
      if (!armed) {
        armed = true;
        $('btn-reset').textContent = 'Tap again to confirm';
        tmr = setTimeout(() => { armed = false; $('btn-reset').textContent = 'Reset all progress'; }, 2500);
      } else {
        clearTimeout(tmr);
        Save.reset();
        location.reload();
      }
    });

    $('btn-fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
    if (!document.documentElement.requestFullscreen) $('btn-fullscreen').classList.add('hidden');

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredInstall = e;
      $('btn-install').classList.remove('hidden');
    });
    $('btn-install').addEventListener('click', async () => {
      if (!this.deferredInstall) return;
      this.deferredInstall.prompt();
      await this.deferredInstall.userChoice;
      this.deferredInstall = null;
      $('btn-install').classList.add('hidden');
    });
  }

  toast(msg, { big = false, dur = 2600 } = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (big ? ' big' : '');
    el.textContent = msg;
    this.el.toasts.appendChild(el);
    if (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 650);
    }, dur);
  }

  flash() {
    this.el.vignette.style.opacity = '1';
    clearTimeout(this._flashTmr);
    this._flashTmr = setTimeout(() => { this.el.vignette.style.opacity = '0'; }, 180);
  }

  updateHud(speed, alt, distKm, orbs) {
    this.el.speed.textContent = Math.round(speed * 3.6);
    this.el.alt.textContent = Math.round(alt);
    this.el.dist.textContent = distKm.toFixed(1);
    this.el.orbs.textContent = orbs;
  }

  drawMinimap(px, pz, yaw, discoveries) {
    const ctx = this.mm, S = 132, R = S / 2, range = 650, sc = (R - 8) / range;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(R, R);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (const rr of [R - 8, (R - 8) * 0.5]) {
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832); ctx.stroke();
    }
    for (const ent of discoveries.entities.values()) {
      const L = ent.landmark;
      if (!L) continue;
      const dx = (L.x - px) * sc, dz = (L.z - pz) * sc;
      if (dx * dx + dz * dz > (R - 8) * (R - 8)) continue;
      ctx.beginPath();
      ctx.arc(dx, dz, L.found ? 4 : 2.5, 0, 6.2832);
      ctx.fillStyle = L.found ? '#ffd24a' : 'rgba(255,255,255,0.55)';
      ctx.fill();
    }
    ctx.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
    ctx.fillStyle = '#7fc0ff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  setPlayEnabled(enabled, label) {
    this.el.play.disabled = !enabled;
    this.el.play.textContent = label;
  }

  showMenu() {
    const d = Save.data;
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.menuStats.textContent =
      `✦ ${d.totalOrbs} orbs · ${Object.keys(d.found).length} landmarks · best ${(d.bestDist / 1000).toFixed(1)} km / ${Math.round(d.bestAlt)} m`;
  }

  hideMenu() { this.el.menu.classList.add('hidden'); this.el.hud.classList.remove('hidden'); }

  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }

  openJournal() {
    const d = Save.data;
    const found = Object.entries(d.found).sort((a, b) => b[1].ts - a[1].ts);
    this.el.journalProgress.textContent =
      `${found.length} landmarks · ✦ ${d.totalOrbs} orbs · best ${(d.bestDist / 1000).toFixed(1)} km / ${Math.round(d.bestAlt)} m`;
    this.el.journalList.innerHTML = '';
    if (!found.length) {
      this.el.journalList.innerHTML = '<div class="j-empty">Nothing yet — fly toward the light beams ✨</div>';
    } else {
      for (const [, f] of found) {
        const row = document.createElement('div');
        row.className = 'j-entry';
        const when = new Date(f.ts);
        row.innerHTML =
          `<span class="icon">${TYPE_ICON[f.t] || '🗺️'}</span>` +
          `<span class="name">${f.n}</span>` +
          `<span class="meta">${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
        this.el.journalList.appendChild(row);
      }
    }
    this.el.journal.classList.remove('hidden');
  }

  openSettings() {
    this.renderSkins();
    this.el.settings.classList.remove('hidden');
  }

  renderSkins() {
    const box = this.el.skins;
    box.innerHTML = '';
    for (const s of SKINS) {
      const unlocked = Save.data.unlocked.includes(s.id);
      const btn = document.createElement('button');
      btn.className = 'skin-opt' +
        (Save.data.skin === s.id ? ' selected' : '') +
        (unlocked ? '' : ' locked');
      btn.innerHTML =
        `<span class="swatch" style="background:${hex(s.color)}"></span>` +
        `<span>${s.name}</span>` +
        `<span class="req">${unlocked ? (Save.data.skin === s.id ? '✓' : '') : '✦ ' + s.req}</span>`;
      if (unlocked) {
        btn.addEventListener('click', () => {
          Save.data.skin = s.id;
          Save.flush();
          this.onSkin && this.onSkin(s.id);
          this.renderSkins();
        });
      } else {
        btn.disabled = true;
      }
      box.appendChild(btn);
    }
  }
}
