'use strict';
/* SILVIA v5 — app.js
   Engine psicologico locale, chat che funziona sempre,
   onboarding profondo, log email, zero API key */

// ─── TIPS ───
const TIPS = [
  'Respirare lentamente per 60 secondi attiva il nervo vago e abbassa il battito cardiaco entro 2 minuti.',
  'Scrivere le proprie preoccupazioni per 10 minuti prima di un esame migliora la performance del 15% (Ramirez & Beilock, 2011).',
  'Il grounding 5-4-3-2-1 interrompe un attacco di panico in media in 3-5 minuti.',
  'Dormire 7-8 ore migliora la memorizzazione del 40% rispetto a dormire meno di 6.',
  'Il 90% dei pensieri ansiosi non si realizza mai (Penn State University).',
  'La self-compassion riduce l\'autocritica più efficacemente dell\'autostima (Kristin Neff).',
  'Il PMR abbassa il cortisolo del 18% in una singola sessione di 10 minuti.',
  'La meditazione body scan per 8 settimane riduce il volume dell\'amigdala (Harvard, 2011).',
  'La scrittura espressiva per 3 giorni consecutivi migliora l\'umore per settimane (Pennebaker, 1997).',
  'L\'esercizio fisico di 20 minuti ha effetti ansiolitici paragonabili a una dose bassa di farmaci.',
];

// ─── STATE ───
let S = {
  name:'', notifyEmail:'', notifyEnabled:false, alertEnabled:true,
  style:'misto', triggers:[],
  currentMood:'', currentMoodV:0,
  chatHistory:[], diary:[], moodLog:[],
  stats:{sessions:0,entries:0,chats:0,exercises:0,sos:0},
  streak:0, lastActiveDate:null,
  techniqueUsage:{}, lastEmailTs:0, totalSessions:0,
  sessionTopics:[], usedIdx:{},
  stressLog:[], sosHistory:[],
  learnedPatterns:{},
};
function persist(){try{localStorage.setItem('silvia_v5',JSON.stringify(S));}catch(e){}}
function hydrate(){
  try{
    const r=localStorage.getItem('silvia_v5')||localStorage.getItem('silvia_v4')||localStorage.getItem('silvia_v3');
    if(r) S={...S,...JSON.parse(r)};
  }catch(e){}
}

// ─── TOAST ───
let _tt=null;
function toast(msg,ms=3200){
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),ms);
}

// ─── SHEET ───
const Sheet={
  open(html){document.getElementById('sheet-body').innerHTML=html;document.getElementById('sheet-ov').classList.add('open');},
  close(e){if(e&&e.target!==document.getElementById('sheet-ov'))return;document.getElementById('sheet-ov').classList.remove('open');Pomo.stop();},
  forceClose(){document.getElementById('sheet-ov').classList.remove('open');Pomo.stop();}
};

// ─── ONBOARDING ───
const OB={
  step:0, selectedMood:null, triggers:[], style:null,
  screens:['ob-0','ob-1','ob-2','ob-3','ob-4','ob-5'],

  _show(n){
    const prev=document.getElementById(this.screens[this.step]);
    if(prev){prev.classList.remove('active');prev.classList.add('exit');setTimeout(()=>prev.classList.remove('exit'),500);}
    this.step=n;
    const next=document.getElementById(this.screens[n]);
    if(next){next.classList.add('active');}
  },

  next(){this._show(this.step+1);},

  saveName(){
    const v=document.getElementById('ob-name').value.trim();
    if(!v)return;
    S.name=v;
    document.getElementById('ob-2-title').innerHTML=`Come stai<br><em>${v}?</em>`;
    this.next();
  },

  pickMood(btn){
    document.querySelectorAll('.ob-mood').forEach(b=>b.classList.remove('sel'));
    btn.classList.add('sel');
    this.selectedMood={label:btn.dataset.m,emoji:btn.dataset.e,v:parseInt(btn.dataset.v)};
    document.getElementById('ob-mood-emoji').textContent=btn.dataset.e;
    document.getElementById('ob-btn-2').disabled=false;
  },

  toggleCheck(btn){btn.classList.toggle('sel');this.triggers=Array.from(document.querySelectorAll('.ob-check.sel')).map(b=>b.dataset.k);},

  pickStyle(btn){
    document.querySelectorAll('.ob-radio').forEach(b=>b.classList.remove('sel'));
    btn.classList.add('sel');this.style=btn.dataset.k;
    document.getElementById('ob-btn-4').disabled=false;
  },

  toggleNotify(el){document.getElementById('ob-email-wrap').classList.toggle('hidden',!el.checked);},

  finish(){
    if(this.selectedMood){S.currentMood=this.selectedMood.label;S.currentMoodV=this.selectedMood.v;S.moodLog.push({date:new Date().toISOString(),v:this.selectedMood.v,emoji:this.selectedMood.emoji});}
    S.triggers=this.triggers;
    S.style=this.style||'misto';
    const tog=document.getElementById('ob-notify');S.notifyEnabled=tog?tog.checked:false;
    const em=document.getElementById('ob-email');if(em)S.notifyEmail=em.value.trim();
    persist();
    document.getElementById('onboarding').classList.add('hidden');
    App.boot();
  }
};

// ══════════════════════════════════════════
//  CHAT ENGINE v5
//  Funziona SEMPRE — niente fallback generico
//  Risposta lunga anche su messaggi brevi
// ══════════════════════════════════════════

const Engine={

  // ── DETECT: analisi semantica ──
  detect(text){
    const t=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const has=(...p)=>p.some(x=>typeof x==='string'?t.includes(x):x.test(t));
    return{
      // Crisi / urgenza
      crisi:     has('non ce la faccio piu','voglio mollare','basta con tutto','non reggo','sto crollando','non ne posso piu','voglio sparire','vorrei morire','voglio morire','mi voglio fare del male',/non (ce la |)faccio (piu|più)/),
      panico:    has('attacco di panico','non respiro','cuore che scoppia','mi tremano','sto svenendo','non riesco a respirare','panico totale'),
      // Intensità
      alta:      has('molta ansia','ansia forte','tantissima ansia','terrorizzata','terrore','paura enorme'),
      media:     has('ansiosa','nervosa','agitata','preoccupata','stressata','in ansia'),
      bassa:     has('un po giu','non benissimo','cosi cosi','abbastanza stanca','non mi va niente','svogliata'),
      // Temi
      esame:     has('esame','esami','studiare','studio','universita','uni','lezione','materia','prof','voto','bocciata','sessione','tesi','laurea'),
      lavoro:    has('lavoro','lavorare','capo','colleghi','ufficio','stage','tirocinio','turno','stipendio','licenziata','troppo lavoro'),
      stanchezza:has('stanca','esausta','sfinita','non dormo','sonno','dormire','distrutta','a pezzi','non ho energie','svuotata'),
      tristezza: has('triste','tristezza','piango','pianto','male','vuoto','vuota','abbattuta','malinconia','depressa','depressione','non sto bene','sto malissimo','sto male','tutto fa schifo','non va niente','sto da schifo','fa tutto schifo'),
      rabbia:    has('arrabbiata','incazzata','incazzatissima','nervosa','odio','fastidio','non sopporto','irritata','furiosa','mandare a fanculo'),
      solitudine:has('sola','nessuno','non mi capisce','abbandonata','isolata','mi sento invisibile','nessuno mi ascolta'),
      autostima: has('non valgo','sono stupida','non sono capace','fallita','sbagliata','non sono abbastanza','incapace','inutile','sono un disastro','sono uno schifo'),
      corpo:     has('mal di testa','nausea','stomaco','tensione','spalle','collo','mal di schiena','dolore','mi fa male'),
      relazione: has('filippo','fidanzato','coppia','litigato','discussione','lui','amore','mi manca','storia'),
      futuro:    has('futuro','non so cosa fare','cosa succedera','come faro','paura del futuro','non so dove vado'),
      rimpianto: has('avrei dovuto','ho sbagliato','mi pento','rimpianto','se avessi','colpa mia'),
      positivo:  has('bene','benissimo','felice','contenta','ho studiato','ce la faccio','riuscita','migliorata','finalmente','sollievo','orgogliosa'),
      breve:     text.trim().split(/\s+/).length<=6,
      // Richieste
      vuoleAiuto:has('cosa faccio','come faccio','aiutami','cosa dovrei','consiglio','suggerisci','come posso','cosa posso fare'),
      vuoleEsercizio:has('esercizio','tecnica','respiro','calmarmi','rilassarmi','aiuto pratico'),
    };
  },

  // ── CLASSIFY: categoria principale ──
  classify(sig,ctx){
    // Se ha già ricevuto risposta su questo topic, vai in profondità
    if(sig.crisi||sig.panico)            return 'crisi';
    if(sig.tristezza&&sig.autostima)     return 'triste_autostima';
    if(sig.autostima)                    return 'autostima';
    if(sig.tristezza)                    return 'tristezza';
    if(sig.alta||sig.panico)             return 'ansia_alta';
    if(sig.rabbia)                       return 'rabbia';
    if(sig.stanchezza&&sig.lavoro)       return 'burnout';
    if(sig.stanchezza)                   return 'stanchezza';
    if(sig.lavoro)                       return 'lavoro';
    if(sig.esame)                        return 'esame';
    if(sig.media)                        return 'ansia_media';
    if(sig.relazione)                    return 'relazione';
    if(sig.futuro)                       return 'futuro';
    if(sig.rimpianto)                    return 'rimpianto';
    if(sig.positivo)                     return 'positivo';
    if(sig.corpo)                        return 'corpo';
    if(sig.breve)                        return 'breve';
    if(sig.vuoleAiuto||sig.vuoleEsercizio) return 'consigli';
    // Se siamo già in conversazione, continua il tema precedente
    if(ctx.topics.length>0)              return 'approfondimento';
    return 'apertura';
  },

  // ── PICK: scelta risposta non ripetuta ──
  pick(cat,pool){
    if(!S.usedIdx[cat])S.usedIdx[cat]=[];
    const used=S.usedIdx[cat];
    const available=pool.map((_,i)=>i).filter(i=>!used.includes(i));
    const candidates=available.length>0?available:pool.map((_,i)=>i);
    const idx=candidates[Math.floor(Math.random()*candidates.length)];
    S.usedIdx[cat]=[...used,idx].slice(-Math.floor(pool.length*0.7));
    return pool[idx];
  },

  // ── CONTEXT ──
  ctx(){
    const recentMoods=S.moodLog.slice(-7);
    const avgMood=recentMoods.length?recentMoods.reduce((a,m)=>a+m.v,0)/recentMoods.length:3;
    const allDiary=S.diary.map(e=>e.text.toLowerCase()).join(' ');
    return{
      topics:S.sessionTopics||[],
      turns:S.chatHistory.length,
      avgMood,
      anxietyRecurring:(allDiary.match(/ansia|ansiosa|preoccup/g)||[]).length>4,
      examRecurring:(allDiary.match(/esame|studio/g)||[]).length>3,
      fatigueRecurring:(allDiary.match(/stanca|esausta/g)||[]).length>3,
      name:S.name||'cara',
      style:S.style||'misto',
    };
  },

  // ── RESPOND ──
  respond(text){
    const sig=this.detect(text);
    const ctx=this.ctx();
    const cat=this.classify(sig,ctx);
    const name=ctx.name;

    // Aggiorna topics sessione
    ['esame','lavoro','tristezza','ansia','relazione','autostima'].forEach(t=>{
      if(sig[t==='ansia'?'media':t]&&!ctx.topics.includes(t))S.sessionTopics.push(t);
    });

    return this.generate(cat,sig,ctx,name);
  },

  generate(cat,sig,ctx,name){
    const pools={

// ══ CRISI ══
crisi:[
  `${name}, ti sento. Quello che porti adesso è troppo pesante da reggere da sola — e non devi.\n\nPrima di tutto: sei al sicuro fisicamente adesso?\n\nNon ti chiedo di stare bene. Ti chiedo solo di dirmi cosa sta succedendo — tutto, anche in modo disordinato. Sono qui.`,
  `"Non ce la faccio più" — queste parole mi dicono che sei arrivata al limite. Non è debolezza. È esaurimento reale.\n\nIn CBT sappiamo che quando siamo a questo punto, la mente distorce tutto: fa sembrare permanente quello che è temporaneo. Non è la realtà — è l'effetto del sovraccarico.\n\nDimmi: cos'è la cosa più pesante in questo momento? Una sola.`,
  `Fermati un secondo con me. Respira.\n\nQuando tutto crolla insieme, il cervello va in shutdown — non riesce più a distinguere i problemi, li sente tutti come uno solo enorme. Ma non lo è.\n\nSono qui con te. Cosa è successo oggi?`,
  `${name}, il fatto che tu sia qui e che lo stia dicendo è già qualcosa. Non tenere tutto dentro.\n\nCi sono spesso livelli sovrapposti quando si arriva a questo punto — stanchezza fisica, pressione mentale, e sotto tutto una solitudine profonda. Senti anche quello?\n\nDimmi come è andata questa giornata — dall'inizio.`,
  `Ti ascolto. Quello che sento è una persona che ha dato tantissimo ed è rimasta a zero.\n\nIn psicologia questo si chiama esaurimento delle risorse cognitive ed emotive — non è "essere debole". È una risposta fisiologica a un carico troppo lungo.\n\nLa prima cosa: non risolvere niente adesso. Stai respirando? Dove sei fisicamente in questo momento?`,
],

// ══ TRISTEZZA ══
tristezza:[
  `"Sto malissimo" — grazie per dirmelo. So che a volte anche solo scriverlo costa tantissimo.\n\nLa tristezza ha mille forme diverse: quella che viene dalla stanchezza, quella dalla delusione, quella che arriva e basta senza un perché chiaro.\n\nQual è la tua? Da dove viene, se riesci a sentirlo?`,
  `Quando dici che stai malissimo e che tutto fa schifo, sento qualcuno che porta troppe cose insieme — non una sola grande, ma tante piccole che sommandosi diventano un muro.\n\nNon ti chiedo di stare bene. Ti chiedo di restare qui un momento con me.\n\nCosa è successo oggi che ha reso tutto più pesante?`,
  `La depressione — anche quella del "periodo no" — ha una caratteristica brutta: mente. Dice che è sempre stato così e sempre sarà così. Non è vero, ma lo sembra con una forza enorme.\n\nDue cose che la ricerca ci dice aiutano subito anche solo un po': il movimento (anche 10 minuti) e la connessione (anche solo questa conversazione).\n\nDimmi com'è andata la tua giornata — dall'inizio.`,
  `Non stai bene. L'ho sentito.\n\nA volte non serve analizzare tutto subito. A volte serve solo che qualcuno sia lì. Ci sono.\n\nSe vuoi, dimmi tutto — anche in modo disordinato, anche senza logica. Non devi fare la sintesi di come stai. Parla e basta.`,
  `Quello che descrivi — l'umore a terra, il non avere voglia di niente, il sentire che tutto pesa — è il cervello che non riesce a produrre le risorse di cui ha bisogno. Non è pigrizia. Non è colpa tua.\n\nE si lavora su questo. Ma prima: sei al sicuro? Come ti senti fisicamente adesso?`,
  `Stare malissimo non richiede una spiegazione o una giustificazione. Stai male e basta — e questo è già abbastanza per essere qui e parlarne.\n\nCosa ti farebbe sentire anche solo un grammo meglio adesso? Anche qualcosa di piccolo, anche qualcosa di stupido.`,
  `La tristezza che senti ha diritto di esserci. Non devi combatterla, spiegarla o scusarla.\n\nIn ACT facciamo una cosa sola: la osserviamo senza identificarci con lei. "Sto attraversando la tristezza" — non "sono triste" come se fosse un'identità permanente.\n\nDa quanto va avanti questo periodo?`,
],

// ══ AUTOSTIMA ══
autostima:[
  `Aspetta — hai appena detto una cosa molto dura su di te. Voglio fermarmi qui.\n\nIn CBT la chiamiamo "etichettatura" — quando il cervello prende un episodio ("ho sbagliato qualcosa") e lo trasforma in un'identità ("sono sbagliata"). È uno degli errori cognitivi più comuni e più dolorosi.\n\nLa voce dura che ti parla così — è tua, o l'hai imparata da qualcuno?`,
  `"Non sono abbastanza / sono uno schifo / sono stupida" — so quanto fa male sentire queste cose nella propria testa.\n\nMa queste non sono verità. Sono pensieri. E i pensieri non sono fatti.\n\nSe una tua amica ti dicesse esattamente le stesse cose di se stessa, cosa le risponderesti?`,
  `L'autostima bassa funziona come un filtro distorto — filtra via tutte le prove che ti contraddicono e trattiene solo quelle negative. Come avere un avvocato dell'accusa nella testa, senza difensore.\n\nFacciamo questo: dimmi una cosa — anche piccola, anche banale — che hai fatto questa settimana che ha richiesto impegno o coraggio.`,
  `Il critico interiore ha una voce forte quando siamo già sotto pressione. Non è la tua voce vera — è una parte di te che ha imparato a essere dura per proteggerti. Ma spesso esagera molto.\n\nDa quanto hai questa sensazione di non valere abbastanza? È sempre stata lì o è peggiorata in questo periodo?`,
  `In ACT c'è una distinzione importante: il sé osservante (chi sei davvero) e il sé concettualizzato (l'immagine distorta che abbiamo di noi stessi).\n\nQuello che stai descrivendo è il secondo — una storia che la mente ha costruito, non la realtà.\n\nCosa ha scatenato questi pensieri oggi, nello specifico?`,
  `La self-compassion — trattarsi con la gentilezza che riserveresti a una cara amica — è più efficace dell'autostima nel lungo periodo (Kristin Neff, Harvard).\n\nNon ti chiedo di volersi bene su comando. Ti chiedo solo: riesci a trattarti con un po' meno severità, solo per oggi?`,
],

// ══ TRISTEZZA + AUTOSTIMA ══
triste_autostima:[
  `Due cose insieme — tristezza e pensieri duri su di te. È una combinazione che si alimenta a vicenda: più si sta male, più il critico interno si fa sentire. E più si ascolta il critico, più si sta male.\n\nVorrei capire da dove viene tutto questo. C'è stato qualcosa di specifico — un episodio, una parola, una situazione — che ha fatto scattare questo oggi?`,
  `Stare male e contemporaneamente credere di essere la causa del proprio star male — è un peso doppio. E so che quando si è in quel posto, sembra verissimo.\n\nNon ti chiedo di non crederci. Ti chiedo solo di mettere in pausa il giudizio per qualche minuto e dirmi cosa è successo — i fatti, non le interpretazioni.`,
  `Quando siamo giù, la mente cerca cause interne: "è colpa mia, sono sbagliata." È un meccanismo automatico del cervello — cerca controllo anche quando non ce l'ha.\n\nMa stare male non è una colpa. È qualcosa che sta succedendo a te, non qualcosa che sei.\n\nDimmi tutto, senza filtri.`,
],

// ══ ANSIA ALTA ══
ansia_alta:[
  `Quello che descrivi è il sistema nervoso in modalità allarme — non stai diventando matta, è fisiologia.\n\nLa cosa più efficace adesso non è pensare, è fare qualcosa con il corpo. Prova questo: metti i piedi sul pavimento, inspira 4 secondi, espira 6 secondi. Ripeti 3 volte.\n\nFatto? Come stai adesso? Da quando hai questa sensazione?`,
  `L'ansia alta ci fa credere che dovremmo risolvere tutto subito — ma è esattamente questa urgenza che la alimenta.\n\nIl sistema nervoso si calma con segnali fisici di sicurezza. Tre cose adesso: siediti se non sei seduta, metti una mano sul petto, respira come se stessi appannando uno specchio — lento, costante.\n\nCosa stava succedendo prima che iniziasse?`,
  `Ansia forte. Ci sono con te.\n\nLa ricerca ci dice che la cosa più efficace nei primi 5 minuti è rallentare il respiro — il nervo vago risponde direttamente alla velocità dell'espirazione.\n\nEspira il più lentamente possibile. Poi dimmi: cosa ha fatto scattare questo?`,
  `Ansia su tutto insieme — è il tipo più logorante, perché non ha un oggetto preciso. In DBT la chiamiamo "flooding emotivo" — le emozioni sommergono la capacità di elaborare.\n\nNon si ragiona via dall'ansia in flooding. Prima si calma il corpo, poi si pensa.\n\nDove la senti di più — petto, stomaco, testa, gola?`,
],

// ══ ANSIA MEDIA ══
ansia_media:[
  `L'ansia che senti — da dove arriva? A volte ha un oggetto preciso, a volte fluttua senza un'ancora chiara. Entrambi i tipi esistono.\n\nDimmi: l'ansia che hai adesso ha un nome? C'è qualcosa di specifico che la alimenta?`,
  `Quando si è "in ansia e basta" — quella sensazione diffusa di fondo — spesso ci sono troppe cose non risolte che girano in background. Come troppi processi aperti sul computer.\n\nUna tecnica CBT molto efficace è il "brain dump": scrivi tutto quello che ti preoccupa, senza ordine. Solo per tirarle fuori dalla testa. Lo hai mai provato?`,
  `L'ansia è scomoda, ma ascoltarla può essere utile. Ci dice che c'è qualcosa a cui teniamo.\n\nSe l'ansia potesse parlare, cosa direbbe? Di cosa ha paura davvero, sotto sotto?`,
  `Quanto su una scala da 1 a 10? E da quando? Questi due dati mi dicono cose diverse e cambiano come rispondere nel modo più utile per te.\n\nE c'è un momento della giornata in cui è peggio?`,
  `In ACT l'ansia non viene combattuta — viene accettata. Non perché sia piacevole, ma perché la lotta contro di essa la amplifica.\n\n"Ho il pensiero che qualcosa andrà male" è diverso da "qualcosa andrà male." Riesci a fare questa distinzione adesso?`,
  `L'ansia da prestazione, l'ansia da futuro, l'ansia da relazione — ognuna ha radici diverse. In questo momento senti di capire da dove viene la tua?\n\nRaccontami un po' com'è la tua giornata tipo ultimamente.`,
],

// ══ STANCHEZZA ══
stanchezza:[
  `La stanchezza che descrivi — fisicamente come la senti? Pesantezza, testa ovattata, occhi che bruciano?\n\nEsistono tipi diversi: fisica (si risolve con il sonno), cognitiva (il cervello ha elaborato troppo), emotiva (hai dato troppo emotivamente), esistenziale (hai perso il senso di quello che fai). Quale riconosci di più?`,
  `"A pezzi" — questa parola mi dice che non è solo "sono stanca". È qualcosa di più profondo.\n\nIl burnout ha tre segnali: esaurimento, cinismo (tutto sembra inutile), inefficacia percepita (sento di non combinare niente). Ne riconosci qualcuno?\n\nE da quanto vai avanti così senza fermarti davvero?`,
  `Quando si è esauste, tutto pesa il doppio — ogni compito, ogni pensiero, ogni emozione. Non è debolezza, è neurobiologia: il cervello a corto di risorse funziona male, esattamente come un telefono al 2%.\n\nQuando hai fatto l'ultima cosa che ti ha dato energia invece di toglierla? Cosa era?`,
  `La stanchezza cronica ha un effetto subdolo: cambia la prospettiva. Tutto sembra più grigio e senza speranza di quanto sia realmente. È un effetto biologico, non la verità.\n\nConcretamente: nelle ultime 72 ore, quante ore hai dormito? Hai mangiato regolarmente?`,
  `So che quando si è così stanchi, l'idea di "fare qualcosa per stare meglio" sembra impossibile. È il paradosso del burnout — le cose che aiutano richiedono energia che non hai.\n\nAllora una sola cosa: dimmi qualcosa di piccolo che potresti fare oggi per dare al tuo corpo un segnale di cura. Anche bere un bicchiere d'acqua conta.`,
  `L'esaurimento prolungato abbassa l'umore, riduce la motivazione e altera il giudizio. Quando sei a pezzi, non è il momento giusto per prendere decisioni importanti o giudicarsi.\n\nCosa hai fatto oggi? Raccontami la giornata.`,
],

// ══ BURNOUT ══
burnout:[
  `Lavoro e stanchezza insieme — la combinazione classica del burnout. E quando arriva, non si risolve con una notte di sonno.\n\nIl burnout lavorativo ha fasi: idealismo → stagnazione → frustrazione → apatia. In quale fase ti senti?\n\nE c'è ancora qualcosa nel tuo lavoro che ti dà qualcosa, o è diventato tutto uguale e vuoto?`,
  `Essere esauste dal lavoro e dovere andare avanti è uno dei pesi più difficili — perché non puoi semplicemente fermarti.\n\nCosa ti spinge a continuare nonostante tutto? E cosa ti darebbe sollievo, anche parziale, adesso?`,
  `Il problema è il lavoro in sé (i compiti, il settore) o le condizioni (colleghi, capo, orari, ambiente)? Perché le soluzioni sono molto diverse.\n\nE hai qualcuno con cui puoi parlarne — un collega di fiducia, qualcuno a casa?`,
],

// ══ LAVORO ══
lavoro:[
  `Il lavoro sta pesando. Cosa sta succedendo — è una situazione specifica (un conflitto, un progetto difficile) o è una sensazione più generale di non riuscire a reggere il ritmo?\n\nSono due cose diverse e voglio capire bene qual è la tua.`,
  `Le dinamiche lavorative portano con sé stress, dubbio su se stessi, a volte senso di ingiustizia. Cosa prevale in quello che senti tu adesso?\n\nC'è qualcuno con cui hai potuto parlarne?`,
  `A volte il problema è esterno (ambiente tossico, carico insostenibile), a volte è interno (difficoltà a dire no, perfezionismo, paura di deludere). Se dovessi indicare la fonte principale del tuo disagio al lavoro, quale sarebbe?`,
  `Lavorare mentre studi, o lavorare in un periodo già difficile, è un carico doppio che molte persone sottovalutano. Il cervello non ha capacità infinite.\n\nC'è un modo per alleggerire, anche temporaneamente? O senti di non avere scelta?`,
  `A volte al lavoro succede qualcosa che ci fa sentire piccole, non rispettate, non viste. E questo lascia segni anche fuori dall'ufficio.\n\nHai vissuto qualcosa del genere di recente?`,
],

// ══ ESAME ══
esame:[
  `Gli esami portano con sé non solo la pressione della materia, ma la paura del giudizio — e spesso quella connessione tra voti e valore personale che è una trappola sottile ma devastante.\n\nL'ansia da prestazione ha basi neurologiche precise: il cortisolo alto inibisce la corteccia prefrontale, quella che serve per ragionare. Non è una scusa — è fisiologia.\n\nCos'è il prossimo esame? E cosa senti quando pensi a quella data?`,
  `Lo studio quando l'ansia è alta è una battaglia in salita — non perché tu sia meno capace, ma perché il cervello ansioso non funziona alla stessa velocità di quello calmo.\n\nQuando apri il libro, cosa succede? Ti blocchi subito, vai avanti un po' e poi ti perdi, o non riesci proprio ad aprirlo?`,
  `Un dato interessante: scrivere le proprie preoccupazioni per 10 minuti prima di studiare migliora la performance del 15% (Ramirez & Beilock, 2011). Perché scarica la memoria di lavoro.\n\nHai mai provato qualcosa del genere — buttare fuori tutto su carta prima di iniziare?`,
  `L'esame è una scadenza, ma spesso diventa un contenitore per tutto lo stress accumulato. Cosa mi stai dicendo dell'esame — e cosa mi stai dicendo in realtà di tutto il resto?`,
  `Il perfezionismo accademico è uno dei predittori più forti di ansia da esame. Non la mancanza di capacità — il perfezionismo. La paura di non essere abbastanza brava.\n\nTi riconosci in questo? E quanto hai ancora prima dell'esame?`,
  `Come stai andando con il metodo di studio? A volte il problema non è la quantità — è come si studia. Il retrieval practice (ripassare senza guardare gli appunti) è 2-3 volte più efficace della rilettura.\n\nCome studi in questo momento?`,
],

// ══ RABBIA ══
rabbia:[
  `La rabbia che senti è reale e ha diritto di esserci. Spesso è la risposta a qualcosa di importante che non è stato rispettato — un confine, un'aspettativa, un bisogno.\n\nNon ti dico di calmarti. Dimmi: cosa è successo? Chi o cosa ha fatto scattare questo?`,
  `Incazzarsi non è sbagliato. È umano. E a volte è l'unica risposta onesta a una situazione ingiusta.\n\nLa rabbia non espressa rimane dentro e si trasforma — in tensione fisica, in tristezza, in cinismo. Esprimerla (anche qui) è sano.\n\nRaccontami tutto senza filtri.`,
  `Quando sei furiosa, cosa senti nel corpo — petto, mascella, spalle? Te lo chiedo perché la rabbia si manifesta fisicamente, e riconoscerla aiuta a non fare cose di cui poi ci si pente.\n\nE chi o cosa è l'obiettivo della tua rabbia adesso?`,
  `A volte la rabbia è tristezza o paura travestite. È più facile arrabbiarsi che sentire la vulnerabilità sotto.\n\nSenza forzare niente: se sotto la tua rabbia ci fosse una paura, quale sarebbe?`,
],

// ══ SOLITUDINE ══
solitudine:[
  `Sentirsi sola — anche quando ci sono persone attorno — è una delle esperienze più difficili. Non è assenza di persone, è assenza di connessione vera.\n\nLa solitudine ha effetti reali sul corpo e sulla mente — non è "esagerazione". Da quando senti questa cosa? Ed è nuova o va avanti da un po'?`,
  `"Nessuno mi capisce" — di solito non dice che non ci siano persone buone intorno, ma che c'è qualcosa di profondo che non riesci a mostrare, o che quando lo mostri non trova risposta.\n\nCi sei mai riuscita a sentirti davvero capita, in qualche momento della tua vita? Da chi?`,
  `La solitudine emotiva è diversa da quella fisica. Puoi essere circondata da persone e sentirti sola — o stare da sola e sentirti connessa.\n\nQual è la tua? E cosa manca, concretamente?`,
],

// ══ RELAZIONE ══
relazione:[
  `Le relazioni — anche quelle belle — portano un peso in più quando si è già sotto pressione. Non perché l'amore faccia male, ma perché le risorse emotive si esauriscono.\n\nCosa sta succedendo? C'è una tensione specifica o è più una sensazione diffusa?`,
  `Quando sei sotto pressione, la relazione diventa spesso il posto dove si scarica tutto — o dove si sente di non avere abbastanza da dare.\n\nCome stai vivendo questo con Filippo in questo momento?`,
  `A volte si ha paura di far pesare le proprie difficoltà su chi si ama. Si cerca di sembrare bene anche quando non lo si è.\n\nTi ritrovi in questo?`,
],

// ══ FUTURO ══
futuro:[
  `La paura del futuro è una delle forme di ansia più difficili, perché l'oggetto non esiste ancora — è tutto nella proiezione della mente.\n\nIn CBT la chiamiamo "fortune telling" — il cervello che prevede il futuro come se fosse certo, solitamente nel peggio possibile.\n\nQual è il futuro specifico che ti spaventa? Rendilo concreto — non "andrà tutto male", ma: cosa temi esattamente che succeda?`,
  `Non sapere cosa fare della propria vita è una delle sensazioni più scomode. Viviamo in una cultura che dice che dovremmo sempre sapere dove andiamo. Ma la maggior parte delle persone naviga a vista molto più di quanto appare.\n\nCosa desideri, al di là delle aspettative degli altri?`,
],

// ══ RIMPIANTO ══
rimpianto:[
  `Il rimpianto è uno dei pensieri più pesanti — non ha un oggetto nel presente su cui agire, solo un passato che non si può cambiare.\n\nIn ACT distinguiamo ciò che possiamo cambiare da ciò che non possiamo. Il passato è fisso. Ma il significato che gli diamo — quello possiamo sceglierlo.\n\nCosa è successo?`,
  `"È colpa mia" — frase da analizzare con attenzione. Il cervello sotto stress tende a prendere il 100% della responsabilità anche quando non spetta tutta a noi.\n\nCosa è successo esattamente? E quali erano le opzioni reali che avevi in quel momento?`,
],

// ══ POSITIVO ══
positivo:[
  `Che bello sentirti così! Il fatto che tu noti i momenti positivi è già una forma di salute mentale — non è scontato.\n\nCosa ha contribuito a questo? C'è qualcosa di specifico che ha fatto la differenza?`,
  `Brava davvero. E sai cosa? Goditi questo senza fretta di passare al prossimo obiettivo. Stare bene non richiede immediatamente di fare qualcosa di utile.\n\nCom'è diverso il mondo quando stai così?`,
  `Questo stato che senti adesso — tienitelo a mente. Letteralmente. Quando le cose saranno più difficili, è utile ricordarsi che questo è possibile. Lo chiamiamo "savoring" in psicologia positiva.`,
],

// ══ CORPO ══
corpo:[
  `Il corpo parla spesso prima della mente. Quello che senti fisicamente — tensione, dolore, stanchezza — è il segnale che c'è qualcosa da ascoltare.\n\nDa quanto hai questi sintomi fisici? E c'è qualcosa che li fa peggiorare o migliorare?`,
  `I sintomi fisici che descrivi — mal di testa, tensione, stomaco — sono spesso la risposta del corpo allo stress cronico. Non sono "nella testa". Sono reali e vanno presi sul serio.\n\nHai dormito abbastanza ultimamente? E stai mangiando regolarmente?`,
],

// ══ BREVE (messaggio corto) ══
breve:[
  `Ti sento — anche solo con quelle parole.\n\nDimmi di più: cosa sta succedendo? Non devi fare una sintesi o essere logica. Dimmi come lo senti, anche in modo disordinato, anche senza senso.`,
  `Sono qui. Cos'è che pesa di più in questo momento — nella testa, nel corpo, nel cuore?\n\nPuoi dirmelo in modo disordinato, come viene. Non c'è un modo sbagliato di parlare qui.`,
  `Quando si dice poco, di solito è perché ci sono troppe cose insieme e non si sa da dove iniziare.\n\nProviamo così: dimmi la cosa più grande che ti pesa adesso. Una sola.`,
  `Hai scritto poco ma ho sentito tanto.\n\nDimmi tutto — da quanto va così, cosa è successo, come ti senti nel corpo. Questo è il tuo spazio, senza filtri.`,
  `Sono qui con te. Anche in poche parole ho sentito che non stai bene.\n\nRaccontami: com'è stata la tua giornata oggi?`,
],

// ══ CONSIGLI ══
consigli:[
  `Ti do qualcosa di concreto — ma prima voglio capire bene, così ti do la cosa giusta per te, non quella generica.\n\nCosa senti di più adesso — tensione nel corpo, pensieri che girano veloci, difficoltà a fare le cose, o qualcos'altro?`,
  `Ci sono tecniche per quasi tutto. Le più efficaci in base alla ricerca:\n• Respiro 4-7-8 per ansia acuta\n• Grounding 5-4-3-2-1 per panico\n• Body scan per tensione e stanchezza\n• Scrittura espressiva per processare le emozioni\n• PMR per tensione muscolare\n\nCosa hai già provato? E cosa vuoi esplorare?`,
],

// ══ APPROFONDIMENTO (dopo più turni sullo stesso tema) ══
approfondimento:[
  `Siamo tornate su questo. Evidentemente c'è ancora qualcosa che non si è spostato.\n\nCosa ha aiutato, anche solo un po', di quello che ci siamo dette? E cosa invece è rimasto immobile?`,
  `Sento che questo tema è importante per te — non è la prima volta che ne parliamo.\n\nVorrei andare più in profondità: c'è una parte di questa cosa che non hai ancora detto? Qualcosa che hai tenuto da parte?`,
  `Quando una cosa continua a tornare, di solito c'è qualcosa di più sotto che aspetta di essere visto.\n\nCosa pensi che ci sia davvero alla radice di tutto questo?`,
],

// ══ APERTURA ══
apertura:[
  `Sono qui, ${name}. Questo è il tuo spazio — nessun giudizio, nessuna fretta.\n\nCome stai davvero in questo momento?`,
  `Dimmi come stai — non la risposta automatica. Quella vera.\n\nCosa c'è nella testa e nel cuore adesso?`,
  `C'è qualcosa che vuoi tirarti fuori? Questo è il posto giusto.\n\nDimmi tutto, anche in disordine.`,
],

    };// fine pools

    const pool=pools[cat]||pools.apertura;
    let reply=this.pick(cat,pool);

    // Arricchimento contestuale
    const note=this._note(sig,ctx);
    if(note)reply+='\n\n'+note;

    return reply;
  },

  _note(sig,ctx){
    const notes=[];
    if(ctx.anxietyRecurring&&(sig.media||sig.alta))notes.push('💡 Dal tuo diario vedo che l\'ansia è qualcosa che ti accompagna spesso. Non sei sola in questo — e si può lavorarci davvero.');
    if(ctx.fatigueRecurring&&sig.stanchezza)notes.push('⚡ La stanchezza sembra essere un tema ricorrente. Vale la pena capire se c\'è qualcosa di strutturale da cambiare.');
    if(ctx.avgMood<2.5&&ctx.turns>3)notes.push('💙 Stai attraversando un periodo difficile. Hai parlato con qualcuno di fiducia nella vita reale?');
    return notes.length?notes[Math.floor(Math.random()*notes.length)]:null;
  },

  chips(sig){
    const c=[];
    if(sig.crisi||sig.panico)c.push('🌬️ Guidami nella respirazione');
    if(sig.alta)c.push('🌍 Grounding adesso');
    if(sig.autostima)c.push('🍃 Cos\'è la defusione cognitiva?');
    if(sig.stanchezza)c.push('🧘 Body scan per rilassarmi');
    if(sig.esame)c.push('🍅 Timer Pomodoro per studiare');
    if(sig.tristezza)c.push('📖 Scrivere nel diario aiuta?');
    if(sig.lavoro)c.push('Parliamo ancora del lavoro');
    c.push('Come posso stare meglio adesso?');
    return c.slice(0,3);
  },
};

// ─── CHAT UI ───
const Chat={
  loading:false,

  init(){
    S.stats.chats=(S.stats.chats||0)+1;S.sessionTopics=[];S.usedIdx={};persist();
    const h=new Date().getHours(),name=S.name||'cara';
    const gr=h<12?'Buongiorno':h<18?'Buon pomeriggio':'Buonasera';
    let opener;
    if(S.currentMood&&S.currentMoodV<=2)opener=`${gr} ${name} 💚\n\nMi hai detto che ti senti ${S.currentMood}...\n\nSono qui. Questo è il tuo spazio — nessun giudizio, nessuna fretta. Raccontami tutto — da dove viene, quando è iniziata, cosa senti. Anche in modo disordinato.`;
    else if(S.currentMood&&S.currentMoodV>=4)opener=`${gr} ${name}! Bello sentirti 🌿\n\nCome stai oggi — c'è qualcosa su cui vuoi lavorare, o sei qui solo per un check-in?`;
    else opener=`${gr} ${name} 💚\n\nSono qui. Questo è il tuo spazio privato — nessun giudizio, nessuna fretta.\n\nCome stai davvero in questo momento?`;
    this._msg('ai',opener);
    this._chips(['Sono ansiosa 😰','Sto malissimo','Non riesco a studiare','Sono stanca','Ho problemi al lavoro','Voglio sfogarmi']);
  },

  clear(){
    S.chatHistory=[];S.sessionTopics=[];S.usedIdx={};persist();
    document.getElementById('chat-msgs').innerHTML='';
    this._chips([]);this.init();toast('💬 Nuova conversazione');
  },

  async send(){
    if(this.loading)return;
    const inp=document.getElementById('chat-inp');
    const text=inp.value.trim();if(!text)return;
    inp.value='';inp.style.height='auto';
    document.getElementById('chips-wrap').style.display='none';
    this._msg('user',text);
    S.chatHistory.push({role:'user',content:text});
    if(S.chatHistory.length>60)S.chatHistory=S.chatHistory.slice(-60);
    this.loading=true;document.getElementById('send-btn').style.opacity='.5';
    this._typing();
    await new Promise(r=>setTimeout(r,800+Math.random()*900));
    const sig=Engine.detect(text);
    const reply=Engine.respond(text);
    this._rmTyping();
    this._msg('ai',reply);
    S.chatHistory.push({role:'assistant',content:reply});persist();
    const chips=Engine.chips(sig);
    if(chips.length)setTimeout(()=>this._chips(chips),500);
    this.loading=false;document.getElementById('send-btn').style.opacity='1';
    sendEmailLog('chat');
  },

  suggest(btn){document.getElementById('chat-inp').value=btn.textContent.trim();btn.closest('.chip')?.remove();this.send();},
  resize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';},
  onKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.send();}},

  _msg(role,text){
    const msgs=document.getElementById('chat-msgs');
    const time=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    const div=document.createElement('div');div.className=`msg ${role}`;
    const fmt=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
    if(role==='ai')div.innerHTML=`<div class="msg-av">🌿</div><div class="msg-wrap"><div class="msg-bubble">${fmt}</div><div class="msg-time">${time}</div></div>`;
    else div.innerHTML=`<div class="msg-wrap"><div class="msg-bubble">${fmt}</div><div class="msg-time">${time}</div></div>`;
    msgs.appendChild(div);requestAnimationFrame(()=>msgs.scrollTop=msgs.scrollHeight);
  },
  _typing(){const msgs=document.getElementById('chat-msgs');const d=document.createElement('div');d.className='msg ai';d.id='tmsg';d.innerHTML='<div class="msg-av">🌿</div><div class="typing-bub"><div class="td"></div><div class="td"></div><div class="td"></div></div>';msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;},
  _rmTyping(){document.getElementById('tmsg')?.remove();},
  _chips(arr){
    const w=document.getElementById('chips-wrap'),c=document.getElementById('chips');
    c.innerHTML=arr.map(x=>`<button class="chip" onclick="Chat.suggest(this)">${x}</button>`).join('');
    w.style.display=arr.length?'':'none';
  },
};

// ─── SOS ───
const SOS={
  open(){
    S.stats.sos=(S.stats.sos||0)+1;S.sosHistory.push({date:new Date().toISOString()});persist();
    sendEmailLog('sos');
    Sheet.open(`
      <div style="padding:0 4px;text-align:center">
        <div style="font-size:3rem;margin-bottom:10px">🆘</div>
        <div style="font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--ink);margin-bottom:6px">Sono qui con te</div>
        <div style="font-size:.84rem;color:var(--ink-m);margin-bottom:24px">Respira. Sei al sicuro.</div>
        <div style="display:flex;flex-direction:column;gap:10px;text-align:left">
          <button onclick="Nav.to('breath');Sheet.forceClose()" style="width:100%;padding:16px;border:none;border-radius:14px;background:#EEF4FF;color:#1D4ED8;font-size:.92rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:left">
            🌬️ Esercizio di respiro immediato<div style="font-size:.72rem;font-weight:400;opacity:.7;margin-top:2px">Abbassa il panico in 2 minuti</div>
          </button>
          <button onclick="Exercises.open('grounding');Sheet.forceClose()" style="width:100%;padding:16px;border:none;border-radius:14px;background:var(--sage-p);color:var(--sage-d);font-size:.92rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:left">
            🌍 Grounding 5-4-3-2-1<div style="font-size:.72rem;font-weight:400;opacity:.7;margin-top:2px">Torna al presente adesso</div>
          </button>
          <button onclick="Sheet.forceClose();Nav.to('chat');setTimeout(()=>{document.getElementById('chat-inp').value='Ho bisogno di aiuto adesso, sto avendo un momento di crisi';Chat.send();},400)" style="width:100%;padding:16px;border:none;border-radius:14px;background:#F0EEFF;color:#7C3AED;font-size:.92rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:left">
            💬 Parla con la tua guida<div style="font-size:.72rem;font-weight:400;opacity:.7;margin-top:2px">Dimmi tutto, sono qui</div>
          </button>
        </div>
        <div style="margin-top:20px;padding:14px;background:var(--bg);border-radius:12px;font-size:.78rem;color:var(--ink-m);line-height:1.65;text-align:left">
          <strong style="color:var(--ink)">Ricorda:</strong> quello che senti adesso passerà. Non è permanente.<br>
          Se sei in pericolo: <strong>112</strong> · Telefono Amico <strong>02 2327 2327</strong>
        </div>
      </div>`);
  }
};

// ─── STRESS TRACKER ───
const StressTracker={
  open(){
    const log=S.stressLog||[];
    Sheet.open(`
      <div style="padding:0 4px">
        <div style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">📈 Ciclo stress universitario</div>
        <div style="font-size:.78rem;color:var(--ink-m);margin-bottom:18px">Registra il tuo livello di stress durante la sessione</div>
        <div style="background:var(--bg);border-radius:14px;padding:16px;margin-bottom:14px">
          <div style="font-size:.72rem;font-weight:700;color:var(--ink-m);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Livello stress oggi (1-10)</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center">
            ${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button id="sl-${n}" onclick="StressTracker.log(${n})" style="width:44px;height:44px;border-radius:10px;border:2px solid var(--border);background:var(--white);font-size:.9rem;font-weight:600;cursor:pointer;color:var(--ink-m);transition:all .2s;font-family:inherit">${n}</button>`).join('')}
          </div>
          <div style="font-size:.68rem;color:var(--ink-f);text-align:center;margin-top:8px">1 = tranquilla · 10 = al limite</div>
        </div>
        ${this._chart(log)}
        <div style="margin-top:14px;padding:14px;background:var(--sage-p);border-radius:12px">
          <div style="font-size:.76rem;font-weight:600;color:var(--sage-d);margin-bottom:5px">💡 Pattern tipico in sessione</div>
          <div style="font-size:.78rem;color:var(--ink-s);line-height:1.65">Lo stress universitario tende ad aumentare 2-3 settimane prima degli esami e a toccare il picco 48-72 ore prima. Sapere dove sei nel ciclo aiuta a pianificare il recupero.</div>
        </div>
      </div>`);
  },

  log(level){
    document.querySelectorAll('[id^="sl-"]').forEach(b=>{b.style.background='var(--white)';b.style.borderColor='var(--border)';b.style.color='var(--ink-m)';});
    const btn=document.getElementById(`sl-${level}`);
    if(btn){btn.style.background=level>=8?'#DC2626':level>=5?'#F59E0B':'var(--sage)';btn.style.borderColor='transparent';btn.style.color='white';}
    S.stressLog=S.stressLog||[];
    S.stressLog.push({date:new Date().toISOString(),level});
    if(S.stressLog.length>60)S.stressLog=S.stressLog.slice(-60);
    persist();
    this._updateMiniChart();
    toast(`📊 Stress ${level}/10 registrato`);
    if(level>=8)setTimeout(()=>toast('⚠️ Livello alto — prova la respirazione 4-7-8',4000),3000);
    sendEmailLog('stress');
  },

  _chart(log){
    if(!log.length)return'<div style="text-align:center;padding:18px;color:var(--ink-m);font-size:.83rem">Nessun dato ancora — registra il tuo stress!</div>';
    const last=log.slice(-14);
    return`<div style="background:var(--bg);border-radius:14px;padding:16px"><div style="font-size:.7rem;font-weight:600;color:var(--ink-m);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Ultimi ${last.length} rilevamenti</div><div style="display:flex;align-items:flex-end;gap:4px;height:80px">${last.map(e=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="width:100%;border-radius:4px 4px 0 0;background:${e.level>=8?'#EF4444':e.level>=5?'#F59E0B':'var(--sage)'};height:${(e.level/10)*72}px;min-height:4px;transition:height .5s"></div><div style="font-size:.52rem;color:var(--ink-f)">${e.level}</div></div>`).join('')}</div></div>`;
  },

  _updateMiniChart(){
    const mini=document.getElementById('stress-mini');const badge=document.getElementById('stress-badge');
    if(!mini||!badge)return;
    const last=S.stressLog.slice(-7);
    if(!last.length)return;
    const avg=(last.reduce((a,e)=>a+e.level,0)/last.length).toFixed(1);
    badge.textContent=avg+'/10';
    badge.style.background=avg>=8?'#FEE2E2':avg>=5?'#FEF3C7':'var(--sage-p)';
    badge.style.color=avg>=8?'#DC2626':avg>=5?'#D97706':'var(--sage-d)';
    mini.innerHTML=last.map(e=>`<div class="smc-bar" style="height:${(e.level/10)*36}px;background:${e.level>=8?'#EF4444':e.level>=5?'#F59E0B':'var(--sage)'}"></div>`).join('');
  }
};
window.StressTracker=StressTracker;

// ─── EMAIL LOG ───
async function sendEmailLog(trigger){
  if(!S.notifyEnabled||!S.notifyEmail)return;
  const now=Date.now(),cooldown=trigger==='sos'?0:4*60*60*1000;
  if(trigger!=='sos'&&now-(S.lastEmailTs||0)<cooldown)return;
  S.lastEmailTs=now;persist();
  const name=S.name||'Silvia';
  const rm=S.moodLog.slice(-5),avg=rm.length?(rm.reduce((a,m)=>a+m.v,0)/rm.length).toFixed(1):'N/D';
  const lastDiary=S.diary[0];
  const lastStress=S.stressLog.slice(-1)[0];
  const isAlert=trigger==='sos'||(parseFloat(avg)<2.5&&S.alertEnabled);
  const subj=isAlert?`⚠️ ${name} ha bisogno di te`:`🌿 ${name} — log utilizzo app`;
  const body=`Ciao!\n\nTrigger: ${trigger}\nData: ${new Date().toLocaleString('it-IT')}\n\n📊 Statistiche:\n• Sessioni totali: ${S.totalSessions||1}\n• Streak: ${S.streak||1} giorni\n• Chat: ${S.stats.chats||0} conversazioni\n• Respiro: ${S.stats.sessions||0} sessioni\n• Diario: ${S.stats.entries||0} entry\n• Esercizi: ${S.stats.exercises||0}\n• SOS usati: ${S.stats.sos||0}\n\n😊 Umore medio recente: ${avg}/5\n${lastStress?`📈 Ultimo stress registrato: ${lastStress.level}/10`:''}\n\n📖 Ultimo diario:\n"${lastDiary?.text?.slice(0,300)||'—'}"\n\n—\nApp Silvia 🌿`;
  try{
    window.open(`mailto:${S.notifyEmail}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`,'_blank');
  }catch(e){}
}

// ─── BREATH ───
const BT={'478':{label:'4-7-8',desc:'Inspira 4s · Trattieni 7s · Espira 8s — abbassa l\'ansia acuta rapidamente.',phases:[{l:'Inspira',s:4,sc:1.3},{l:'Trattieni',s:7,sc:1.15},{l:'Espira',s:8,sc:.85}],cy:4},box:{label:'Box',desc:'Inspira 4s · Trattieni 4s · Espira 4s · Pausa 4s — calma il sistema nervoso.',phases:[{l:'Inspira',s:4,sc:1.3},{l:'Trattieni',s:4,sc:1.15},{l:'Espira',s:4,sc:.85},{l:'Pausa',s:4,sc:.9}],cy:4},calm:{label:'Calma',desc:'Inspira 4s · Espira 6s — attiva il nervo vago.',phases:[{l:'Inspira',s:4,sc:1.25},{l:'Espira',s:6,sc:.85}],cy:6}};
const Breath={
  type:'478',run:false,tmr:null,cy:0,ph:0,
  setType(t,btn){if(this.run)this.stop();this.type=t;document.querySelectorAll('.btab').forEach(b=>b.classList.toggle('active',b.dataset.t===t));const c=BT[t];document.getElementById('breath-desc').textContent=c.desc;document.getElementById('bo-num').textContent=c.phases[0].s;document.getElementById('bo-phase').textContent='Premi inizia';document.getElementById('breath-instr').textContent=c.desc;document.getElementById('breath-fill').style.width='0%';document.getElementById('breath-meta').textContent=`Cicli: 0 / ${c.cy}`;document.getElementById('breath-cta').textContent='Inizia 🌬️';document.getElementById('breath-orb').style.transform='scale(1)';},
  toggle(){if(this.run)this.stop();else this.start();},
  start(){this.run=true;this.cy=0;this.ph=0;document.getElementById('breath-cta').textContent='Stop ✕';this._run();},
  stop(){this.run=false;clearInterval(this.tmr);document.getElementById('breath-cta').textContent='Inizia 🌬️';document.getElementById('bo-phase').textContent='Premi inizia';document.getElementById('bo-num').textContent=BT[this.type].phases[0].s;document.getElementById('breath-orb').style.transform='scale(1)';document.getElementById('breath-instr').textContent='Scegli una tecnica e inizia';},
  _run(){if(!this.run)return;const c=BT[this.type],p=c.phases[this.ph];let s=p.s;document.getElementById('bo-num').textContent=s;document.getElementById('bo-phase').textContent=p.l.toLowerCase();document.getElementById('breath-instr').textContent=p.l;document.getElementById('breath-orb').style.transition=`transform ${p.s}s ease-in-out`;document.getElementById('breath-orb').style.transform=`scale(${p.sc})`;clearInterval(this.tmr);this.tmr=setInterval(()=>{s--;document.getElementById('bo-num').textContent=Math.max(0,s);const tot=c.phases.reduce((a,x)=>a+x.s,0),prev=c.phases.slice(0,this.ph).reduce((a,x)=>a+x.s,0),pct=((this.cy/c.cy)+((prev+(p.s-s))/tot/c.cy))*100;document.getElementById('breath-fill').style.width=Math.min(pct,100)+'%';document.getElementById('breath-meta').textContent=`Cicli: ${this.cy} / ${c.cy}`;if(s<=0){clearInterval(this.tmr);this.ph++;if(this.ph>=c.phases.length){this.ph=0;this.cy++;if(this.cy>=c.cy){this._fin();return;}}setTimeout(()=>this._run(),350);}},1000);},
  _fin(){this.run=false;document.getElementById('breath-instr').textContent='✨ Ottima sessione!';document.getElementById('breath-cta').textContent='Di nuovo 🌬️';document.getElementById('breath-fill').style.width='100%';document.getElementById('breath-orb').style.transform='scale(1)';S.stats.sessions=(S.stats.sessions||0)+1;const k='Respiro '+BT[this.type].label;S.techniqueUsage[k]=(S.techniqueUsage[k]||0)+1;persist();toast('💪 Sessione completata!');sendEmailLog('breath');}
};

// ─── EXERCISES ───
const Exercises={
  open(t){S.stats.exercises=(S.stats.exercises||0)+1;S.techniqueUsage[t]=(S.techniqueUsage[t]||0)+1;persist();Sheet.open(this._html(t));if(t==='pomodoro')Pomo.reset();},
  _html(t){switch(t){case'grounding':return this._grounding();case'pmr':return this._pmr();case'bodyscan':return this._bodyscan();case'defusion':return this._defusion();case'pomodoro':return this._pomodoro();case'affirmations':return this._affirm();default:return'<p>Non trovato</p>';}},
  gNext(n){document.querySelectorAll('[id^="gs"]').forEach(e=>e.classList.remove('active'));const nx=document.getElementById(`gs${n}`);if(nx){nx.classList.add('active');nx.style.animation='none';requestAnimationFrame(()=>nx.style.animation='slideUp .4s var(--ease)');}if(n>=5)toast('🌿 Grounding completato!');},
  pNext(n){document.querySelectorAll('[id^="ps"]').forEach(e=>e.classList.remove('active'));const nx=document.getElementById(`ps${n}`);if(nx)nx.classList.add('active');if(n>=7)toast('💆 PMR completato!');},

  _grounding(){
    const s=[{n:'5',se:'Cose che VEDI',i:'Guarda intorno. Nomina 5 cose che vedi chiaramente adesso.',p:'La lampada, il muro, le mie mani…'},{n:'4',se:'Cose che TOCCHI',i:'Senti fisicamente 4 superfici — tessuto, sedia, pavimento.',p:'La coperta, il tavolo…'},{n:'3',se:'Cose che SENTI',i:'Ascolta. Quali 3 suoni percepisci adesso?',p:'Il vento, il silenzio…'},{n:'2',se:'Cose che ANNUSI',i:'Respiro profondo. 2 odori.',p:"L'aria, il caffè…"},{n:'1',se:'Cosa ASSAGGI',i:"Cosa c'è in bocca? Anche niente conta.",p:'Niente, acqua…'}];
    return`<div style="padding:0 4px"><div style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🌍 Grounding 5-4-3-2-1</div><div style="font-size:.72rem;font-style:italic;color:var(--sage-d);background:var(--sage-p);padding:5px 11px;border-radius:9px;margin-bottom:18px;display:inline-block">📚 CBT — torna al presente attraverso i sensi</div>${s.map((x,i)=>`<div class="g-step ${i===0?'active':''}" id="gs${i}"><div class="g-big-num">${x.n}</div><div class="g-sense">${x.se}</div><div class="g-inst">${x.i}</div><input class="g-field" placeholder="${x.p}"/><button class="g-next" onclick="Exercises.gNext(${i+1})">${i<s.length-1?'Avanti →':'Completa ✓'}</button></div>`).join('')}<div class="g-step" id="gs5" style="text-align:center;padding:24px 0"><div style="font-size:3.5rem;margin-bottom:14px">🌿</div><div style="font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--ink);margin-bottom:8px">Sei qui, adesso</div><div style="font-size:.86rem;color:var(--ink-m);line-height:1.65">L'ansia si nutre del futuro.<br>Tu sei presente, al sicuro, intera.</div><button class="g-next" style="margin-top:22px" onclick="Sheet.forceClose()">Chiudi ✓</button></div></div>`;
  },
  _pmr(){
    const z=[{i:'🤜',n:'Mani',a:'Stringi i pugni al massimo. 7 secondi. Poi lascia andare tutto in una volta — senti il calore.'},{i:'💪',n:'Braccia',a:'Piega il braccio e contrai il bicipite. 7 secondi. Poi rilascia.'},{i:'😬',n:'Viso',a:'Strizza gli occhi e serra la mascella. 7 secondi. Poi molla tutto.'},{i:'🦴',n:'Collo e spalle',a:'Alza le spalle verso le orecchie. 7 secondi. Poi lascia scendere.'},{i:'🫁',n:'Petto',a:'Respira fondo e tieni. Contrai la pancia. 7 secondi. Poi espira tutto.'},{i:'🦵',n:'Cosce',a:'Stringi le cosce insieme. 7 secondi. Poi rilassa completamente.'},{i:'🦶',n:'Piedi',a:'Punta i piedi verso il basso. Contrai i polpacci. 7 secondi. Poi rilascia.'}];
    return`<div style="padding:0 4px"><div style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">💆 Rilassamento Muscolare</div><div style="font-size:.72rem;font-style:italic;color:var(--sage-d);background:var(--sage-p);padding:5px 11px;border-radius:9px;margin-bottom:18px;display:inline-block">📚 Tecnica di Jacobson — riduce cortisolo del 18%</div>${z.map((x,i)=>`<div class="g-step ${i===0?'active':''}" id="ps${i}"><div style="font-size:2.5rem;text-align:center;margin-bottom:7px">${x.i}</div><div class="g-sense">${x.n}</div><div class="g-inst">${x.a}</div><button class="g-next" onclick="Exercises.pNext(${i+1})">${i<z.length-1?'Avanti →':'Completa ✓'}</button></div>`).join('')}<div class="g-step" id="ps7" style="text-align:center;padding:24px 0"><div style="font-size:3.5rem;margin-bottom:14px">💆</div><div style="font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--ink);margin-bottom:8px">Senti la differenza?</div><div style="font-size:.86rem;color:var(--ink-m);line-height:1.65">Il corpo porta il peso dello stress.<br>Ora è un po' più leggero.</div><button class="g-next" style="margin-top:22px" onclick="Sheet.forceClose()">Chiudi ✓</button></div></div>`;
  },
  _bodyscan(){
    const s=[{t:'Posizionati',c:"Siediti o sdraiati. Chiudi gli occhi. 3 respiri lenti. Nessuna fretta."},{t:'Testa',c:"Sommità del capo. Senti il peso. Tensione? Osservala senza combatterla."},{t:'Viso e collo',c:'Mascella, guance, collo. Lascia che il viso si ammorbidisca.'},{t:'Spalle',c:'Le spalle portano tutto. Con ogni espirazione, lasciale scendere.'},{t:'Petto e braccia',c:'Petto che si alza e scende. Peso delle braccia fino alle dita.'},{t:'Addome',c:'La pancia si muove. Osserva come un testimone — non controllare.'},{t:'Gambe e piedi',c:'Scendi fino alle dita dei piedi. Senti il contatto con la superficie.'},{t:'Il tutto',c:'Tutto il corpo insieme. Sei qui. Presente. Intera.'}];
    return`<div style="padding:0 4px"><div style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🧘 Body Scan</div><div style="font-size:.72rem;font-style:italic;color:var(--sage-d);background:var(--sage-p);padding:5px 11px;border-radius:9px;margin-bottom:18px;display:inline-block">📚 MBSR Kabat-Zinn — riduce cortisolo del 23%</div>${s.map(x=>`<div style="background:var(--bg);border-radius:11px;padding:14px;margin-bottom:9px;border-left:3px solid var(--sage)"><div style="font-weight:600;color:var(--sage-d);font-size:.85rem;margin-bottom:4px">${x.t}</div><div style="font-size:.83rem;color:var(--ink-s);line-height:1.65">${x.c}</div></div>`).join('')}<button class="g-next" style="margin-top:10px" onclick="Sheet.forceClose();toast('🧘 Body scan completato!')">Completato ✓</button></div>`;
  },
  _defusion(){
    return`<div style="padding:0 4px"><div style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px">🍃 Defusione Cognitiva</div><div style="font-size:.72rem;font-style:italic;color:var(--sage-d);background:var(--sage-p);padding:5px 11px;border-radius:9px;margin-bottom:18px;display:inline-block">📚 ACT (Hayes) — i pensieri non sono fatti</div><div style="background:var(--bg);border-radius:11px;padding:16px;margin-bottom:10px"><div style="font-weight:600;color:var(--ink);margin-bottom:7px">Il principio</div><div style="font-size:.83rem;color:var(--ink-s);line-height:1.65">Non siamo i nostri pensieri. Sono nuvole nel cielo — non il cielo. Non devi combatterli né crederci ciecamente.</div></div><div style="background:var(--bg);border-radius:11px;padding:16px;margin-bottom:10px;border-left:3px solid var(--sage)"><div style="font-weight:600;color:var(--ink);margin-bottom:7px">Esercizio: "Ho il pensiero che…"</div><div style="font-size:.83rem;color:var(--ink-s);line-height:1.65">Invece di: <em>"Non ce la faccio"</em><br><br>Di': <strong style="color:var(--sage-d)">"Ho il pensiero che non ce la farò"</strong><br><br>Crei distanza. Il pensiero esiste, ma non sei tu.</div></div><div style="background:var(--bg);border-radius:11px;padding:16px;margin-bottom:18px;border-left:3px solid var(--sage)"><div style="font-weight:600;color:var(--ink);margin-bottom:7px">Dai un nome al critico</div><div style="font-size:.83rem;color:var(--ink-s);line-height:1.65"><em>"Ah, è tornata Radio Catastrofe…"</em><br>L'umorismo crea distanza automaticamente.</div></div><button class="g-next" onclick="Sheet.forceClose();toast('🍃 Defusione completata!')">Ho capito ✓</button></div>`;
  },
  _pomodoro(){
    return`<div style="padding:0 4px;text-align:center"><div style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:4px;text-align:left">🍅 Pomodoro Focus</div><div style="font-size:.78rem;color:var(--ink-m);margin-bottom:18px;text-align:left">25 min studio · 5 min pausa · ripeti</div><div class="pomo-timer" id="pomo-timer">25:00</div><div class="pomo-phase" id="pomo-phase">Sessione studio #1</div><div class="pomo-btns"><button class="pomo-start" id="pomo-btn" onclick="Pomo.toggle()">▶ Inizia</button><button class="pomo-reset" onclick="Pomo.reset()">↺</button></div><div style="background:var(--bg);border-radius:12px;padding:15px;text-align:left"><div style="font-size:.68rem;font-weight:700;color:var(--ink-m);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">Durante il pomodoro:</div><div style="font-size:.8rem;color:var(--ink-s);line-height:1.8">✓ Telefono capovolto<br>✓ Una sola cosa da fare<br>✓ Pensiero che arriva → scrivilo e torna<br>✓ Zero multitasking</div></div></div>`;
  },
  _affirm(){
    const a=['Sono capace di affrontare le sfide, una alla volta.','Non devo essere perfetta per meritare rispetto e amore.','Ogni momento difficile che supero mi rende più forte.','Ho il diritto di sentirmi sopraffatta e di chiedere aiuto.','Il mio valore non dipende dai miei voti o dalla produttività.','Sono abbastanza. Così come sono, adesso.','Posso fare una cosa alla volta. Questo è sufficiente.','I miei sforzi contano, anche quando non si vedono i risultati.','Merito cura e gentilezza — anche da me stessa.','Non sono definita dai miei momenti difficili.'];
    let idx=0;const uid='a'+Date.now();
    setTimeout(()=>{const el=document.getElementById(uid);if(!el)return;el.querySelector('.an').onclick=()=>{idx=(idx+1)%a.length;el.querySelector('.at').textContent=a[idx];el.querySelector('.ac').textContent=`${idx+1} / ${a.length}`;};},50);
    return`<div id="${uid}" style="padding:0 4px"><div style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--ink);margin-bottom:18px">💜 Affermazioni positive</div><div style="background:linear-gradient(135deg,var(--sage-d),var(--sage));border-radius:20px;padding:30px 22px;text-align:center;margin-bottom:18px"><div class="at" style="font-family:'Playfair Display',serif;font-size:1.3rem;color:white;line-height:1.5;font-style:italic">${a[0]}</div><div class="ac" style="font-size:.68rem;color:rgba(255,255,255,.45);margin-top:14px">1 / ${a.length}</div></div><button class="an g-next">Prossima →</button><button class="g-next" style="margin-top:9px;background:var(--bg);color:var(--ink-m)" onclick="Sheet.forceClose()">Chiudi</button></div>`;
  },
};

// ─── POMODORO ───
const Pomo={
  s:25*60,run:false,tmr:null,round:1,
  toggle(){if(this.run){this.run=false;clearInterval(this.tmr);const b=document.getElementById('pomo-btn');if(b)b.textContent='▶ Riprendi';}else{this.run=true;this.tmr=setInterval(()=>this._tick(),1000);const b=document.getElementById('pomo-btn');if(b)b.textContent='⏸ Pausa';}},
  stop(){this.run=false;clearInterval(this.tmr);},
  reset(){this.stop();this.s=25*60;this.round=1;const t=document.getElementById('pomo-timer');if(t)t.textContent='25:00';const p=document.getElementById('pomo-phase');if(p)p.textContent='Sessione studio #1';const b=document.getElementById('pomo-btn');if(b)b.textContent='▶ Inizia';},
  _tick(){this.s--;const m=Math.floor(this.s/60),s=this.s%60;const t=document.getElementById('pomo-timer');if(t)t.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;if(this.s<=0){clearInterval(this.tmr);this.run=false;const isS=this.round%2!==0;this.round++;const b=document.getElementById('pomo-btn'),p=document.getElementById('pomo-phase');if(isS){this.s=5*60;if(p)p.textContent=`⏰ Pausa #${Math.floor(this.round/2)}`;if(b)b.textContent='▶ Inizia pausa';toast('🍅 Pausa meritata! 5 minuti 💚');}else{this.s=25*60;if(p)p.textContent=`Sessione #${Math.ceil(this.round/2)}`;if(b)b.textContent='▶ Inizia sessione';toast('💪 Pausa finita!');}}}
};

// ─── DIARY ───
const Diary={
  em:'',
  pickMood(btn){document.querySelectorAll('.dm-btn').forEach(b=>b.classList.remove('sel'));btn.classList.add('sel');this.em=btn.dataset.e;},
  save(){
    const ta=document.getElementById('diary-ta'),text=ta.value.trim();
    if(!text){toast('✏️ Scrivi qualcosa prima!');return;}
    const entry={id:Date.now(),date:new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}),text,emoji:this.em||'📝',tags:this._tags(text)};
    S.diary.unshift(entry);if(S.diary.length>300)S.diary=S.diary.slice(0,300);
    S.stats.entries=(S.stats.entries||0)+1;
    this._learn(text);persist();
    ta.value='';document.querySelectorAll('.dm-btn').forEach(b=>b.classList.remove('sel'));this.em='';
    this.render();toast('📖 Salvato nel tuo diario 💚');sendEmailLog('diary');
  },
  _learn(text){this._tags(text).forEach(t=>{S.learnedPatterns[t]=(S.learnedPatterns[t]||0)+1;});},
  render(){
    const el=document.getElementById('diary-entries');if(!el)return;
    if(!S.diary.length){el.innerHTML='<div class="diary-empty"><div class="diary-empty-icon">🌿</div><div class="diary-empty-text">Ancora nessun pensiero salvato.<br>Scrivi il primo!</div></div>';return;}
    el.innerHTML=S.diary.slice(0,30).map(e=>`<div class="diary-entry"><div class="diary-entry-top"><span class="diary-date">${e.date}</span><span class="diary-mood">${e.emoji}</span></div><div class="diary-text">${(e.text.length>220?e.text.slice(0,220)+'…':e.text).replace(/\n/g,'<br>')}</div>${e.tags.length?`<div class="diary-tags">${e.tags.map(t=>`<span class="dtag">${t}</span>`).join('')}</div>`:''}</div>`).join('');
  },
  _tags(text){const t=[],l=text.toLowerCase();if(/ansia|ansiosa|preoccup/.test(l))t.push('ansia');if(/stanca|esausta|sonno/.test(l))t.push('stanchezza');if(/studi|esame|uni/.test(l))t.push('studio');if(/nerv|arrab/.test(l))t.push('nervosismo');if(/triste|piango/.test(l))t.push('tristezza');if(/bene|felice|content/.test(l))t.push('positivo');if(/filippo|amore/.test(l))t.push('amore');if(/lavoro|lavorare/.test(l))t.push('lavoro');return t;},
};

// ─── STATS ───
const Stats={
  render(){
    const el=document.getElementById('mood-chart');
    if(el){const days=['Lu','Ma','Me','Gi','Ve','Sa','Do'],cols=[];for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*86400000),ds=d.toISOString().split('T')[0];const dl=S.moodLog.filter(m=>m.date&&m.date.startsWith(ds));const avg=dl.length?dl.reduce((a,m)=>a+(m.v||0),0)/dl.length:0;const em={0:'',1:'😰',2:'😔',3:'😐',4:'🙂',5:'✨'};cols.push({label:days[(d.getDay()+6)%7],avg,emoji:em[Math.round(avg)]||''});}el.innerHTML=cols.map(c=>`<div class="mc-col"><div style="font-size:.65rem;margin-bottom:2px;min-height:13px">${c.emoji}</div><div class="mc-bar" style="height:${c.avg?Math.max(c.avg*15,4):4}px"></div><div class="mc-label">${c.label}</div></div>`).join('');}
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set('stat-sessions',S.stats.sessions||0);set('stat-entries',S.stats.entries||0);set('stat-chats',S.stats.chats||0);set('stat-exercises',S.stats.exercises||0);set('sbc-num',S.streak||1);set('streak-num',S.streak||1);
    const tu=document.getElementById('tech-used');if(tu){const icons={grounding:'🌍',pmr:'💆',bodyscan:'🧘',defusion:'🍃',pomodoro:'🍅',affirmations:'💜'};const sorted=Object.entries(S.techniqueUsage||{}).sort((a,b)=>b[1]-a[1]).slice(0,5);if(!sorted.length){tu.innerHTML='<p class="empty-note">Usa l\'app per vedere le statistiche 🌿</p>';}else{tu.innerHTML=sorted.map(([k,v])=>`<div class="tech-row"><span class="tech-icon">${icons[k]||'🌬️'}</span><span class="tech-name">${k}</span><span class="tech-count">${v}x</span></div>`).join('');}}
    StressTracker._updateMiniChart();
  }
};

// ─── NAV ───
const Nav={
  to(screen,btn){
    document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('.bn').forEach(el=>el.classList.remove('active'));
    const el=document.getElementById('screen-'+screen);if(el)el.classList.add('active');
    const nb=btn||document.querySelector(`[data-s="${screen}"]`);if(nb)nb.classList.add('active');
    if(screen==='chart')Stats.render();
    if(screen==='diary')Diary.render();
    if(screen==='chat'&&!document.getElementById('chat-msgs').children.length)Chat.init();
  }
};

// ─── MOOD ───
const Mood={
  quick(v){
    document.querySelectorAll('.qm').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.v)===v));
    const em={1:'😰',2:'😔',3:'😐',4:'🙂',5:'✨'},lb={1:'molto a disagio',2:"un po' giù",3:'così così',4:'bene',5:'benissimo'};
    S.currentMoodV=v;S.currentMood=lb[v];
    S.moodLog.push({date:new Date().toISOString(),v,emoji:em[v]});
    if(S.moodLog.length>200)S.moodLog=S.moodLog.slice(-200);
    persist();
    const sub=document.getElementById('hero-sub');if(sub)sub.textContent=`Ti senti ${lb[v]} ${em[v]}`;
    if(v<=2)setTimeout(()=>Nav.to('chat',document.querySelector('[data-s="chat"]')),700);
    sendEmailLog('mood');
  }
};

// ─── HOME / STREAK ───
function updateStreak(){const today=new Date().toDateString();if(S.lastActiveDate!==today){const y=new Date(Date.now()-86400000).toDateString();if(S.lastActiveDate===y)S.streak=(S.streak||0)+1;else if(!S.lastActiveDate)S.streak=1;S.lastActiveDate=today;persist();}const el=document.getElementById('streak-num');if(el)el.textContent=S.streak||1;}
function updateHome(){
  const days=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'],d=new Date();
  const de=document.getElementById('hero-date');if(de)de.textContent=`${days[d.getDay()]} ${d.toLocaleDateString('it-IT',{day:'numeric',month:'long'})}`;
  const name=S.name||'amica';
  const h2=document.getElementById('hero-h2');if(h2)h2.innerHTML=`Ciao, <em>${name}</em> 🌿`;
  const sub=document.getElementById('hero-sub');if(sub)sub.textContent=S.currentMood?`Ti senti ${S.currentMood} — sono qui per te 💚`:'Come stai oggi?';
  const tn=document.getElementById('topbar-name');if(tn)tn.textContent=name;
  const ts=document.getElementById('topbar-status');if(ts){const h=d.getHours();ts.textContent=h<12?'Buongiorno 🌤️':h<18?'Buon pomeriggio 🌿':'Buona sera 🌙';}
}
function showTip(){const el=document.getElementById('tip-text');if(el)el.textContent=TIPS[Math.floor(Math.random()*TIPS.length)];}

// ─── SETTINGS ───
const UI={
  openSettings(){
    document.getElementById('set-name').textContent=S.name||'—';
    document.getElementById('set-email').textContent=S.notifyEmail||'Non impostata';
    document.getElementById('set-alert').checked=S.alertEnabled!==false;
    document.getElementById('settings-ov').classList.add('open');
  },
  closeSettings(e){if(e&&e.target!==document.getElementById('settings-ov'))return;document.getElementById('settings-ov').classList.remove('open');},
  editName(){const n=prompt('Il tuo nome:',S.name);if(n!==null){S.name=n.trim();persist();document.getElementById('set-name').textContent=S.name;document.getElementById('topbar-name').textContent=S.name;}},
  editEmail(){const e=prompt('Email per le notifiche:',S.notifyEmail);if(e!==null){S.notifyEmail=e.trim();S.notifyEnabled=!!e.trim();persist();document.getElementById('set-email').textContent=S.notifyEmail||'Non impostata';}},
  reset(){if(confirm('Sei sicura? Tutti i dati verranno eliminati.')){localStorage.clear();location.reload();}}
};

// ─── SPLASH PARTICLES ───
function createParticles(){
  const c=document.getElementById('splash-particles');if(!c)return;
  for(let i=0;i<12;i++){const p=document.createElement('div');p.className='s-particle';const size=20+Math.random()*80;p.style.cssText=`width:${size}px;height:${size}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-duration:${6+Math.random()*8}s;animation-delay:${Math.random()*4}s;`;c.appendChild(p);}
}

// ─── BREATH INIT ───
function initBreath(){Breath.setType('478',document.querySelector('.btab[data-t="478"]'));}

// ─── APP BOOT ───
const App={
  ob:OB,chat:Chat,breath:Breath,exercises:Exercises,diary:Diary,
  mood:Mood,nav:Nav,ui:UI,sheet:Sheet,sos:SOS,

  boot(){
    const a=document.getElementById('app');a.classList.remove('hidden');a.classList.add('visible');
    S.totalSessions=(S.totalSessions||0)+1;persist();
    updateStreak();updateHome();showTip();
    Stats.render();Diary.render();
    initBreath();
    sendEmailLog('open');
  }
};

// ─── INIT ───
hydrate();
window.addEventListener('load',()=>{
  createParticles();
  setTimeout(()=>{
    document.getElementById('splash').classList.add('out');
    setTimeout(()=>{
      document.getElementById('splash').style.display='none';
      if(S.name){document.getElementById('onboarding').classList.add('hidden');App.boot();}
      else{document.getElementById('onboarding').classList.remove('hidden');document.getElementById('ob-0').classList.add('active');}
    },800);
  },2400);
});
document.addEventListener('DOMContentLoaded',()=>{
  const ni=document.getElementById('ob-name');
  if(ni)ni.addEventListener('input',function(){document.getElementById('ob-btn-1').disabled=this.value.trim().length<2;});
  // Breath init
  const bd=document.getElementById('breath-desc');if(bd){const c=BT['478'];bd.textContent=c.desc;document.getElementById('bo-num').textContent=c.phases[0].s;}
});

window.App=App;window.OB=OB;window.Chat=Chat;window.Nav=Nav;window.Mood=Mood;
window.Breath=Breath;window.Exercises=Exercises;window.Diary=Diary;
window.Sheet=Sheet;window.SOS=SOS;window.Pomo=Pomo;window.UI=UI;
window.StressTracker=StressTracker;window.toast=toast;window.persist=persist;window.S=S;
