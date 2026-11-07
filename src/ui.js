// DOM user interface: clock, time controls, options, navigator, info panel,
// N-body sandbox and keyboard shortcuts.

import { SPEED_PRESETS, formatDateUTC, dateToJD, jdToDate } from './time.js';
import { SUN, PLANETS, MOONS, BODY_BY_ID } from './data/bodies.js';
import { periodDays, AU_KM, planetElements } from './physics/kepler.js';
import { ROGUE_STAR } from './simulation.js';

const $ = (id) => document.getElementById(id);
const nf = (digits = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const EARTH_R = 6371, EARTH_M = 5.97237e24;
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function sci(x) {
  const exp = Math.floor(Math.log10(x));
  const mant = x / 10 ** exp;
  return `${nf(2).format(mant)} × 10${String(exp).split('').map((c) => SUP[c]).join('')}`;
}

function duration(days) {
  const d = Math.abs(days);
  if (d < 2) return `${nf(1).format(d * 24)} h`;
  if (d < 800) return `${nf(d < 20 ? 2 : 1).format(d)} jours`;
  return `${nf(d / 365.25 < 20 ? 2 : 1).format(d / 365.25)} ans`;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.sim = app.sim;
    this.speedIndex = SPEED_PRESETS.findIndex((p) => p.value === 7);
    this.lastSpeedIndex = this.speedIndex;
    this.infoTimer = 0;
    this.buildNav();
    this.bindTime();
    this.bindOptions();
    this.bindSandbox();
    this.bindKeyboard();
    this.applySpeed();
  }

  // ---------- Navigator ----------
  buildNav() {
    const nav = $('nav-panel');
    const add = (body, key, isMoon) => {
      const b = document.createElement('button');
      b.className = isMoon ? 'moon' : '';
      b.dataset.bodyId = body.id;
      b.innerHTML = `<span class="dot" style="--c:${body.color}"></span>${body.name}${key !== null ? `<span class="key">${key}</span>` : ''}`;
      b.addEventListener('click', () => this.app.focus(body.id));
      nav.appendChild(b);
    };
    add(SUN, 0, false);
    PLANETS.forEach((p, i) => {
      add(p, i + 1, false);
      if (p.id === 'earth' || p.id === 'jupiter') MOONS.filter((m) => m.parent === p.id).forEach((m) => add(m, null, true));
    });
  }

  setActiveBody(id) {
    for (const b of $('nav-panel').querySelectorAll('button')) b.classList.toggle('active', b.dataset.bodyId === id);
    this.renderInfo(id);
  }

  // ---------- Time ----------
  bindTime() {
    const sel = $('speed-select');
    SPEED_PRESETS.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = p.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => this.setSpeedIndex(+sel.value));
    $('play').addEventListener('click', () => this.togglePause());
    $('slower').addEventListener('click', () => this.setSpeedIndex(this.speedIndex - 1));
    $('faster').addEventListener('click', () => this.setSpeedIndex(this.speedIndex + 1));
    $('today').addEventListener('click', () => this.app.jumpTo(dateToJD(new Date())));
    $('date-input').addEventListener('change', (e) => {
      const v = e.target.value; // YYYY-MM-DD
      if (!v) return;
      const [y, m, d] = v.split('-').map(Number);
      const date = new Date(Date.UTC(2000, m - 1, d, 12));
      date.setUTCFullYear(y);
      this.app.jumpTo(dateToJD(date));
    });
  }

  setSpeedIndex(i) {
    this.speedIndex = Math.max(0, Math.min(SPEED_PRESETS.length - 1, i));
    if (SPEED_PRESETS[this.speedIndex].value !== 0) this.lastSpeedIndex = this.speedIndex;
    this.applySpeed();
  }

  togglePause() {
    if (SPEED_PRESETS[this.speedIndex].value === 0) this.setSpeedIndex(this.lastSpeedIndex);
    else this.setSpeedIndex(SPEED_PRESETS.findIndex((p) => p.value === 0));
  }

  applySpeed() {
    const p = SPEED_PRESETS[this.speedIndex];
    this.sim.speed = p.value;
    $('speed-select').value = this.speedIndex;
    $('speed-label').textContent = p.label;
    $('play').textContent = p.value === 0 ? '▶' : '⏸';
  }

  // ---------- Options ----------
  bindOptions() {
    for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => this.app.setMode(b.dataset.mode));
    for (const b of document.querySelectorAll('[data-scale]')) b.addEventListener('click', () => this.app.setReadable(b.dataset.scale === 'readable'));
    $('toggle-orbits').addEventListener('change', (e) => (this.app.showOrbits = e.target.checked));
    $('toggle-labels').addEventListener('change', (e) => (this.app.showLabels = e.target.checked));
    $('toggle-belts').addEventListener('change', (e) => this.app.setBelts(e.target.checked));
    $('help-btn').addEventListener('click', () => ($('help').hidden = !$('help').hidden));
    $('help').addEventListener('click', () => ($('help').hidden = true));
    $('info-close').addEventListener('click', () => ($('info-panel').hidden = true));
  }

  syncMode(mode) {
    for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('active', b.dataset.mode === mode);
    const badge = $('mode-badge');
    badge.textContent = mode === 'nbody' ? 'N-corps' : 'Éphémérides';
    badge.classList.toggle('nbody', mode === 'nbody');
    $('sandbox-panel').hidden = mode !== 'nbody';
    document.body.classList.toggle('nbody', mode === 'nbody');
  }

  syncScale(readable) {
    for (const b of document.querySelectorAll('[data-scale]')) b.classList.toggle('active', (b.dataset.scale === 'readable') === readable);
  }

  toggleCheckbox(id) {
    const el = $(id);
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change'));
  }

  // ---------- Sandbox ----------
  bindSandbox() {
    const jup = $('jup-mass'), sun = $('sun-mass');
    const fmt = (f) => `×${f >= 10 ? nf(0).format(f) : nf(2).format(f)}`;
    jup.addEventListener('input', () => {
      const f = 10 ** +jup.value;
      $('jup-val').textContent = fmt(f);
      this.sim.setMultiplier('jupiter', f);
    });
    sun.addEventListener('input', () => {
      const f = 10 ** +sun.value;
      $('sun-val').textContent = fmt(f);
      this.sim.setMultiplier('sun', f);
    });
    $('rogue-btn').addEventListener('click', () => {
      this.sim.launchRogueStar();
      if (this.speedIndex < SPEED_PRESETS.findIndex((p) => p.value === 365.25)) this.setSpeedIndex(SPEED_PRESETS.findIndex((p) => p.value === 365.25));
    });
    $('reset-btn').addEventListener('click', () => {
      jup.value = 0; sun.value = 0;
      jup.dispatchEvent(new Event('input')); sun.dispatchEvent(new Event('input'));
      this.app.resetNBody();
    });
  }

  // ---------- Keyboard ----------
  bindKeyboard() {
    const order = [SUN, ...PLANETS];
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.togglePause(); }
      else if (k === 'arrowleft') this.setSpeedIndex(this.speedIndex - 1);
      else if (k === 'arrowright') this.setSpeedIndex(this.speedIndex + 1);
      else if (/^[0-9]$/.test(k)) this.app.focus(order[+k].id);
      else if (k === 'm') this.app.setMode(this.sim.mode === 'nbody' ? 'ephemeris' : 'nbody');
      else if (k === 's') this.app.setReadable(!this.app.mapper.readable);
      else if (k === 'o') this.toggleCheckbox('toggle-orbits');
      else if (k === 'l') this.toggleCheckbox('toggle-labels');
      else if (k === 'b') this.toggleCheckbox('toggle-belts');
      else if (k === 't') this.app.jumpTo(dateToJD(new Date()));
      else if (k === 'h' || k === '?') $('help').hidden = !$('help').hidden;
      else if (k === 'escape') { $('help').hidden = true; this.app.focus('sun', true); }
    });
  }

  // ---------- Per-frame ----------
  update(dt) {
    const jd = this.sim.jd;
    $('date').textContent = formatDateUTC(jd);
    this.infoTimer -= dt;
    if (this.infoTimer > 0) return;
    this.infoTimer = 0.25;
    const year = jdToDate(jd).getUTCFullYear();
    $('accuracy-badge').hidden = year >= 1800 && year <= 2050;
    const di = $('date-input');
    if (document.activeElement !== di) {
      const d = jdToDate(jd);
      if (d.getUTCFullYear() > 0 && d.getUTCFullYear() < 10000) {
        di.value = `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      }
    }
    if (this.sim.nbody) $('energy').textContent = this.sim.nbody.relativeEnergyDrift().toExponential(2);
    if (!$('info-panel').hidden) this.renderStats(this.app.focusId);
  }

  // ---------- Info panel ----------
  renderInfo(id) {
    const body = BODY_BY_ID[id] || (id === 'rogue' ? ROGUE_STAR : null);
    if (!body) return;
    $('info-panel').hidden = false;
    $('info-name').textContent = body.name;
    $('info-type').textContent = body.type;
    $('info-desc').textContent = body.description;
    $('info-swatch').style.background = `radial-gradient(circle at 35% 35%, #fff8, ${body.color} 45%, #000 120%)`;
    $('info-swatch').style.boxShadow = `0 0 18px ${body.color}66`;
    this.renderStats(id);
  }

  renderStats(id) {
    const body = BODY_BY_ID[id] || (id === 'rogue' ? ROGUE_STAR : null);
    if (!body) return;
    const rows = [];
    const sim = this.sim;
    rows.push(['Rayon', `${nf(0).format(body.radiusKm)} km` + (body.id !== 'sun' && !body.isStar ? ` (${nf(body.radiusKm / EARTH_R < 1 ? 3 : 2).format(body.radiusKm / EARTH_R)} R⊕)` : '')]);
    if (body.massKg) rows.push(['Masse', `${sci(body.massKg)} kg` + (body.id !== 'sun' ? ` (${nf(body.massKg / EARTH_M < 0.1 ? 4 : 2).format(body.massKg / EARTH_M)} M⊕)` : '')]);
    if (id === 'rogue') rows.push(['Masse', `${nf(2).format(sim.rogueMassSolar)} M☉`]);
    const kin = sim.kinematics(id);
    if (kin && id !== 'sun') {
      rows.push(['Distance au Soleil', `${nf(3).format(kin.distanceAU)} UA · ${nf(1).format((kin.distanceAU * AU_KM) / 1e6)} M km`]);
      if (body.parent) {
        rows.push([`Distance à ${BODY_BY_ID[body.parent].name}`, `${nf(0).format(body.distanceKm)} km`]);
        rows.push(['Vitesse orbitale', `${nf(2).format(kin.orbitalSpeed)} km/s`]);
      } else {
        rows.push(['Vitesse / Soleil', `${nf(2).format(kin.speedKmS)} km/s`]);
      }
    }
    if (body.elements) {
      const k = planetElements(body, sim.jd);
      rows.push(['Période orbitale', duration(periodDays(k.a))]);
      rows.push(['Excentricité', nf(4).format(k.e)]);
      rows.push(['Inclinaison', `${nf(2).format(Math.abs((k.i * 180) / Math.PI) < 0.005 ? 0 : (k.i * 180) / Math.PI)}°`]);
    } else if (body.periodDays) {
      rows.push(['Période orbitale', duration(body.periodDays) + (body.periodDays < 0 ? ' (rétrograde)' : '')]);
    }
    if (body.rotationDays) {
      rows.push(['Jour sidéral', duration(body.rotationDays) + (body.rotationDays < 0 ? ' (rétrograde)' : '')]);
    } else if (body.parent) {
      rows.push(['Rotation', 'synchrone (face cachée)']);
    }
    const dev = sim.deviationKm(id);
    if (dev !== null) rows.push(['Écart N-corps / éphémérides', `${nf(0).format(dev)} km`, true]);
    $('info-stats').innerHTML = rows.map(([k, v, hl]) => `<dt>${k}</dt><dd${hl ? ' class="highlight"' : ''}>${v}</dd>`).join('');
  }
}
