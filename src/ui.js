// DOM user interface: clock, time controls, options, navigator, info panel,
// N-body sandbox, guided tour and keyboard shortcuts.

import { SPEED_PRESETS, formatDateUTC, dateToJD, jdToDate } from './time.js';
import { SUN, PLANETS, MOONS, BODY_BY_ID } from './data/bodies.js';
import { COMETS } from './data/comets.js';
import { EVENTS } from './data/events.js';
import { periodDays, AU_KM, planetElements } from './physics/kepler.js';
import { cometElements } from './physics/comets.js';
import { shadowAxisHit, earthShadowAtMoon } from './physics/eclipse.js';
import { cometActivity } from './render/cometView.js';
import { ROGUE_STAR } from './simulation.js';
import { PHOTOS } from './data/photos.js';

const $ = (id) => document.getElementById(id);
const nf = (digits = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const EARTH_R = 6371, EARTH_M = 5.97237e24;
const C_KM_S = 299792.458;
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function sci(x) {
  const exp = Math.floor(Math.log10(x));
  const mant = x / 10 ** exp;
  return `${nf(2).format(mant)}·10${String(exp).split('').map((c) => SUP[c]).join('')}`;
}

function duration(days) {
  const d = Math.abs(days);
  if (d < 2) return `${nf(1).format(d * 24)} h`;
  if (d < 800) return `${nf(d < 20 ? 2 : 1).format(d)} jours`;
  return `${nf(d / 365.25 < 20 ? 2 : 1).format(d / 365.25)} ans`;
}

function shortDate(jd) {
  const d = jdToDate(jd);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function lightTime(km) {
  const s = km / C_KM_S;
  if (s < 60) return `${nf(1).format(s)} s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(sec).padStart(2, '0')} s`;
}

const distKm = (km) => (km < 1e6 ? `${nf(0).format(km)} km` : `${nf(km < 1e7 ? 2 : 1).format(km / 1e6)} M km`);

export class UI {
  constructor(app) {
    this.app = app;
    this.sim = app.sim;
    this.speedIndex = SPEED_PRESETS.findIndex((p) => p.value === 7);
    this.lastSpeedIndex = this.speedIndex;
    this.infoTimer = 0;
    this.eventIndex = -1;
    this.buildNav();
    this.buildEvents();
    this.bindTime();
    this.bindOptions();
    this.bindSandbox();
    this.bindPhotos();
    this.bindKeyboard();
    this.applySpeed();
  }

  // ---------- Navigator ----------
  navButton(body, key, cls = '') {
    const b = document.createElement('button');
    b.className = cls;
    b.dataset.bodyId = body.id;
    b.innerHTML = `<span class="dot" style="--c:${body.color}"></span>${body.shortName || body.name}${key !== null ? `<span class="key">${key}</span>` : ''}`;
    b.addEventListener('click', () => this.app.focus(body.id));
    return b;
  }

  navHeader(text, id) {
    const h = document.createElement('div');
    h.className = 'nav-header';
    if (id) h.id = id;
    h.textContent = text;
    return h;
  }

  buildNav() {
    const nav = $('nav-panel');
    nav.appendChild(this.navButton(SUN, 0));
    PLANETS.forEach((p, i) => {
      nav.appendChild(this.navButton(p, i + 1));
      if (p.id === 'earth' || p.id === 'jupiter') MOONS.filter((m) => m.parent === p.id).forEach((m) => nav.appendChild(this.navButton(m, null, 'moon')));
    });
    const comets = COMETS.filter((c) => BODY_BY_ID[c.id]);
    if (comets.length) {
      nav.appendChild(this.navHeader('Comètes', 'nav-comets'));
      comets.forEach((c) => nav.appendChild(this.navButton(c, null, 'comet')));
    }
  }

  addProbes(bodies) {
    const nav = $('nav-panel');
    nav.appendChild(this.navHeader('Sondes', 'nav-probes'));
    bodies.forEach((b) => nav.appendChild(this.navButton(b, null, 'probe')));
    this.syncNavVisibility();
    this.setActiveBody(this.app.focusId);
  }

  syncNavVisibility() {
    for (const b of $('nav-panel').querySelectorAll('button')) {
      const kind = BODY_BY_ID[b.dataset.bodyId]?.kind;
      b.hidden = (kind === 'comet' && !this.app.showComets) || (kind === 'probe' && !this.app.showProbes);
    }
    const hc = $('nav-comets'), hp = $('nav-probes');
    if (hc) hc.hidden = !this.app.showComets;
    if (hp) hp.hidden = !this.app.showProbes;
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

  /** Select the preset closest to a speed in days per second. */
  setSpeedValue(v) {
    let best = 0;
    SPEED_PRESETS.forEach((p, i) => {
      if (Math.abs(p.value - v) < Math.abs(SPEED_PRESETS[best].value - v)) best = i;
    });
    this.setSpeedIndex(best);
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
    $('toggle-comets').addEventListener('change', (e) => { this.app.setComets(e.target.checked); this.syncNavVisibility(); });
    $('toggle-probes').addEventListener('change', (e) => { this.app.setProbes(e.target.checked); this.syncNavVisibility(); });
    $('help-btn').addEventListener('click', () => ($('help').hidden = !$('help').hidden));
    $('help').addEventListener('click', () => ($('help').hidden = true));
    $('info-close').addEventListener('click', () => ($('info-panel').hidden = true));
    $('events-btn').addEventListener('click', () => this.toggleEvents());
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
    this.setToggle(id, !$(id).checked);
  }

  setToggle(id, on) {
    const el = $(id);
    el.checked = on;
    el.dispatchEvent(new Event('change'));
  }

  // ---------- Guided tour ----------
  buildEvents() {
    const list = $('events-list');
    EVENTS.forEach((ev, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="ev-title">${ev.title}</span><span class="ev-when">${ev.when}</span>`;
      b.addEventListener('click', () => this.app.playEvent(ev.id));
      b.dataset.index = i;
      list.appendChild(b);
    });
    $('events-close').addEventListener('click', () => ($('events-panel').hidden = true));
    $('event-prev').addEventListener('click', () => this.stepEvent(-1));
    $('event-next').addEventListener('click', () => this.stepEvent(1));
    $('event-close').addEventListener('click', () => this.hideEvent());
    $('event-share').addEventListener('click', () => this.shareEvent());
  }

  toggleEvents() {
    $('events-panel').hidden = !$('events-panel').hidden;
    if (!$('events-panel').hidden) $('help').hidden = true;
  }

  showEvent(ev) {
    this.eventIndex = EVENTS.indexOf(ev);
    $('event-title').textContent = ev.title;
    $('event-when').textContent = ev.when;
    $('event-caption').textContent = ev.caption;
    $('event-step').textContent = `${this.eventIndex + 1} / ${EVENTS.length}`;
    $('event-card').hidden = false;
    $('events-panel').hidden = true;
    document.body.classList.add('touring');
    for (const b of $('events-list').querySelectorAll('button')) b.classList.toggle('active', +b.dataset.index === this.eventIndex);
    const url = new URL(window.location.href);
    url.search = `?event=${ev.id}`;
    window.history.replaceState(null, '', url);
  }

  hideEvent() {
    $('event-card').hidden = true;
    document.body.classList.remove('touring');
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState(null, '', url);
  }

  stepEvent(delta) {
    const i = (this.eventIndex + delta + EVENTS.length) % EVENTS.length;
    this.app.playEvent(EVENTS[i].id);
  }

  async shareEvent() {
    const btn = $('event-share');
    try {
      await navigator.clipboard.writeText(window.location.href);
      btn.textContent = 'Lien copié ✓';
    } catch {
      btn.textContent = 'Copiez l’adresse';
    }
    setTimeout(() => (btn.textContent = 'Partager'), 1800);
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
      if (!$('lightbox').hidden) {
        // The lightbox captures navigation keys while it is open.
        if (k === 'escape') this.closeLightbox();
        else if (k === 'arrowleft') this.stepPhoto(-1);
        else if (k === 'arrowright') this.stepPhoto(1);
        e.preventDefault();
        return;
      }
      if (k === ' ') { e.preventDefault(); this.togglePause(); }
      else if (k === 'arrowleft') this.setSpeedIndex(this.speedIndex - 1);
      else if (k === 'arrowright') this.setSpeedIndex(this.speedIndex + 1);
      else if (/^[0-9]$/.test(k)) this.app.focus(order[+k].id);
      else if (k === 'm') this.app.setMode(this.sim.mode === 'nbody' ? 'ephemeris' : 'nbody');
      else if (k === 's') this.app.setReadable(!this.app.mapper.readable);
      else if (k === 'o') this.toggleCheckbox('toggle-orbits');
      else if (k === 'l') this.toggleCheckbox('toggle-labels');
      else if (k === 'b') this.toggleCheckbox('toggle-belts');
      else if (k === 'c') this.toggleCheckbox('toggle-comets');
      else if (k === 'v') this.toggleCheckbox('toggle-probes');
      else if (k === 'e') this.toggleEvents();
      else if (k === 'pagedown' || k === 'n') { if (this.eventIndex >= 0) this.stepEvent(1); }
      else if (k === 'pageup') { if (this.eventIndex >= 0) this.stepEvent(-1); }
      else if (k === 't') this.app.jumpTo(dateToJD(new Date()));
      else if (k === 'h' || k === '?') $('help').hidden = !$('help').hidden;
      else if (k === 'escape') { $('help').hidden = true; $('events-panel').hidden = true; this.app.focus('sun', true); }
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
    this.updateEclipseBadge();
    if (this.sim.nbody) $('energy').textContent = this.sim.nbody.relativeEnergyDrift().toExponential(2);
    if (!$('info-panel').hidden) this.renderStats(this.app.focusId);
  }

  /** "Éclipse de Soleil / de Lune en cours" badge, from the real geometry. */
  updateEclipseBadge() {
    const e = this.sim.helio.get('earth'), m = this.sim.helio.get('moon');
    const badge = $('eclipse-badge');
    if (!e || !m) { badge.hidden = true; return; }
    const sun = e.map((v) => -v * AU_KM);
    const moon = m.map((v, k) => (v - e[k]) * AU_KM);
    let text = null;
    if (shadowAxisHit(sun, moon, EARTH_R)) text = 'Éclipse de Soleil en cours';
    else {
      const s = earthShadowAtMoon(sun, moon, 695700, EARTH_R);
      if (s.along > 0) {
        if (s.distance + 1737 < s.umbra) text = 'Éclipse totale de Lune';
        else if (s.distance - 1737 < s.umbra) text = 'Éclipse partielle de Lune';
      }
    }
    badge.hidden = !text;
    if (text) badge.textContent = text;
  }

  // ---------- Info panel ----------
  bodyFor(id) {
    return BODY_BY_ID[id] || (id === 'rogue' ? ROGUE_STAR : null);
  }

  renderInfo(id) {
    const body = this.bodyFor(id);
    if (!body) return;
    $('info-panel').hidden = false;
    $('info-name').textContent = body.name;
    $('info-type').textContent = body.type;
    $('info-desc').textContent = body.description;
    $('info-swatch').style.background = `radial-gradient(circle at 35% 35%, #fff8, ${body.color} 45%, #000 120%)`;
    $('info-swatch').style.boxShadow = `0 0 18px ${body.color}66`;
    if (id !== this.photoBody) { this.photoBody = id; this.photoIndex = 0; }
    this.renderPhoto();
    this.renderStats(id);
  }

  // ---------- Photos ----------
  bindPhotos() {
    this.photoBody = null;
    this.photoIndex = 0;
    const img = $('photo-img');
    img.addEventListener('load', () => $('photo-frame').classList.add('loaded'));
    img.addEventListener('error', () => {
      // Missing file: fall back to the coloured swatch only.
      $('info-photo').hidden = true;
    });
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    $('photo-prev').addEventListener('click', stop(() => this.stepPhoto(-1)));
    $('photo-next').addEventListener('click', stop(() => this.stepPhoto(1)));
    $('photo-frame').addEventListener('click', () => this.openLightbox());
    $('photo-frame').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.openLightbox(); }
    });
    $('lightbox').addEventListener('click', (e) => { if (e.target === $('lightbox')) this.closeLightbox(); });
    $('lightbox-close').addEventListener('click', () => this.closeLightbox());
    $('lightbox-prev').addEventListener('click', () => this.stepPhoto(-1));
    $('lightbox-next').addEventListener('click', () => this.stepPhoto(1));
  }

  photos() {
    return PHOTOS[this.photoBody] || [];
  }

  creditHTML(p) {
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const lic = /^public domain$/i.test(p.license) ? 'Domaine public' : p.license;
    const licHTML = p.licenseUrl ? `<a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener">${esc(lic)}</a>` : esc(lic);
    return `Crédit : <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">${esc(p.credit)}</a> — ${licHTML}`;
  }

  renderPhoto() {
    const list = this.photos();
    const fig = $('info-photo');
    if (!list.length) { fig.hidden = true; return; }
    const p = list[this.photoIndex];
    fig.hidden = false;
    const img = $('photo-img');
    if (!img.src.endsWith(p.file)) {
      $('photo-frame').classList.remove('loaded');
      img.src = p.file;
    }
    img.alt = p.caption;
    img.style.objectPosition = p.pos || 'center';
    $('photo-caption').textContent = p.caption;
    $('photo-credit').innerHTML = this.creditHTML(p);
    const many = list.length > 1;
    $('photo-prev').hidden = $('photo-next').hidden = !many;
    $('photo-dots').innerHTML = many ? list.map((_, i) => `<span class="${i === this.photoIndex ? 'on' : ''}"></span>`).join('') : '';
    // Warm the cache for the next photo so stepping feels instant.
    if (many) new Image().src = list[(this.photoIndex + 1) % list.length].file;
    if (!$('lightbox').hidden) this.renderLightbox();
  }

  stepPhoto(delta) {
    const n = this.photos().length;
    if (n < 2) return;
    this.photoIndex = (this.photoIndex + delta + n) % n;
    this.renderPhoto();
  }

  openLightbox() {
    if (!this.photos().length) return;
    $('lightbox').hidden = false;
    this.renderLightbox();
    $('lightbox-close').focus();
  }

  closeLightbox() {
    $('lightbox').hidden = true;
    $('photo-frame').focus();
  }

  renderLightbox() {
    const list = this.photos();
    const p = list[this.photoIndex];
    if (!p) return;
    $('lightbox-img').src = p.file;
    $('lightbox-img').alt = p.caption;
    $('lightbox-caption').textContent = p.caption;
    $('lightbox-credit').innerHTML = this.creditHTML(p);
    $('lightbox-step').textContent = list.length > 1 ? `${this.photoIndex + 1} / ${list.length}` : '';
    $('lightbox-prev').hidden = $('lightbox-next').hidden = list.length < 2;
  }

  renderStats(id) {
    const body = this.bodyFor(id);
    if (!body) return;
    let rows;
    if (body.kind === 'comet') rows = this.cometRows(body);
    else if (body.kind === 'probe') rows = this.probeRows(body);
    else rows = this.bodyRows(body);
    const dev = this.sim.deviationKm(id);
    if (dev !== null) rows.push(['Écart N-corps / éphémérides', distKm(dev), true]);
    $('info-stats').innerHTML = rows.map(([k, v, hl]) => `<div class="stat"><dt>${k}</dt><dd${hl ? ' class="highlight"' : ''}>${v}</dd></div>`).join('');
  }

  heliocentricRows(rows, id) {
    const kin = this.sim.kinematics(id);
    if (!kin) return null;
    rows.push(['Distance au Soleil', `${nf(kin.distanceAU < 10 ? 3 : 2).format(kin.distanceAU)} UA · ${distKm(kin.distanceAU * AU_KM)}`]);
    return kin;
  }

  bodyRows(body) {
    const rows = [];
    const sim = this.sim, id = body.id;
    const inEarths = body.id !== 'sun' && !body.isStar;
    rows.push(['Rayon', `${nf(0).format(body.radiusKm)} km` + (inEarths ? ` (${nf(body.radiusKm / EARTH_R < 1 ? 3 : 2).format(body.radiusKm / EARTH_R)} R⊕)` : '')]);
    if (body.massKg) rows.push(['Masse', `${sci(body.massKg)} kg` + (inEarths ? ` (${nf(body.massKg / EARTH_M < 0.1 ? 4 : 2).format(body.massKg / EARTH_M)} M⊕)` : '')]);
    if (id === 'rogue') rows.push(['Masse', `${nf(2).format(sim.rogueMassSolar)} M☉`]);
    if (id !== 'sun') {
      const kin = this.heliocentricRows(rows, id);
      if (kin && body.parent) {
        const off = sim.moonOffsets.get(id);
        rows.push([`Distance à ${BODY_BY_ID[body.parent].name}`, `${nf(0).format(off ? off.distanceKm : body.distanceKm)} km`]);
        rows.push(['Vitesse orbitale', `${nf(2).format(kin.orbitalSpeed)} km/s`]);
      } else if (kin) {
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
      rows.push(['Rotation', 'synchrone']);
    }
    return rows;
  }

  cometRows(body) {
    const rows = [['Désignation', body.designation]];
    if (body.diameterKm) rows.push(['Diamètre du noyau', `≈ ${nf(1).format(body.diameterKm)} km`]);
    const kin = this.heliocentricRows(rows, body.id);
    if (kin) rows.push(['Vitesse / Soleil', `${nf(2).format(kin.speedKmS)} km/s`]);
    const k = cometElements(body, this.sim.jd);
    rows.push(['Période orbitale', duration(periodDays(k.a))]);
    rows.push(['Excentricité', nf(4).format(k.e)]);
    rows.push(['Périhélie', `${nf(3).format(k.q)} UA`]);
    rows.push(['Passage au périhélie', shortDate(k.tp)]);
    rows.push(['Inclinaison', `${nf(1).format((k.i * 180) / Math.PI)}°` + (k.i > Math.PI / 2 ? ' (rétrograde)' : '')]);
    if (kin) {
      const act = cometActivity(kin.distanceAU) * (body.tailScale || 1);
      rows.push(['Queue', act > 0.03 ? `≈ ${distKm(Math.min(1.2, 0.2 * act) * AU_KM)}` : 'aucune (trop loin du Soleil)']);
    }
    return rows;
  }

  probeRows(body) {
    const sim = this.sim, id = body.id;
    const rows = [['Lancement', shortDate(dateToJD(new Date(body.launch)))]];
    const p = sim.helio.get(id);
    if (!p) {
      rows.push(['Statut', 'pas encore lancée']);
      return rows;
    }
    const kin = this.heliocentricRows(rows, id);
    rows.push(['Vitesse / Soleil', `${nf(2).format(kin.speedKmS)} km/s`]);
    const e = sim.helio.get('earth');
    const dEarth = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]) * AU_KM;
    rows.push(['Distance à la Terre', distKm(dEarth)]);
    rows.push(['Signal radio', `${lightTime(dEarth)} pour arriver`]);
    const local = sim.probeLocal.get(id);
    if (local && local.weight > 0.5) {
      const planet = BODY_BY_ID[local.planet];
      rows.push([`Distance à ${planet.name}`, `${distKm(local.distanceKm)} (alt. ${distKm(Math.max(0, local.distanceKm - planet.radiusKm))})`, true]);
    }
    const next = body.encounters.find(([, d]) => dateToJD(new Date(d)) > sim.jd);
    const last = [...body.encounters].reverse().find(([, d]) => dateToJD(new Date(d)) <= sim.jd);
    if (last) rows.push(['Dernier survol', `${last[2]}, ${shortDate(dateToJD(new Date(last[1])))}`]);
    if (next) rows.push(['Prochain survol', `${next[2]}, ${shortDate(dateToJD(new Date(next[1])))}`]);
    if (sim.probeExtrapolated?.get(id)) rows.push(['Trajectoire', 'extrapolée (après les données JPL)']);
    return rows;
  }
}
