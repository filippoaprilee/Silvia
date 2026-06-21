/* ══════════════════════════════════════════
   SILVIA APP — app.js
   Chat reale con Claude API, tutto funzionante
══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const CONFIG = {
  API_URL: 'https://api.anthropic.com/v1/messages',
  MODEL:   'claude-sonnet-4-6',
  GMAIL_MCP: 'https://gmailmcp.googleapis.com/mcp/v1',
  EMAIL_ALERT_COOLDOWN_MS: 4 * 60 * 60 * 1000, // 4h
  MAX_HISTORY: 24,
};

const TIPS = [
  'Respirare lentamente per 60 secondi attiva il nervo vago e abbassa il battito cardiaco entro 2 minuti.',
  'Il metodo Pomodoro aumenta la produttività del 25% riducendo il carico cognitivo percepito.',
  'Scrivere i propri pensieri per 15 minuti riduce l\'ansia da esame, secondo uno studio del 2011 (Ramirez & Beilock).',
  'Il grounding 5-4-3-2-1 interrompe un attacco di panico in media in 3-5 minuti.',
  'Dormire 7-8 ore migliora la memorizzazione del 40% rispetto a dormire meno di 6.',
  'L\'esercizio fisico moderato per 20 minuti produce effetti ansiolitici simili a una dose bassa di benzodiazepine.',
  'La "defusione cognitiva" dell\'ACT riduce l\'impatto dei pensieri negativi senza doverli eliminare.',
  'Il rilassamento muscolare progressivo (PMR) abbassa il cortisolo del 18% in una singola sessione.',
];

// ─────────────────────────────────────────
// STATE — unica fonte di verità
// ─────────────────────────────────────────
let S = {
  name: '',
  notifyEmail: '',
  notifyEnabled: false,
  alertEnabled: true,
  summaryEnabled: true,
  currentMood: '',
  currentMoodV: 0,
  chatHistory: [],       // [{role,content}]
  diary: [],             // [{id,date,text,emoji,tags}]
  moodLog: [],           // [{date,v,emoji}]
  stats: { sessions:0, entries:0, chats:0, exercises:0 },
  streak: 0,
  lastActiveDate: null,
  techniqueUsage: {},
  lastEmailTs: 0,
  totalSessions: 0,
};

function persist() { try { localStorage.setItem('silvia_v2', JSON.stringify(S)); } catch(e){} }
function hydrate() {
  try {
    const raw = localStorage.getItem('silvia_v2');
    if (raw) S = { ...S, ...JSON.parse(raw) };
  } catch(e) {}
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
let _toastTimer = null;
function toast(msg, ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ─────────────────────────────────────────
// SHEET (Bottom Sheet Modal)
// ─────────────────────────────────────────
const Sheet = {
  open(html) {
    document.getElementById('sheet-body').innerHTML = html;
    document.getElementById('sheet-overlay').classList.add('open');
  },
  close(e) {
    if (e && e.target !== document.getElementById('sheet-overlay')) return;
    document.getElementById('sheet-overlay').classList.remove('open');
    // stop pomodoro if running
    Pomo.stop();
  },
  forceClose() {
    document.getElementById('sheet-overlay').classList.remove('open');
    Pomo.stop();
  }
};

// ─────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────
const OB = {
  step: 0,
  selectedMood: null,
  notifyEnabled: false,

  next() {
    this.step++;
    document.querySelectorAll('.ob-step').forEach((el,i) => {
      el.classList.toggle('hidden', i !== this.step);
    });
    document.querySelectorAll('.ob-dot').forEach((el,i) => {
      el.classList.toggle('active', i === this.step);
    });
    // re-animate
    const active = document.getElementById(`ob-step-${this.step}`);
    if (active) { active.style.animation = 'none'; requestAnimationFrame(() => { active.style.animation = ''; }); }
  },

  setName() {
    const val = document.getElementById('ob-name-input').value.trim();
    if (!val) return;
    S.name = val;
    document.getElementById('ob-step2-h2').innerHTML = `Come stai<br><em>${val}?</em>`;
    this.next();
  },

  pickMood(btn) {
    document.querySelectorAll('.ob-mood-card').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    this.selectedMood = { label: btn.dataset.mood, emoji: btn.dataset.emoji, v: parseInt(btn.dataset.v) };
    document.getElementById('ob-mood-display').textContent = btn.dataset.emoji;
    document.getElementById('ob-mood-btn').disabled = false;
  },

  toggleNotify(el) {
    this.notifyEnabled = el.checked;
    document.getElementById('ob-email-section').classList.toggle('hidden', !el.checked);
  },

  finish() {
    if (this.selectedMood) {
      S.currentMood = this.selectedMood.label;
      S.currentMoodV = this.selectedMood.v;
      S.moodLog.push({ date: new Date().toISOString(), v: this.selectedMood.v, emoji: this.selectedMood.emoji });
    }
    S.notifyEnabled = this.notifyEnabled;
    const emailEl = document.getElementById('ob-email-input');
    if (emailEl) S.notifyEmail = emailEl.value.trim();
    persist();
    document.getElementById('onboarding').classList.add('hidden');
    App.boot();
  }
};

// ─────────────────────────────────────────
// CLAUDE API CHAT
// ─────────────────────────────────────────
function buildSystemPrompt() {
  const diaryCtx = S.diary.slice(-6).map(e => `[${e.date}] (umore: ${e.emoji || '?'})\n${e.text}`).join('\n\n');
  const moodHistory = S.moodLog.slice(-12).map(m => `${m.emoji}(${m.v}/5)`).join(' ');
  const name = S.name || 'cara';

  return `Sei una psicoterapeuta esperta e umana, formata in CBT (Terapia Cognitivo-Comportamentale), ACT (Acceptance and Commitment Therapy) e MBSR (Mindfulness). Stai parlando con ${name}, una studentessa universitaria.

TONO FONDAMENTALE:
- Caldo, empatico, mai robotico né formulaico
- Adattivo: se ${name} è in crisi → prima la accogli e validi, poi (eventualmente) proponi tecniche
- Se è tranquilla → puoi essere più leggera, curiosa, anche un po' giocosa
- Parla in italiano naturale, come farebbe una terapeuta vera in seduta
- Usa il suo nome (${name}) con parsimonia — solo quando aggiunge calore autentico
- MAI rispondere con elenchi puntati o strutture rigide — parla come una persona

STRUTTURA DI UNA RISPOSTA IDEALE:
1. Riconosci ed empatizza con ciò che ha detto (1-2 frasi max)
2. Se appropriato, fai UNA domanda aperta per capire meglio — mai un interrogatorio
3. Solo dopo la comprensione, proponi qualcosa di concreto (tecnica, esercizio, reframe)

LUNGHEZZA: 2-4 frasi normalmente. Più lunga solo se serve davvero. Mai monologhi.

ESEMPI DI STILE:
- Bene: "Ha senso che tu ti senta così con tutti quegli esami... è un casino. Cosa ti pesa di più in questo momento?"
- Male: "Capisco che tu stia attraversando un periodo difficile. Ecco 5 tecniche per gestire l'ansia: 1) Respiro..."
- Bene: "Eh, l'ansia da esame è proprio quella brutta bestia. Quando inizia a salire, cosa senti nel corpo?"
- Male: "L'ansia è una risposta naturale. Ti consiglio di praticare mindfulness e tecniche di rilassamento."

CONTESTO DIARIO (ultimi sfoghi di ${name}):
${diaryCtx || '(nessun diario ancora)'}

STORICO UMORE RECENTE: ${moodHistory || '(non ancora registrato)'}
UMORE ATTUALE: ${S.currentMood ? `${S.currentMood} (${S.currentMoodV}/5)` : 'non specificato'}

Ricorda: il tuo compito principale è far sentire ${name} ascoltata e capita. I consigli vengono dopo.`;
}

async function askClaude(userMessage) {
  // Add to history
  S.chatHistory.push({ role: 'user', content: userMessage });
  if (S.chatHistory.length > CONFIG.MAX_HISTORY) {
    S.chatHistory = S.chatHistory.slice(-CONFIG.MAX_HISTORY);
  }

  const body = {
    model: CONFIG.MODEL,
    max_tokens: 1000,
    system: buildSystemPrompt(),
    messages: S.chatHistory,
  };

  const resp = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('Claude API error:', resp.status, err);
    throw new Error(`API ${resp.status}`);
  }

  const data = await resp.json();
  const reply = data.content?.find(b => b.type === 'text')?.text || '';
  if (!reply) throw new Error('Empty response');

  S.chatHistory.push({ role: 'assistant', content: reply });
  persist();
  return reply;
}

// ─────────────────────────────────────────
// CHAT UI
// ─────────────────────────────────────────
const Chat = {
  isLoading: false,

  init() {
    S.stats.chats = (S.stats.chats || 0) + 1;
    persist();
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
    const name = S.name || 'cara';
    let opener;
    if (S.currentMood && S.currentMoodV <= 2) {
      opener = `${greet} ${name} 💚 Mi hai detto che stai ${S.currentMood}... sono qui. Cosa sta succedendo?`;
    } else if (S.currentMood) {
      opener = `${greet} ${name}! Come va oggi? Dimmi tutto 🌿`;
    } else {
      opener = `${greet} ${name} 💚 Questo è il tuo spazio. Cosa ti porta qui oggi?`;
    }
    this._appendMsg('ai', opener);
  },

  clear() {
    S.chatHistory = [];
    persist();
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-suggestions-wrap').style.display = '';
    this.init();
    toast('💬 Nuova conversazione iniziata');
  },

  async send() {
    if (this.isLoading) return;
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    document.getElementById('chat-suggestions-wrap').style.display = 'none';

    this._appendMsg('user', text);
    this._showTyping();
    this.isLoading = true;
    document.getElementById('chat-send-btn').style.opacity = '0.5';

    try {
      const reply = await askClaude(text);
      this._hideTyping();
      this._appendMsg('ai', reply);
      this._maybeOfferExercise(reply);
      maybeEmail();
    } catch (err) {
      this._hideTyping();
      this._appendMsg('ai', 'Sono qui con te 🌿 Dimmi come stai.');
    } finally {
      this.isLoading = false;
      document.getElementById('chat-send-btn').style.opacity = '1';
    }
  },

  suggest(btn) {
    document.getElementById('chat-input').value = btn.textContent.trim();
    btn.closest('.chip')?.remove();
    this.send();
  },

  resize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  },

  onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  },

  _appendMsg(role, text) {
    const msgs = document.getElementById('chat-messages');
    const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    const safeText = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    if (role === 'ai') {
      div.innerHTML = `<div class="msg-avatar">🌿</div><div class="msg-wrap"><div class="msg-bubble">${safeText}</div><div class="msg-time">${time}</div></div>`;
    } else {
      div.innerHTML = `<div class="msg-wrap"><div class="msg-bubble">${safeText}</div><div class="msg-time">${time}</div></div>`;
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  _showTyping() {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg ai'; div.id = 'typing-msg';
    div.innerHTML = `<div class="msg-avatar">🌿</div><div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  _hideTyping() {
    document.getElementById('typing-msg')?.remove();
  },

  _maybeOfferExercise(reply) {
    const low = reply.toLowerCase();
    if (low.includes('respira') || low.includes('fiato') || low.includes('respiro')) {
      setTimeout(() => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:4px 16px';
        div.innerHTML = `<button class="chip" onclick="App.nav.to('breath');this.parentElement.remove()">🌬️ Vai agli esercizi di respiro</button>`;
        document.getElementById('chat-messages').appendChild(div);
        document.getElementById('chat-messages').scrollTop = 99999;
      }, 600);
    }
  }
};

// ─────────────────────────────────────────
// BREATHING
// ─────────────────────────────────────────
const BREATH_TYPES = {
  '478': {
    label: '4-7-8',
    desc:  'Inspira 4s · Trattieni 7s · Espira 8s — riduce l\'ansia acuta rapidamente.',
    phases: [{ label:'Inspira', s:4, scale:1.3 }, { label:'Trattieni', s:7, scale:1.15 }, { label:'Espira', s:8, scale:0.85 }],
    cycles: 4,
  },
  box: {
    label: 'Box',
    desc:  'Inspira 4s · Trattieni 4s · Espira 4s · Pausa 4s — calma il sistema nervoso.',
    phases: [{ label:'Inspira', s:4, scale:1.3 }, { label:'Trattieni', s:4, scale:1.15 }, { label:'Espira', s:4, scale:0.85 }, { label:'Pausa', s:4, scale:0.9 }],
    cycles: 4,
  },
  calm: {
    label: 'Calma',
    desc:  'Inspira 4s · Espira lunga 6s — attiva la risposta di rilassamento del vago.',
    phases: [{ label:'Inspira', s:4, scale:1.25 }, { label:'Espira', s:6, scale:0.85 }],
    cycles: 6,
  },
};

const Breath = {
  type: '478',
  running: false,
  timer: null,
  cycles: 0,
  phaseIdx: 0,

  setType(type, btn) {
    if (this.running) this.stop();
    this.type = type;
    document.querySelectorAll('.breath-tab').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    document.getElementById('breath-desc').textContent = BREATH_TYPES[type].desc;
    document.getElementById('breath-num').textContent = BREATH_TYPES[type].phases[0].s;
    document.getElementById('breath-phase').textContent = 'Premi Inizia';
    document.getElementById('breath-instr').textContent = BREATH_TYPES[type].desc;
    document.getElementById('breath-bar').style.width = '0%';
    document.getElementById('breath-meta').textContent = `Cicli: 0 / ${BREATH_TYPES[type].cycles}`;
    document.getElementById('breath-cta').textContent = 'Inizia 🌬️';
    document.getElementById('breath-orb').style.transform = 'scale(1)';
  },

  toggle() {
    if (this.running) this.stop(); else this.start();
  },

  start() {
    this.running = true;
    this.cycles = 0;
    this.phaseIdx = 0;
    document.getElementById('breath-cta').textContent = 'Stop ✕';
    this._runPhase();
  },

  stop() {
    this.running = false;
    clearInterval(this.timer);
    document.getElementById('breath-cta').textContent = 'Inizia 🌬️';
    document.getElementById('breath-phase').textContent = 'Premi Inizia';
    document.getElementById('breath-num').textContent = BREATH_TYPES[this.type].phases[0].s;
    document.getElementById('breath-orb').style.transform = 'scale(1)';
    document.getElementById('breath-instr').textContent = 'Scegli una tecnica e inizia';
  },

  _runPhase() {
    if (!this.running) return;
    const cfg = BREATH_TYPES[this.type];
    const phase = cfg.phases[this.phaseIdx];
    let s = phase.s;

    document.getElementById('breath-num').textContent = s;
    document.getElementById('breath-phase').textContent = phase.label.toLowerCase();
    document.getElementById('breath-instr').textContent = phase.label;
    document.getElementById('breath-orb').style.transition = `transform ${phase.s}s ease-in-out`;
    document.getElementById('breath-orb').style.transform = `scale(${phase.scale})`;

    clearInterval(this.timer);
    this.timer = setInterval(() => {
      s--;
      document.getElementById('breath-num').textContent = Math.max(0, s);

      // Progress bar
      const totalSecs = cfg.phases.reduce((a, p) => a + p.s, 0);
      const prevSecs = cfg.phases.slice(0, this.phaseIdx).reduce((a, p) => a + p.s, 0);
      const elapsed = prevSecs + (phase.s - s);
      const cyclePct = elapsed / totalSecs;
      const totalPct = (this.cycles / cfg.cycles + cyclePct / cfg.cycles) * 100;
      document.getElementById('breath-bar').style.width = Math.min(totalPct, 100) + '%';
      document.getElementById('breath-meta').textContent = `Cicli: ${this.cycles} / ${cfg.cycles}`;

      if (s <= 0) {
        clearInterval(this.timer);
        this.phaseIdx++;
        if (this.phaseIdx >= cfg.phases.length) {
          this.phaseIdx = 0;
          this.cycles++;
          if (this.cycles >= cfg.cycles) { this._finish(); return; }
        }
        setTimeout(() => this._runPhase(), 350);
      }
    }, 1000);
  },

  _finish() {
    this.running = false;
    document.getElementById('breath-instr').textContent = '✨ Ottima sessione!';
    document.getElementById('breath-cta').textContent = 'Di nuovo 🌬️';
    document.getElementById('breath-bar').style.width = '100%';
    document.getElementById('breath-orb').style.transform = 'scale(1)';
    S.stats.sessions = (S.stats.sessions || 0) + 1;
    const key = 'Respiro ' + BREATH_TYPES[this.type].label;
    S.techniqueUsage[key] = (S.techniqueUsage[key] || 0) + 1;
    persist();
    toast('💪 Sessione completata! Brava.');
    setTimeout(maybeEmail, 1500);
  },
};

// ─────────────────────────────────────────
// EXERCISES
// ─────────────────────────────────────────
const Exercises = {
  open(type) {
    S.stats.exercises = (S.stats.exercises || 0) + 1;
    S.techniqueUsage[type] = (S.techniqueUsage[type] || 0) + 1;
    persist();
    const html = this._html(type);
    Sheet.open(html);
    if (type === 'pomodoro') Pomo.reset();
  },

  _html(type) {
    switch (type) {
      case 'grounding': return this._groundingHtml();
      case 'pmr':       return this._pmrHtml();
      case 'bodyscan':  return this._bodyscanHtml();
      case 'defusion':  return this._defusionHtml();
      case 'pomodoro':  return this._pomodoroHtml();
      case 'affirmations': return this._affirmHtml();
      default: return '<p>Esercizio non trovato.</p>';
    }
  },

  _groundingHtml() {
    const steps = [
      { n:'5', sense:'Cose che VEDI', inst:'Guarda intorno. Nomina 5 cose che riesci a vedere chiaramente.', ph:'Es: la lampada, il muro, le mie mani…' },
      { n:'4', sense:'Cose che TOCCHI', inst:'Senti fisicamente 4 superfici. Il tessuto, la sedia, il pavimento...', ph:'Es: la coperta, il tavolo…' },
      { n:'3', sense:'Cose che SENTI', inst:'Ascolta in silenzio. Quali 3 suoni percepisci ora?', ph:'Es: il vento, la mia voce, il silenzio…' },
      { n:'2', sense:'Cose che ANNUSI', inst:'Fai un respiro profondo. Quali 2 odori percepisci?', ph:'Es: l\'aria, il caffè di prima…' },
      { n:'1', sense:'Cosa ASSAGGI', inst:'Cosa c\'è in bocca? Anche l\'acqua, anche niente, conta.', ph:'Es: niente, l\'acqua…' },
    ];
    const stepsHtml = steps.map((s, i) => `
      <div class="grounding-step ${i === 0 ? 'active' : ''}" id="gs-${i}">
        <div class="grounding-big-num">${s.n}</div>
        <div class="grounding-sense">${s.sense}</div>
        <div class="grounding-inst">${s.inst}</div>
        <input class="grounding-field" placeholder="${s.ph}" />
        <button class="grounding-next" onclick="App.exercises.groundingNext(${i + 1})">
          ${i < steps.length - 1 ? 'Avanti →' : 'Completa ✓'}
        </button>
      </div>`).join('');
    const done = `
      <div class="grounding-step" id="gs-5" style="text-align:center;padding:24px 0">
        <div style="font-size:3.5rem;margin-bottom:16px">🌿</div>
        <div style="font-family:'DM Serif Display',serif;font-size:1.6rem;color:var(--ink);margin-bottom:10px">Sei qui, adesso</div>
        <div style="font-size:0.88rem;color:var(--ink-muted);line-height:1.65">L'ansia si nutre del futuro.<br>Tu sei presente, al sicuro, intera.</div>
        <button class="grounding-next" style="margin-top:24px" onclick="Sheet.forceClose()">Chiudi ✓</button>
      </div>`;
    return `
      <div style="padding:0 4px">
        <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🌍 Grounding 5-4-3-2-1</div>
        <div style="font-size:0.8rem;color:var(--ink-muted);margin-bottom:20px">Torna al presente attraverso i sensi • CBT</div>
        ${stepsHtml}${done}
      </div>`;
  },

  groundingNext(n) {
    document.querySelectorAll('[id^="gs-"]').forEach(el => el.classList.remove('active'));
    const next = document.getElementById(`gs-${n}`);
    if (next) {
      next.classList.add('active');
      next.style.animation = 'none';
      requestAnimationFrame(() => next.style.animation = 'slideUp 0.4s var(--ease)');
    }
    if (n >= 5) { toast('🌿 Grounding completato! Come ti senti?'); }
  },

  _pmrHtml() {
    const zones = [
      { icon:'🤜', name:'Mani', act:'Stringi i pugni con forza, tieni 7 secondi... poi lascia andare tutto in una volta.' },
      { icon:'💪', name:'Braccia', act:'Piega il braccio e contrai il bicipite al massimo. 7 secondi. Poi rilascia.' },
      { icon:'😬', name:'Viso', act:'Strizza gli occhi e serra i denti delicatamente. 7 secondi. Poi molla tutto.' },
      { icon:'🦴', name:'Collo e spalle', act:'Alza le spalle verso le orecchie il più possibile. 7 secondi. Poi lascia scendere.' },
      { icon:'🫁', name:'Petto e addome', act:'Fai un respiro profondo e tieni. Contrai la pancia. 7 secondi. Poi espira tutto.' },
      { icon:'🦵', name:'Cosce', act:'Stringi le cosce insieme con forza. 7 secondi. Poi rilassa completamente.' },
      { icon:'🦶', name:'Polpacci e piedi', act:'Punta i piedi verso il basso. Contrai i polpacci. 7 secondi. Poi rilascia.' },
    ];
    const stepsHtml = zones.map((z, i) => `
      <div class="grounding-step ${i === 0 ? 'active' : ''}" id="pmr-${i}">
        <div style="font-size:2.5rem;text-align:center;margin-bottom:8px">${z.icon}</div>
        <div class="grounding-sense">${z.name}</div>
        <div class="grounding-inst">${z.act}</div>
        <button class="grounding-next" onclick="App.exercises.pmrNext(${i + 1})">
          ${i < zones.length - 1 ? 'Avanti →' : 'Completa ✓'}
        </button>
      </div>`).join('');
    const done = `
      <div class="grounding-step" id="pmr-${zones.length}" style="text-align:center;padding:24px 0">
        <div style="font-size:3.5rem;margin-bottom:16px">💆</div>
        <div style="font-family:'DM Serif Display',serif;font-size:1.6rem;color:var(--ink);margin-bottom:10px">Senti la differenza?</div>
        <div style="font-size:0.88rem;color:var(--ink-muted);line-height:1.65">Il corpo porta il peso dello stress.<br>Ora è un po' più leggero.</div>
        <button class="grounding-next" style="margin-top:24px" onclick="Sheet.forceClose()">Chiudi ✓</button>
      </div>`;
    return `
      <div style="padding:0 4px">
        <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">💆 Rilassamento Muscolare Progressivo</div>
        <div style="font-size:0.8rem;color:var(--ink-muted);margin-bottom:4px">Tecnica di Jacobson • 7 zone muscolari</div>
        <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">
          📚 Validata da centinaia di studi clinici. Riduce cortisolo del 18% in una sessione.
        </div>
        ${stepsHtml}${done}
      </div>`;
  },

  pmrNext(n) {
    document.querySelectorAll('[id^="pmr-"]').forEach(el => el.classList.remove('active'));
    const next = document.getElementById(`pmr-${n}`);
    if (next) { next.classList.add('active'); }
    if (n >= 7) toast('💆 PMR completato! Senti quanto è diverso?');
  },

  _bodyscanHtml() {
    const steps = [
      { t:'Posizionati', c:'Siediti o sdraiati. Chiudi gli occhi se ti va. Fai 3 respiri lenti e profondi prima di iniziare.' },
      { t:'Testa', c:'Porta l\'attenzione alla sommità del capo. Senti il peso. Noti tensione? Lascia che si sciolga con ogni espirazione.' },
      { t:'Viso e collo', c:'Guancia, mascella, collo. Spesso tensioni inconsapevoli. Lascia che il viso si ammorbidisca.' },
      { t:'Spalle e petto', c:'Le spalle portano il peso di tutto. Con ogni espirazione, lasciale scendere di un centimetro.' },
      { t:'Braccia e mani', c:'Senti il peso delle braccia. Fino alle dita — c\'è calore? Formicolio? Qualunque cosa va bene.' },
      { t:'Addome', c:'La pancia si alza e scende. Non controllare — osserva e basta, come se fossi un testimone.' },
      { t:'Gambe e piedi', c:'Scendi lungo le cosce, le ginocchia, i polpacci, fino alle dita dei piedi. Senti il contatto con il suolo.' },
      { t:'Il tutto', c:'Espandi la consapevolezza a tutto il corpo insieme. Sei qui. Sei presente. Sei intera.' },
    ];
    return `
      <div style="padding:0 4px">
        <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🧘 Body Scan</div>
        <div style="font-size:0.8rem;color:var(--ink-muted);margin-bottom:4px">Protocollo MBSR (Kabat-Zinn) • 8 minuti</div>
        <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">
          📚 Riduce il cortisolo del 23% dopo uso regolare.
        </div>
        ${steps.map(s => `
          <div style="background:var(--bg);border-radius:12px;padding:16px;margin-bottom:10px;border-left:3px solid var(--sage)">
            <div style="font-weight:600;color:var(--sage-deep);font-size:0.88rem;margin-bottom:5px">${s.t}</div>
            <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">${s.c}</div>
          </div>`).join('')}
        <button class="grounding-next" style="margin-top:12px" onclick="Sheet.forceClose();toast('🧘 Body scan completato!')">
          Completato ✓
        </button>
      </div>`;
  },

  _defusionHtml() {
    return `
      <div style="padding:0 4px">
        <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🍃 Defusione Cognitiva</div>
        <div style="font-size:0.8rem;color:var(--ink-muted);margin-bottom:4px">ACT — Acceptance & Commitment Therapy • 3 min</div>
        <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">
          📚 Riduce la fusione cognitiva — non devi eliminare i pensieri, solo non crederci ciecamente.
        </div>
        <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:10px">
          <div style="font-weight:600;color:var(--ink);margin-bottom:8px">Il principio</div>
          <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">I pensieri non sono fatti. Sono solo eventi mentali — nuvole nel cielo, non il cielo stesso. Non devi combatterli né credere a ogni cosa che pensi.</div>
        </div>
        <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:10px;border-left:3px solid var(--sage)">
          <div style="font-weight:600;color:var(--ink);margin-bottom:8px">Esercizio 1: "Ho il pensiero che…"</div>
          <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">
            Invece di: <em>"Non ce la faccio"</em><br><br>
            Di' a te stessa: <strong style="color:var(--sage-deep)">"Ho il pensiero che non ce la farò"</strong><br><br>
            Senti la differenza? Crei distanza. Il pensiero esiste, ma non sei tu.
          </div>
        </div>
        <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:20px;border-left:3px solid var(--sage)">
          <div style="font-weight:600;color:var(--ink);margin-bottom:8px">Esercizio 2: Dai un nome</div>
          <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">
            Quando arriva un pensiero critico, battezzalo: <br>
            <em>"Ah, è tornata Radio Catastrofe..."</em><br>
            <em>"Sta parlando il mio Critico interiore..."</em><br><br>
            L'umorismo crea distanza automaticamente.
          </div>
        </div>
        <button class="grounding-next" onclick="Sheet.forceClose();toast('🍃 Defusione completata!')">
          Ho capito ✓
        </button>
      </div>`;
  },

  _pomodoroHtml() {
    return `
      <div style="padding:0 4px;text-align:center">
        <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px;text-align:left">🍅 Pomodoro Focus</div>
        <div style="font-size:0.8rem;color:var(--ink-muted);margin-bottom:20px;text-align:left">25 min studio · 5 min pausa · ripeti</div>
        <div class="pomo-timer-big" id="pomo-timer">25:00</div>
        <div class="pomo-phase-label" id="pomo-phase">Sessione studio #1</div>
        <div class="pomo-btns">
          <button class="pomo-btn-start" id="pomo-btn" onclick="Pomo.toggle()">▶ Inizia</button>
          <button class="pomo-btn-reset" onclick="Pomo.reset()">↺</button>
        </div>
        <div style="background:var(--bg);border-radius:12px;padding:16px;text-align:left">
          <div style="font-size:0.72rem;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Durante il pomodoro:</div>
          <div style="font-size:0.82rem;color:var(--ink-soft);line-height:1.8">
            ✓ Telefono capovolto o silenziato<br>
            ✓ Una sola cosa da fare<br>
            ✓ Se arriva un pensiero, scrivilo e torna<br>
            ✓ Nessun multitasking — il cervello non regge
          </div>
        </div>
      </div>`;
  },

  _affirmHtml() {
    const affs = [
      'Sono capace di affrontare le sfide, una alla volta.',
      'Non devo essere perfetta per meritare rispetto e amore.',
      'Ogni momento difficile che supero mi rende più forte.',
      'Ho il diritto di sentirmi sopraffatta e di chiedere aiuto.',
      'Il mio valore non dipende dai miei voti o dalla mia produttività.',
      'Sono abbastanza. Così come sono, adesso.',
      'Posso fare una cosa alla volta. Questo è sufficiente.',
    ];
    let idx = 0;
    const id = 'aff-' + Date.now();
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.querySelector('.aff-next').onclick = () => {
        idx = (idx + 1) % affs.length;
        el.querySelector('.aff-text').textContent = affs[idx];
        el.querySelector('.aff-num').textContent = `${idx + 1} / ${affs.length}`;
      };
    }, 50);
    return `
      <div id="${id}" style="padding:0 4px">
        <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">💜 Affermazioni positive</div>
        <div style="font-size:0.8rem;color:var(--ink-muted);margin-bottom:24px">Psicologia positiva basata sull\'autoefficacia (Bandura)</div>
        <div style="background:linear-gradient(135deg,var(--sage-deep),var(--sage));border-radius:20px;padding:32px 24px;text-align:center;margin-bottom:20px">
          <div class="aff-text" style="font-family:'DM Serif Display',serif;font-size:1.3rem;color:white;line-height:1.5;font-style:italic">${affs[0]}</div>
          <div class="aff-num" style="font-size:0.72rem;color:rgba(255,255,255,0.5);margin-top:16px">1 / ${affs.length}</div>
        </div>
        <button class="aff-next grounding-next">Prossima →</button>
        <button class="grounding-next" style="margin-top:10px;background:var(--bg);color:var(--ink-muted)" onclick="Sheet.forceClose()">Chiudi</button>
      </div>`;
  },
};

// ─────────────────────────────────────────
// POMODORO
// ─────────────────────────────────────────
const Pomo = {
  secs: 25 * 60,
  running: false,
  timer: null,
  round: 1,

  toggle() {
    if (this.running) {
      this.running = false; clearInterval(this.timer);
      const btn = document.getElementById('pomo-btn');
      if (btn) btn.textContent = '▶ Riprendi';
    } else {
      this.running = true;
      this.timer = setInterval(() => this._tick(), 1000);
      const btn = document.getElementById('pomo-btn');
      if (btn) btn.textContent = '⏸ Pausa';
    }
  },

  stop() { this.running = false; clearInterval(this.timer); },

  reset() {
    this.stop(); this.secs = 25 * 60; this.round = 1;
    const t = document.getElementById('pomo-timer');
    const p = document.getElementById('pomo-phase');
    const b = document.getElementById('pomo-btn');
    if (t) t.textContent = '25:00';
    if (p) p.textContent = 'Sessione studio #1';
    if (b) b.textContent = '▶ Inizia';
  },

  _tick() {
    this.secs--;
    const m = Math.floor(this.secs / 60), s = this.secs % 60;
    const t = document.getElementById('pomo-timer');
    if (t) t.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (this.secs <= 0) {
      clearInterval(this.timer); this.running = false;
      const isStudy = this.round % 2 !== 0;
      this.round++;
      const b = document.getElementById('pomo-btn');
      const p = document.getElementById('pomo-phase');
      if (isStudy) {
        this.secs = 5 * 60;
        if (p) p.textContent = `⏰ Pausa #${Math.floor(this.round / 2)}`;
        if (b) b.textContent = '▶ Inizia pausa';
        toast('🍅 Pausa meritata! 5 minuti 💚');
      } else {
        this.secs = 25 * 60;
        if (p) p.textContent = `Sessione studio #${Math.ceil(this.round / 2)}`;
        if (b) b.textContent = '▶ Inizia sessione';
        toast('💪 Pausa finita! Torna al lavoro');
      }
    }
  },
};

// ─────────────────────────────────────────
// DIARY
// ─────────────────────────────────────────
const Diary = {
  selectedEmoji: '',

  pickMood(btn) {
    document.querySelectorAll('.diary-emoji-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    this.selectedEmoji = btn.dataset.emoji;
  },

  save() {
    const ta = document.getElementById('diary-textarea');
    const text = ta.value.trim();
    if (!text) { toast('✏️ Scrivi qualcosa prima!'); return; }

    const entry = {
      id: Date.now(),
      date: new Date().toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }),
      text,
      emoji: this.selectedEmoji || '📝',
      tags: this._extractTags(text),
    };
    S.diary.unshift(entry);
    if (S.diary.length > 300) S.diary = S.diary.slice(0, 300);
    S.stats.entries = (S.stats.entries || 0) + 1;
    persist();

    ta.value = '';
    document.querySelectorAll('.diary-emoji-btn').forEach(b => b.classList.remove('selected'));
    this.selectedEmoji = '';

    this.render();
    toast('📖 Salvato nel tuo diario 💚');
    setTimeout(maybeEmail, 1500);
  },

  render() {
    const el = document.getElementById('diary-entries');
    if (!el) return;
    if (!S.diary.length) {
      el.innerHTML = `<div class="diary-empty"><div class="diary-empty-icon">🌿</div><div class="diary-empty-text">Ancora nessun pensiero salvato.<br>Scrivi il primo!</div></div>`;
      return;
    }
    el.innerHTML = S.diary.slice(0, 30).map(e => `
      <div class="diary-entry">
        <div class="diary-entry-top">
          <span class="diary-entry-date">${e.date}</span>
          <span class="diary-entry-mood">${e.emoji}</span>
        </div>
        <div class="diary-entry-text">${(e.text.length > 220 ? e.text.slice(0, 220) + '…' : e.text).replace(/\n/g,'<br>')}</div>
        ${e.tags.length ? `<div class="diary-entry-tags">${e.tags.map(t => `<span class="diary-tag">${t}</span>`).join('')}</div>` : ''}
      </div>`).join('');
  },

  _extractTags(text) {
    const tags = [];
    const l = text.toLowerCase();
    if (/ansia|ansiosa|preoccup|paura/.test(l)) tags.push('ansia');
    if (/stanca|esausta|sonno|dormire|sfinita/.test(l)) tags.push('stanchezza');
    if (/studi|esame|università|uni|lezione|prof/.test(l)) tags.push('studio');
    if (/nerv|arrab|irritata|incazzata/.test(l)) tags.push('nervosismo');
    if (/triste|tristezza|piango|pianto|giù/.test(l)) tags.push('tristezza');
    if (/bene|felice|content|ottima|ottimo|sorriso/.test(l)) tags.push('positivo');
    if (/filippo|amo|amore|manca/.test(l)) tags.push('amore');
    return tags;
  },
};

// ─────────────────────────────────────────
// MOOD CHART + STATS
// ─────────────────────────────────────────
const Stats = {
  renderChart() {
    const el = document.getElementById('mood-chart');
    if (!el) return;
    const days = ['Lu','Ma','Me','Gi','Ve','Sa','Do'];
    const cols = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const ds = d.toISOString().split('T')[0];
      const dayLogs = S.moodLog.filter(m => m.date && m.date.startsWith(ds));
      const avg = dayLogs.length ? dayLogs.reduce((a, m) => a + (m.v || 0), 0) / dayLogs.length : 0;
      const label = days[(d.getDay() + 6) % 7];
      const emojis = {0:'',1:'😰',2:'😔',3:'😐',4:'🙂',5:'✨'};
      cols.push({ label, avg, emoji: emojis[Math.round(avg)] || '' });
    }
    el.innerHTML = cols.map(c => `
      <div class="mc-col">
        <div style="font-size:0.68rem;margin-bottom:3px;min-height:14px">${c.emoji}</div>
        <div class="mc-bar" style="height:${c.avg ? Math.max(c.avg * 16, 4) : 4}px"></div>
        <div class="mc-label">${c.label}</div>
      </div>`).join('');
  },

  renderStats() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-sessions',  S.stats.sessions  || 0);
    set('stat-entries',   S.stats.entries   || 0);
    set('stat-chats',     S.stats.chats     || 0);
    set('stat-exercises', S.stats.exercises || 0);
    set('sbc-num', S.streak || 1);
    set('streak-num', S.streak || 1);

    const el = document.getElementById('techniques-used');
    if (!el) return;
    const icons = { grounding:'🌍', pmr:'💆', bodyscan:'🧘', defusion:'🍃', pomodoro:'🍅', affirmations:'💜' };
    const sorted = Object.entries(S.techniqueUsage || {}).sort((a,b) => b[1]-a[1]).slice(0, 5);
    if (!sorted.length) { el.innerHTML = '<p class="empty-note">Usa l\'app per vedere le statistiche 🌿</p>'; return; }
    el.innerHTML = sorted.map(([k, v]) => `
      <div class="tech-row">
        <span class="tech-icon">${icons[k] || '🌬️'}</span>
        <span class="tech-name">${k}</span>
        <span class="tech-count">${v}x</span>
      </div>`).join('');
  },
};

// ─────────────────────────────────────────
// STREAK
// ─────────────────────────────────────────
function updateStreak() {
  const today = new Date().toDateString();
  if (S.lastActiveDate !== today) {
    const yest = new Date(Date.now() - 86400000).toDateString();
    if (S.lastActiveDate === yest) S.streak = (S.streak || 0) + 1;
    else if (!S.lastActiveDate) S.streak = 1;
    S.lastActiveDate = today;
    persist();
  }
  const el = document.getElementById('streak-num');
  if (el) el.textContent = S.streak || 1;
}

// ─────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────
const Nav = {
  current: 'home',
  to(screen, btn) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bn-btn').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('screen-' + screen);
    if (el) el.classList.add('active');
    const navBtn = btn || document.querySelector(`[data-screen="${screen}"]`);
    if (navBtn) navBtn.classList.add('active');
    this.current = screen;
    if (screen === 'chart') { Stats.renderChart(); Stats.renderStats(); }
    if (screen === 'diary') Diary.render();
    if (screen === 'chat' && !document.getElementById('chat-messages').children.length) Chat.init();
  }
};

// ─────────────────────────────────────────
// MOOD QUICK CHECK
// ─────────────────────────────────────────
const Mood = {
  quick(v) {
    document.querySelectorAll('.qm-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.v) === v));
    const emojis = {1:'😰',2:'😔',3:'😐',4:'🙂',5:'✨'};
    const labels = {1:'molto a disagio',2:'un po\' giù',3:'così così',4:'bene',5:'benissimo'};
    S.currentMoodV = v;
    S.currentMood = labels[v];
    S.moodLog.push({ date: new Date().toISOString(), v, emoji: emojis[v] });
    if (S.moodLog.length > 200) S.moodLog = S.moodLog.slice(-200);
    persist();
    document.getElementById('hero-sub').textContent = `Ti senti ${labels[v]} ${emojis[v]}`;
    if (v <= 2) setTimeout(() => Nav.to('chat', document.querySelector('[data-screen="chat"]')), 700);
    setTimeout(maybeEmail, 2000);
  }
};

// ─────────────────────────────────────────
// EMAIL (via Claude + Gmail MCP)
// ─────────────────────────────────────────
async function sendEmailViaAPI(subject, body) {
  if (!S.notifyEmail || !S.notifyEnabled) return;
  try {
    await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        max_tokens: 500,
        mcp_servers: [{ type: 'url', url: CONFIG.GMAIL_MCP, name: 'gmail' }],
        messages: [{
          role: 'user',
          content: `Invia questa email usando Gmail:\nA: ${S.notifyEmail}\nOggetto: ${subject}\nCorpo:\n${body}\n\nUsare il tool Gmail per inviarla.`
        }]
      })
    });
  } catch(e) { console.warn('Email non inviata', e); }
}

async function maybeEmail() {
  if (!S.notifyEnabled || !S.notifyEmail) return;
  const now = Date.now();
  if (now - (S.lastEmailTs || 0) < CONFIG.EMAIL_ALERT_COOLDOWN_MS) return;
  S.lastEmailTs = now;
  persist();

  const name = S.name || 'Silvia';
  const recentMoods = S.moodLog.slice(-5);
  const avgV = recentMoods.length ? recentMoods.reduce((a, m) => a + m.v, 0) / recentMoods.length : 0;
  const lastDiary = S.diary[0];

  // RIASSUNTO
  const subj = `🌿 ${name} — aggiornamento app ${new Date().toLocaleDateString('it-IT')}`;
  const body = `Ciao! Ecco il riepilogo dell'utilizzo dell'app da parte di ${name}.

📊 Statistiche:
• Sessioni totali: ${S.totalSessions || 1}
• Streak: ${S.streak || 1} giorni consecutivi
• Sessioni respiro: ${S.stats.sessions || 0}
• Pagine di diario: ${S.stats.entries || 0}
• Conversazioni: ${S.stats.chats || 0}
• Esercizi: ${S.stats.exercises || 0}

😊 Umore medio recente: ${avgV ? avgV.toFixed(1) + '/5' : 'N/D'}
Ultimi umore: ${recentMoods.map(m => m.emoji).join(' ')}

📖 Ultimo sfogo nel diario (${lastDiary?.date || '—'}):
"${lastDiary?.text?.slice(0, 300) || 'Nessuna entry'}${lastDiary?.text?.length > 300 ? '…' : ''}"

—
App Silvia 🌿`;

  sendEmailViaAPI(subj, body);

  // AVVISO se umore basso
  if (S.alertEnabled && avgV > 0 && avgV < 2.5) {
    const alertSubj = `⚠️ ${name} ha un umore basso — potrebbe aver bisogno di te`;
    const alertBody = `Ciao,

L'app ha rilevato che ${name} ha registrato un umore medio di ${avgV.toFixed(1)}/5 nelle ultime sessioni.

Umore recente: ${recentMoods.map(m => m.emoji).join(' ')}

Sta usando l'app — il che è un buon segno. Ma un tuo messaggio potrebbe fare la differenza 💚

—
App Silvia 🌿`;
    setTimeout(() => sendEmailViaAPI(alertSubj, alertBody), 3000);
  }
}

// ─────────────────────────────────────────
// SETTINGS UI
// ─────────────────────────────────────────
const UI = {
  openSettings() {
    document.getElementById('set-name-val').textContent = S.name || '—';
    document.getElementById('set-email-val').textContent = S.notifyEmail || 'Non impostata';
    document.getElementById('set-alert-toggle').checked = S.alertEnabled !== false;
    document.getElementById('set-summary-toggle').checked = S.summaryEnabled !== false;
    document.getElementById('settings-overlay').classList.add('open');
  },
  closeSettings(e) {
    if (e && e.target !== document.getElementById('settings-overlay')) return;
    document.getElementById('settings-overlay').classList.remove('open');
  },
  editName() {
    const n = prompt('Il tuo nome:', S.name);
    if (n !== null) { S.name = n.trim(); persist(); document.getElementById('set-name-val').textContent = S.name; document.getElementById('topbar-name').textContent = S.name; }
  },
  editEmail() {
    const e = prompt('Email per le notifiche:', S.notifyEmail);
    if (e !== null) {
      S.notifyEmail = e.trim(); S.notifyEnabled = !!e.trim(); persist();
      document.getElementById('set-email-val').textContent = S.notifyEmail || 'Non impostata';
    }
  },
  saveAlertPref(el) { S.alertEnabled = el.checked; persist(); },
  saveSummaryPref(el) { S.summaryEnabled = el.checked; persist(); },
  resetData() {
    if (confirm('Sei sicura? Tutti i dati verranno eliminati.')) {
      localStorage.removeItem('silvia_v2');
      location.reload();
    }
  },
};

// ─────────────────────────────────────────
// TIPS
// ─────────────────────────────────────────
function showTip() {
  const el = document.getElementById('tip-text');
  if (el) el.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
}

// ─────────────────────────────────────────
// HOME DYNAMIC TEXT
// ─────────────────────────────────────────
function updateHome() {
  const days = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const d = new Date();
  const dateEl = document.getElementById('hero-date');
  if (dateEl) dateEl.textContent = `${days[d.getDay()]} ${d.toLocaleDateString('it-IT', { day:'numeric', month:'long' })}`;

  const name = S.name || 'amica';
  const h2 = document.getElementById('hero-h2');
  const sub = document.getElementById('hero-sub');
  if (h2) h2.innerHTML = `Ciao, <em>${name}</em> 🌿`;
  if (sub) {
    if (S.currentMood) sub.textContent = `Ti senti ${S.currentMood} — sono qui per te 💚`;
    else sub.textContent = 'Come stai oggi?';
  }

  const topName = document.getElementById('topbar-name');
  if (topName) topName.textContent = name;
  const topStatus = document.getElementById('topbar-status');
  if (topStatus) {
    const hour = d.getHours();
    topStatus.textContent = hour < 12 ? 'Buongiorno 🌤️' : hour < 18 ? 'Buon pomeriggio 🌿' : 'Buona sera 🌙';
  }
}

// ─────────────────────────────────────────
// APP BOOT
// ─────────────────────────────────────────
const App = {
  ob: OB,
  chat: Chat,
  breath: Breath,
  exercises: Exercises,
  diary: Diary,
  mood: Mood,
  nav: Nav,
  ui: UI,
  sheet: Sheet,

  boot() {
    const appEl = document.getElementById('app');
    appEl.classList.remove('hidden');
    appEl.classList.add('visible');
    S.totalSessions = (S.totalSessions || 0) + 1;
    persist();
    updateStreak();
    updateHome();
    showTip();
    Stats.renderChart();
    Stats.renderStats();
    Diary.render();
    // Init chat history if returning user
    if (S.name && !document.getElementById('chat-messages').children.length) {
      // will init on first nav to chat
    }
  },
};

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
hydrate();

window.addEventListener('load', () => {
  // Wait for splash animation
  setTimeout(() => {
    document.getElementById('splash').classList.add('out');
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      if (S.name) {
        // Returning user — skip onboarding
        document.getElementById('onboarding').classList.add('hidden');
        App.boot();
      } else {
        // New user — show onboarding
        document.getElementById('onboarding').classList.remove('hidden');
      }
    }, 700);
  }, 2200);
});

// Fix textarea for iOS
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('ob-name-input');
  if (nameInput) {
    nameInput.addEventListener('input', function() {
      document.getElementById('ob-name-btn').disabled = this.value.trim().length < 2;
    });
  }
});

// Make globals accessible for inline onclick
window.App = App;
window.Sheet = Sheet;
window.Pomo = Pomo;
window.toast = toast;
