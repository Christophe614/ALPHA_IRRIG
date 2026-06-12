// ============================================================
//  IRRIGATION SMART — Frontend JavaScript v2.0
//  Sources : ESP32 Wi-Fi local → Firebase → Simulation
// ============================================================

// ══ CONFIGURATION ════════════════════════════════════════════
// Remplace par ton URL Firebase quand tu l'as créé
const FIREBASE_URL = "https://TON-PROJET.firebaseio.com";
const FIREBASE_KEY = "TON-API-KEY";

const ESP32_IP  = '';       // Vide = même hôte 192.168.4.1
const POLL_MS   = 8000;     // Rafraîchissement 8 secondes
const MAX_PTS   = 30;       // Points max graphique

// ══ ÉTAT ══════════════════════════════════════════════════════
let SEUIL       = 30;
let histSol     = [], histTemp = [], histLabels = [];
let logArrosages = [];
let simSol      = 65, simCount = 0;
let source      = 'simulation'; // 'esp32' | 'firebase' | 'simulation'

// ══ GRAPHIQUES ════════════════════════════════════════════════
const mkChart = (id, label, color, min, max) => new Chart(
  document.getElementById(id).getContext('2d'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label, data: [], borderColor: color,
        backgroundColor: color + '15', fill: true,
        tension: 0.45, pointRadius: 2, borderWidth: 2 },
      ...(id === 'chart-sol' ? [{
        label: 'Seuil', data: [],
        borderColor: '#E63946', borderDash: [4, 3],
        pointRadius: 0, fill: false, borderWidth: 1.5
      }] : [])
    ]
  },
  options: {
    responsive: true, animation: false,
    plugins: { legend: { labels: { color: '#95D5B2', font: { size: 10 }, boxWidth: 10 } } },
    scales: {
      y: { min, max, ticks: { color: '#4a6655', font: { size: 9 } }, grid: { color: '#1a3322' } },
      x: { ticks: { color: '#4a6655', maxRotation: 0, font: { size: 9 } }, grid: { color: '#1a3322' } }
    }
  }
});

const chartSol  = mkChart('chart-sol',  'Humidité Sol (%)', '#52B788', 0, 100);
const chartTemp = mkChart('chart-temp', 'Température (°C)', '#F4A92B', 15, 50);

// ══ MESSAGE ÉDUCATIF ══════════════════════════════════════════
function getMessage(sol, temp, eau, pompe) {
  if (pompe)      return "💧 Arrosage en cours — la plante reçoit de l'eau !";
  if (sol < 15)   return "🌵 Sol très sec — arrosage automatique imminent";
  if (sol < 30)   return "⚠️ Humidité faible — surveillance renforcée";
  if (sol > 75)   return "✅ Sol bien hydraté — aucun arrosage nécessaire";
  if (temp > 35)  return "☀️ Forte chaleur — consommation eau augmentée";
  if (eau > 25)   return "🪣 Réservoir bas — pensez à remplir bientôt";
  return "🌿 Système actif — tout va bien";
}

// ══ MISE À JOUR INTERFACE ════════════════════════════════════
function render(d) {
  const sol    = +d.humiditeSol  || 0;
  const temp   = parseFloat(d.temperature  || 0);
  const air    = parseFloat(d.humiditeAir  || 0);
  const eau    = parseFloat(d.niveauEau    || 0);
  const pompe  = !!d.pompe;
  const count  = +d.arrosages   || 0;
  SEUIL        = +d.seuil       || SEUIL;
  const besoin = +d.besoinMl    || 0;
  const moy    = parseFloat(d.moyenneSol   || 0);
  const tend   = parseFloat(d.tendance     || 0);
  const uptime = +d.uptime      || 0;
  const gsm    = !!d.gsm;

  // ── ACCUEIL ───────────────────────────
  document.getElementById('h-sol').innerHTML  = sol + '<sup>%</sup>';
  document.getElementById('h-sub').textContent =
    sol < SEUIL ? `Sous le seuil (${SEUIL}%) — arrosage activé` : `Au-dessus du seuil (${SEUIL}%) — normal`;
  document.getElementById('h-msg').textContent  = getMessage(sol, temp, eau, pompe);
  document.getElementById('edu-box').textContent = getMessage(sol, temp, eau, pompe);
  document.getElementById('h-bar').style.width  = Math.min(sol, 100) + '%';
  document.getElementById('hero').className      = 'hero' + (sol < SEUIL ? ' danger' : '');

  document.getElementById('s-temp').textContent  = temp.toFixed(1);
  document.getElementById('s-air').textContent   = air.toFixed(0);
  document.getElementById('s-eau').textContent   = eau.toFixed(0);
  document.getElementById('s-count').textContent = count;
  document.getElementById('s-seuil').textContent = SEUIL;
  document.getElementById('s-besoin').textContent = Math.round(besoin);

  const sc = document.getElementById('stat-eau');
  if (sc) sc.className = 'sc' + (eau > 25 ? ' warn' : '');

  const badge = document.getElementById('badge-pompe');
  badge.textContent = pompe ? '💧 ON' : 'OFF';
  badge.className   = 'badge ' + (pompe ? 'on' : 'off');

  const prog = document.getElementById('progress-sol');
  prog.style.width = Math.min(sol, 100) + '%';
  prog.className   = 'progress-fill' + (sol < SEUIL ? ' danger' : '');

  // ── BADGE SOURCE ──────────────────────
  const dot     = document.getElementById('dot');
  const liveTxt = document.getElementById('statut-txt');
  if (source === 'esp32') {
    dot.className = 'dot green';
    liveTxt.textContent = pompe ? 'Arrosage...' : '✅ ESP32 connecté';
  } else if (source === 'firebase') {
    dot.className = 'dot blue';
    liveTxt.textContent = '🌐 Firebase live';
  } else {
    dot.className = 'dot orange';
    liveTxt.textContent = '🔄 Simulation';
  }

  // ── CAPTEURS ──────────────────────────
  document.getElementById('c-sol').textContent  = sol + '%';
  document.getElementById('c-temp').textContent = temp.toFixed(1) + '°';
  document.getElementById('c-air').textContent  = air.toFixed(0) + '%';
  document.getElementById('c-eau').textContent  = eau.toFixed(0) + 'cm';
  const cp = document.getElementById('c-pompe');
  cp.textContent = pompe ? 'ON' : 'OFF';
  cp.style.color = pompe ? '#52B788' : '#E63946';

  const gsmEl = document.getElementById('c-gsm');
  if (gsmEl) { gsmEl.textContent = gsm ? 'Connecté' : 'Hors ligne'; gsmEl.style.color = gsm ? '#52B788' : '#E63946'; }

  // ── IA ────────────────────────────────
  if (document.getElementById('ia-moy'))    document.getElementById('ia-moy').textContent    = moy.toFixed(1) + '%';
  if (document.getElementById('ia-seuil'))  document.getElementById('ia-seuil').textContent  = SEUIL + '%';
  if (document.getElementById('ia-besoin')) document.getElementById('ia-besoin').textContent = Math.round(besoin) + ' ml/j';
  if (document.getElementById('ia-tend'))   document.getElementById('ia-tend').textContent   =
    tend > 0.5 ? '📉 Se sèche' : tend < -0.5 ? '📈 S\'humidifie' : '➡️ Stable';
  const h = Math.floor(uptime/3600), m = Math.floor((uptime%3600)/60);
  if (document.getElementById('ia-uptime')) document.getElementById('ia-uptime').textContent = `${h}h ${m}min`;

  // ── GRAPHIQUES ────────────────────────
  const now = new Date();
  const lbl = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  histSol.push(sol); histTemp.push(temp); histLabels.push(lbl);
  if (histSol.length > MAX_PTS) { histSol.shift(); histTemp.shift(); histLabels.shift(); }

  chartSol.data.labels           = histLabels;
  chartSol.data.datasets[0].data = histSol;
  chartSol.data.datasets[1].data = new Array(histSol.length).fill(SEUIL);
  chartSol.update('none');
  chartTemp.data.labels           = histLabels;
  chartTemp.data.datasets[0].data = histTemp;
  chartTemp.update('none');

  // ── LOG ARROSAGE ──────────────────────
  if (pompe) {
    const last = logArrosages[logArrosages.length - 1];
    if (!last || !last.actif) {
      logArrosages.push({ heure: lbl, actif: true });
      renderLog();
    }
  } else if (logArrosages.length > 0) {
    logArrosages[logArrosages.length - 1].actif = false;
  }
}

function renderLog() {
  const el = document.getElementById('log-arrosages');
  if (!el) return;
  if (!logArrosages.length) {
    el.innerHTML = '<div class="log-empty">Aucun arrosage enregistré</div>'; return;
  }
  el.innerHTML = logArrosages.slice(-8).reverse().map(a =>
    `<div class="log-item">
       <div class="log-dot" style="${a.actif ? 'background:var(--solar)' : ''}"></div>
       <div class="log-txt">Arrosage à <strong>${a.heure}</strong>
         ${a.actif ? '<span style="color:var(--solar)"> — En cours</span>' : ''}
       </div>
     </div>`
  ).join('');
}

// ══ SOURCES DE DONNÉES ════════════════════════════════════════

// 1. ESP32 local (Wi-Fi IrrigationSmart)
function tryESP32() {
  return fetch(ESP32_IP + '/data', { signal: AbortSignal.timeout(3000) })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(d => { source = 'esp32'; return d; });
}

// 2. Firebase (via GSM depuis le champ)
function tryFirebase() {
  if (FIREBASE_URL.includes('TON-PROJET')) return Promise.reject('non configuré');
  const url = `${FIREBASE_URL}/irrigation/donnees.json?auth=${FIREBASE_KEY}`;
  return fetch(url, { signal: AbortSignal.timeout(5000) })
    .then(r => r.json())
    .then(d => {
      if (!d || typeof d !== 'object') throw new Error('Pas de données');
      source = 'firebase'; return d;
    });
}

// 3. Simulation (si rien n'est disponible)
function simStep() {
  simSol += (Math.random() - 0.52) * 5;
  simSol  = Math.max(8, Math.min(92, simSol));
  const pompe = simSol < SEUIL;
  if (pompe) simSol += 10;
  simCount++;
  source = 'simulation';
  return {
    humiditeSol: Math.round(simSol),
    temperature: (26 + Math.random() * 6).toFixed(1),
    humiditeAir: (50 + Math.random() * 25).toFixed(0),
    niveauEau:   (6 + Math.random() * 6).toFixed(1),
    pompe, arrosages: logArrosages.length, seuil: SEUIL,
    moyenneSol:  (52 + Math.random() * 12).toFixed(1),
    besoinMl:    70 + Math.random() * 80,
    tendance:    (Math.random() - 0.5) * 3,
    uptime:      simCount * 8, gsm: false,
  };
}

// Cascade : ESP32 → Firebase → Simulation
function poll() {
  tryESP32()
    .catch(() => tryFirebase())
    .catch(() => simStep())
    .then(d => render(d));
}

// ══ ARROSAGE MANUEL ══════════════════════════════════════════
function arroser() {
  const btn = document.getElementById('btn-water');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> Arrosage en cours...';
  showToast('💧 Commande envoyée !');

  if (source === 'esp32')    fetch(ESP32_IP + '/water').catch(() => {});
  if (source === 'firebase') {
    // Commande via Firebase — l'ESP32 la lira
    const url = `${FIREBASE_URL}/irrigation/commandes.json?auth=${FIREBASE_KEY}`;
    fetch(url, { method: 'POST',
      body: JSON.stringify({ action: 'water', ts: Date.now() })
    }).catch(() => {});
  }

  const heure = new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0');
  logArrosages.push({ heure, actif: true }); renderLog();

  setTimeout(() => {
    btn.innerHTML = '<span>💧</span> ARROSER MAINTENANT';
    btn.disabled = false;
    if (logArrosages.length) logArrosages[logArrosages.length-1].actif = false;
    renderLog();
  }, 32000);
}

// ══ SEUIL ═════════════════════════════════════════════════════
function updateSeuil(v) {
  SEUIL = +v;
  document.getElementById('p-seuil').textContent = v;
  document.getElementById('s-seuil').textContent = v;
  if (source === 'esp32') fetch(ESP32_IP + '/setseuil?val=' + v).catch(() => {});
  showToast('Seuil : ' + v + '%');
}

// ══ NAVIGATION ════════════════════════════════════════════════
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
}

// ══ TOAST ═════════════════════════════════════════════════════
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);'
      + 'background:#1B4332;border:1px solid #52B788;border-radius:12px;padding:12px 20px;'
      + 'font-size:13px;font-weight:600;color:#95D5B2;transition:transform .3s;z-index:999;white-space:nowrap';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => t.style.transform = 'translateX(-50%) translateY(100px)', 2800);
}

// ══ DÉMARRAGE ════════════════════════════════════════════════
poll();
setInterval(poll, POLL_MS);
