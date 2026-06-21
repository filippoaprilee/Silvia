/* ══════════════════════════════════════════
   SILVIA APP — app.js v3
   Engine psicologico locale (CBT/ACT/MBSR)
   Zero API key, funziona ovunque
══════════════════════════════════════════ */
'use strict';

// ─────────────────────────────────────────
// TIPS scientifici
// ─────────────────────────────────────────
const TIPS = [
  'Respirare lentamente per 60 secondi attiva il nervo vago e abbassa il battito cardiaco entro 2 minuti.',
  'Il metodo Pomodoro aumenta la produttività del 25% riducendo il carico cognitivo percepito.',
  'Scrivere i propri pensieri per 15 minuti riduce l\'ansia da esame (Ramirez & Beilock, 2011).',
  'Il grounding 5-4-3-2-1 interrompe un attacco di panico in media in 3-5 minuti.',
  'Dormire 7-8 ore migliora la memorizzazione del 40% rispetto a dormire meno di 6.',
  'L\'esercizio fisico di 20 minuti ha effetti ansiolitici paragonabili a una dose bassa di farmaci.',
  'La defusione cognitiva dell\'ACT riduce l\'impatto dei pensieri negativi senza doverli eliminare.',
  'Il PMR abbassa il cortisolo del 18% in una singola sessione di 10 minuti.',
  'La scrittura espressiva per 3 giorni consecutivi migliora l\'umore per settimane (Pennebaker, 1997).',
  'Il 90% dei pensieri ansiosi non si realizza mai (studio Penn State University).',
];

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let S = {
  name: '',
  notifyEmail: '',
  notifyEnabled: false,
  alertEnabled: true,
  summaryEnabled: true,
  currentMood: '',
  currentMoodV: 0,
  chatHistory: [],
  diary: [],
  moodLog: [],
  stats: { sessions:0, entries:0, chats:0, exercises:0 },
  streak: 0,
  lastActiveDate: null,
  techniqueUsage: {},
  lastEmailTs: 0,
  totalSessions: 0,
  learnedPatterns: {},   // pattern imparati dal diario
  sessionTopics: [],     // argomenti emersi nella sessione corrente
};

function persist() { try { localStorage.setItem('silvia_v3', JSON.stringify(S)); } catch(e){} }
function hydrate() {
  try {
    const raw = localStorage.getItem('silvia_v3') || localStorage.getItem('silvia_v2');
    if (raw) S = { ...S, ...JSON.parse(raw) };
  } catch(e) {}
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
let _toastTimer = null;
function toast(msg, ms = 3200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ─────────────────────────────────────────
// SHEET
// ─────────────────────────────────────────
const Sheet = {
  open(html) {
    document.getElementById('sheet-body').innerHTML = html;
    document.getElementById('sheet-overlay').classList.add('open');
  },
  close(e) {
    if (e && e.target !== document.getElementById('sheet-overlay')) return;
    document.getElementById('sheet-overlay').classList.remove('open');
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

  next() {
    this.step++;
    document.querySelectorAll('.ob-step').forEach((el,i) => el.classList.toggle('hidden', i !== this.step));
    document.querySelectorAll('.ob-dot').forEach((el,i) => el.classList.toggle('active', i === this.step));
    const active = document.getElementById(`ob-step-${this.step}`);
    if (active) { active.style.animation='none'; requestAnimationFrame(()=>{ active.style.animation=''; }); }
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
    document.getElementById('ob-email-section').classList.toggle('hidden', !el.checked);
  },

  finish() {
    if (this.selectedMood) {
      S.currentMood = this.selectedMood.label;
      S.currentMoodV = this.selectedMood.v;
      S.moodLog.push({ date: new Date().toISOString(), v: this.selectedMood.v, emoji: this.selectedMood.emoji });
    }
    const tog = document.getElementById('ob-notify-toggle');
    S.notifyEnabled = tog ? tog.checked : false;
    const emailEl = document.getElementById('ob-email-input');
    if (emailEl) S.notifyEmail = emailEl.value.trim();
    persist();
    document.getElementById('onboarding').classList.add('hidden');
    App.boot();
  }
};

// ══════════════════════════════════════════════════════════════
//  ENGINE PSICOLOGICO LOCALE — CBT / ACT / MBSR / DBT
//  Sistema a strati: detect → diagnosi → risposta → follow-up
// ══════════════════════════════════════════════════════════════

const Engine = {

  // ── 1. DETECTOR — analizza il testo e ritorna segnali
  detect(text) {
    const t = text.toLowerCase();
    const signals = {
      // Intensità
      crisi:        /non ce la fac|non riesco più|voglio mollare|basta|non ce la faccio più|crollo|sto cedendo|esaurita|non reggo/.test(t),
      alta:         /ansia forte|attacco|panico|tremo|cuore che batte|respiro corto|soffoco|testa che gira|terrore/.test(t),
      media:        /ansiosa|nervosa|agitata|preoccupata|stressata|tesa|in ansia/.test(t),
      bassa:        /un po' giù|così così|non benissimo|stanca|non mi va|pigra|svogliata/.test(t),

      // Aree tematiche
      esame:        /esame|studiare|studio|università|uni|lezione|materia|prof|voto|bocciata|sessione|interrogazione|tesi/.test(t),
      stanchezza:   /stanca|esausta|sfinita|non dormo|sonno|dormire|non ce la faccio fisicamente|distrutta/.test(t),
      tristezza:    /triste|tristezza|piango|pianto|male|vuoto|sola|abbattuta|malinconia|depresso|depessa/.test(t),
      rabbia:       /arrabbiata|incazzata|nervosa|odio|fastidio|mi fa impazzire|non sopporto|irritata/.test(t),
      solitudine:   /sola|nessuno|non mi capisce|abbandonata|isolata|mi manca|lontana/.test(t),
      autostima:    /non valgo|sono stupida|non sono capace|fallita|sbagliata|non sono abbastanza|incapace/.test(t),
      rimpianto:    /avrei dovuto|ho sbagliato|mi pento|rimpianto|se avessi|errore mio/.test(t),
      futuro:       /futuro|non so cosa fare|paura di|cosa succederà|domani|dopo|non vedo via/.test(t),
      corpo:        /mal di testa|nausea|stomaco|tensione|spalle|collo|mal di schiena|dolore|freddo|caldo/.test(t),
      relazione:    /filippo|fidanzato|coppia|litigato|discussione|lui|amore|mi manca/.test(t),
      positivo:     /bene|felice|contenta|ho studiato|ce l'ho fatta|riuscita|migliorata|finalmente|sollievo|orgogliosa/.test(t),

      // Richieste esplicite
      vuoleConsigli:  /cosa faccio|come faccio|aiutami|dimmi|consiglio|suggerisci|cosa dovrei/.test(t),
      vuoleEsercizio: /esercizio|tecnica|respiro|calmarmi|rilassarmi|aiuto pratico|cosa posso fare/.test(t),
      vuoleSfogare:   /devo dire|ho bisogno di dire|ti racconto|ascoltami|ho da sfogarmi/.test(t),
      domanda:        /\?$|\? /.test(t),
    };

    // Score intensità numerica 1-5
    let intensity = 1;
    if (signals.crisi) intensity = 5;
    else if (signals.alta) intensity = 4;
    else if (signals.media) intensity = 3;
    else if (signals.bassa) intensity = 2;
    if (signals.positivo) intensity = Math.max(1, intensity - 1);

    return { ...signals, intensity, raw: t };
  },

  // ── 2. MEMORIA DAL DIARIO — estrae pattern ricorrenti
  getDiaryInsights() {
    if (!S.diary.length) return null;
    const all = S.diary.map(e => e.text.toLowerCase()).join(' ');
    const insights = [];
    if ((all.match(/esame|studio/g) || []).length > 3) insights.push('studio');
    if ((all.match(/ansia|ansiosa/g) || []).length > 2) insights.push('ansia');
    if ((all.match(/stanca|esausta/g) || []).length > 2) insights.push('stanchezza');
    if ((all.match(/sola|nessuno/g) || []).length > 2) insights.push('solitudine');
    // umore medio
    const recentMoods = S.moodLog.slice(-7);
    const avg = recentMoods.length ? recentMoods.reduce((a,m)=>a+m.v,0)/recentMoods.length : 0;
    return { patterns: insights, avgMood: avg, entries: S.diary.length };
  },

  // ── 3. CONTESTO SESSIONE — cosa è già emerso in questa chat
  getSessionContext() {
    const topics = S.sessionTopics || [];
    const lastAI = S.chatHistory.filter(m=>m.role==='assistant').slice(-1)[0]?.content || '';
    return { topics, lastAI, turns: S.chatHistory.length };
  },

  // ── 4. GENERATORE DI RISPOSTA — cuore del sistema
  respond(userText) {
    const sig = this.detect(userText);
    const diary = this.getDiaryInsights();
    const ctx = this.getSessionContext();
    const name = S.name || 'cara';

    // Aggiorna topics sessione
    if (sig.esame && !S.sessionTopics.includes('esame')) S.sessionTopics.push('esame');
    if (sig.ansia && !S.sessionTopics.includes('ansia')) S.sessionTopics.push('ansia');
    if (sig.tristezza && !S.sessionTopics.includes('tristezza')) S.sessionTopics.push('tristezza');

    // ── PERCORSO POSITIVO
    if (sig.positivo && !sig.crisi && !sig.alta) {
      return this._positive(sig, name, ctx);
    }

    // ── CRISI ACUTA
    if (sig.crisi) {
      return this._crisis(sig, name, diary);
    }

    // ── ANSIA ALTA + CORPO
    if (sig.alta || (sig.corpo && sig.media)) {
      return this._highAnxiety(sig, name, ctx);
    }

    // ── AUTOSTIMA / PENSIERI NEGATIVI SU SE STESSA
    if (sig.autostima) {
      return this._selfEsteem(sig, name, diary, ctx);
    }

    // ── TRISTEZZA / SOLITUDINE
    if (sig.tristezza || sig.solitudine) {
      return this._sadness(sig, name, diary, ctx);
    }

    // ── RABBIA / FRUSTRAZIONE
    if (sig.rabbia) {
      return this._anger(sig, name, ctx);
    }

    // ── STANCHEZZA / BURNOUT
    if (sig.stanchezza) {
      return this._exhaustion(sig, name, diary, ctx);
    }

    // ── ESAME / STUDIO
    if (sig.esame) {
      return this._exam(sig, name, diary, ctx);
    }

    // ── ANSIA MEDIA GENERICA
    if (sig.media) {
      return this._anxiety(sig, name, diary, ctx);
    }

    // ── VUOLE CONSIGLI / ESERCIZI
    if (sig.vuoleConsigli || sig.vuoleEsercizio) {
      return this._advice(sig, name, ctx);
    }

    // ── RELAZIONE
    if (sig.relazione) {
      return this._relationship(sig, name, ctx);
    }

    // ── BASSA INTENSITÀ / GENERICO
    return this._generic(sig, name, diary, ctx);
  },

  // ══ RISPOSTE PER CATEGORIA ══

  _positive(sig, name, ctx) {
    const rs = [
      `Che bello sentirti così! 🌿 Sai che quando noti i momenti positivi, il cervello impara a cercarli di più? È neuroplasticità in azione. Cosa ha contribuito a questo momento?`,
      `Questo mi fa davvero piacere sentirlo. E te lo meriti, ${name} — anche le piccole vittorie contano tantissimo. Goditi questo momento senza fretta di passare al prossimo.`,
      `Brava. Davvero. A volte basta fermarsi un secondo e riconoscere "sto bene" — è più potente di quanto sembri. Cosa ti ha aiutato ad arrivare qui?`,
      `Bellissimo. E sai una cosa? Questo stato che senti adesso — tienilo a mente. Quando le cose saranno più difficili, è utile ricordarsi che questo è possibile.`,
    ];
    return this._pick(rs) + (sig.esame ? '\n\nCome sta andando con lo studio?' : '');
  },

  _crisis(sig, name, diary) {
    const base = [
      `Fermati un secondo con me. Respira. Sei qui, sei al sicuro — anche se in questo momento non sembra.\n\nQuello che senti è reale e pesante, e ha perfettamente senso che tu ti senta così. Non devi fingere di stare bene.\n\nDimmi: cosa è successo? Da dove viene tutta questa pressione?`,
      `${name}, ti sento. E quello che stai vivendo è troppo da reggere da sola in questo momento — è normale voler mollare quando sei a questo punto.\n\nPrima di tutto: respira con me. Un respiro profondo, lento. Poi dimmi: c'è una cosa sola, la più grande, che ti pesa di più adesso?`,
      `Stai portando un peso enorme. Lo sento anche io attraverso le parole.\n\nQuando si è a questo punto, il cervello mente — ci dice che non c'è via d'uscita, che non ce la faremo. Ma è l'effetto del sovraccarico, non la realtà.\n\nUna cosa sola: cosa ti farebbe sentire anche solo un po' meno sola adesso?`,
    ];
    let r = this._pick(base);
    if (diary && diary.patterns.includes('ansia')) {
      r += '\n\n💡 Ho notato che l\'ansia è qualcosa che ti accompagna spesso. Non sei sola in questo.';
    }
    r += '\n\n🌬️ *Tecnica immediata: prova a fare 3 respiri profondi — inspira 4 secondi, espira 6. Poi torna da me.*';
    return r;
  },

  _highAnxiety(sig, name, ctx) {
    const rs = [
      `Quello che descrivi — ${sig.corpo ? 'le sensazioni fisiche, ' : ''}l\'agitazione — è il tuo sistema nervoso in modalità allarme. Non è pericolo reale, anche se il corpo lo vive così.\n\nLa prima cosa da fare è uscire da questa modalità prima ancora di pensare a soluzioni. Hai 2 minuti per provare la respirazione 4-7-8 nell'app? Funziona davvero, in pochi minuti.\n\nIntanto dimmi: da quanto ce l'hai questa sensazione?`,
      `L'ansia alta ha un effetto strano: ci fa credere che dovremmo *fare qualcosa subito*, ma quello che serve invece è rallentare.\n\nIl tuo corpo è in iperattivazione — cuore, respiro, muscoli tesi. Si chiama risposta di attacco-fuga ed è automatica, non è colpa tua.\n\nCosa stava succedendo prima che iniziasse?`,
      `Sento che stai facendo fatica a stare ferma in questo momento — è l'ansia che spinge. Normale.\n\nUna cosa concreta: metti i piedi sul pavimento, senti il peso del corpo sulla sedia. Guarda 3 cose attorno a te e nominale mentalmente. Ci sei?\n\nIl grounding fisico è il modo più veloce per dire al cervello "sono al sicuro". Come ti senti dopo?`,
    ];
    return this._pick(rs);
  },

  _selfEsteem(sig, name, diary, ctx) {
    const rs = [
      `Aspetta — hai appena detto una cosa su di te che mi ha colpita. "${this._extractSelfCriticism(sig.raw)}"\n\nVorrei chiederti una cosa: se una tua amica ti dicesse questo di se stessa, cosa le risponderesti? Prova a pensarci davvero.`,
      `Quella voce che ti dice che non sei abbastanza — la conosco. In psicologia la chiamiamo "critico interiore", ed è una parte di noi che ha imparato a essere dura per proteggerci. Ma spesso esagera.\n\nLa domanda chiave in CBT è: quali prove reali hai che questo sia vero? E quali prove hai del contrario?`,
      `"Non sono capace" è un pensiero, non un fatto. È una differenza enorme.\n\nIn ACT facciamo così: invece di combattere il pensiero, lo osserviamo. "Ho il pensiero che non sono capace." Già così, crei distanza. Non ci credi ciecamente.\n\nCosa ti ha fatto venire questo pensiero oggi nello specifico?`,
      `${name}, il fatto che tu sia qui, che stia cercando di capire cosa senti, che ti impegni — questo già dice molto su chi sei.\n\nMa so che a parole fa poco effetto quando sei in quel posto. Dimmi: da quando ce l'hai questa sensazione di non essere abbastanza?`,
    ];
    let r = this._pick(rs);
    if (diary && diary.entries > 3) {
      r += `\n\n💚 Nel tuo diario hai scritto tanto — questo mi dice che sei una persona che si conosce e ci lavora. Non è da poco.`;
    }
    return r;
  },

  _sadness(sig, name, diary, ctx) {
    const hasSolitudine = sig.solitudine;
    const rs = hasSolitudine ? [
      `Sentirsi soli è una delle sensazioni più difficili. Non perché siamo deboli — ma perché siamo fatti per la connessione, e quando manca fa fisicamente male.\n\nNon voglio dirti subito "parla con qualcuno" perché lo so che non è sempre facile. Ma voglio capire: questa solitudine da dove viene? È che non ci sono persone attorno, o che ci sono ma non ti capiscono?`,
      `La solitudine non è sempre assenza di persone — spesso è sentirsi non visti, anche quando si è in mezzo agli altri. È una di queste?\n\nDimmi un po' cosa sta succedendo. Non devi riassumere o essere logica — dimmi come lo vivi.`,
    ] : [
      `La tristezza non ha bisogno di una ragione grande per essere reale. A volte arriva e basta — e il corpo lo sa prima della testa.\n\nNon voglio che tu la combatta adesso. Vorrei che ci stessi un momento, insieme. Cosa senti esattamente? Dove lo senti nel corpo?`,
      `Quello che descrivi ha senso — e non devi fare niente di questo adesso tranne che sentirlo.\n\nIn psicologia sappiamo che resistere alle emozioni difficili le amplifica. Accoglierle, anche solo nominarle, le diminuisce.\n\nDa quanto sei giù? C'è qualcosa di specifico che l'ha fatto venire?`,
      `Mi fermo con te un secondo.\n\nLa tristezza che descrivi — è pesante, lo so. E hai tutto il diritto di sentirla.\n\nUna cosa che aiuta, quando sei pronta: scrivila nel diario. Non per analizzarla — solo per tirarla fuori. Spesso basta quello per spostare il peso.`,
    ];
    let r = this._pick(rs);
    if (diary && diary.avgMood && diary.avgMood < 2.5) {
      r += `\n\n💙 Ho notato che stai attraversando un periodo difficile da un po'. Sei coraggiosa a non ignorarlo.`;
    }
    return r;
  },

  _anger(sig, name, ctx) {
    const rs = [
      `La rabbia che senti ha senso — di solito sotto c'è qualcosa di importante che non è stato rispettato o capito.\n\nNon ti dico di calmarti (lo so che fa schifo sentirsi dire così). Dimmi: cosa è successo esattamente? Chi o cosa ti ha fatta incazzare?`,
      `La rabbia è una delle emozioni più utili che esistono — ci dice dove sono i nostri confini. Il problema è quando rimane intrappolata dentro.\n\nCosa ti sta succedendo? Raccontami tutto.`,
      `Incazzarsi non è sbagliato. È umano. E a volte è l'unica risposta sensata a una situazione insensata.\n\nTi ascolto. Cosa è successo?`,
    ];
    return this._pick(rs);
  },

  _exhaustion(sig, name, diary, ctx) {
    const rs = [
      `La stanchezza che descrivi non sembra solo fisica — sembra quella stanchezza profonda che viene dal dare troppo senza ricaricare mai.\n\nIn psicologia si chiama esaurimento delle risorse cognitive. Il cervello, come il telefono, ha bisogno di essere caricato.\n\nUna domanda: quando hai fatto l'ultima cosa solo per te, senza che servisse a qualcosa?`,
      `"Stanca" può significare mille cose diverse. C'è stanca-di-studiare, stanca-di-sforzarsi, stanca-di-fingere-che-vada-tutto-bene, stanca-nel-corpo.\n\nQuale di queste ti somiglia di più adesso?`,
      `Il corpo ti sta mandando un messaggio chiaro. L'esaurimento cronico non si risolve dormendo una notte — richiede di ridurre il carico e di ricaricare attivamente.\n\nSo che non è facile con gli esami. Ma dimmi: cosa potresti togliere, anche solo temporaneamente, senza che sia un disastro?`,
      `Quando siamo esauste, tutto sembra più pesante, più difficile, più senza speranza di quanto sia realmente. È un effetto biologico, non una verità.\n\nCosa hai mangiato oggi? Sei uscita un po'? (Non ti sto rimproverando — voglio capire da dove ricaricare)`,
    ];
    let r = this._pick(rs);
    if (diary && diary.patterns.includes('stanchezza')) {
      r += `\n\n⚡ La stanchezza sembra essere un tema ricorrente per te ultimamente. Potrebbe valere la pena parlarne con qualcuno di cui ti fidi nella vita reale.`;
    }
    return r;
  },

  _exam(sig, name, diary, ctx) {
    const alreadyTalked = ctx.topics.includes('esame');
    const rs = alreadyTalked ? [
      `Siamo tornate sul tema degli esami. È chiaramente una fonte grande di stress per te.\n\nVorrei capire meglio: è la materia difficile? La paura del giudizio? La sensazione di non essere pronta? O qualcosa d'altro?`,
      `Riesci a identificare la parte degli esami che ti spaventa di più? Spesso l'ansia da prestazione ha una radice specifica — e lavorarci su quella è molto più efficace che combattere l'ansia in generale.`,
    ] : [
      `Gli esami sono un trigger potente — non solo per la difficoltà reale, ma perché attivano paure di valutazione e giudizio che vanno ben oltre la materia.\n\nL'ansia da prestazione (test anxiety) ha basi neurobiologiche reali: lo stress riduce le funzioni cognitive proprio quando ne abbiamo più bisogno. Non è una scusa — è fisiologia.\n\nCos'è il prossimo esame? Quanto manca?`,
      `Lo studio sotto pressione è una delle situazioni più difficili psicologicamente. Il cervello ansia + cervello studio sono in conflitto — l'amigdala (allarme) inibisce la corteccia prefrontale (ragionamento).\n\nLa buona notizia: ci sono strategie evidence-based per questo. Ma prima dimmi — come stai vivendo lo studio in questo momento? Cosa succede quando apri il libro?`,
      `Sento che gli esami ti stanno pesando molto. Facciamo una cosa: invece di parlare dell'esame in astratto, dimmi una cosa concreta — cosa è successo oggi con lo studio?`,
    ];
    let r = this._pick(rs);
    if (sig.autostima) {
      r += `\n\n💡 Nota: il tuo valore come persona non dipende da un voto. Questo lo so che è facile da dire — ma è importante ricordarselo.`;
    }
    return r;
  },

  _anxiety(sig, name, diary, ctx) {
    const alreadyTalked = ctx.topics.includes('ansia');
    const rs = [
      `L'ansia che senti ha una logica — anche se in questo momento fa solo male.\n\nIn CBT ci chiediamo: cosa sta pensando la mente in questo momento? Spesso l'ansia cavalca un pensiero specifico, un "e se..." o un "non ce la faccio perché...". Riesci a identificarlo?`,
      `L'ansia è il sistema di allarme del corpo — utile in piccole dosi, logorante quando resta accesa troppo a lungo.\n\nUna cosa che aiuta subito è il respiro: rallentare l'espirazione (più lunga dell'inspirazione) attiva il sistema parasimpatico e abbassa l'allarme fisicamente.\n\nMa prima dimmi: da quando ce l'hai? C'è qualcosa di specifico che l'ha accesa?`,
      `"Ansiosa" può essere tante cose diverse. C'è l'ansia-pensieri-che-girano, l'ansia-in-corpo, l'ansia-che-paralizza, l'ansia-che-agita.\n\nQual è la tua? E dove la senti di più — nella testa o nel corpo?`,
    ];
    let r = this._pick(rs);
    if (alreadyTalked) {
      r = `Stiamo tornando sull'ansia — evidentemente è ancora lì.\n\nAbbiamo già parlato di alcune cose. Cosa ha aiutato, anche solo un po'? E cosa invece non si è mossa?\n\nA volte capire cosa non funziona ci dice dove lavorare davvero.`;
    }
    if (diary && diary.patterns.includes('ansia')) {
      r += `\n\n📖 Dal tuo diario vedo che l'ansia è qualcosa con cui hai a che fare spesso. Hai mai provato a tracciare quando arriva? A volte i pattern rivelano i trigger.`;
    }
    return r;
  },

  _advice(sig, name, ctx) {
    const rs = [
      `Ti do qualcosa di concreto — ma voglio prima capire bene cosa stai vivendo, così posso darti la cosa giusta per te, non quella generica.\n\nIn due parole: qual è la situazione principale adesso?`,
      `Ci sono tecniche per quasi tutto — respiro per l'ansia acuta, grounding per il panico, PMR per la tensione, Pomodoro per lo studio.\n\nPer darti quella giusta: cosa senti di più in questo momento? Tensione nel corpo, pensieri che girano, o difficoltà a concentrarti?`,
      `Bene, partiamo dalla pratica.\n\nCBT ci insegna che possiamo cambiare come ci sentiamo cambiando o come pensiamo o come agiamo. Quale dei due ti sembra più accessibile adesso?\n\nSe vuoi qualcosa di immediato: vai alla sezione "Respira" o "Tecniche" nell'app — ma dimmi prima cosa hai già provato.`,
    ];
    return this._pick(rs);
  },

  _relationship(sig, name, ctx) {
    const rs = [
      `Le relazioni — anche quelle belle — portano un peso emotivo in più, specialmente in periodi di stress.\n\nCosa sta succedendo? Ti manca, avete litigato, o è qualcosa d'altro?`,
      `Capisco. Quando sei già sotto pressione, anche la lontananza o una tensione con chi ami pesa il doppio.\n\nRaccontami — cosa è successo?`,
      `L'amore e l'ansia si mischiano spesso — si finisce per scaricare sull'altra persona, o per sentirsi in colpa per questo.\n\nCom'è la situazione?`,
    ];
    return this._pick(rs);
  },

  _generic(sig, name, diary, ctx) {
    const turns = ctx.turns;
    if (turns === 0) {
      return `Sono qui, ${name}. Questo è il tuo spazio — puoi dire quello che vuoi, come viene, senza filtri.\n\nCome stai davvero in questo momento?`;
    }
    if (turns <= 4) {
      const rs = [
        `Capisco. E come ti fa sentire questo?\n\nSpesso la prima cosa che diciamo è la punta dell'iceberg — c'è qualcosa di più sotto?`,
        `Grazie per dirmelo. Voglio capire meglio — da quanto tempo ti porti questa cosa?`,
        `Ha senso quello che dici. E in che parte della giornata lo senti di più?`,
        `Ti ascolto. C'è qualcosa che hai già provato per stare meglio?`,
      ];
      return this._pick(rs);
    }
    // Lunga conversazione — sintetizza
    const topics = S.sessionTopics;
    if (topics.length) {
      return `Abbiamo parlato di ${topics.join(', ')} — c'è una cosa in particolare su cui vuoi andare più in profondità?\n\nO c'è qualcos'altro che non abbiamo ancora toccato?`;
    }
    return `Sono ancora qui con te. Come ti senti rispetto all'inizio della nostra conversazione?`;
  },

  // ── UTILS
  _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  _extractSelfCriticism(text) {
    const matches = text.match(/(?:sono |mi sento |sono una )[a-zA-Zà-ù\s]{3,30}/i);
    return matches ? matches[0].trim() : 'quello che hai detto';
  },

  // ── FOLLOW-UP INTELLIGENTE (dopo la risposta AI)
  suggestFollowUp(sig) {
    const suggestions = [];
    if (sig.alta || sig.crisi) suggestions.push('🌬️ Portami agli esercizi di respiro');
    if (sig.autostima) suggestions.push('🍃 Come funziona la defusione cognitiva?');
    if (sig.esame) suggestions.push('🍅 Usa il timer Pomodoro con me');
    if (sig.stanchezza) suggestions.push('🧘 Fai un body scan con me');
    if (sig.tristezza) suggestions.push('📖 Vai al diario a scrivere');
    if (sig.vuoleEsercizio) suggestions.push('🌍 Prova il grounding 5-4-3-2-1');
    return suggestions.slice(0, 3);
  },
};

// ─────────────────────────────────────────
// CHAT UI
// ─────────────────────────────────────────
const Chat = {
  isLoading: false,

  init() {
    S.stats.chats = (S.stats.chats || 0) + 1;
    S.sessionTopics = [];
    persist();
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
    const name = S.name || 'cara';
    let opener;
    if (S.currentMood && S.currentMoodV <= 2) {
      opener = `${greet} ${name} 💚 Mi hai detto che ti senti ${S.currentMood}... sono qui. Cosa sta succedendo?`;
    } else if (S.currentMood && S.currentMoodV >= 4) {
      opener = `${greet} ${name}! Che bello sentirti bene 🌿 Di cosa hai voglia di parlare oggi?`;
    } else {
      opener = `${greet} ${name} 💚 Sono qui, questo è il tuo spazio. Come stai davvero in questo momento?`;
    }
    this._appendMsg('ai', opener);
    this._showSuggestions([
      'Sono ansiosa 😰', 'Non riesco a studiare', 'Mi sento sopraffatta',
      'Sono stanca 😮‍💨', 'Ho un esame presto', 'Voglio sfogarmi'
    ]);
  },

  clear() {
    S.chatHistory = [];
    S.sessionTopics = [];
    persist();
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-suggestions-wrap').style.display = '';
    document.getElementById('chat-suggestions').innerHTML = '';
    this.init();
    toast('💬 Nuova conversazione');
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

    // Aggiungi alla history
    S.chatHistory.push({ role: 'user', content: text });
    if (S.chatHistory.length > 40) S.chatHistory = S.chatHistory.slice(-40);

    this.isLoading = true;
    document.getElementById('chat-send-btn').style.opacity = '0.5';
    this._showTyping();

    // Piccolo delay realistico
    const thinkTime = 800 + Math.random() * 1200;
    await new Promise(r => setTimeout(r, thinkTime));

    const sig = Engine.detect(text);
    const reply = Engine.respond(text);

    this._hideTyping();
    this._appendMsg('ai', reply);

    S.chatHistory.push({ role: 'assistant', content: reply });
    persist();

    // Suggerimenti follow-up contestuali
    const followUps = Engine.suggestFollowUp(sig);
    if (followUps.length) {
      setTimeout(() => this._showSuggestions(followUps), 400);
    }

    this.isLoading = false;
    document.getElementById('chat-send-btn').style.opacity = '1';

    maybeEmail();
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
    // Gestisci *corsivo* e **grassetto** e newline
    const formatted = text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.*?)\*/g,'<em>$1</em>')
      .replace(/\n/g,'<br>');
    if (role === 'ai') {
      div.innerHTML = `<div class="msg-avatar">🌿</div><div class="msg-wrap"><div class="msg-bubble">${formatted}</div><div class="msg-time">${time}</div></div>`;
    } else {
      div.innerHTML = `<div class="msg-wrap"><div class="msg-bubble">${formatted}</div><div class="msg-time">${time}</div></div>`;
    }
    msgs.appendChild(div);
    requestAnimationFrame(() => msgs.scrollTop = msgs.scrollHeight);
  },

  _showTyping() {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg ai'; div.id = 'typing-msg';
    div.innerHTML = `<div class="msg-avatar">🌿</div><div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  _hideTyping() { document.getElementById('typing-msg')?.remove(); },

  _showSuggestions(chips) {
    const wrap = document.getElementById('chat-suggestions-wrap');
    const cont = document.getElementById('chat-suggestions');
    cont.innerHTML = chips.map(c =>
      `<button class="chip" onclick="App.chat.suggest(this)">${c}</button>`
    ).join('');
    wrap.style.display = '';
  },
};

// ─────────────────────────────────────────
// BREATHING
// ─────────────────────────────────────────
const BREATH_TYPES = {
  '478': {
    label:'4-7-8', desc:'Inspira 4s · Trattieni 7s · Espira 8s — abbassa l\'ansia acuta rapidamente.',
    phases:[{label:'Inspira',s:4,scale:1.3},{label:'Trattieni',s:7,scale:1.15},{label:'Espira',s:8,scale:0.85}], cycles:4,
  },
  box: {
    label:'Box', desc:'Inspira 4s · Trattieni 4s · Espira 4s · Pausa 4s — calma il sistema nervoso.',
    phases:[{label:'Inspira',s:4,scale:1.3},{label:'Trattieni',s:4,scale:1.15},{label:'Espira',s:4,scale:0.85},{label:'Pausa',s:4,scale:0.9}], cycles:4,
  },
  calm: {
    label:'Calma', desc:'Inspira 4s · Espira 6s — attiva la risposta di rilassamento del nervo vago.',
    phases:[{label:'Inspira',s:4,scale:1.25},{label:'Espira',s:6,scale:0.85}], cycles:6,
  },
};

const Breath = {
  type:'478', running:false, timer:null, cycles:0, phaseIdx:0,

  setType(type, btn) {
    if (this.running) this.stop();
    this.type = type;
    document.querySelectorAll('.breath-tab').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const cfg = BREATH_TYPES[type];
    document.getElementById('breath-desc').textContent = cfg.desc;
    document.getElementById('breath-num').textContent = cfg.phases[0].s;
    document.getElementById('breath-phase').textContent = 'Premi Inizia';
    document.getElementById('breath-instr').textContent = cfg.desc;
    document.getElementById('breath-bar').style.width = '0%';
    document.getElementById('breath-meta').textContent = `Cicli: 0 / ${cfg.cycles}`;
    document.getElementById('breath-cta').textContent = 'Inizia 🌬️';
    document.getElementById('breath-orb').style.transform = 'scale(1)';
  },

  toggle() { if (this.running) this.stop(); else this.start(); },

  start() {
    this.running=true; this.cycles=0; this.phaseIdx=0;
    document.getElementById('breath-cta').textContent = 'Stop ✕';
    this._runPhase();
  },

  stop() {
    this.running=false; clearInterval(this.timer);
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
      document.getElementById('breath-num').textContent = Math.max(0,s);
      const totalSecs = cfg.phases.reduce((a,p)=>a+p.s,0);
      const prevSecs = cfg.phases.slice(0,this.phaseIdx).reduce((a,p)=>a+p.s,0);
      const elapsed = prevSecs+(phase.s-s);
      const pct = ((this.cycles/cfg.cycles)+(elapsed/totalSecs/cfg.cycles))*100;
      document.getElementById('breath-bar').style.width = Math.min(pct,100)+'%';
      document.getElementById('breath-meta').textContent = `Cicli: ${this.cycles} / ${cfg.cycles}`;
      if (s<=0) {
        clearInterval(this.timer);
        this.phaseIdx++;
        if (this.phaseIdx >= cfg.phases.length) {
          this.phaseIdx=0; this.cycles++;
          if (this.cycles >= cfg.cycles) { this._finish(); return; }
        }
        setTimeout(()=>this._runPhase(), 350);
      }
    }, 1000);
  },

  _finish() {
    this.running=false;
    document.getElementById('breath-instr').textContent = '✨ Ottima sessione!';
    document.getElementById('breath-cta').textContent = 'Di nuovo 🌬️';
    document.getElementById('breath-bar').style.width = '100%';
    document.getElementById('breath-orb').style.transform = 'scale(1)';
    S.stats.sessions=(S.stats.sessions||0)+1;
    const key='Respiro '+BREATH_TYPES[this.type].label;
    S.techniqueUsage[key]=(S.techniqueUsage[key]||0)+1;
    persist();
    toast('💪 Sessione completata! Brava.');
    setTimeout(maybeEmail,1500);
  },
};

// ─────────────────────────────────────────
// EXERCISES
// ─────────────────────────────────────────
const Exercises = {
  open(type) {
    S.stats.exercises=(S.stats.exercises||0)+1;
    S.techniqueUsage[type]=(S.techniqueUsage[type]||0)+1;
    persist();
    Sheet.open(this._html(type));
    if (type==='pomodoro') Pomo.reset();
  },

  _html(type) {
    switch(type) {
      case 'grounding':    return this._groundingHtml();
      case 'pmr':          return this._pmrHtml();
      case 'bodyscan':     return this._bodyscanHtml();
      case 'defusion':     return this._defusionHtml();
      case 'pomodoro':     return this._pomodoroHtml();
      case 'affirmations': return this._affirmHtml();
      default: return '<p>Esercizio non trovato.</p>';
    }
  },

  _groundingHtml() {
    const steps = [
      {n:'5',sense:'Cose che VEDI',inst:'Guarda intorno. Nomina 5 cose che riesci a vedere chiaramente adesso.',ph:'La lampada, il muro, le mie mani…'},
      {n:'4',sense:'Cose che TOCCHI',inst:'Senti fisicamente 4 superfici. Il tessuto, la sedia, il pavimento.',ph:'La coperta, il tavolo, il divano…'},
      {n:'3',sense:'Cose che SENTI',inst:'Ascolta in silenzio. Quali 3 suoni percepisci in questo momento?',ph:'Il vento, la mia voce, il silenzio…'},
      {n:'2',sense:'Cose che ANNUSI',inst:'Fai un respiro profondo. Quali 2 odori percepisci?',ph:"L'aria, il caffè di prima…"},
      {n:'1',sense:'Cosa ASSAGGI',inst:"Cosa c'è in bocca? Anche niente conta.",ph:'Niente, l\'acqua, il caffè…'},
    ];
    const stepsHtml = steps.map((s,i)=>`
      <div class="grounding-step ${i===0?'active':''}" id="gs-${i}">
        <div class="grounding-big-num">${s.n}</div>
        <div class="grounding-sense">${s.sense}</div>
        <div class="grounding-inst">${s.inst}</div>
        <input class="grounding-field" placeholder="${s.ph}" />
        <button class="grounding-next" onclick="App.exercises.groundingNext(${i+1})">${i<steps.length-1?'Avanti →':'Completa ✓'}</button>
      </div>`).join('');
    return `<div style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🌍 Grounding 5-4-3-2-1</div>
      <div style="font-size:0.8rem;color:var(--ink-muted);margin-bottom:20px">Torna al presente attraverso i sensi • CBT</div>
      ${stepsHtml}
      <div class="grounding-step" id="gs-5" style="text-align:center;padding:24px 0">
        <div style="font-size:3.5rem;margin-bottom:16px">🌿</div>
        <div style="font-family:'DM Serif Display',serif;font-size:1.6rem;color:var(--ink);margin-bottom:10px">Sei qui, adesso</div>
        <div style="font-size:0.88rem;color:var(--ink-muted);line-height:1.65">L'ansia si nutre del futuro.<br>Tu sei presente, al sicuro, intera.</div>
        <button class="grounding-next" style="margin-top:24px" onclick="Sheet.forceClose()">Chiudi ✓</button>
      </div>
    </div>`;
  },

  groundingNext(n) {
    document.querySelectorAll('[id^="gs-"]').forEach(el=>el.classList.remove('active'));
    const next=document.getElementById(`gs-${n}`);
    if (next) { next.classList.add('active'); next.style.animation='none'; requestAnimationFrame(()=>next.style.animation='slideUp 0.4s var(--ease)'); }
    if (n>=5) toast('🌿 Grounding completato!');
  },

  _pmrHtml() {
    const zones=[
      {icon:'🤜',name:'Mani',act:'Stringi i pugni al massimo. Tieni 7 secondi... poi lascia andare tutto in una volta. Senti il calore.'},
      {icon:'💪',name:'Braccia',act:'Piega il braccio e contrai il bicipite. 7 secondi. Poi rilascia completamente.'},
      {icon:'😬',name:'Viso',act:'Strizza gli occhi e serra i denti. 7 secondi. Poi molla tutto — senti la differenza.'},
      {icon:'🦴',name:'Collo e spalle',act:'Alza le spalle verso le orecchie il più possibile. 7 secondi. Poi lascia scendere.'},
      {icon:'🫁',name:'Petto',act:'Respira fondo e tieni. Contrai la pancia. 7 secondi. Poi espira tutto.'},
      {icon:'🦵',name:'Cosce',act:'Stringi le cosce insieme. 7 secondi. Poi rilassa completamente.'},
      {icon:'🦶',name:'Piedi',act:'Punta i piedi verso il basso. Contrai i polpacci. 7 secondi. Poi rilascia.'},
    ];
    const stepsHtml=zones.map((z,i)=>`
      <div class="grounding-step ${i===0?'active':''}" id="pmr-${i}">
        <div style="font-size:2.5rem;text-align:center;margin-bottom:8px">${z.icon}</div>
        <div class="grounding-sense">${z.name}</div>
        <div class="grounding-inst">${z.act}</div>
        <button class="grounding-next" onclick="App.exercises.pmrNext(${i+1})">${i<zones.length-1?'Avanti →':'Completa ✓'}</button>
      </div>`).join('');
    return `<div style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">💆 Rilassamento Muscolare Progressivo</div>
      <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">📚 Tecnica di Jacobson — riduce cortisolo del 18% in una sessione</div>
      ${stepsHtml}
      <div class="grounding-step" id="pmr-${zones.length}" style="text-align:center;padding:24px 0">
        <div style="font-size:3.5rem;margin-bottom:16px">💆</div>
        <div style="font-family:'DM Serif Display',serif;font-size:1.6rem;color:var(--ink);margin-bottom:10px">Senti la differenza?</div>
        <div style="font-size:0.88rem;color:var(--ink-muted);line-height:1.65">Il corpo porta il peso dello stress.<br>Ora è un po' più leggero.</div>
        <button class="grounding-next" style="margin-top:24px" onclick="Sheet.forceClose()">Chiudi ✓</button>
      </div>
    </div>`;
  },

  pmrNext(n) {
    document.querySelectorAll('[id^="pmr-"]').forEach(el=>el.classList.remove('active'));
    const next=document.getElementById(`pmr-${n}`);
    if (next) next.classList.add('active');
    if (n>=7) toast('💆 PMR completato!');
  },

  _bodyscanHtml() {
    const steps=[
      {t:'Posizionati',c:"Siediti o sdraiati. Chiudi gli occhi. Fai 3 respiri lenti prima di iniziare. Non c'è fretta."},
      {t:'Testa',c:"Porta l'attenzione alla sommità del capo. Senti il peso. C'è tensione? Non combatterla — osservala."},
      {t:'Viso e collo',c:'Mascella, guance, collo. Spesso tensioni inconsapevoli. Lascia che il viso si ammorbidisca con ogni espirazione.'},
      {t:'Spalle',c:'Le spalle portano il peso di tutto. Con ogni espirazione, lasciale scendere di un centimetro.'},
      {t:'Petto e braccia',c:'Senti il petto che si alza e scende. Peso delle braccia. Fino alle dita — calore? Formicolio?'},
      {t:'Addome',c:'La pancia si muove con il respiro. Non controllare — osserva, come se fossi un testimone.'},
      {t:'Gambe e piedi',c:'Scendi lungo le gambe fino alle dita dei piedi. Senti il contatto con la superficie sotto di te.'},
      {t:'Il tutto',c:'Espandi la consapevolezza a tutto il corpo. Sei qui. Sei presente. Sei intera.'},
    ];
    return `<div style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🧘 Body Scan</div>
      <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">📚 Protocollo MBSR (Kabat-Zinn) — riduce cortisolo del 23% con uso regolare</div>
      ${steps.map(s=>`
        <div style="background:var(--bg);border-radius:12px;padding:16px;margin-bottom:10px;border-left:3px solid var(--sage)">
          <div style="font-weight:600;color:var(--sage-deep);font-size:0.88rem;margin-bottom:5px">${s.t}</div>
          <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">${s.c}</div>
        </div>`).join('')}
      <button class="grounding-next" style="margin-top:12px" onclick="Sheet.forceClose();toast('🧘 Body scan completato!')">Completato ✓</button>
    </div>`;
  },

  _defusionHtml() {
    return `<div style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🍃 Defusione Cognitiva</div>
      <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">📚 ACT — Hayes. I pensieri non sono fatti, sono eventi mentali.</div>
      <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:12px">
        <div style="font-weight:600;color:var(--ink);margin-bottom:8px">Il principio</div>
        <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">Non siamo i nostri pensieri. Sono nuvole che passano nel cielo — non il cielo stesso. Non devi combatterli né credere a ogni cosa che pensi.</div>
      </div>
      <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:12px;border-left:3px solid var(--sage)">
        <div style="font-weight:600;color:var(--ink);margin-bottom:8px">Esercizio 1: "Ho il pensiero che…"</div>
        <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">
          Invece di: <em>"Non ce la faccio"</em><br><br>
          Di': <strong style="color:var(--sage-deep)">"Ho il pensiero che non ce la farò"</strong><br><br>
          Crei distanza. Il pensiero esiste, ma non sei tu.
        </div>
      </div>
      <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:20px;border-left:3px solid var(--sage)">
        <div style="font-weight:600;color:var(--ink);margin-bottom:8px">Esercizio 2: Dai un nome</div>
        <div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">Chiama il pensiero critico per nome:<br><em>"Ah, è tornata Radio Catastrofe…"</em><br><em>"Sta parlando il mio Critico interiore…"</em><br><br>L'umorismo crea distanza automaticamente.</div>
      </div>
      <button class="grounding-next" onclick="Sheet.forceClose();toast('🍃 Defusione completata!')">Ho capito ✓</button>
    </div>`;
  },

  _pomodoroHtml() {
    return `<div style="padding:0 4px;text-align:center">
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
        <div style="font-size:0.82rem;color:var(--ink-soft);line-height:1.8">✓ Telefono capovolto<br>✓ Una sola cosa da fare<br>✓ Pensiero che arriva → scrivilo e torna<br>✓ Zero multitasking</div>
      </div>
    </div>`;
  },

  _affirmHtml() {
    const affs=[
      'Sono capace di affrontare le sfide, una alla volta.',
      'Non devo essere perfetta per meritare rispetto e amore.',
      'Ogni momento difficile che supero mi rende più forte.',
      'Ho il diritto di sentirmi sopraffatta e di chiedere aiuto.',
      'Il mio valore non dipende dai miei voti o dalla mia produttività.',
      'Sono abbastanza. Così come sono, adesso.',
      'Posso fare una cosa alla volta. Questo è sufficiente.',
      'I miei sforzi contano, anche quando non si vedono i risultati.',
    ];
    let idx=0;
    const uid='aff-'+Date.now();
    setTimeout(()=>{
      const el=document.getElementById(uid);
      if (!el) return;
      el.querySelector('.aff-next').onclick=()=>{
        idx=(idx+1)%affs.length;
        el.querySelector('.aff-text').textContent=affs[idx];
        el.querySelector('.aff-num').textContent=`${idx+1} / ${affs.length}`;
      };
    },50);
    return `<div id="${uid}" style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:20px">💜 Affermazioni positive</div>
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
  secs:25*60, running:false, timer:null, round:1,
  toggle() {
    if (this.running) {
      this.running=false; clearInterval(this.timer);
      const b=document.getElementById('pomo-btn'); if(b) b.textContent='▶ Riprendi';
    } else {
      this.running=true;
      this.timer=setInterval(()=>this._tick(),1000);
      const b=document.getElementById('pomo-btn'); if(b) b.textContent='⏸ Pausa';
    }
  },
  stop() { this.running=false; clearInterval(this.timer); },
  reset() {
    this.stop(); this.secs=25*60; this.round=1;
    const t=document.getElementById('pomo-timer'); if(t) t.textContent='25:00';
    const p=document.getElementById('pomo-phase'); if(p) p.textContent='Sessione studio #1';
    const b=document.getElementById('pomo-btn'); if(b) b.textContent='▶ Inizia';
  },
  _tick() {
    this.secs--;
    const m=Math.floor(this.secs/60), s=this.secs%60;
    const t=document.getElementById('pomo-timer');
    if(t) t.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (this.secs<=0) {
      clearInterval(this.timer); this.running=false;
      const isStudy=this.round%2!==0; this.round++;
      const b=document.getElementById('pomo-btn');
      const p=document.getElementById('pomo-phase');
      if (isStudy) {
        this.secs=5*60;
        if(p) p.textContent=`⏰ Pausa #${Math.floor(this.round/2)}`;
        if(b) b.textContent='▶ Inizia pausa';
        toast('🍅 Pausa meritata! 5 minuti 💚');
      } else {
        this.secs=25*60;
        if(p) p.textContent=`Sessione studio #${Math.ceil(this.round/2)}`;
        if(b) b.textContent='▶ Inizia sessione';
        toast('💪 Pausa finita! Dai!');
      }
    }
  },
};

// ─────────────────────────────────────────
// DIARY
// ─────────────────────────────────────────
const Diary = {
  selectedEmoji:'',

  pickMood(btn) {
    document.querySelectorAll('.diary-emoji-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    this.selectedEmoji=btn.dataset.emoji;
  },

  save() {
    const ta=document.getElementById('diary-textarea');
    const text=ta.value.trim();
    if (!text) { toast('✏️ Scrivi qualcosa prima!'); return; }
    const entry={
      id:Date.now(),
      date:new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      text, emoji:this.selectedEmoji||'📝', tags:this._extractTags(text),
    };
    S.diary.unshift(entry);
    if (S.diary.length>300) S.diary=S.diary.slice(0,300);
    S.stats.entries=(S.stats.entries||0)+1;
    // Aggiorna pattern appresi
    this._learnFromEntry(text);
    persist();
    ta.value='';
    document.querySelectorAll('.diary-emoji-btn').forEach(b=>b.classList.remove('selected'));
    this.selectedEmoji='';
    this.render();
    toast('📖 Salvato nel tuo diario 💚');
    setTimeout(maybeEmail,1500);
  },

  _learnFromEntry(text) {
    const tags=this._extractTags(text);
    tags.forEach(t=>{ S.learnedPatterns[t]=(S.learnedPatterns[t]||0)+1; });
  },

  render() {
    const el=document.getElementById('diary-entries');
    if (!el) return;
    if (!S.diary.length) {
      el.innerHTML=`<div class="diary-empty"><div class="diary-empty-icon">🌿</div><div class="diary-empty-text">Ancora nessun pensiero salvato.<br>Scrivi il primo!</div></div>`;
      return;
    }
    el.innerHTML=S.diary.slice(0,30).map(e=>`
      <div class="diary-entry">
        <div class="diary-entry-top">
          <span class="diary-entry-date">${e.date}</span>
          <span class="diary-entry-mood">${e.emoji}</span>
        </div>
        <div class="diary-entry-text">${(e.text.length>220?e.text.slice(0,220)+'…':e.text).replace(/\n/g,'<br>')}</div>
        ${e.tags.length?`<div class="diary-entry-tags">${e.tags.map(t=>`<span class="diary-tag">${t}</span>`).join('')}</div>`:''}
      </div>`).join('');
  },

  _extractTags(text) {
    const tags=[]; const l=text.toLowerCase();
    if (/ansia|ansiosa|preoccup|paura/.test(l)) tags.push('ansia');
    if (/stanca|esausta|sonno|dormire/.test(l)) tags.push('stanchezza');
    if (/studi|esame|università|uni/.test(l)) tags.push('studio');
    if (/nerv|arrab|irritata/.test(l)) tags.push('nervosismo');
    if (/triste|piango|giù/.test(l)) tags.push('tristezza');
    if (/bene|felice|content/.test(l)) tags.push('positivo');
    if (/filippo|amore|manca/.test(l)) tags.push('amore');
    return tags;
  },
};

// ─────────────────────────────────────────
// STATS
// ─────────────────────────────────────────
const Stats = {
  renderChart() {
    const el=document.getElementById('mood-chart'); if(!el) return;
    const days=['Lu','Ma','Me','Gi','Ve','Sa','Do'];
    const cols=[];
    for (let i=6;i>=0;i--) {
      const d=new Date(Date.now()-i*86400000);
      const ds=d.toISOString().split('T')[0];
      const dayLogs=S.moodLog.filter(m=>m.date&&m.date.startsWith(ds));
      const avg=dayLogs.length?dayLogs.reduce((a,m)=>a+(m.v||0),0)/dayLogs.length:0;
      const emojis={0:'',1:'😰',2:'😔',3:'😐',4:'🙂',5:'✨'};
      cols.push({label:days[(d.getDay()+6)%7],avg,emoji:emojis[Math.round(avg)]||''});
    }
    el.innerHTML=cols.map(c=>`
      <div class="mc-col">
        <div style="font-size:0.68rem;margin-bottom:3px;min-height:14px">${c.emoji}</div>
        <div class="mc-bar" style="height:${c.avg?Math.max(c.avg*16,4):4}px"></div>
        <div class="mc-label">${c.label}</div>
      </div>`).join('');
  },

  renderStats() {
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    set('stat-sessions',S.stats.sessions||0);
    set('stat-entries',S.stats.entries||0);
    set('stat-chats',S.stats.chats||0);
    set('stat-exercises',S.stats.exercises||0);
    set('sbc-num',S.streak||1);
    set('streak-num',S.streak||1);
    const el=document.getElementById('techniques-used'); if(!el) return;
    const icons={grounding:'🌍',pmr:'💆',bodyscan:'🧘',defusion:'🍃',pomodoro:'🍅',affirmations:'💜'};
    const sorted=Object.entries(S.techniqueUsage||{}).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!sorted.length) { el.innerHTML='<p class="empty-note">Usa l\'app per vedere le statistiche 🌿</p>'; return; }
    el.innerHTML=sorted.map(([k,v])=>`
      <div class="tech-row">
        <span class="tech-icon">${icons[k]||'🌬️'}</span>
        <span class="tech-name">${k}</span>
        <span class="tech-count">${v}x</span>
      </div>`).join('');
  },
};

// ─────────────────────────────────────────
// STREAK + HOME
// ─────────────────────────────────────────
function updateStreak() {
  const today=new Date().toDateString();
  if (S.lastActiveDate!==today) {
    const yest=new Date(Date.now()-86400000).toDateString();
    if (S.lastActiveDate===yest) S.streak=(S.streak||0)+1;
    else if (!S.lastActiveDate) S.streak=1;
    S.lastActiveDate=today; persist();
  }
  const el=document.getElementById('streak-num'); if(el) el.textContent=S.streak||1;
}

function updateHome() {
  const days=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const d=new Date();
  const dateEl=document.getElementById('hero-date');
  if(dateEl) dateEl.textContent=`${days[d.getDay()]} ${d.toLocaleDateString('it-IT',{day:'numeric',month:'long'})}`;
  const name=S.name||'amica';
  const h2=document.getElementById('hero-h2'); if(h2) h2.innerHTML=`Ciao, <em>${name}</em> 🌿`;
  const sub=document.getElementById('hero-sub');
  if(sub) sub.textContent=S.currentMood?`Ti senti ${S.currentMood} — sono qui per te 💚`:'Come stai oggi?';
  const topName=document.getElementById('topbar-name'); if(topName) topName.textContent=name;
  const topStatus=document.getElementById('topbar-status');
  if(topStatus) { const h=d.getHours(); topStatus.textContent=h<12?'Buongiorno 🌤️':h<18?'Buon pomeriggio 🌿':'Buona sera 🌙'; }
}

function showTip() {
  const el=document.getElementById('tip-text');
  if(el) el.textContent=TIPS[Math.floor(Math.random()*TIPS.length)];
}

// ─────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────
const Nav = {
  current:'home',
  to(screen, btn) {
    document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('.bn-btn').forEach(el=>el.classList.remove('active'));
    const el=document.getElementById('screen-'+screen);
    if(el) el.classList.add('active');
    const navBtn=btn||document.querySelector(`[data-screen="${screen}"]`);
    if(navBtn) navBtn.classList.add('active');
    this.current=screen;
    if(screen==='chart') { Stats.renderChart(); Stats.renderStats(); }
    if(screen==='diary') Diary.render();
    if(screen==='chat'&&!document.getElementById('chat-messages').children.length) Chat.init();
  }
};

// ─────────────────────────────────────────
// MOOD QUICK
// ─────────────────────────────────────────
const Mood = {
  quick(v) {
    document.querySelectorAll('.qm-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.v)===v));
    const emojis={1:'😰',2:'😔',3:'😐',4:'🙂',5:'✨'};
    const labels={1:'molto a disagio',2:"un po' giù",3:'così così',4:'bene',5:'benissimo'};
    S.currentMoodV=v; S.currentMood=labels[v];
    S.moodLog.push({date:new Date().toISOString(),v,emoji:emojis[v]});
    if(S.moodLog.length>200) S.moodLog=S.moodLog.slice(-200);
    persist();
    const sub=document.getElementById('hero-sub');
    if(sub) sub.textContent=`Ti senti ${labels[v]} ${emojis[v]}`;
    if(v<=2) setTimeout(()=>Nav.to('chat',document.querySelector('[data-screen="chat"]')),700);
    setTimeout(maybeEmail,2000);
  }
};

// ─────────────────────────────────────────
// EMAIL
// ─────────────────────────────────────────
async function maybeEmail() {
  if (!S.notifyEnabled||!S.notifyEmail) return;
  const now=Date.now();
  if (now-(S.lastEmailTs||0)<4*60*60*1000) return;
  S.lastEmailTs=now; persist();
  // L'email viene inviata tramite mailto (funziona senza backend)
  const name=S.name||'Silvia';
  const recentMoods=S.moodLog.slice(-5);
  const avgV=recentMoods.length?recentMoods.reduce((a,m)=>a+m.v,0)/recentMoods.length:0;
  const subj=encodeURIComponent(`🌿 ${name} — aggiornamento app`);
  const body=encodeURIComponent(`Ciao!\n\nEcco il riepilogo:\n• Streak: ${S.streak||1} giorni\n• Sessioni respiro: ${S.stats.sessions||0}\n• Diario: ${S.stats.entries||0} entry\n• Umore medio: ${avgV?avgV.toFixed(1)+'/5':'N/D'}\n\n—\nApp Silvia 🌿`);
  if (avgV>0&&avgV<2.5&&S.alertEnabled) {
    window.open(`mailto:${S.notifyEmail}?subject=${subj}&body=${body}`, '_blank');
  }
}

// ─────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────
const UI = {
  openSettings() {
    document.getElementById('set-name-val').textContent=S.name||'—';
    document.getElementById('set-email-val').textContent=S.notifyEmail||'Non impostata';
    document.getElementById('set-alert-toggle').checked=S.alertEnabled!==false;
    document.getElementById('set-summary-toggle').checked=S.summaryEnabled!==false;
    document.getElementById('settings-overlay').classList.add('open');
  },
  closeSettings(e) {
    if(e&&e.target!==document.getElementById('settings-overlay')) return;
    document.getElementById('settings-overlay').classList.remove('open');
  },
  editName() {
    const n=prompt('Il tuo nome:',S.name);
    if(n!==null){S.name=n.trim();persist();document.getElementById('set-name-val').textContent=S.name;document.getElementById('topbar-name').textContent=S.name;}
  },
  editEmail() {
    const e=prompt('Email per le notifiche:',S.notifyEmail);
    if(e!==null){S.notifyEmail=e.trim();S.notifyEnabled=!!e.trim();persist();document.getElementById('set-email-val').textContent=S.notifyEmail||'Non impostata';}
  },
  saveAlertPref(el){S.alertEnabled=el.checked;persist();},
  saveSummaryPref(el){S.summaryEnabled=el.checked;persist();},
  resetData() {
    if(confirm('Sei sicura? Tutti i dati verranno eliminati.')) { localStorage.clear(); location.reload(); }
  },
};

// ─────────────────────────────────────────
// APP BOOT
// ─────────────────────────────────────────
const App = {
  ob:OB, chat:Chat, breath:Breath, exercises:Exercises,
  diary:Diary, mood:Mood, nav:Nav, ui:UI, sheet:Sheet,

  boot() {
    const appEl=document.getElementById('app');
    appEl.classList.remove('hidden');
    appEl.classList.add('visible');
    S.totalSessions=(S.totalSessions||0)+1;
    persist();
    updateStreak();
    updateHome();
    showTip();
    Stats.renderChart();
    Stats.renderStats();
    Diary.render();
  },
};

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
hydrate();

window.addEventListener('load', ()=>{
  setTimeout(()=>{
    document.getElementById('splash').classList.add('out');
    setTimeout(()=>{
      document.getElementById('splash').style.display='none';
      if (S.name) {
        document.getElementById('onboarding').classList.add('hidden');
        App.boot();
      } else {
        document.getElementById('onboarding').classList.remove('hidden');
      }
    }, 700);
  }, 2200);
});

document.addEventListener('DOMContentLoaded', ()=>{
  const ni=document.getElementById('ob-name-input');
  if(ni) ni.addEventListener('input',function(){ document.getElementById('ob-name-btn').disabled=this.value.trim().length<2; });
});

window.App=App; window.Sheet=Sheet; window.Pomo=Pomo; window.toast=toast;
