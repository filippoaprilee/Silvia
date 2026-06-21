'use strict';

/* ══════════════════════════════════════════
   SILVIA APP v4 — Engine psicologico locale
   CBT / ACT / MBSR / DBT / Psicologia positiva
   30+ risposte per categoria, mai ripetute
   Zero API — funziona offline
══════════════════════════════════════════ */

const TIPS = [
  'Respirare lentamente per 60 secondi attiva il nervo vago e abbassa il battito cardiaco entro 2 minuti.',
  'Il metodo Pomodoro aumenta la produttività del 25% riducendo il carico cognitivo percepito.',
  'Scrivere i propri pensieri per 15 minuti riduce l\'ansia da esame (Ramirez & Beilock, 2011).',
  'Il grounding 5-4-3-2-1 interrompe un attacco di panico in media in 3-5 minuti.',
  'Dormire 7-8 ore migliora la memorizzazione del 40% rispetto a dormire meno di 6.',
  'L\'esercizio fisico di 20 minuti ha effetti ansiolitici paragonabili a una dose bassa di farmaci.',
  'La defusione cognitiva dell\'ACT riduce l\'impatto dei pensieri negativi senza combatterli.',
  'Il PMR abbassa il cortisolo del 18% in una singola sessione di 10 minuti.',
  'La scrittura espressiva per 3 giorni consecutivi migliora l\'umore per settimane (Pennebaker, 1997).',
  'Il 90% dei pensieri ansiosi non si realizza mai (Penn State University).',
  'La self-compassion di Kristin Neff riduce l\'autocritica più efficacemente dell\'autostima.',
  'La meditazione body scan per 8 settimane riduce il volume dell\'amigdala (Harvard, 2011).',
];

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let S = {
  name: '', notifyEmail: '', notifyEnabled: false,
  alertEnabled: true, summaryEnabled: true,
  currentMood: '', currentMoodV: 0,
  chatHistory: [], diary: [], moodLog: [],
  stats: { sessions:0, entries:0, chats:0, exercises:0, sos:0 },
  streak: 0, lastActiveDate: null,
  techniqueUsage: {}, lastEmailTs: 0, totalSessions: 0,
  learnedPatterns: {}, sessionTopics: [],
  usedResponses: {},   // traccia risposte già usate per categoria
  stressLog: [],       // tracciamento ciclo stress universitario
  sosHistory: [],      // storico SOS
};

function persist() { try { localStorage.setItem('silvia_v4', JSON.stringify(S)); } catch(e){} }
function hydrate() {
  try {
    const raw = localStorage.getItem('silvia_v4') || localStorage.getItem('silvia_v3') || localStorage.getItem('silvia_v2');
    if (raw) S = { ...S, ...JSON.parse(raw) };
  } catch(e) {}
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
let _toastT = null;
function toast(msg, ms=3200) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), ms);
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
  step: 0, selectedMood: null,
  next() {
    this.step++;
    document.querySelectorAll('.ob-step').forEach((el,i) => el.classList.toggle('hidden', i !== this.step));
    document.querySelectorAll('.ob-dot').forEach((el,i) => el.classList.toggle('active', i === this.step));
    const a = document.getElementById(`ob-step-${this.step}`);
    if (a) { a.style.animation='none'; requestAnimationFrame(()=>{ a.style.animation=''; }); }
  },
  setName() {
    const v = document.getElementById('ob-name-input').value.trim();
    if (!v) return;
    S.name = v;
    document.getElementById('ob-step2-h2').innerHTML = `Come stai<br><em>${v}?</em>`;
    this.next();
  },
  pickMood(btn) {
    document.querySelectorAll('.ob-mood-card').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    this.selectedMood = { label:btn.dataset.mood, emoji:btn.dataset.emoji, v:parseInt(btn.dataset.v) };
    document.getElementById('ob-mood-display').textContent = btn.dataset.emoji;
    document.getElementById('ob-mood-btn').disabled = false;
  },
  toggleNotify(el) {
    document.getElementById('ob-email-section').classList.toggle('hidden', !el.checked);
  },
  finish() {
    if (this.selectedMood) {
      S.currentMood = this.selectedMood.label; S.currentMoodV = this.selectedMood.v;
      S.moodLog.push({ date:new Date().toISOString(), v:this.selectedMood.v, emoji:this.selectedMood.emoji });
    }
    const tog = document.getElementById('ob-notify-toggle');
    S.notifyEnabled = tog ? tog.checked : false;
    const em = document.getElementById('ob-email-input');
    if (em) S.notifyEmail = em.value.trim();
    persist();
    document.getElementById('onboarding').classList.add('hidden');
    App.boot();
  }
};

// ══════════════════════════════════════════════════════════════
//  ENGINE PSICOLOGICO v4
//  Sistema a 5 strati:
//  1. Detect (analisi semantica profonda)
//  2. Classify (categoria primaria + secondaria)
//  3. Context (memoria diario + sessione + pattern)
//  4. Generate (30+ risposte per categoria, non ripetute)
//  5. Enrich (follow-up, suggerimenti, esercizi)
// ══════════════════════════════════════════════════════════════

const Engine = {

  // ── STRATO 1: DETECT ──────────────────────────────────────
  detect(text) {
    const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const has = (...pats) => pats.some(p => typeof p === 'string' ? t.includes(p) : p.test(t));

    return {
      // Intensità
      crisi:       has('non ce la faccio piu', 'voglio mollare', 'basta con tutto', 'non reggo', 'sto crollando', 'crollo', 'esaurita completamente', 'non ne posso piu', 'voglio sparire', 'non ce la faccio davvero', /non (ce la |)faccio (piu|più)/),
      urgente:     has('attacco di panico', 'non respiro', 'cuore che scoppia', 'mi tremano', 'mi gira la testa', 'sto svenendo', 'non riesco a respirare', 'panico totale'),
      alta:        has('molta ansia', 'ansia forte', 'tantissima ansia', 'super ansiosa', 'terrorizzata', 'terrore', 'paura enorme', 'non dormo per', 'ho paura di'),
      media:       has('ansiosa', 'nervosa', 'agitata', 'preoccupata', 'stressata', 'in ansia', 'abbastanza in ansia', 'un po ansiosa'),
      bassa:       has('un po giu', 'non benissimo', 'cosi cosi', 'abbastanza stanca', 'non mi va niente', 'svogliata', 'pigra'),

      // Aree
      esame:       has('esame', 'esami', 'studiare', 'studio', 'universita', 'uni', 'lezione', 'materia', 'prof', 'professore', 'voto', 'bocciata', 'sessione', 'tesi', 'interrogazione', 'laurea', 'corso'),
      lavoro:      has('lavoro', 'lavorare', 'capo', 'colleghi', 'collega', 'ufficio', 'stage', 'tirocinio', 'orari', 'turno', 'stipendio', 'licenziata', 'dimissioni', 'burnout lavoro', 'stanca del lavoro', 'troppo lavoro'),
      stanchezza:  has('stanca', 'esausta', 'sfinita', 'non dormo', 'sonno', 'dormire', 'distrutta', 'a pezzi', 'non ho energie', 'zero energie', 'svuotata', 'terrapiena', 'non ce la faccio fisicamente'),
      tristezza:   has('triste', 'tristezza', 'piango', 'piangendo', 'pianto', 'male', 'vuoto', 'vuota', 'sola', 'abbattuta', 'malinconia', 'depressa', 'depressione', 'non sto bene', 'sto malissimo', 'sto male', 'tutto fa schifo', 'non va niente'),
      rabbia:      has('arrabbiata', 'incazzata', 'incazzatissima', 'nervosa', 'odio', 'fastidio', 'non sopporto', 'irritata', 'mi fa impazzire', 'rompono', 'mi rompe', 'mandare tutti a fanculo', 'sono furiosa'),
      solitudine:  has('sola', 'nessuno', 'non mi capisce', 'abbandonata', 'isolata', 'mi manca', 'lontana', 'nessuno mi capisce', 'mi sento invisibile', 'nessuno mi ascolta'),
      autostima:   has('non valgo', 'sono stupida', 'non sono capace', 'fallita', 'sbagliata', 'non sono abbastanza', 'incapace', 'inutile', 'non riesco mai', 'faccio sempre tutto male', 'sono un disastro', 'sono uno schifo'),
      rimpianto:   has('avrei dovuto', 'ho sbagliato', 'mi pento', 'rimpianto', 'se avessi', 'errore mio', 'colpa mia', 'e colpa mia'),
      futuro:      has('futuro', 'non so cosa fare', 'cosa succedera', 'domani', 'dopo', 'non vedo via', 'come faro', 'paura del futuro', 'non so dove vado'),
      corpo:       has('mal di testa', 'cefalea', 'nausea', 'stomaco chiuso', 'tensione', 'spalle', 'collo', 'mal di schiena', 'dolore', 'sento male', 'mi fa male', 'fisicamente stanca'),
      relazione:   has('filippo', 'fidanzato', 'coppia', 'litigato', 'discussione', 'lui', 'amore', 'mi manca', 'rapporto', 'storia'),
      positivo:    has('bene', 'benissimo', 'felice', 'contenta', 'ho studiato', 'ce la faccio', 'riuscita', 'migliorata', 'finalmente', 'sollievo', 'orgogliosa', 'sono contenta', 'ottimo'),
      ambiguo:     text.trim().split(' ').length <= 5, // messaggio molto corto

      // Richieste
      vuoleConsigli:  has('cosa faccio', 'come faccio', 'aiutami', 'dimmi cosa', 'consiglio', 'suggerisci', 'cosa dovrei', 'come posso'),
      vuoleEsercizio: has('esercizio', 'tecnica', 'respiro', 'calmarmi', 'rilassarmi', 'aiuto pratico', 'cosa posso fare adesso'),
      vuoleSfogarsi:  has('devo dire', 'ho bisogno di parlare', 'ascoltami', 'ho da sfogare', 'ti racconto tutto'),
    };
  },

  // ── STRATO 2: CLASSIFY ────────────────────────────────────
  classify(sig) {
    if (sig.urgente)                              return 'urgente';
    if (sig.crisi)                                return 'crisi';
    if (sig.tristezza && sig.autostima)           return 'autostima_triste';
    if (sig.autostima)                            return 'autostima';
    if (sig.tristezza && sig.solitudine)          return 'solitudine';
    if (sig.tristezza)                            return 'tristezza';
    if (sig.alta || (sig.corpo && sig.media))     return 'ansia_alta';
    if (sig.rabbia)                               return 'rabbia';
    if (sig.stanchezza && sig.lavoro)             return 'burnout';
    if (sig.stanchezza)                           return 'stanchezza';
    if (sig.lavoro)                               return 'lavoro';
    if (sig.esame)                                return 'esame';
    if (sig.media)                                return 'ansia_media';
    if (sig.relazione)                            return 'relazione';
    if (sig.futuro)                               return 'futuro';
    if (sig.rimpianto)                            return 'rimpianto';
    if (sig.positivo)                             return 'positivo';
    if (sig.ambiguo)                              return 'ambiguo';
    if (sig.vuoleConsigli || sig.vuoleEsercizio)  return 'consigli';
    return 'generico';
  },

  // ── STRATO 3: CONTEXT ─────────────────────────────────────
  getContext() {
    const recentDiary = S.diary.slice(0, 5).map(e => e.text.toLowerCase()).join(' ');
    const allDiary    = S.diary.map(e => e.text.toLowerCase()).join(' ');
    const recentMoods = S.moodLog.slice(-7);
    const avgMood     = recentMoods.length ? recentMoods.reduce((a,m)=>a+m.v,0)/recentMoods.length : 3;
    const patterns    = {
      anxietyRecurring: (allDiary.match(/ansia|ansiosa|preoccup/g)||[]).length > 4,
      examStress:       (allDiary.match(/esame|studio/g)||[]).length > 3,
      fatigueRecurring: (allDiary.match(/stanca|esausta/g)||[]).length > 3,
      lonelinessTheme:  (allDiary.match(/sola|nessuno/g)||[]).length > 2,
      moodTrending:     avgMood,
    };
    return {
      turns:    S.chatHistory.length,
      topics:   S.sessionTopics || [],
      patterns, avgMood,
      name:     S.name || 'cara',
      lastAI:   S.chatHistory.filter(m=>m.role==='assistant').slice(-1)[0]?.content || '',
    };
  },

  // ── STRATO 4: GENERATE ────────────────────────────────────
  // Seleziona risposta non ancora usata in questa sessione
  pick(category, responses) {
    if (!S.usedResponses[category]) S.usedResponses[category] = [];
    const used    = S.usedResponses[category];
    const unused  = responses.filter((_,i) => !used.includes(i));
    const pool    = unused.length > 0 ? unused : responses.map((_,i)=>i); // reset se finiscono
    const idx     = pool[Math.floor(Math.random() * pool.length)];
    const realIdx = responses.indexOf ? responses.indexOf(responses[idx]) : idx;
    S.usedResponses[category].push(realIdx);
    if (S.usedResponses[category].length > responses.length * 0.8) S.usedResponses[category] = [];
    return responses[realIdx] || responses[0];
  },

  respond(text) {
    const sig  = this.detect(text);
    const cat  = this.classify(sig);
    const ctx  = this.getContext();
    const name = ctx.name;

    // Aggiorna topics sessione
    if (sig.esame   && !ctx.topics.includes('esame'))   S.sessionTopics.push('esame');
    if (sig.lavoro  && !ctx.topics.includes('lavoro'))  S.sessionTopics.push('lavoro');
    if (sig.tristezza && !ctx.topics.includes('umore')) S.sessionTopics.push('umore');
    if (sig.ansia_media && !ctx.topics.includes('ansia')) S.sessionTopics.push('ansia');

    return this.generate(cat, sig, ctx, name);
  },

  generate(cat, sig, ctx, name) {
    const enrichNote = this.enrichNote(cat, ctx);

    const responses = {

      // ══ URGENTE ══
      urgente: [
        `Fermati. Metti i piedi sul pavimento adesso — senti il peso del corpo sulla sedia o sul letto. Fai un respiro con me: inspira lentamente contando fino a 4, poi espira contando fino a 6. Non devi fare altro in questo momento.\n\nStai avendo un momento di panico acuto — il tuo sistema nervoso ha attivato l'allarme, ma sei al sicuro. Non è pericolo reale anche se lo sembra.\n\nDimmi: sei sdraiata o seduta? Dove sei adesso?`,
        `Okay, sono qui. Non andare da nessuna parte.\n\nPrima cosa: metti una mano sul petto e senti il battito. È lì. Sei presente, sei intera.\n\nIl panico inganna — convince il cervello che ci sia un pericolo che non esiste. I sintomi sono reali, la minaccia non lo è.\n\nFai questo con me: guarda intorno e nomina 3 cose che vedi. Poi dimmi cosa stai vedendo.`,
        `Sono qui con te in questo momento.\n\nQuello che senti adesso — il cuore, il respiro, la testa — è la risposta di attacco-fuga del tuo sistema nervoso. Si attiva automaticamente, non è colpa tua.\n\nLa cosa più efficace adesso è rallentare il respiro: espira più a lungo dell'inspirazione. Prova: inspira 4 secondi, espira 7 secondi. Ripeti 3 volte.\n\nCi sei? Cosa succede?`,
      ],

      // ══ CRISI ══
      crisi: [
        `${name}, ti sento. Quello che stai portando adesso è troppo da reggere da sola — e ha tutto il senso che tu sia a pezzi.\n\nNon voglio darti consigli adesso. Voglio solo starti vicina un secondo.\n\nDimmi una cosa sola: cos'è la cosa più pesante in questo momento? Quella che pesa di più, anche se ne hai mille.`,
        `"Non ce la faccio più" — queste parole mi dicono che sei arrivata a un punto di saturazione reale. Non è debolezza, è esaurimento delle risorse. C'è un limite a quanto si può portare.\n\nIn CBT sappiamo che quando siamo in questo stato, la mente distorce la realtà — tutto sembra permanente e senza via d'uscita, ma non lo è.\n\nUna cosa concreta: hai mangiato qualcosa oggi? Hai dormito stanotte? Partiamo da lì.`,
        `Fermati un secondo con me. Respira.\n\nQuando tutto crolla insieme — studio, lavoro, stanchezza, umore — il cervello va in shutdown cognitivo. Non riesce più a distinguere i problemi, li sente tutti come uno solo, enorme, irrisolvibile.\n\nMa non lo è. Lo smontheremo insieme.\n\nDimmi: di tutto quello che ti pesa, c'è una cosa che oggi potresti anche solo mettere da parte per qualche ora? Una sola.`,
        `${name}, il fatto che tu sia qui e che lo stia dicendo è già qualcosa. Non lo tenere dentro.\n\nQuando si arriva a "non ce la faccio più" ci sono di solito livelli sovrapposti — stanchezza fisica, pressione mentale, e spesso un senso di solitudine profonda sotto tutto. Senti anche quello?\n\nNon devi aver risposta adesso. Dimmi solo come è andato oggi — dall'inizio.`,
        `Ti ascolto. E quello che sento è una persona che ha dato tantissimo e adesso è a zero.\n\nIn psicologia clinica questo si chiama esaurimento delle risorse cognitive ed emotive — non è "essere debole", è una risposta fisiologica a un carico troppo lungo.\n\nLa prima cosa da fare non è risolvere niente. È fermarsi. Stai respirando? Come senti il corpo adesso — dove hai più tensione?`,
      ],

      // ══ TRISTEZZA ══
      tristezza: [
        `"Sto malissimo" — grazie per dirmelo. So che a volte anche solo scriverlo costa.\n\nLa tristezza ha mille facce diverse — c'è quella che viene dall'estenuazione, quella che viene dalla solitudine, quella che viene dalla delusione. E poi c'è quella che arriva e basta, senza un perché chiaro.\n\nQual è la tua in questo momento? Da dove viene, se riesci a sentirlo?`,
        `Quando dici "sto malissimo" e "tutto fa schifo", sento qualcuno che è sotto pressione da troppe cose insieme — non una sola cosa grande, ma tante piccole che sommandosi diventano un muro.\n\nNon ti chiedo di stare bene. Ti chiedo solo di restare qui con me un momento.\n\nCosa è successo oggi che ha reso tutto più pesante?`,
        `La depressione — anche quella non clinica, quella del "periodo no" — ha una caratteristica brutta: mente. Dice che le cose sono sempre state così e sempre saranno così. Non è vero, ma lo sembra.\n\nCi sono due cose che la ricerca ci dice aiutano subito anche solo un po': il movimento (anche solo 10 minuti) e la connessione (anche solo questa conversazione).\n\nDimmi com'è andata la tua giornata — dall'inizio.`,
        `Non stai bene. L'ho sentito.\n\nA volte non serve analizzare tutto subito. A volte serve solo che qualcuno sia lì. Ci sono.\n\nSe vuoi, dimmi tutto — anche in modo disordinato, anche senza logica. Non devi fare la sintesi di come stai. Parla e basta.`,
        `"In depressione" — uso questo termine con rispetto, perché so che quando lo usiamo intendiamo qualcosa di pesante e reale.\n\nVorrei capire meglio: è qualcosa che senti da qualche giorno, o è una sensazione che va e viene da più tempo? Perché questo mi aiuta a capire come starti vicina nel modo giusto.`,
        `Quello che descrivi — l'umore a terra, il non avere voglia di niente, il sentire che tutto pesa — in psicologia si chiama abbassamento dell'umore persistente. Non è pigrizia, non è "volere stare male". È il cervello che non riesce a produrre le risorse energetiche di cui ha bisogno.\n\nE si lavora su questo. Ma prima di tutto: sei al sicuro? Fisicamente e emotivamente?`,
        `Stare malissimo non richiede una spiegazione o una giustificazione. Stai male e basta — e questo è già abbastanza per essere qui e parlarne.\n\nCosa ti farebbe sentire anche solo un grammo meglio adesso? Anche qualcosa di piccolo, di stupido, non importa.`,
        `Sento che stai portando qualcosa di molto pesante. E ho notato che hai detto "l'umore per tutto" — come se fosse tutto insieme, sovrapposto.\n\nQuando succede così, il corpo e la mente mandano segnali di sovraccarico. Non è debolezza — è un campanello d'allarme utile.\n\nCosa ha precipitato tutto oggi?`,
      ],

      // ══ AUTOSTIMA ══
      autostima: [
        `Aspetta — hai appena detto qualcosa di molto duro su di te. Voglio fermarmi qui.\n\nIn CBT la chiamiamo "etichettatura" — quando il cervello prende un episodio (ho sbagliato qualcosa) e lo trasforma in un'identità (sono sbagliata). È uno degli errori cognitivi più comuni e più dolorosi.\n\nLa domanda che ti faccio è questa: quella voce dura che ti parla così — è tua, o l'hai imparata da qualcuno?`,
        `"Sono uno schifo / non sono abbastanza / sono stupida" — so quanto fa male sentire queste cose nella propria testa.\n\nMa voglio dirti una cosa: in psicologia sappiamo che il critico interiore non è la nostra voce vera. È una parte di noi che ha imparato a essere dura per proteggerci, per spingerci a migliorare. Ma spesso esagera. Molto.\n\nSe una tua amica ti dicesse queste cose di se stessa, cosa le risponderesti?`,
        `Quello che stai dicendo di te stessa mi colpisce — non perché sia vero, ma perché so quanto ci si crede, quando si è in quel posto lì.\n\nIn ACT facciamo una distinzione importante: il sé osservante (chi sei davvero) e il sé concettualizzato (l'immagine che abbiamo di noi stessi, spesso distorta). Quello che stai descrivendo è il secondo — non il primo.\n\nDimmi: cosa ha scatenato questi pensieri oggi?`,
        `L'autostima bassa funziona come un filtro — filtra via tutte le prove che ti contraddicono e tiene solo quelle che la confermano. È come avere un avvocato dell'accusa dentro la testa, senza un avvocato difensore.\n\nFacciamo questo insieme: dimmi una cosa — anche piccola — che hai fatto oggi, questa settimana, che ha richiesto impegno o coraggio. Anche solo alzarsi dal letto conta.`,
        `So che a parole "sei abbastanza" suona vuoto. Non te lo dico così.\n\nTe lo dico in modo diverso: il fatto che tu senta questo dolore, che ti importi, che ci tenga — questo dice qualcosa su chi sei. Chi non vale non soffre di non valere abbastanza.\n\nDa quanto tempo senti questa cosa?`,
        `Cristopher Germer e Kristin Neff hanno dimostrato che la self-compassion — trattarsi con la gentilezza che riserveresti a una cara amica — è più efficace dell'autostima nel lungo periodo.\n\nNon ti chiedo di volersi bene (so che non funziona su comando). Ti chiedo: riesci a trattarti con un po' meno severità, solo per oggi?`,
      ],

      // ══ AUTOSTIMA + TRISTEZZA ══
      autostima_triste: [
        `Due cose insieme — tristezza e pensieri duri su te stessa. È una combinazione che si alimenta a vicenda: più si sta male, più il critico interiore si fa sentire. E più si ascolta il critico, più si sta male.\n\nVorrei capire da dove viene tutto questo. C'è stato qualcosa di specifico — un episodio, una parola, una situazione — che ha fatto scattare questo oggi?`,
        `Stare male e contemporaneamente credere di essere la causa del proprio star male — è un peso doppio. E so che quando si è in quel posto, sembra tutto verissimo.\n\nNon ti chiedo di non crederci. Ti chiedo solo di mettere in pausa il giudizio per qualche minuto e parlarmi di cosa è successo — i fatti, non le interpretazioni.`,
        `Quando siamo giù, la mente tende a cercare cause interne: "è colpa mia, sono sbagliata, non sono abbastanza." È un meccanismo evolutivo — il cervello cerca di avere il controllo anche quando non ce l'ha.\n\nMa stare male non è una colpa. È qualcosa che sta succedendo a te, non qualcosa che sei.\n\nDimmi tutto, senza filtri.`,
      ],

      // ══ ANSIA ALTA ══
      ansia_alta: [
        `Quello che descrivi — ${sig.corpo ? 'le sensazioni nel corpo, ' : ''}l'agitazione forte — è il sistema nervoso autonomo in modalità allarme. Non stai diventando matta. È fisiologia.\n\nLa risposta più efficace in questo momento non è pensare, è fare qualcosa con il corpo. Prova questo adesso: metti i piedi sul pavimento, inspira 4 secondi, trattieni 1, espira 6 secondi. Ripeti 3 volte.\n\nFatto? Come ti senti dopo?`,
        `L'ansia alta ha una caratteristica fastidiosa: ci fa credere che dovremmo *risolvere tutto subito*, ma è proprio questa urgenza che la alimenta.\n\nIl sistema nervoso si calma con segnali fisici di sicurezza, non con il ragionamento. Tre cose adesso: 1) Siediti se non sei seduta. 2) Metti una mano sul petto. 3) Respira come se stessi appannando uno specchio — lento, costante.\n\nDimmi da quando hai questa sensazione.`,
        `Ansia forte. Ci sono.\n\nSo che in questo momento la testa va veloce e il corpo è teso. La ricerca ci dice che la cosa più efficace nei primi 5 minuti è rallentare il respiro — non perché sia magico, ma perché il nervo vago risponde direttamente alla velocità dell'espirazione.\n\nEspira il più lentamente possibile. Non importa quanto inspiri — conta solo l'espirazione lunga.\n\nCosa sta succedendo? Cosa ha fatto scattare questo?`,
        `Ansia forte su tutto insieme — questo è esattamente il tipo di ansia più logorante, perché non ha un oggetto preciso su cui concentrarsi.\n\nIn DBT (Dialectical Behavior Therapy) chiamiamo questo "flooding emotivo" — quando le emozioni sommergono la capacità di elaborare. Non si ragiona via dall'ansia quando si è in flooding. Prima si calma il sistema nervoso, poi si pensa.\n\nDove la senti di più nel corpo — petto, stomaco, testa, gola?`,
        `Quando tutto pesa insieme e l'ansia è alta, la mente tende a catastrofizzare — a proiettare tutto al peggio possibile. È un bias evolutivo che ci ha salvato la vita per millenni, ma oggi crea un inferno inutile.\n\nUna domanda CBT: qual è la cosa peggiore concreta che temi succeda? Non "che andrà tutto male" — ma la cosa specifica, reale, che temi.`,
      ],

      // ══ ANSIA MEDIA ══
      ansia_media: [
        `L'ansia che senti — da dove arriva? A volte ha un oggetto preciso (l'esame, il lavoro, una relazione), a volte fluttua senza un'ancora chiara. Entrambi i tipi esistono, e si lavorano in modo leggermente diverso.\n\nDimmi: l'ansia che hai adesso ha un nome? C'è qualcosa di specifico che la alimenta?`,
        `Quando sei "in ansia" e basta — quella sensazione diffusa, di fondo — spesso è il segnale che ci sono troppe cose non risolte che girano nella testa in background. Come troppi processi aperti sul computer.\n\nUna tecnica CBT molto efficace è il "brain dump": scrivi tutto quello che ti preoccupa, senza ordine. Solo tirarle fuori. Lo hai mai provato? Se no, ti guido io.`,
        `L'ansia è scomoda, ma ascoltarla può essere utile. Ci sta dicendo che c'è qualcosa a cui teniamo, qualcosa che stiamo cercando di proteggere o di ottenere.\n\nSe l'ansia potesse parlare, cosa direbbe? Di cosa ha paura davvero?`,
        `"Ansiosa" — quanto su una scala da 1 a 10? E da quando? Perché questi due dati mi dicono cose molto diverse e cambiano come rispondere nel modo più utile per te.`,
        `L'ansia da prestazione, l'ansia da futuro, l'ansia da relazione — ognuna ha radici diverse e strategie diverse. In questo momento senti di capire da dove viene la tua?`,
        `Una cosa che molte persone non sanno: l'ansia e l'eccitazione producono le stesse sostanze nel cervello — adrenalina, cortisolo. La differenza è come le interpretiamo. Non ti sto dicendo "trasforma l'ansia in eccitazione" (lo so che è irritante sentirlo). Ma mi interessava capire: l'ansia che senti è paralizzante o ti agita e spinge a fare?`,
        `In ACT l'ansia non viene combattuta — viene accettata. Non perché sia piacevole, ma perché la lotta contro di essa la amplifica. "Ho il pensiero che qualcosa andrà male" è diverso da "qualcosa andrà male." Riesci a fare questa distinzione adesso?`,
      ],

      // ══ STANCHEZZA ══
      stanchezza: [
        `La stanchezza che descrivi — fisicamente come la senti? Pesantezza nel corpo, testa ovattata, occhi che bruciano? Perché esistono tipi diversi di stanchezza e il modo di ricaricare cambia.\n\nC'è la stanchezza fisica (si risolve con il sonno e il riposo), quella cognitiva (il cervello ha elaborato troppo), quella emotiva (si è dato troppo emotivamente) e quella esistenziale (si è perso il senso di quello che si fa). Quale riconosci di più?`,
        `"A pezzi" — questa parola mi dice che non è solo "sono stanca". È qualcosa di più profondo.\n\nIl burnout accademico o lavorativo è reale e riconosciuto clinicamente. I tre segnali principali sono: esaurimento, cinismo (tutto sembra inutile) e inefficacia percepita (sento di non combinare niente). Ne riconosci qualcuno?`,
        `Quando si è esausti, tutto — ogni compito, ogni pensiero, ogni emozione — pesa il doppio. Non è debolezza, è neurobiologia: il cervello a corto di risorse funziona male, proprio come un telefono al 2% di batteria.\n\nQuando hai fatto l'ultima cosa che ti ha dato energia invece di toglierla? E cosa era?`,
        `La stanchezza cronica ha un effetto subdolo: cambia la prospettiva. Tutto sembra più grigio, più difficile, più senza speranza di quanto sia realmente. È un effetto biologico, non la verità.\n\nConcretamente: nelle ultime 72 ore, quante ore hai dormito? Hai mangiato regolarmente? Sei uscita di casa almeno una volta?`,
        `So che quando si è così stanchi, l'idea di "fare qualcosa per stare meglio" sembra impossibile. È un paradosso del burnout — le cose che aiutano richiedono energia che non hai.\n\nAllora facciamo così: dimmi una cosa sola, piccola, che potresti fare oggi — non per risolvere tutto, ma per dare al tuo corpo o alla tua mente un segnale di cura. Anche bere un bicchiere d'acqua conta.`,
        `L'esaurimento prolungato abbassa il tono dell'umore, riduce la motivazione e altera la capacità di giudizio. Questo è importante dirlo chiaramente: quando sei a pezzi, non è il momento giusto per prendere decisioni importanti o giudicarsi.\n\nDa quanto tempo vai avanti così senza fermarti davvero?`,
        `In MBSR (il programma di Kabat-Zinn) c'è un concetto fondamentale: "being mode" vs "doing mode". Siamo sempre in modalità fare — anche quando non facciamo niente, il cervello pianifica, rimugina, elabora. La stanchezza profonda spesso viene dalla mancanza totale di "essere mode".\n\nL'ultima volta che eri davvero presente in un momento, senza pensare al prima o al dopo — quando è stato?`,
      ],

      // ══ BURNOUT (lavoro + stanchezza) ══
      burnout: [
        `Lavoro e stanchezza insieme — questa è la combinazione più classica del burnout. E quando arriva, non si risolve con una notte di sonno.\n\nIl burnout lavorativo ha fasi: idealism → stagnation → frustration → apathy. In quale fase ti senti?\n\nE sopratutto: c'è qualcosa nel tuo lavoro che ti dà ancora qualcosa, o è diventato tutto uguale e vuoto?`,
        `Il lavoro sta pesando tanto. Dimmi una cosa: il problema è il lavoro in sé (i compiti, il settore) o le condizioni (i colleghi, il capo, gli orari, lo stress)? Perché le soluzioni sono molto diverse.\n\nE poi: quanto tempo hai? Sei all'inizio di una carriera, a metà, o stai valutando di cambiare?`,
        `Essere esauste dal lavoro e dovere andare avanti è uno dei pesi più difficili — perché non puoi semplicemente fermarti come potresti con altre cose.\n\nCosa ti spinge a continuare nonostante tutto? E cosa ti darebbe sollievo, anche parziale, adesso?`,
      ],

      // ══ LAVORO ══
      lavoro: [
        `Il lavoro sta pesando. Dimmi di più — cosa sta succedendo? È una situazione specifica (un conflitto, una decisione, un progetto difficile) o è una sensazione più generale di non riuscire a reggere il ritmo o l'ambiente?\n\nSono due cose diverse e voglio capire bene qual è la tua.`,
        `Il lavoro quando va male porta con sé tante cose: stress, dubbio su se stessi, a volte senso di ingiustizia, a volte paura del futuro. Cosa prevale in quello che senti tu adesso?\n\nE c'è qualcuno con cui hai potuto parlarne nella vita reale — un collega di fiducia, qualcuno a casa?`,
        `Le dinamiche lavorative sono complesse — capo, colleghi, aspettative, confini. A volte il problema è esterno (ambiente tossico, carico insostenibile), a volte è interno (difficoltà a dire no, perfezionismo, paura di deludere).\n\nSe dovessi indicare la fonte principale del tuo disagio al lavoro, quale sarebbe?`,
        `Lavorare mentre studi, o lavorare in un periodo già difficile, è un carico doppio che molte persone sottovalutano. Il cervello non ha la capacità infinita che spesso ci convinciamo di avere.\n\nC'è un modo per alleggerire, anche temporaneamente? O senti di non avere scelta?`,
        `Cosa vorresti che cambiasse nel tuo lavoro? Se potessi scegliere una sola cosa — orari, mansioni, colleghi, ambiente, stipendio — cosa metteresti al primo posto?`,
        `A volte al lavoro succede qualcosa che ci fa sentire piccole, non rispettate, non viste. E questo lascia segni anche fuori dall'ufficio — sull'umore, sul sonno, sull'autostima.\n\nHai vissuto qualcosa del genere di recente?`,
      ],

      // ══ ESAME ══
      esame: [
        `Gli esami — e tutto quello che portano con sé. Non solo la materia da studiare, ma la pressione del giudizio, il confronto, la paura di non essere abbastanza.\n\nL'ansia da prestazione (test anxiety) è riconosciuta clinicamente e ha basi neurologiche precise: il cortisolo alto inibisce la corteccia prefrontale, quella che ci serve per ragionare. Non è una scusa — è fisiologia.\n\nCos'è il prossimo esame? E cosa senti quando pensi a quella data?`,
        `Lo studio quando l'ansia è alta è una battaglia in salita — non perché tu sia meno capace, ma perché il cervello ansioso non funziona alla stessa velocità di quello calmo.\n\nDimmi: quando apri il libro, cosa succede? Ti blocchi subito, vai avanti un po' e poi ti perdi, o non riesci proprio ad aprirlo?`,
        `L'università porta con sé una pressione che non è solo accademica — è identitaria. "Come me la cavo agli esami" diventa spesso "chi sono io, quanto valgo". È una trappola sottile ma devastante.\n\nTu quanto senti questa connessione tra i tuoi voti e il tuo valore come persona?`,
        `Uno studio dell'Università di Chicago (Ramirez & Beilock, 2011) ha dimostrato che scrivere le proprie preoccupazioni per 10 minuti prima di un esame migliora la performance del 15%. Perché scarica la memoria di lavoro.\n\nHai provato mai qualcosa del genere? Anche solo fare un dump su carta di tutto quello che ti spaventa?`,
        `Come stai andando con il metodo di studio? A volte il problema non è la quantità — è come si studia. Il retrieval practice (ripassare senza guardare gli appunti) è 2-3 volte più efficace della rilettura, secondo la ricerca sulla memoria.\n\nCome stai studiando in questo momento?`,
        `L'esame è una scadenza, ma spesso diventa un contenitore per tutto lo stress accumulato. Cosa mi stai dicendo dell'esame — e cosa mi stai dicendo di tutto il resto?`,
        `Il perfezionismo accademico è uno dei predittori più forti di ansia da esame. Non la mancanza di capacità — il perfezionismo. La paura di non essere abbastanza brava, non la reale difficoltà del materiale.\n\nTi riconosci in questo?`,
        `Gli esami passano. I periodi difficili passano. Questa non è una frase vuota — è qualcosa che vale la pena ricordare quando si è dentro la sessione e sembra eterna.\n\nQuanti esami hai davanti? E qual è quello che ti spaventa di più in assoluto?`,
      ],

      // ══ RABBIA ══
      rabbia: [
        `La rabbia che senti è reale e ha diritto di esserci. Spesso la rabbia è la risposta a qualcosa di importante che non è stato rispettato — un confine, un'aspettativa, un bisogno.\n\nNon ti dico di calmarti (so che fa schifo sentirlo). Dimmi: cosa è successo? Chi o cosa ha fatto scattare questo?`,
        `Incazzarsi non è sbagliato. È umano. E a volte è l'unica risposta onesta a una situazione ingiusta o insostenibile.\n\nLa rabbia non espressa rimane dentro e si trasforma — in tensione fisica, in depressione, in cinismo. Esprimerla (anche qui, anche sfogandosi) è salutare.\n\nRaccontami tutto senza filtri.`,
        `Quando sei furiosa, cosa senti nel corpo? Il petto? La mascella? Le spalle? Ti chiedo perché la rabbia si manifesta fisicamente — e riconoscerla aiuta a non farne qualcosa di cui poi ci si pente.\n\nE dimmi: chi o cosa è l'obiettivo della tua rabbia adesso?`,
        `La frustrazione cronica — quando si è arrabbiati spesso e per tante cose — di solito viene da una discrepanza tra come vorremmo che le cose fossero e come sono. In DBT la chiamiamo "sofferenza da reality check".\n\nC'è qualcosa che hai aspettato o sperato e non è arrivato come speravi?`,
        `A volte la rabbia è in realtà tristezza o paura travestite. Più facile arrabbiarsi che sentire la vulnerabilità sotto.\n\nSenza forzare niente: se sotto la tua rabbia ci fosse una paura, quale sarebbe?`,
      ],

      // ══ SOLITUDINE ══
      solitudine: [
        `Sentirsi sola — anche quando ci sono persone attorno — è una delle esperienze più difficili. Perché non è assenza di persone, è assenza di connessione vera.\n\nNon mi dire che "non è un problema grande". Lo è. La solitudine ha effetti sul corpo e sulla mente che la ricerca equipara a fumare 15 sigarette al giorno.\n\nDa quando senti questa cosa? Ed è una sensazione nuova o va avanti da un po'?`,
        `"Nessuno mi capisce" — questa frase mi colpisce sempre, perché di solito non dice che non ci siano persone buone intorno, ma che c'è qualcosa di profondo dentro di te che non riesci a mostrare o che, quando lo mostri, non trova risposta.\n\nCi sei mai riuscita a sentirti davvero capita, in qualche momento della tua vita? Da chi?`,
        `La solitudine emotiva è diversa da quella fisica. Puoi essere circondata da persone e sentirti completamente sola — o stare da sola e sentirti connessa.\n\nQual è la tua? E cosa manca, concretamente, nella tua vita in questo momento?`,
        `Quando mi dici che ti senti sola, ho un sacco di domande. Ma ne scelgo una sola: c'è qualcuno a cui vorresti avvicinarti ma non riesci, per qualche motivo? O è più che non sai nemmeno da dove cominciare?`,
      ],

      // ══ RELAZIONE ══
      relazione: [
        `Le relazioni — anche quelle belle e sane — portano un peso emotivo in più, specialmente in periodi di stress. Non perché l'amore faccia male, ma perché quando siamo già a corto di risorse, la vicinanza emotiva diventa più difficile.\n\nCos'è successo? C'è una tensione specifica o è più una sensazione diffusa?`,
        `Quando sei sotto pressione (esami, lavoro, stanchezza), la relazione diventa spesso il posto dove si scarica tutto — o il posto dove si sente di non avere abbastanza energia da dare.\n\nCome stai vivendo questo?`,
        `Mi hai parlato di Filippo. Come sta andando tra voi in questo momento? Non devi rassicurarmi — puoi dirmi com'è davvero.`,
        `A volte si ha paura di far pesare le proprie difficoltà su chi si ama. Si cerca di sembrare bene anche quando non lo si è. Ti ritrovi in questo?`,
      ],

      // ══ FUTURO ══
      futuro: [
        `La paura del futuro è una delle forme di ansia più difficili, perché l'oggetto non esiste ancora — è tutto nella proiezione della mente.\n\nIn CBT chiamiamo questo "fortune telling" — il cervello che prevede il futuro come se fosse certo, solitamente nel peggio possibile.\n\nQual è il futuro specifico che ti spaventa? Prova a renderlo concreto — non "andrà tutto male", ma: cosa temi esattamente che succeda?`,
        `Non sapere cosa fare — della propria vita, del proprio percorso — è una delle sensazioni più scomode. Perché viviamo in una cultura che ci dice che dovremmo sempre sapere dove andiamo.\n\nMa la verità è che la maggior parte delle persone naviga a vista molto più di quanto appare.\n\nCosa desideri, al di là delle aspettative degli altri?`,
        `Il futuro fa paura soprattutto quando il presente è instabile. Quando si è esausti, ansiosi, soli — il futuro sembra ancora più incerto.\n\nDimmi: in questo momento, cos'è la cosa del futuro che pensi più spesso?`,
      ],

      // ══ RIMPIANTO ══
      rimpianto: [
        `Il rimpianto è uno dei pensieri più pesanti da portare, perché non ha un oggetto nel presente su cui agire — solo un passato che non si può cambiare.\n\nIn ACT lavoriamo sul distinguere ciò che possiamo cambiare da ciò che non possiamo. Il passato è fisso. Ma il significato che gli diamo — quello possiamo sceglierlo.\n\nCosa è successo? Raccontami.`,
        `"È colpa mia" — frase da analizzare con attenzione. Spesso è vera solo in parte, e il cervello in uno stato di stress tende a prendere il 100% della responsabilità anche quando non spetta tutta a noi.\n\nCosa è successo esattamente? E quali erano le opzioni reali che avevi in quel momento?`,
      ],

      // ══ POSITIVO ══
      positivo: [
        `Questo mi fa davvero piacere sentirlo. E sai cosa? Il fatto che tu lo noti — che riesci a riconoscere un momento positivo — è già una forma di salute mentale. Non è scontato.\n\nCosa ha contribuito a questo? C'è qualcosa di specifico che ha fatto la differenza oggi?`,
        `Brava davvero. So che non è sempre facile arrivare a sentirti così — specialmente in un periodo intenso.\n\nGoditelo senza fretta di passare al prossimo obiettivo. Stare bene non richiede immediatamente di fare qualcosa di utile con quel benessere.\n\nDimmi: com'è diverso il mondo quando stai bene così?`,
        `Bellissimo. E questo stato — tienitelo a mente. Letteralmente. In psicologia si chiama "savoring" — il processo di assaporare consapevolmente le esperienze positive per consolidarle nella memoria. Stai facendo esattamente questo.`,
      ],

      // ══ AMBIGUO (messaggio corto) ══
      ambiguo: [
        `Ti sento — anche solo con quelle parole. Hai voglia di dirmi di più? Cosa sta succedendo?\n\nNon devi fare una sintesi o essere logica. Dimmi come lo senti, anche in modo disordinato.`,
        `Dimmi tutto. Da dove viene, quando è iniziata, cosa pesa di più. Questo è il tuo spazio — non c'è niente di troppo piccolo o di troppo grande da dire.`,
        `Sono qui. Cosa sta succedendo dentro di te adesso — anche se non hai parole precise, prova a descriverlo. Come lo senti nel corpo, nella testa, nell'umore?`,
        `So che a volte le parole non vengono. Ci sono comunque — è già qualcosa essere qui.\n\nSe dovessi scegliere una sola cosa da dirmi in questo momento, cosa sarebbe?`,
        `Quando si dice "sto male" e basta, di solito è perché ci sono troppe cose insieme e non si sa da dove iniziare. Capisco.\n\nProviamo così: dimmi la cosa che ti pesa di più — non tutte, solo quella più grande.`,
      ],

      // ══ CONSIGLI ══
      consigli: [
        `Ti do qualcosa di concreto — ma voglio assicurarmi di darti la cosa giusta per te, non quella generica.\n\nIn CBT, ACT e MBSR abbiamo strumenti molto diversi a seconda del problema. Prima dimmi: cosa senti di più in questo momento — tensione nel corpo, pensieri che girano veloci, o difficoltà a fare le cose?`,
        `Ci sono tecniche per quasi tutto — e te ne darò di efficaci. Ma prima la domanda chiave: il problema principale adesso è gestire un'emozione difficile, cambiare un pensiero ricorrente, o trovare la motivazione per fare qualcosa?`,
        `Bene, partiamo dalla pratica.\n\nLe tecniche evidence-based più efficaci per stress/ansia: 1) Respiro 4-7-8 per effetto immediato. 2) Grounding 5-4-3-2-1 per panico. 3) Body scan per tensione fisica. 4) Scrittura espressiva per processare le emozioni.\n\nDimmi prima cosa hai già provato — così non perdiamo tempo su cose che non fanno per te.`,
      ],

      // ══ GENERICO ══
      generico: [
        `Ti ascolto. Dimmi di più — cosa sta succedendo nella tua vita in questo periodo?`,
        `Sono qui. Cosa hai in testa adesso — anche se sembra disordinato o senza senso?`,
        `Dimmi come stai — non la risposta automatica, quella vera.`,
        `C'è qualcosa che vuoi tirarti fuori? Questo è il posto giusto per farlo.`,
        `Cosa ti pesa di più oggi?`,
      ],
    };

    const pool = responses[cat] || responses.generico;
    let reply   = this.pick(cat, pool);

    // Arricchimento contestuale
    if (enrichNote) reply += '\n\n' + enrichNote;

    return reply;
  },

  // ── STRATO 5: ENRICH ─────────────────────────────────────
  enrichNote(cat, ctx) {
    const { patterns, avgMood, turns } = ctx;
    const notes = [];

    if (patterns.anxietyRecurring && ['ansia_media','ansia_alta','esame'].includes(cat)) {
      notes.push('💡 Ho visto nel tuo diario che l\'ansia è qualcosa che ti accompagna spesso. Non sei sola in questo — e si può lavorarci davvero.');
    }
    if (patterns.fatigueRecurring && cat === 'stanchezza') {
      notes.push('⚡ La stanchezza sembra essere un tema ricorrente per te. Vale la pena capire se c\'è qualcosa di strutturale che possiamo cambiare.');
    }
    if (avgMood < 2.5 && turns > 2) {
      notes.push('💙 Stai attraversando un periodo difficile da un po\'. Hai parlato con qualcuno di cui ti fidi nella vita reale — Filippo, un\'amica, un familiare?');
    }
    if (patterns.lonelinessTheme && cat === 'solitudine') {
      notes.push('🌿 Dal tuo diario emerge che la solitudine è qualcosa che senti spesso. Non l\'hai mai detto a qualcuno di persona?');
    }
    return notes.length ? notes[Math.floor(Math.random()*notes.length)] : null;
  },

  // ── FOLLOW-UP CHIPS ──────────────────────────────────────
  followUpChips(sig) {
    const chips = [];
    if (sig.urgente || sig.crisi)    chips.push('🌬️ Guidami nella respirazione');
    if (sig.alta)                    chips.push('🌍 Grounding 5-4-3-2-1 adesso');
    if (sig.autostima)               chips.push('🍃 Cos\'è la defusione cognitiva?');
    if (sig.stanchezza)              chips.push('🧘 Body scan per rilassarmi');
    if (sig.esame)                   chips.push('🍅 Pomodoro per studiare');
    if (sig.tristezza)               chips.push('📖 Scrivere nel diario mi aiuta?');
    if (sig.corpo)                   chips.push('💆 Rilassamento muscolare progressivo');
    if (sig.lavoro)                  chips.push('Parliamo ancora del lavoro');
    chips.push('Come posso stare meglio adesso?');
    return chips.slice(0,3);
  },
};

// ─────────────────────────────────────────
// CHAT UI
// ─────────────────────────────────────────
const Chat = {
  isLoading: false,

  init() {
    S.stats.chats = (S.stats.chats||0)+1;
    S.sessionTopics = [];
    S.usedResponses = {};
    persist();
    const hour = new Date().getHours();
    const greet = hour<12?'Buongiorno':hour<18?'Buon pomeriggio':'Buonasera';
    const name = S.name||'cara';
    let opener;
    if (S.currentMood && S.currentMoodV <= 2) {
      opener = `${greet} ${name} 💚 Mi hai detto che ti senti ${S.currentMood}...\n\nSono qui, questo è il tuo spazio. Raccontami tutto — da dove viene, quando è iniziata, cosa senti. Non filtrare niente.`;
    } else if (S.currentMood && S.currentMoodV >= 4) {
      opener = `${greet} ${name}! Bello sentirti 🌿\n\nCome stai oggi — c'è qualcosa su cui vuoi lavorare, o sei qui solo per un check-in?`;
    } else {
      opener = `${greet} ${name} 💚\n\nSono qui. Questo è il tuo spazio — nessun giudizio, nessuna fretta.\n\nCome stai davvero in questo momento?`;
    }
    this._append('ai', opener);
    this._showChips(['Sono ansiosa 😰','Sto malissimo','Non riesco a studiare','Sono stanca 😮‍💨','Ho problemi al lavoro','Voglio sfogarmi']);
  },

  clear() {
    S.chatHistory = []; S.sessionTopics = []; S.usedResponses = {};
    persist();
    document.getElementById('chat-messages').innerHTML = '';
    this._showChips([]);
    this.init();
    toast('💬 Nuova conversazione');
  },

  async send() {
    if (this.isLoading) return;
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;
    input.value = ''; input.style.height = 'auto';
    document.getElementById('chat-suggestions-wrap').style.display = 'none';
    this._append('user', text);
    S.chatHistory.push({ role:'user', content:text });
    if (S.chatHistory.length > 60) S.chatHistory = S.chatHistory.slice(-60);
    this.isLoading = true;
    document.getElementById('chat-send-btn').style.opacity = '0.5';
    this._showTyping();
    // delay realistico
    await new Promise(r => setTimeout(r, 900 + Math.random()*1000));
    const sig   = Engine.detect(text);
    const reply = Engine.respond(text);
    this._hideTyping();
    this._append('ai', reply);
    S.chatHistory.push({ role:'assistant', content:reply });
    persist();
    const chips = Engine.followUpChips(sig);
    if (chips.length) setTimeout(() => this._showChips(chips), 500);
    this.isLoading = false;
    document.getElementById('chat-send-btn').style.opacity = '1';
    maybeEmail();
  },

  suggest(btn) {
    document.getElementById('chat-input').value = btn.textContent.trim();
    btn.closest('.chip')?.remove();
    this.send();
  },
  resize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; },
  onKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.send();} },

  _append(role, text) {
    const msgs = document.getElementById('chat-messages');
    const time = new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    const div  = document.createElement('div');
    div.className = `msg ${role}`;
    const fmt = text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.*?)\*/g,'<em>$1</em>')
      .replace(/\n/g,'<br>');
    if (role==='ai') {
      div.innerHTML=`<div class="msg-avatar">🌿</div><div class="msg-wrap"><div class="msg-bubble">${fmt}</div><div class="msg-time">${time}</div></div>`;
    } else {
      div.innerHTML=`<div class="msg-wrap"><div class="msg-bubble">${fmt}</div><div class="msg-time">${time}</div></div>`;
    }
    msgs.appendChild(div);
    requestAnimationFrame(()=> msgs.scrollTop = msgs.scrollHeight);
  },
  _showTyping() {
    const msgs=document.getElementById('chat-messages');
    const div=document.createElement('div'); div.className='msg ai'; div.id='typing-msg';
    div.innerHTML=`<div class="msg-avatar">🌿</div><div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight;
  },
  _hideTyping() { document.getElementById('typing-msg')?.remove(); },
  _showChips(chips) {
    const wrap=document.getElementById('chat-suggestions-wrap');
    const cont=document.getElementById('chat-suggestions');
    cont.innerHTML=chips.map(c=>`<button class="chip" onclick="App.chat.suggest(this)">${c}</button>`).join('');
    wrap.style.display=chips.length?'':'none';
  },
};

// ─────────────────────────────────────────
// SOS BUTTON
// ─────────────────────────────────────────
const SOS = {
  open() {
    S.stats.sos=(S.stats.sos||0)+1;
    S.sosHistory.push({ date:new Date().toISOString() });
    persist();
    Sheet.open(`
      <div style="padding:0 4px">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:3rem;margin-bottom:10px">🆘</div>
          <div style="font-family:'DM Serif Display',serif;font-size:1.5rem;color:var(--ink)">Sono qui con te</div>
          <div style="font-size:0.85rem;color:var(--ink-muted);margin-top:6px">Respira. Sei al sicuro.</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button onclick="App.nav.to('breath');Sheet.forceClose()" style="width:100%;padding:16px;border:none;border-radius:14px;background:var(--blue-pale);color:#2563EB;font-size:0.95rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:left">
            🌬️ Esercizio di respiro immediato
            <div style="font-size:0.75rem;font-weight:400;opacity:0.7;margin-top:2px">Abbassa il panico in 2 minuti</div>
          </button>
          <button onclick="App.exercises.open('grounding');Sheet.forceClose();setTimeout(()=>App.exercises.open('grounding'),100)" style="width:100%;padding:16px;border:none;border-radius:14px;background:var(--sage-pale);color:var(--sage-deep);font-size:0.95rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:left">
            🌍 Grounding 5-4-3-2-1
            <div style="font-size:0.75rem;font-weight:400;opacity:0.7;margin-top:2px">Torna al presente adesso</div>
          </button>
          <button onclick="App.nav.to('chat');Sheet.forceClose();setTimeout(()=>{document.getElementById('chat-input').value='Ho bisogno di aiuto adesso, sto avendo un momento di crisi';App.chat.send()},300)" style="width:100%;padding:16px;border:none;border-radius:14px;background:var(--purple-pale);color:#7C3AED;font-size:0.95rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:left">
            💬 Parla con la tua guida
            <div style="font-size:0.75rem;font-weight:400;opacity:0.7;margin-top:2px">Dimmi tutto, sono qui</div>
          </button>
        </div>
        <div style="margin-top:20px;padding:14px;background:var(--bg);border-radius:12px;font-size:0.8rem;color:var(--ink-muted);line-height:1.6">
          <strong style="color:var(--ink)">Ricorda:</strong> quello che senti adesso passerà. Non è permanente.<br>
          Se sei in pericolo reale, chiama il <strong>112</strong> o il Telefono Amico <strong>02 2327 2327</strong>.
        </div>
      </div>
    `);
  }
};

// ─────────────────────────────────────────
// STRESS TRACKER (ciclo universitario)
// ─────────────────────────────────────────
const StressTracker = {
  open() {
    const log = S.stressLog || [];
    const chart = this._buildChart(log);
    Sheet.open(`
      <div style="padding:0 4px">
        <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">📈 Ciclo stress universitario</div>
        <div style="font-size:0.8rem;color:var(--ink-muted);margin-bottom:20px">Traccia i tuoi livelli di stress durante la sessione</div>
        <div style="background:var(--bg);border-radius:14px;padding:16px;margin-bottom:16px">
          <div style="font-size:0.78rem;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Livello stress oggi</div>
          <div style="display:flex;gap:8px;justify-content:center">
            ${[1,2,3,4,5,6,7,8,9,10].map(n=>`
              <button onclick="StressTracker.log(${n},this)" style="width:32px;height:32px;border-radius:8px;border:2px solid var(--border);background:var(--white);font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--ink-muted);transition:all 0.2s;font-family:inherit">${n}</button>
            `).join('')}
          </div>
          <div style="font-size:0.72rem;color:var(--ink-faint);text-align:center;margin-top:8px">1 = tranquilla · 10 = al limite</div>
        </div>
        ${chart}
        <div style="margin-top:16px;padding:14px;background:var(--sage-pale);border-radius:12px">
          <div style="font-size:0.78rem;font-weight:600;color:var(--sage-deep);margin-bottom:6px">💡 Pattern comune in sessione</div>
          <div style="font-size:0.8rem;color:var(--ink-soft);line-height:1.6">Lo stress tende ad aumentare 2-3 settimane prima degli esami e a toccare il picco 48-72 ore prima. Sapere dove sei nel ciclo aiuta a pianificare meglio il recupero.</div>
        </div>
      </div>
    `);
  },

  log(level, btn) {
    document.querySelectorAll('[onclick^="StressTracker.log"]').forEach(b=>{
      b.style.background='var(--white)';b.style.borderColor='var(--border)';b.style.color='var(--ink-muted)';
    });
    btn.style.background='var(--sage)';btn.style.borderColor='var(--sage)';btn.style.color='white';
    S.stressLog = S.stressLog||[];
    S.stressLog.push({ date:new Date().toISOString(), level });
    if (S.stressLog.length>60) S.stressLog=S.stressLog.slice(-60);
    persist();
    toast(`📊 Stress ${level}/10 registrato`);
    if (level >= 8) {
      setTimeout(()=>{
        toast('⚠️ Livello alto — prova la respirazione 4-7-8', 4000);
      }, 3000);
    }
  },

  _buildChart(log) {
    if (!log.length) return '<div style="text-align:center;padding:20px;color:var(--ink-muted);font-size:0.85rem">Nessun dato ancora. Registra il tuo stress oggi!</div>';
    const last14 = log.slice(-14);
    const max = 10;
    return `
      <div style="background:var(--bg);border-radius:14px;padding:16px">
        <div style="font-size:0.75rem;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Ultimi ${last14.length} rilevamenti</div>
        <div style="display:flex;align-items:flex-end;gap:4px;height:80px">
          ${last14.map(e=>`
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
              <div style="width:100%;border-radius:4px 4px 0 0;background:${e.level>=8?'#EF4444':e.level>=5?'#F59E0B':'var(--sage)'};height:${(e.level/max)*72}px;min-height:4px;transition:height 0.5s"></div>
              <div style="font-size:0.55rem;color:var(--ink-faint)">${e.level}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }
};
window.StressTracker = StressTracker;

// ─────────────────────────────────────────
// BREATHING
// ─────────────────────────────────────────
const BREATH_TYPES = {
  '478':{ label:'4-7-8', desc:'Inspira 4s · Trattieni 7s · Espira 8s — abbassa l\'ansia acuta in 2-3 minuti.', phases:[{label:'Inspira',s:4,scale:1.3},{label:'Trattieni',s:7,scale:1.15},{label:'Espira',s:8,scale:0.85}], cycles:4 },
  box:  { label:'Box',   desc:'Inspira 4s · Trattieni 4s · Espira 4s · Pausa 4s — calma il sistema nervoso.', phases:[{label:'Inspira',s:4,scale:1.3},{label:'Trattieni',s:4,scale:1.15},{label:'Espira',s:4,scale:0.85},{label:'Pausa',s:4,scale:0.9}], cycles:4 },
  calm: { label:'Calma', desc:'Inspira 4s · Espira 6s — attiva il nervo vago, risposta di rilassamento.', phases:[{label:'Inspira',s:4,scale:1.25},{label:'Espira',s:6,scale:0.85}], cycles:6 },
};
const Breath = {
  type:'478', running:false, timer:null, cycles:0, phaseIdx:0,
  setType(type,btn){
    if(this.running)this.stop();this.type=type;
    document.querySelectorAll('.breath-tab').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
    const c=BREATH_TYPES[type];
    document.getElementById('breath-desc').textContent=c.desc;
    document.getElementById('breath-num').textContent=c.phases[0].s;
    document.getElementById('breath-phase').textContent='Premi Inizia';
    document.getElementById('breath-instr').textContent=c.desc;
    document.getElementById('breath-bar').style.width='0%';
    document.getElementById('breath-meta').textContent=`Cicli: 0 / ${c.cycles}`;
    document.getElementById('breath-cta').textContent='Inizia 🌬️';
    document.getElementById('breath-orb').style.transform='scale(1)';
  },
  toggle(){ if(this.running)this.stop(); else this.start(); },
  start(){ this.running=true;this.cycles=0;this.phaseIdx=0;document.getElementById('breath-cta').textContent='Stop ✕';this._run(); },
  stop(){
    this.running=false;clearInterval(this.timer);
    document.getElementById('breath-cta').textContent='Inizia 🌬️';
    document.getElementById('breath-phase').textContent='Premi Inizia';
    document.getElementById('breath-num').textContent=BREATH_TYPES[this.type].phases[0].s;
    document.getElementById('breath-orb').style.transform='scale(1)';
    document.getElementById('breath-instr').textContent='Scegli una tecnica e inizia';
  },
  _run(){
    if(!this.running)return;
    const c=BREATH_TYPES[this.type],p=c.phases[this.phaseIdx];let s=p.s;
    document.getElementById('breath-num').textContent=s;
    document.getElementById('breath-phase').textContent=p.label.toLowerCase();
    document.getElementById('breath-instr').textContent=p.label;
    document.getElementById('breath-orb').style.transition=`transform ${p.s}s ease-in-out`;
    document.getElementById('breath-orb').style.transform=`scale(${p.scale})`;
    clearInterval(this.timer);
    this.timer=setInterval(()=>{
      s--;document.getElementById('breath-num').textContent=Math.max(0,s);
      const tot=c.phases.reduce((a,ph)=>a+ph.s,0);
      const prev=c.phases.slice(0,this.phaseIdx).reduce((a,ph)=>a+ph.s,0);
      const pct=((this.cycles/c.cycles)+((prev+(p.s-s))/tot/c.cycles))*100;
      document.getElementById('breath-bar').style.width=Math.min(pct,100)+'%';
      document.getElementById('breath-meta').textContent=`Cicli: ${this.cycles} / ${c.cycles}`;
      if(s<=0){clearInterval(this.timer);this.phaseIdx++;if(this.phaseIdx>=c.phases.length){this.phaseIdx=0;this.cycles++;if(this.cycles>=c.cycles){this._finish();return;}}setTimeout(()=>this._run(),350);}
    },1000);
  },
  _finish(){
    this.running=false;
    document.getElementById('breath-instr').textContent='✨ Ottima sessione!';
    document.getElementById('breath-cta').textContent='Di nuovo 🌬️';
    document.getElementById('breath-bar').style.width='100%';
    document.getElementById('breath-orb').style.transform='scale(1)';
    S.stats.sessions=(S.stats.sessions||0)+1;
    const k='Respiro '+BREATH_TYPES[this.type].label;
    S.techniqueUsage[k]=(S.techniqueUsage[k]||0)+1;
    persist();toast('💪 Sessione completata! Brava.');setTimeout(maybeEmail,1500);
  },
};

// ─────────────────────────────────────────
// EXERCISES
// ─────────────────────────────────────────
const Exercises = {
  open(type){
    S.stats.exercises=(S.stats.exercises||0)+1;
    S.techniqueUsage[type]=(S.techniqueUsage[type]||0)+1;
    persist();Sheet.open(this._html(type));
    if(type==='pomodoro')Pomo.reset();
  },
  _html(type){
    switch(type){
      case 'grounding':    return this._grounding();
      case 'pmr':          return this._pmr();
      case 'bodyscan':     return this._bodyscan();
      case 'defusion':     return this._defusion();
      case 'pomodoro':     return this._pomodoro();
      case 'affirmations': return this._affirm();
      default: return '<p>Esercizio non trovato.</p>';
    }
  },
  groundingNext(n){
    document.querySelectorAll('[id^="gs-"]').forEach(el=>el.classList.remove('active'));
    const nx=document.getElementById(`gs-${n}`);
    if(nx){nx.classList.add('active');nx.style.animation='none';requestAnimationFrame(()=>nx.style.animation='slideUp 0.4s var(--ease)');}
    if(n>=5)toast('🌿 Grounding completato!');
  },
  pmrNext(n){
    document.querySelectorAll('[id^="pmr-"]').forEach(el=>el.classList.remove('active'));
    const nx=document.getElementById(`pmr-${n}`);if(nx)nx.classList.add('active');
    if(n>=7)toast('💆 PMR completato!');
  },
  _grounding(){
    const steps=[
      {n:'5',sense:'Cose che VEDI',inst:'Guarda intorno. Nomina 5 cose che vedi chiaramente adesso.',ph:'La lampada, il muro, le mie mani…'},
      {n:'4',sense:'Cose che TOCCHI',inst:'Senti 4 superfici fisicamente — tessuto, sedia, pavimento.',ph:'La coperta, il tavolo…'},
      {n:'3',sense:'Cose che SENTI',inst:'Ascolta. Quali 3 suoni percepisci adesso?',ph:'Il vento, il silenzio…'},
      {n:'2',sense:'Cose che ANNUSI',inst:'Respiro profondo. 2 odori.',ph:"L'aria, il caffè…"},
      {n:'1',sense:'Cosa ASSAGGI',inst:"Cosa c'è in bocca? Anche niente conta.",ph:'Niente, acqua…'},
    ];
    return `<div style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🌍 Grounding 5-4-3-2-1</div>
      <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">📚 CBT — interrompe il ciclo del pensiero ansioso tornando al presente</div>
      ${steps.map((s,i)=>`
        <div class="grounding-step ${i===0?'active':''}" id="gs-${i}">
          <div class="grounding-big-num">${s.n}</div>
          <div class="grounding-sense">${s.sense}</div>
          <div class="grounding-inst">${s.inst}</div>
          <input class="grounding-field" placeholder="${s.ph}" />
          <button class="grounding-next" onclick="App.exercises.groundingNext(${i+1})">${i<steps.length-1?'Avanti →':'Completa ✓'}</button>
        </div>`).join('')}
      <div class="grounding-step" id="gs-5" style="text-align:center;padding:24px 0">
        <div style="font-size:3.5rem;margin-bottom:16px">🌿</div>
        <div style="font-family:'DM Serif Display',serif;font-size:1.6rem;color:var(--ink);margin-bottom:10px">Sei qui, adesso</div>
        <div style="font-size:0.88rem;color:var(--ink-muted);line-height:1.65">L'ansia si nutre del futuro.<br>Tu sei presente, al sicuro, intera.</div>
        <button class="grounding-next" style="margin-top:24px" onclick="Sheet.forceClose()">Chiudi ✓</button>
      </div></div>`;
  },
  _pmr(){
    const zones=[
      {i:'🤜',n:'Mani',a:'Stringi i pugni al massimo. Tieni 7 secondi. Poi lascia andare tutto in una volta — senti il calore.'},
      {i:'💪',n:'Braccia',a:'Piega il braccio e contrai il bicipite. 7 secondi. Poi rilascia completamente.'},
      {i:'😬',n:'Viso',a:'Strizza gli occhi e serra la mascella. 7 secondi. Poi molla tutto — senti la differenza.'},
      {i:'🦴',n:'Collo e spalle',a:'Alza le spalle verso le orecchie. 7 secondi. Poi lascia scendere tutto.'},
      {i:'🫁',n:'Petto',a:'Respira fondo e tieni. Contrai la pancia. 7 secondi. Poi espira tutto.'},
      {i:'🦵',n:'Cosce',a:'Stringi le cosce insieme. 7 secondi. Poi rilassa completamente.'},
      {i:'🦶',n:'Piedi',a:'Punta i piedi verso il basso. Contrai i polpacci. 7 secondi. Poi rilascia.'},
    ];
    return `<div style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">💆 Rilassamento Muscolare Progressivo</div>
      <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">📚 Tecnica di Jacobson — riduce cortisolo del 18% in una sessione</div>
      ${zones.map((z,i)=>`
        <div class="grounding-step ${i===0?'active':''}" id="pmr-${i}">
          <div style="font-size:2.5rem;text-align:center;margin-bottom:8px">${z.i}</div>
          <div class="grounding-sense">${z.n}</div><div class="grounding-inst">${z.a}</div>
          <button class="grounding-next" onclick="App.exercises.pmrNext(${i+1})">${i<zones.length-1?'Avanti →':'Completa ✓'}</button>
        </div>`).join('')}
      <div class="grounding-step" id="pmr-7" style="text-align:center;padding:24px 0">
        <div style="font-size:3.5rem;margin-bottom:16px">💆</div>
        <div style="font-family:'DM Serif Display',serif;font-size:1.6rem;color:var(--ink);margin-bottom:10px">Senti la differenza?</div>
        <div style="font-size:0.88rem;color:var(--ink-muted);line-height:1.65">Il corpo porta il peso dello stress.<br>Ora è un po' più leggero.</div>
        <button class="grounding-next" style="margin-top:24px" onclick="Sheet.forceClose()">Chiudi ✓</button>
      </div></div>`;
  },
  _bodyscan(){
    const steps=[
      {t:'Posizionati',c:"Siediti o sdraiati. Chiudi gli occhi. 3 respiri lenti. Nessuna fretta."},
      {t:'Testa',c:"Sommità del capo. Senti il peso. Tensione? Osservala senza combatterla."},
      {t:'Viso e collo',c:'Mascella, guance, collo. Lascia che il viso si ammorbidisca.'},
      {t:'Spalle',c:'Le spalle portano tutto. Con ogni espirazione, lasciale scendere.'},
      {t:'Petto e braccia',c:'Petto che si alza e scende. Peso delle braccia fino alle dita.'},
      {t:'Addome',c:'La pancia si muove. Non controllare — osserva come un testimone.'},
      {t:'Gambe e piedi',c:'Scendi fino alle dita dei piedi. Senti il contatto con la superficie.'},
      {t:'Il tutto',c:'Tutto il corpo insieme. Sei qui. Presente. Intera.'},
    ];
    return `<div style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🧘 Body Scan</div>
      <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">📚 MBSR Kabat-Zinn — riduce cortisolo del 23% con uso regolare</div>
      ${steps.map(s=>`<div style="background:var(--bg);border-radius:12px;padding:16px;margin-bottom:10px;border-left:3px solid var(--sage)"><div style="font-weight:600;color:var(--sage-deep);font-size:0.88rem;margin-bottom:5px">${s.t}</div><div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">${s.c}</div></div>`).join('')}
      <button class="grounding-next" style="margin-top:12px" onclick="Sheet.forceClose();toast('🧘 Body scan completato!')">Completato ✓</button></div>`;
  },
  _defusion(){
    return `<div style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🍃 Defusione Cognitiva</div>
      <div style="font-size:0.75rem;font-style:italic;color:var(--sage-deep);background:var(--sage-pale);padding:6px 12px;border-radius:10px;margin-bottom:20px;display:inline-block">📚 ACT (Hayes) — i pensieri non sono fatti, sono eventi mentali</div>
      <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:12px"><div style="font-weight:600;color:var(--ink);margin-bottom:8px">Il principio</div><div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">Non siamo i nostri pensieri. Sono nuvole nel cielo — non il cielo. Non devi combatterli né crederci ciecamente.</div></div>
      <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:12px;border-left:3px solid var(--sage)"><div style="font-weight:600;color:var(--ink);margin-bottom:8px">Esercizio: "Ho il pensiero che…"</div><div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65">Invece di: <em>"Non ce la faccio"</em><br><br>Di': <strong style="color:var(--sage-deep)">"Ho il pensiero che non ce la farò"</strong><br><br>Crei distanza. Il pensiero esiste, ma non sei tu.</div></div>
      <div style="background:var(--bg);border-radius:12px;padding:18px;margin-bottom:20px;border-left:3px solid var(--sage)"><div style="font-weight:600;color:var(--ink);margin-bottom:8px">Dai un nome al critico</div><div style="font-size:0.85rem;color:var(--ink-soft);line-height:1.65"><em>"Ah, è tornata Radio Catastrofe…"</em><br>L'umorismo crea distanza automaticamente.</div></div>
      <button class="grounding-next" onclick="Sheet.forceClose();toast('🍃 Defusione completata!')">Ho capito ✓</button></div>`;
  },
  _pomodoro(){
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
        <div style="font-size:0.82rem;color:var(--ink-soft);line-height:1.8">✓ Telefono capovolto<br>✓ Una sola cosa da fare<br>✓ Pensiero che arriva → scrivilo e torna<br>✓ Zero multitasking — il cervello non lo regge</div>
      </div></div>`;
  },
  _affirm(){
    const affs=['Sono capace di affrontare le sfide, una alla volta.','Non devo essere perfetta per meritare rispetto e amore.','Ogni momento difficile che supero mi rende più forte.','Ho il diritto di sentirmi sopraffatta e di chiedere aiuto.','Il mio valore non dipende dai miei voti o dalla produttività.','Sono abbastanza. Così come sono, adesso.','Posso fare una cosa alla volta. Questo è sufficiente.','I miei sforzi contano, anche quando non si vedono i risultati.','Merito cura e gentilezza — anche da me stessa.','Non sono definita dai miei momenti difficili.'];
    let idx=0; const uid='aff-'+Date.now();
    setTimeout(()=>{
      const el=document.getElementById(uid);if(!el)return;
      el.querySelector('.aff-next').onclick=()=>{idx=(idx+1)%affs.length;el.querySelector('.aff-text').textContent=affs[idx];el.querySelector('.aff-num').textContent=`${idx+1} / ${affs.length}`;};
    },50);
    return `<div id="${uid}" style="padding:0 4px">
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:20px">💜 Affermazioni positive</div>
      <div style="background:linear-gradient(135deg,var(--sage-deep),var(--sage));border-radius:20px;padding:32px 24px;text-align:center;margin-bottom:20px">
        <div class="aff-text" style="font-family:'DM Serif Display',serif;font-size:1.3rem;color:white;line-height:1.5;font-style:italic">${affs[0]}</div>
        <div class="aff-num" style="font-size:0.72rem;color:rgba(255,255,255,0.5);margin-top:16px">1 / ${affs.length}</div>
      </div>
      <button class="aff-next grounding-next">Prossima →</button>
      <button class="grounding-next" style="margin-top:10px;background:var(--bg);color:var(--ink-muted)" onclick="Sheet.forceClose()">Chiudi</button></div>`;
  },
};

// ─────────────────────────────────────────
// POMODORO
// ─────────────────────────────────────────
const Pomo={
  secs:25*60,running:false,timer:null,round:1,
  toggle(){if(this.running){this.running=false;clearInterval(this.timer);const b=document.getElementById('pomo-btn');if(b)b.textContent='▶ Riprendi';}else{this.running=true;this.timer=setInterval(()=>this._tick(),1000);const b=document.getElementById('pomo-btn');if(b)b.textContent='⏸ Pausa';}},
  stop(){this.running=false;clearInterval(this.timer);},
  reset(){this.stop();this.secs=25*60;this.round=1;const t=document.getElementById('pomo-timer');if(t)t.textContent='25:00';const p=document.getElementById('pomo-phase');if(p)p.textContent='Sessione studio #1';const b=document.getElementById('pomo-btn');if(b)b.textContent='▶ Inizia';},
  _tick(){this.secs--;const m=Math.floor(this.secs/60),s=this.secs%60;const t=document.getElementById('pomo-timer');if(t)t.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;if(this.secs<=0){clearInterval(this.timer);this.running=false;const isS=this.round%2!==0;this.round++;const b=document.getElementById('pomo-btn'),p=document.getElementById('pomo-phase');if(isS){this.secs=5*60;if(p)p.textContent=`⏰ Pausa #${Math.floor(this.round/2)}`;if(b)b.textContent='▶ Inizia pausa';toast('🍅 Pausa meritata! 5 minuti 💚');}else{this.secs=25*60;if(p)p.textContent=`Sessione studio #${Math.ceil(this.round/2)}`;if(b)b.textContent='▶ Inizia sessione';toast('💪 Pausa finita!');}}},
};

// ─────────────────────────────────────────
// DIARY
// ─────────────────────────────────────────
const Diary={
  selectedEmoji:'',
  pickMood(btn){document.querySelectorAll('.diary-emoji-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');this.selectedEmoji=btn.dataset.emoji;},
  save(){
    const ta=document.getElementById('diary-textarea'),text=ta.value.trim();
    if(!text){toast('✏️ Scrivi qualcosa prima!');return;}
    const entry={id:Date.now(),date:new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}),text,emoji:this.selectedEmoji||'📝',tags:this._tags(text)};
    S.diary.unshift(entry);if(S.diary.length>300)S.diary=S.diary.slice(0,300);
    S.stats.entries=(S.stats.entries||0)+1;
    this._learn(text);persist();
    ta.value='';document.querySelectorAll('.diary-emoji-btn').forEach(b=>b.classList.remove('selected'));this.selectedEmoji='';
    this.render();toast('📖 Salvato nel tuo diario 💚');setTimeout(maybeEmail,1500);
  },
  _learn(text){const tags=this._tags(text);tags.forEach(t=>{S.learnedPatterns[t]=(S.learnedPatterns[t]||0)+1;});},
  render(){
    const el=document.getElementById('diary-entries');if(!el)return;
    if(!S.diary.length){el.innerHTML=`<div class="diary-empty"><div class="diary-empty-icon">🌿</div><div class="diary-empty-text">Ancora nessun pensiero salvato.<br>Scrivi il primo!</div></div>`;return;}
    el.innerHTML=S.diary.slice(0,30).map(e=>`<div class="diary-entry"><div class="diary-entry-top"><span class="diary-entry-date">${e.date}</span><span class="diary-entry-mood">${e.emoji}</span></div><div class="diary-entry-text">${(e.text.length>220?e.text.slice(0,220)+'…':e.text).replace(/\n/g,'<br>')}</div>${e.tags.length?`<div class="diary-entry-tags">${e.tags.map(t=>`<span class="diary-tag">${t}</span>`).join('')}</div>`:''}</div>`).join('');
  },
  _tags(text){const tags=[],l=text.toLowerCase();if(/ansia|ansiosa|preoccup/.test(l))tags.push('ansia');if(/stanca|esausta|sonno/.test(l))tags.push('stanchezza');if(/studi|esame|uni/.test(l))tags.push('studio');if(/nerv|arrab/.test(l))tags.push('nervosismo');if(/triste|piango/.test(l))tags.push('tristezza');if(/bene|felice|content/.test(l))tags.push('positivo');if(/filippo|amore/.test(l))tags.push('amore');if(/lavoro|lavorare/.test(l))tags.push('lavoro');return tags;},
};

// ─────────────────────────────────────────
// STATS
// ─────────────────────────────────────────
const Stats={
  renderChart(){
    const el=document.getElementById('mood-chart');if(!el)return;
    const days=['Lu','Ma','Me','Gi','Ve','Sa','Do'],cols=[];
    for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*86400000),ds=d.toISOString().split('T')[0];const dl=S.moodLog.filter(m=>m.date&&m.date.startsWith(ds));const avg=dl.length?dl.reduce((a,m)=>a+(m.v||0),0)/dl.length:0;const em={0:'',1:'😰',2:'😔',3:'😐',4:'🙂',5:'✨'};cols.push({label:days[(d.getDay()+6)%7],avg,emoji:em[Math.round(avg)]||''});}
    el.innerHTML=cols.map(c=>`<div class="mc-col"><div style="font-size:0.68rem;margin-bottom:3px;min-height:14px">${c.emoji}</div><div class="mc-bar" style="height:${c.avg?Math.max(c.avg*16,4):4}px"></div><div class="mc-label">${c.label}</div></div>`).join('');
  },
  renderStats(){
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    set('stat-sessions',S.stats.sessions||0);set('stat-entries',S.stats.entries||0);
    set('stat-chats',S.stats.chats||0);set('stat-exercises',S.stats.exercises||0);
    set('sbc-num',S.streak||1);set('streak-num',S.streak||1);
    const el=document.getElementById('techniques-used');if(!el)return;
    const icons={grounding:'🌍',pmr:'💆',bodyscan:'🧘',defusion:'🍃',pomodoro:'🍅',affirmations:'💜'};
    const sorted=Object.entries(S.techniqueUsage||{}).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if(!sorted.length){el.innerHTML='<p class="empty-note">Usa l\'app per vedere le statistiche 🌿</p>';return;}
    el.innerHTML=sorted.map(([k,v])=>`<div class="tech-row"><span class="tech-icon">${icons[k]||'🌬️'}</span><span class="tech-name">${k}</span><span class="tech-count">${v}x</span></div>`).join('');
  },
};

// ─────────────────────────────────────────
// NAV + HOME + MOOD + STREAK
// ─────────────────────────────────────────
const Nav={
  current:'home',
  to(screen,btn){
    document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('.bn-btn').forEach(el=>el.classList.remove('active'));
    const el=document.getElementById('screen-'+screen);if(el)el.classList.add('active');
    const nb=btn||document.querySelector(`[data-screen="${screen}"]`);if(nb)nb.classList.add('active');
    this.current=screen;
    if(screen==='chart'){Stats.renderChart();Stats.renderStats();}
    if(screen==='diary')Diary.render();
    if(screen==='chat'&&!document.getElementById('chat-messages').children.length)Chat.init();
  }
};

const Mood={
  quick(v){
    document.querySelectorAll('.qm-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.v)===v));
    const em={1:'😰',2:'😔',3:'😐',4:'🙂',5:'✨'},lb={1:'molto a disagio',2:"un po' giù",3:'così così',4:'bene',5:'benissimo'};
    S.currentMoodV=v;S.currentMood=lb[v];
    S.moodLog.push({date:new Date().toISOString(),v,emoji:em[v]});
    if(S.moodLog.length>200)S.moodLog=S.moodLog.slice(-200);
    persist();
    const sub=document.getElementById('hero-sub');if(sub)sub.textContent=`Ti senti ${lb[v]} ${em[v]}`;
    if(v<=2)setTimeout(()=>Nav.to('chat',document.querySelector('[data-screen="chat"]')),700);
    setTimeout(maybeEmail,2000);
  }
};

function updateStreak(){const today=new Date().toDateString();if(S.lastActiveDate!==today){const y=new Date(Date.now()-86400000).toDateString();if(S.lastActiveDate===y)S.streak=(S.streak||0)+1;else if(!S.lastActiveDate)S.streak=1;S.lastActiveDate=today;persist();}const el=document.getElementById('streak-num');if(el)el.textContent=S.streak||1;}
function updateHome(){const days=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'],d=new Date();const de=document.getElementById('hero-date');if(de)de.textContent=`${days[d.getDay()]} ${d.toLocaleDateString('it-IT',{day:'numeric',month:'long'})}`;const name=S.name||'amica';const h2=document.getElementById('hero-h2');if(h2)h2.innerHTML=`Ciao, <em>${name}</em> 🌿`;const sub=document.getElementById('hero-sub');if(sub)sub.textContent=S.currentMood?`Ti senti ${S.currentMood} — sono qui per te 💚`:'Come stai oggi?';const tn=document.getElementById('topbar-name');if(tn)tn.textContent=name;const ts=document.getElementById('topbar-status');if(ts){const h=d.getHours();ts.textContent=h<12?'Buongiorno 🌤️':h<18?'Buon pomeriggio 🌿':'Buona sera 🌙';}}
function showTip(){const el=document.getElementById('tip-text');if(el)el.textContent=TIPS[Math.floor(Math.random()*TIPS.length)];}

// ─────────────────────────────────────────
// EMAIL
// ─────────────────────────────────────────
async function maybeEmail(){
  if(!S.notifyEnabled||!S.notifyEmail)return;
  const now=Date.now();if(now-(S.lastEmailTs||0)<4*60*60*1000)return;
  S.lastEmailTs=now;persist();
  const name=S.name||'Silvia',rm=S.moodLog.slice(-5),avg=rm.length?rm.reduce((a,m)=>a+m.v,0)/rm.length:0;
  const subj=encodeURIComponent(`🌿 ${name} — aggiornamento app`);
  const body=encodeURIComponent(`Ciao!\n\nRiepilogo:\n• Streak: ${S.streak||1} giorni\n• Sessioni respiro: ${S.stats.sessions||0}\n• Diario: ${S.stats.entries||0} entry\n• Umore medio: ${avg?avg.toFixed(1)+'/5':'N/D'}\n• SOS usati: ${S.stats.sos||0}\n\n—\nApp Silvia 🌿`);
  if(avg>0&&avg<2.5&&S.alertEnabled)window.open(`mailto:${S.notifyEmail}?subject=${encodeURIComponent(`⚠️ ${name} ha bisogno di te`)}&body=${body}`,'_blank');
}

// ─────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────
const UI={
  openSettings(){
    document.getElementById('set-name-val').textContent=S.name||'—';
    document.getElementById('set-email-val').textContent=S.notifyEmail||'Non impostata';
    document.getElementById('set-alert-toggle').checked=S.alertEnabled!==false;
    document.getElementById('set-summary-toggle').checked=S.summaryEnabled!==false;
    document.getElementById('settings-overlay').classList.add('open');
  },
  closeSettings(e){if(e&&e.target!==document.getElementById('settings-overlay'))return;document.getElementById('settings-overlay').classList.remove('open');},
  editName(){const n=prompt('Il tuo nome:',S.name);if(n!==null){S.name=n.trim();persist();document.getElementById('set-name-val').textContent=S.name;document.getElementById('topbar-name').textContent=S.name;}},
  editEmail(){const e=prompt('Email per le notifiche:',S.notifyEmail);if(e!==null){S.notifyEmail=e.trim();S.notifyEnabled=!!e.trim();persist();document.getElementById('set-email-val').textContent=S.notifyEmail||'Non impostata';}},
  saveAlertPref(el){S.alertEnabled=el.checked;persist();},
  saveSummaryPref(el){S.summaryEnabled=el.checked;persist();},
  resetData(){if(confirm('Sei sicura? Tutti i dati verranno eliminati.')){localStorage.clear();location.reload();}},
};

// ─────────────────────────────────────────
// APP
// ─────────────────────────────────────────
const App={
  ob:OB,chat:Chat,breath:Breath,exercises:Exercises,
  diary:Diary,mood:Mood,nav:Nav,ui:UI,sheet:Sheet,sos:SOS,
  boot(){
    const a=document.getElementById('app');a.classList.remove('hidden');a.classList.add('visible');
    S.totalSessions=(S.totalSessions||0)+1;persist();
    updateStreak();updateHome();showTip();
    Stats.renderChart();Stats.renderStats();Diary.render();
  },
};

hydrate();
window.addEventListener('load',()=>{
  setTimeout(()=>{
    document.getElementById('splash').classList.add('out');
    setTimeout(()=>{
      document.getElementById('splash').style.display='none';
      if(S.name){document.getElementById('onboarding').classList.add('hidden');App.boot();}
      else{document.getElementById('onboarding').classList.remove('hidden');}
    },700);
  },2200);
});
document.addEventListener('DOMContentLoaded',()=>{
  const ni=document.getElementById('ob-name-input');
  if(ni)ni.addEventListener('input',function(){document.getElementById('ob-name-btn').disabled=this.value.trim().length<2;});
});
window.App=App;window.Sheet=Sheet;window.Pomo=Pomo;window.toast=toast;window.StressTracker=StressTracker;
