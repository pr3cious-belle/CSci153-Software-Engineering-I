/* ===== CSci 135 Exam Trainer — app logic ===== */
(function(){
"use strict";

/* ---------- utilities ---------- */
function norm(s){
  return (s||"").toLowerCase()
    .replace(/[’']/g,"'")
    .replace(/[^a-z0-9%.\-\s]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function tokens(s){ return norm(s).split(" ").filter(w=>w.length>1); }
function fuzzyMatch(user, key){
  const nu = norm(user), nk = norm(key);
  if(!nu) return false;
  if(nu===nk) return true;
  if(nu.length>=3 && nk.includes(nu)) return true;
  if(nk.length>=3 && nu.includes(nk)) return true;
  const tk = tokens(key).filter(w=>!["the","and","of","a","an","in","to","for","or","on","with","is","are"].includes(w));
  if(!tk.length) return false;
  const hits = tk.filter(w=>nu.includes(w)).length;
  return (hits/tk.length) >= 0.6;
}
function fmtTime(sec){
  sec = Math.max(0,Math.round(sec));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return (h>0? String(h).padStart(2,"0")+":" : "") + String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}
function save(key,val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
function load(key){ try{ const v=localStorage.getItem(key); return v?JSON.parse(v):null; }catch(e){ return null; } }
function clearSave(key){ try{ localStorage.removeItem(key); }catch(e){} }

/* ---------- app state ---------- */
const root = document.getElementById("app");
let state = null; // current test session

const SECTION_DEFS = [
  {key:"mc", label:"Multiple Choice", data:MC, kind:"mc", perPt:1},
  {key:"ident", label:"Identification", data:IDENT, kind:"text", perPt:1},
  {key:"mtf", label:"Modified True or False", data:MTF, kind:"mtf", perPt:1},
  {key:"fib", label:"Fill in the Blanks", data:FIB, kind:"text", perPt:1},
  {key:"enum", label:"Enumeration", data:ENUM, kind:"enum", perPt:null},
  {key:"analysis", label:"Analysis", data:ANALYSIS, kind:"essay", perPt:10},
  {key:"situ", label:"Situational", data:SITU, kind:"essay", perPt:10},
];

const DIFFICULTY = {
  easy:   {label:"Easy", sections:["mc"], desc:"Multiple choice only — 40 items, instant feedback after each answer."},
  medium: {label:"Medium", sections:["mc","ident","mtf","fib"], desc:"Recall drills — multiple choice, identification, modified true/false, fill in the blanks. Instant feedback."},
  hard:   {label:"Hard", sections:["mc","ident","mtf","fib","enum","analysis","situ"], desc:"The full exam content, including enumeration, analysis, and situational items. Self-check your long-answer work against the key."},
};

function buildQuestions(sectionKeys){
  const qs = [];
  sectionKeys.forEach(sk=>{
    const def = SECTION_DEFS.find(d=>d.key===sk);
    def.data.forEach((item,idx)=>{
      qs.push({ section: sk, sectionLabel: def.label, kind: def.kind, idx, item, points: def.kind==="enum" ? item[1].length : (def.kind==="essay"?10:1) });
    });
  });
  return qs;
}

/* ---------- timer ---------- */
let timerInterval = null;
function startTimer(seconds, onTick, onDone){
  let remaining = seconds;
  onTick(remaining);
  timerInterval = setInterval(()=>{
    remaining--;
    onTick(remaining);
    if(remaining<=0){
      clearInterval(timerInterval);
      onDone();
    }
  },1000);
}
function stopTimer(){ if(timerInterval){ clearInterval(timerInterval); timerInterval=null; } }

/* ---------- render: home ---------- */
function renderHome(){
  stopTimer();
  const resumeExam = load("exam_state");
  root.innerHTML = `
    <div class="wrap">
      <header class="masthead">
        <p class="eyebrow">CSci 135 · Software Engineering I</p>
        <h1>Module 1 Exam Trainer</h1>
        <p class="sub">Software Evolution &middot; Software Engineering Concepts &middot; Ethics &amp; Professional Practice &middot; IT Business Trends &middot; IT-BPM Industry Overview 2026 &middot; Roadmap 2028</p>
      </header>

      <div class="modes">
        <section class="mode-card">
          <h2>Practice Test</h2>
          <p class="mode-desc">Untimed. Pick a difficulty. Get feedback right after each answer, and fix mistakes as you go.</p>
          <div class="diff-grid" id="diffGrid"></div>
        </section>

        <section class="mode-card">
          <h2>Real Exam Simulation</h2>
          <p class="mode-desc">All 466 points, every part, one sitting. <strong>1 hour 30 minutes</strong> on the clock — it auto-submits at zero. No feedback until you finish.</p>
          <button class="btn btn-primary btn-wide" id="startExam">Start the 90-minute exam</button>
          ${resumeExam ? `<button class="btn btn-ghost btn-wide" id="resumeExam">Resume in-progress attempt (${fmtTime(resumeExam.remaining)} left)</button>` : ``}
        </section>
      </div>

      <footer class="foot">
        <span>466 points &middot; 7 parts &middot; same questions as the printed exam</span>
      </footer>
    </div>
  `;
  const diffGrid = document.getElementById("diffGrid");
  Object.entries(DIFFICULTY).forEach(([key,d])=>{
    const resumeKey = "practice_"+key;
    const resume = load(resumeKey);
    const card = document.createElement("div");
    card.className = "diff-card diff-"+key;
    const pts = buildQuestions(d.sections).reduce((s,q)=>s+q.points,0);
    card.innerHTML = `
      <h3>${d.label}</h3>
      <p>${d.desc}</p>
      <p class="diff-pts">${pts} pts &middot; ${buildQuestions(d.sections).length} items</p>
      <button class="btn btn-secondary" data-start="${key}">${resume? "Continue":"Start"}</button>
      ${resume? `<button class="btn btn-text" data-reset="${key}">Start over</button>`:""}
    `;
    diffGrid.appendChild(card);
  });
  diffGrid.querySelectorAll("[data-start]").forEach(btn=>{
    btn.addEventListener("click",()=>startPractice(btn.getAttribute("data-start")));
  });
  diffGrid.querySelectorAll("[data-reset]").forEach(btn=>{
    btn.addEventListener("click",(e)=>{ e.stopPropagation(); clearSave("practice_"+btn.getAttribute("data-reset")); renderHome(); });
  });
  document.getElementById("startExam").addEventListener("click", ()=>{
    clearSave("exam_state");
    startExam(90*60);
  });
  if(resumeExam){
    document.getElementById("resumeExam").addEventListener("click", ()=> startExam(resumeExam.remaining, resumeExam));
  }
}

/* ---------- practice mode ---------- */
function startPractice(diffKey){
  const diff = DIFFICULTY[diffKey];
  const saveKey = "practice_"+diffKey;
  const existing = load(saveKey);
  const questions = buildQuestions(diff.sections);
  state = existing && existing.total===questions.length ? existing : {
    mode:"practice", diffKey, saveKey,
    total: questions.length,
    cur: 0,
    answers: new Array(questions.length).fill(null),
    graded: new Array(questions.length).fill(null),
    score: 0, maxScore: questions.reduce((s,q)=>s+q.points,0),
  };
  state.questions = questions;
  renderPractice();
}

function renderPractice(){
  const q = state.questions[state.cur];
  root.innerHTML = `
    <div class="wrap narrow">
      <div class="runbar">
        <button class="btn btn-text" id="backHome">&larr; Exit to menu</button>
        <div class="progress-pill">${DIFFICULTY[state.diffKey].label} &middot; Item ${state.cur+1} / ${state.total}</div>
        <div class="score-pill">Score ${state.score} / ${state.maxScore}</div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${(state.cur/state.total)*100}%"></div></div>
      <div id="qHost"></div>
      <div class="navbar">
        <button class="btn btn-ghost" id="prevBtn" ${state.cur===0?"disabled":""}>&larr; Back</button>
        <button class="btn btn-primary" id="nextBtn">${state.cur===state.total-1? "Finish":"Next →"}</button>
      </div>
    </div>
  `;
  document.getElementById("backHome").addEventListener("click", ()=>{ save(state.saveKey,state); renderHome(); });
  document.getElementById("prevBtn").addEventListener("click", ()=>{ state.cur=Math.max(0,state.cur-1); renderPractice(); });
  document.getElementById("nextBtn").addEventListener("click", ()=>{
    gradeCurrent(true);
    save(state.saveKey,state);
    if(state.cur===state.total-1){ finishPractice(); }
    else { state.cur++; renderPractice(); }
  });
  renderQuestion(document.getElementById("qHost"), q, state.cur, true);
}

function finishPractice(){
  clearSave(state.saveKey);
  renderResults();
}

/* ---------- exam simulation mode ---------- */
function startExam(remainingSeconds, existing){
  const questions = buildQuestions(DIFFICULTY.hard.sections);
  state = existing && existing.total===questions.length ? existing : {
    mode:"exam",
    total: questions.length,
    cur: 0,
    answers: new Array(questions.length).fill(null),
    graded: new Array(questions.length).fill(null),
    score: 0, maxScore: questions.reduce((s,q)=>s+q.points,0),
    remaining: remainingSeconds,
    submitted: false,
  };
  state.questions = questions;
  renderExam();
  startTimer(state.remaining, (rem)=>{
    state.remaining = rem;
    const el = document.getElementById("examTimer");
    if(el) el.textContent = fmtTime(rem);
    if(el && rem<=300) el.classList.add("time-low");
    save("exam_state", {...state, questions:undefined});
  }, ()=>{ submitExam(true); });
}

function renderExam(){
  const q = state.questions[state.cur];
  root.innerHTML = `
    <div class="wrap narrow">
      <div class="runbar exam-runbar">
        <div class="exam-title">Real Exam Simulation</div>
        <div class="timer" id="examTimer">${fmtTime(state.remaining)}</div>
      </div>
      <div class="progress-pill full">${q.sectionLabel} &middot; Item ${state.cur+1} / ${state.total}</div>
      <div class="progress-track"><div class="progress-fill" style="width:${(state.cur/state.total)*100}%"></div></div>
      <div id="qHost"></div>
      <div class="navbar">
        <button class="btn btn-ghost" id="prevBtn" ${state.cur===0?"disabled":""}>&larr; Back</button>
        ${state.cur===state.total-1
          ? `<button class="btn btn-primary" id="submitBtn">Submit exam</button>`
          : `<button class="btn btn-primary" id="nextBtn">Next →</button>`}
      </div>
      <button class="btn btn-text btn-wide" id="quitExam">Save &amp; exit (resume later)</button>
    </div>
  `;
  document.getElementById("prevBtn").addEventListener("click", ()=>{ recordCurrent(); state.cur=Math.max(0,state.cur-1); renderExam(); });
  if(document.getElementById("nextBtn")){
    document.getElementById("nextBtn").addEventListener("click", ()=>{ recordCurrent(); state.cur++; renderExam(); });
  }
  if(document.getElementById("submitBtn")){
    document.getElementById("submitBtn").addEventListener("click", ()=>{ recordCurrent(); submitExam(false); });
  }
  document.getElementById("quitExam").addEventListener("click", ()=>{
    recordCurrent();
    save("exam_state", {...state, questions:undefined});
    stopTimer();
    renderHome();
  });
  renderQuestion(document.getElementById("qHost"), q, state.cur, false);
}

function recordCurrent(){ gradeCurrent(false); }

function submitExam(timeUp){
  stopTimer();
  clearSave("exam_state");
  state.submitted = true;
  state.timeUp = timeUp;
  gradeAll();
  renderResults();
}

function gradeAll(){
  state.score = 0;
  for(let i=0;i<state.total;i++){
    const q = state.questions[i];
    const g = computeGrade(q, state.answers[i]);
    state.graded[i] = g;
    state.score += g.points;
  }
}

/* ---------- question rendering ---------- */
function renderQuestion(host, q, idx, instant){
  const saved = state.answers[idx] || {};
  let html = `<div class="qcard"><div class="qmeta">${q.sectionLabel} &middot; ${q.points} pt${q.points===1?"":"s"}</div>`;

  if(q.kind==="mc"){
    const [prompt, options] = q.item;
    html += `<h3 class="qtext">${prompt}</h3><div class="options" id="optList">`;
    options.forEach((opt,i)=>{
      html += `<label class="option" data-i="${i}"><input type="radio" name="mc" value="${i}" ${saved.choice===i?"checked":""}><span>${String.fromCharCode(65+i)}.</span> ${opt}</label>`;
    });
    html += `</div><div id="feedback"></div>`;
  }
  else if(q.kind==="text"){
    const [prompt] = q.item;
    html += `<h3 class="qtext">${prompt}</h3>
      <input type="text" class="text-input" id="txtAns" placeholder="Your answer" value="${saved.text? escapeHtml(saved.text):""}">
      <div id="feedback"></div>`;
  }
  else if(q.kind==="mtf"){
    const [stmt] = q.item;
    const display = stmt.replace(/\{\{(.*?)\}\}/g, '<span class="underline">$1</span>');
    html += `<h3 class="qtext">${display}</h3>
      <div class="mtf-row">
        <label class="radio-chip"><input type="radio" name="tf" value="TRUE" ${saved.tf==="TRUE"?"checked":""}> TRUE</label>
        <label class="radio-chip"><input type="radio" name="tf" value="FALSE" ${saved.tf==="FALSE"?"checked":""}> FALSE</label>
      </div>
      <input type="text" class="text-input" id="mtfCorrection" placeholder="If FALSE, give the correction" value="${saved.correction?escapeHtml(saved.correction):""}">
      <div id="feedback"></div>`;
  }
  else if(q.kind==="enum"){
    const [prompt, items] = q.item;
    html += `<h3 class="qtext">${prompt} <span class="pts-chip">${items.length} pts</span></h3>
      <textarea class="text-area" id="enumAns" rows="6" placeholder="List one item per line">${saved.text? escapeHtml(saved.text):""}</textarea>
      <div id="feedback"></div>`;
  }
  else if(q.kind==="essay"){
    const [title, prompt, rubric] = q.item;
    html += `<h3 class="qtext">${title}</h3><p class="essay-prompt">${prompt}</p>
      <textarea class="text-area" id="essayAns" rows="9" placeholder="Write your answer here">${saved.text? escapeHtml(saved.text):""}</textarea>
      <div id="feedback"></div>`;
  }
  html += `</div>`;
  host.innerHTML = html;

  if(q.kind==="mc" && instant){
    host.querySelectorAll('input[name="mc"]').forEach(inp=>{
      inp.addEventListener("change", ()=>{
        const choice = parseInt(inp.value,10);
        state.answers[idx] = {choice};
        const g = computeGrade(q, state.answers[idx]);
        applyScoreDelta(idx,g);
        showMCFeedback(host, q, choice, g.correct);
      });
    });
    if(saved.choice!==undefined && saved.choice!==null){
      showMCFeedback(host, q, saved.choice, state.graded[idx]? state.graded[idx].correct : (saved.choice===q.item[2]));
    }
  }
  if(q.kind==="mc" && !instant){
    host.querySelectorAll('input[name="mc"]').forEach(inp=>{
      inp.addEventListener("change", ()=>{ state.answers[idx] = {choice: parseInt(inp.value,10)}; });
    });
  }

  if((q.kind==="text") && instant){
    const btn = document.createElement("button");
    btn.className="btn btn-secondary btn-wide"; btn.textContent="Check answer";
    host.querySelector(".qcard").appendChild(btn);
    btn.addEventListener("click", ()=>{
      const val = document.getElementById("txtAns").value;
      state.answers[idx] = {text:val};
      const g = computeGrade(q, state.answers[idx]);
      applyScoreDelta(idx,g);
      showTextFeedback(host, q.item[1], g, idx, q);
    });
  }
  if(q.kind==="mtf" && instant){
    const btn = document.createElement("button");
    btn.className="btn btn-secondary btn-wide"; btn.textContent="Check answer";
    host.querySelector(".qcard").appendChild(btn);
    btn.addEventListener("click", ()=>{
      const tf = (host.querySelector('input[name="tf"]:checked')||{}).value;
      const correction = document.getElementById("mtfCorrection").value;
      state.answers[idx] = {tf, correction};
      const g = computeGrade(q, state.answers[idx]);
      applyScoreDelta(idx,g);
      const key = q.item[1];
      const correctText = key==="TRUE" ? "TRUE" : key.replace(/^FALSE:\s*/,"");
      showTextFeedback(host, correctText, g, idx, q, key==="TRUE"?"This statement is TRUE as written.":"The underlined part is false. Correct answer:");
    });
  }
  if(q.kind==="enum" && instant){
    const btn = document.createElement("button");
    btn.className="btn btn-secondary btn-wide"; btn.textContent="Check my list";
    host.querySelector(".qcard").appendChild(btn);
    btn.addEventListener("click", ()=>{
      const val = document.getElementById("enumAns").value;
      state.answers[idx] = {text:val};
      const g = computeGrade(q, state.answers[idx]);
      applyScoreDelta(idx,g);
      showEnumFeedback(host, q, g);
    });
  }
  if(q.kind==="essay" && instant){
    const btn = document.createElement("button");
    btn.className="btn btn-secondary btn-wide"; btn.textContent="Reveal rubric & self-grade";
    host.querySelector(".qcard").appendChild(btn);
    btn.addEventListener("click", ()=>{
      const val = document.getElementById("essayAns").value;
      state.answers[idx] = {text:val, checked: state.answers[idx]&&state.answers[idx].checked || []};
      showEssayRubric(host, q, idx, true);
    });
  }

  // for non-instant (exam) text/mtf/enum/essay, just capture on change
  if(!instant){
    if(q.kind==="text"){
      document.getElementById("txtAns").addEventListener("input", (e)=>{ state.answers[idx]={text:e.target.value}; });
    }
    if(q.kind==="mtf"){
      host.querySelectorAll('input[name="tf"]').forEach(inp=>inp.addEventListener("change",()=>{
        state.answers[idx] = state.answers[idx]||{}; state.answers[idx].tf = inp.value;
      }));
      document.getElementById("mtfCorrection").addEventListener("input",(e)=>{
        state.answers[idx] = state.answers[idx]||{}; state.answers[idx].correction = e.target.value;
      });
    }
    if(q.kind==="enum"){
      document.getElementById("enumAns").addEventListener("input",(e)=>{ state.answers[idx]={text:e.target.value}; });
    }
    if(q.kind==="essay"){
      document.getElementById("essayAns").addEventListener("input",(e)=>{ state.answers[idx]={text:e.target.value, checked:[]}; });
    }
  }
}

function escapeHtml(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function applyScoreDelta(idx, g){
  const prev = state.graded[idx];
  if(prev) state.score -= prev.points;
  state.graded[idx] = g;
  state.score += g.points;
  const pill = document.querySelector(".score-pill");
  if(pill) pill.textContent = `Score ${state.score} / ${state.maxScore}`;
}

function showMCFeedback(host, q, choice, correct){
  const [,options,correctIndex] = q.item;
  const fb = host.querySelector("#feedback");
  host.querySelectorAll(".option").forEach((lab,i)=>{
    lab.classList.remove("opt-correct","opt-wrong");
    if(i===correctIndex) lab.classList.add("opt-correct");
    else if(i===choice && !correct) lab.classList.add("opt-wrong");
  });
  fb.innerHTML = `<div class="feedback ${correct?"fb-ok":"fb-bad"}">${correct? "Correct." : "Not quite. Correct answer: "+String.fromCharCode(65+correctIndex)+". "+options[correctIndex]}</div>`;
}

function showTextFeedback(host, correctAnswer, g, idx, q, label){
  const fb = host.querySelector("#feedback");
  fb.innerHTML = `
    <div class="feedback ${g.correct?"fb-ok":"fb-bad"}">
      <div>${label || (g.correct? "Matched the key.":"Here's the accepted answer:")}</div>
      <div class="key-answer">${correctAnswer}</div>
      ${!g.correct? `<button class="btn btn-text" id="overrideRight">Mark mine correct anyway</button>`:""}
    </div>`;
  if(!g.correct){
    document.getElementById("overrideRight").addEventListener("click", ()=>{
      const ng = {...g, correct:true, points:q.points};
      applyScoreDelta(idx,ng);
      fb.innerHTML = `<div class="feedback fb-ok"><div>Marked correct.</div><div class="key-answer">${correctAnswer}</div></div>`;
    });
  }
}

function showEnumFeedback(host, q, g){
  const [,items] = q.item;
  const fb = host.querySelector("#feedback");
  let rows = items.map((it,i)=>{
    const got = g.matchedFlags[i];
    return `<li class="${got?"enum-hit":"enum-miss"}">${got?"✓":"✗"} ${it}</li>`;
  }).join("");
  fb.innerHTML = `<div class="feedback ${g.points===q.points?"fb-ok":"fb-partial"}">
    <div>You matched ${g.points} of ${q.points} items.</div>
    <ul class="enum-list">${rows}</ul>
  </div>`;
}

function showEssayRubric(host, q, idx, instant){
  const [,, rubric] = q.item;
  const saved = state.answers[idx] || {text:"",checked:[]};
  const fb = host.querySelector("#feedback");
  let rows = rubric.map((pt,i)=>{
    const checked = saved.checked && saved.checked.includes(i);
    return `<label class="rubric-row"><input type="checkbox" data-i="${i}" ${checked?"checked":""}> ${pt}</label>`;
  }).join("");
  fb.innerHTML = `
    <div class="feedback fb-neutral">
      <div>Self-check: tick each point your answer actually covered.</div>
      <div class="rubric-list">${rows}</div>
      <div class="essay-score" id="essayScore">Self-graded: ${(saved.checked||[]).length}/${rubric.length} points covered &rarr; ${Math.round(((saved.checked||[]).length/rubric.length)*10)} / 10</div>
    </div>`;
  fb.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const i = parseInt(cb.getAttribute("data-i"),10);
      state.answers[idx].checked = state.answers[idx].checked || [];
      if(cb.checked) { if(!state.answers[idx].checked.includes(i)) state.answers[idx].checked.push(i); }
      else { state.answers[idx].checked = state.answers[idx].checked.filter(x=>x!==i); }
      const n = state.answers[idx].checked.length;
      const pts = Math.round((n/rubric.length)*10);
      document.getElementById("essayScore").textContent = `Self-graded: ${n}/${rubric.length} points covered → ${pts} / 10`;
      const g = {correct: pts===10, points: pts, matchedFlags:null};
      applyScoreDelta(idx,g);
    });
  });
}

/* ---------- grading ---------- */
function gradeCurrent(instantAlreadyApplied){
  // used for exam mode "record on navigation" — grading deferred to submit, except essays need checked[] default
}

function computeGrade(q, ans){
  if(!ans) return {correct:false, points:0, matchedFlags:q.kind==="enum"? new Array(q.item[1].length).fill(false) : undefined};
  if(q.kind==="mc"){
    const correctIndex = q.item[2];
    const correct = ans.choice===correctIndex;
    return {correct, points: correct? q.points:0};
  }
  if(q.kind==="text"){
    const correctAnswer = q.item[1];
    const correct = fuzzyMatch(ans.text||"", correctAnswer);
    return {correct, points: correct? q.points:0};
  }
  if(q.kind==="mtf"){
    const key = q.item[1];
    if(key==="TRUE"){
      const correct = (ans.tf==="TRUE");
      return {correct, points: correct?q.points:0};
    } else {
      const correctionKey = key.replace(/^FALSE:\s*/,"");
      const correct = ans.tf==="FALSE" && fuzzyMatch(ans.correction||"", correctionKey);
      return {correct, points: correct?q.points:0};
    }
  }
  if(q.kind==="enum"){
    const items = q.item[1];
    const userPieces = (ans.text||"").split(/[\n;,]+/).map(s=>s.trim()).filter(Boolean);
    const matchedFlags = items.map(it=> userPieces.some(p=>fuzzyMatch(p,it)));
    const pts = matchedFlags.filter(Boolean).length;
    return {correct: pts===items.length, points: pts, matchedFlags};
  }
  if(q.kind==="essay"){
    const rubric = q.item[2];
    const n = (ans.checked||[]).length;
    const pts = rubric.length? Math.round((n/rubric.length)*10) : 0;
    return {correct: pts===10, points: pts};
  }
  return {correct:false, points:0};
}

/* ---------- results ---------- */
function renderResults(){
  stopTimer();
  // ensure every question has a grade entry (exam mode just graded all; practice already incremental)
  if(state.mode==="exam"){
    // already graded via gradeAll in submitExam
  } else {
    // fill any ungraded with current computed grade (in case user skipped "check")
    for(let i=0;i<state.total;i++){
      if(!state.graded[i]) state.graded[i] = computeGrade(state.questions[i], state.answers[i]);
    }
    state.score = state.graded.reduce((s,g)=>s+(g?g.points:0),0);
  }

  const hasEssays = state.questions.some(q=>q.kind==="essay");

  root.innerHTML = `
    <div class="wrap narrow">
      <div class="result-hero">
        <p class="eyebrow">${state.mode==="exam"? (state.timeUp? "Time's up — auto-submitted":"Exam submitted") : "Practice complete"}</p>
        <h1 id="heroScore">${state.score} / ${state.maxScore}</h1>
        <p class="pct" id="heroPct"></p>
        ${hasEssays? `<p class="sub" style="margin-top:8px;">Analysis and Situational items are self-graded — open Review and tick the rubric points your answer covered.</p>`:``}
      </div>
      <div class="section-breakdown" id="sectionBreakdown"></div>
      <div class="result-actions">
        <button class="btn btn-secondary btn-wide" id="reviewBtn">Review all answers</button>
        <button class="btn btn-primary btn-wide" id="homeBtn">Back to menu</button>
      </div>
      <div id="reviewHost"></div>
    </div>
  `;
  refreshScoreHeader();
  document.getElementById("homeBtn").addEventListener("click", renderHome);
  document.getElementById("reviewBtn").addEventListener("click", ()=>{
    renderReview(document.getElementById("reviewHost"));
    document.getElementById("reviewBtn").remove();
  });
}

function refreshScoreHeader(){
  state.score = state.graded.reduce((s,g)=>s+(g?g.points:0),0);
  const pct = state.maxScore? Math.round((state.score/state.maxScore)*100) : 0;
  const heroScore = document.getElementById("heroScore");
  const heroPct = document.getElementById("heroPct");
  if(heroScore) heroScore.textContent = `${state.score} / ${state.maxScore}`;
  if(heroPct) heroPct.textContent = `${pct}%`;
  const bySection = {};
  state.questions.forEach((q,i)=>{
    bySection[q.section] = bySection[q.section] || {label:q.sectionLabel, got:0, max:0};
    bySection[q.section].max += q.points;
    bySection[q.section].got += (state.graded[i]? state.graded[i].points:0);
  });
  const host = document.getElementById("sectionBreakdown");
  if(host){
    host.innerHTML = Object.values(bySection).map(s=>`
      <div class="sb-row">
        <span>${s.label}</span>
        <div class="sb-track"><div class="sb-fill" style="width:${s.max? (s.got/s.max*100):0}%"></div></div>
        <span class="sb-score">${s.got}/${s.max}</span>
      </div>
    `).join("");
  }
}

function renderReview(host){
  let html = `<div class="review-list">`;
  state.questions.forEach((q,i)=>{
    const g = state.graded[i] || computeGrade(q, state.answers[i]);
    const ans = state.answers[i];
    html += `<div class="review-item ${g.points>=q.points?"ri-ok":(g.points>0?"ri-partial":"ri-bad")}" id="ri-${i}">
      <div class="ri-head"><span class="ri-section">${q.sectionLabel}</span><span class="ri-pts" id="ri-pts-${i}">${g.points} / ${q.points} pt${q.points===1?"":"s"}</span></div>
      ${renderReviewBody(q, ans, g, i)}
    </div>`;
  });
  html += `</div>`;
  host.innerHTML = html;

  state.questions.forEach((q,i)=>{
    if(q.kind!=="essay") return;
    const rubric = q.item[2];
    const block = document.getElementById(`essayblock-${i}`);
    if(!block) return;
    block.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
      cb.addEventListener("change", ()=>{
        const ci = parseInt(cb.getAttribute("data-i"),10);
        state.answers[i] = state.answers[i] || {text:"",checked:[]};
        state.answers[i].checked = state.answers[i].checked || [];
        if(cb.checked){ if(!state.answers[i].checked.includes(ci)) state.answers[i].checked.push(ci); }
        else { state.answers[i].checked = state.answers[i].checked.filter(x=>x!==ci); }
        const n = state.answers[i].checked.length;
        const pts = Math.round((n/rubric.length)*10);
        state.graded[i] = {correct: pts===10, points: pts};
        const scoreEl = document.getElementById(`essayscore-${i}`);
        if(scoreEl) scoreEl.textContent = `Self-graded: ${n}/${rubric.length} points covered → ${pts} / 10`;
        const ptsEl = document.getElementById(`ri-pts-${i}`);
        if(ptsEl) ptsEl.textContent = `${pts} / 10 pts`;
        const itemEl = document.getElementById(`ri-${i}`);
        if(itemEl){ itemEl.classList.remove("ri-ok","ri-partial","ri-bad"); itemEl.classList.add(pts>=10?"ri-ok":(pts>0?"ri-partial":"ri-bad")); }
        refreshScoreHeader();
      });
    });
  });
}

function renderReviewBody(q, ans, g, idx){
  if(q.kind==="mc"){
    const [prompt, options, correctIndex] = q.item;
    const chosen = ans? ans.choice : null;
    return `<div class="ri-q">${prompt}</div>
      <div class="ri-a">Your answer: ${chosen!=null? String.fromCharCode(65+chosen)+". "+options[chosen] : "— no answer —"}</div>
      <div class="ri-key">Correct: ${String.fromCharCode(65+correctIndex)}. ${options[correctIndex]}</div>`;
  }
  if(q.kind==="text"){
    const [prompt, correct] = q.item;
    return `<div class="ri-q">${prompt}</div>
      <div class="ri-a">Your answer: ${ans&&ans.text? escapeHtml(ans.text) : "— no answer —"}</div>
      <div class="ri-key">Correct: ${correct}</div>`;
  }
  if(q.kind==="mtf"){
    const [stmt, key] = q.item;
    const display = stmt.replace(/\{\{(.*?)\}\}/g, '<span class="underline">$1</span>');
    const correctText = key==="TRUE"?"TRUE": key.replace(/^FALSE:\s*/,"");
    return `<div class="ri-q">${display}</div>
      <div class="ri-a">Your answer: ${ans? (ans.tf||"—")+(ans.correction? " — "+escapeHtml(ans.correction):"") : "— no answer —"}</div>
      <div class="ri-key">Correct: ${key==="TRUE"?"TRUE":"FALSE — "+correctText}</div>`;
  }
  if(q.kind==="enum"){
    const [prompt, items] = q.item;
    const flags = g.matchedFlags || items.map(()=>false);
    return `<div class="ri-q">${prompt}</div>
      <ul class="enum-list">${items.map((it,i)=>`<li class="${flags[i]?"enum-hit":"enum-miss"}">${flags[i]?"✓":"✗"} ${it}</li>`).join("")}</ul>`;
  }
  if(q.kind==="essay"){
    const [title, prompt, rubric] = q.item;
    const checked = (ans && ans.checked) || [];
    const rows = rubric.map((pt,i)=>`<label class="rubric-row"><input type="checkbox" data-i="${i}" ${checked.includes(i)?"checked":""}> ${pt}</label>`).join("");
    return `<div class="ri-q"><strong>${title}.</strong> ${prompt}</div>
      <div class="ri-a">Your answer: ${ans&&ans.text? escapeHtml(ans.text).replace(/\n/g,"<br>") : "— no answer —"}</div>
      <div class="ri-key" id="essayblock-${idx}">
        <strong>Self-check against the rubric</strong>
        <div class="rubric-list">${rows}</div>
        <div class="essay-score" id="essayscore-${idx}">Self-graded: ${checked.length}/${rubric.length} points covered → ${Math.round((checked.length/rubric.length)*10)} / 10</div>
      </div>`;
  }
  return "";
}

renderHome();
window.addEventListener("beforeunload", ()=>{
  if(state && state.mode==="exam" && !state.submitted){ save("exam_state", {...state, questions:undefined}); }
  if(state && state.mode==="practice"){ save(state.saveKey, {...state, questions:undefined}); }
});

})();
