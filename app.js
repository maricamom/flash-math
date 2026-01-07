(() => {
  const LS_SETTINGS = 'flash_math_settings_v1';
  const LS_HISTORY  = 'flash_math_history_v1';
  const LS_SETS     = 'flash_math_sets_v1';

  const TOTAL_QUESTIONS = 50;

  const $ = (id) => document.getElementById(id);

  const elSettings = $('screenSettings');
  const elQuiz = $('screenQuiz');
  const elHistory = $('screenHistory');

  const elProblem = $('problem');
  const elAnswer = $('answer');
  const elCountdown = $('countdown');
  const elControlsReveal = $('controlsReveal');

  const elStatus = $('status');

  const elNowNo = $('nowNo');
  const elRemainNo = $('remainNo');

  const elResultWrap = $('resultWrap');
  const elResult = $('result');

  const btnToSettings = $('btnToSettings');
  const btnStart = $('btnStart');
  const btnRevealNow = $('btnRevealNow');
  const btnCorrect = $('btnCorrect');
  const btnWrong = $('btnWrong');

  const btnBackToSettings = $('btnBackToSettings');

  const sum10Card = $('sum10Card');
  const chkSum10 = $('sum10');

  const btnResetAll = $('btnResetAll');
  const tabProblem = $('tabProblem');
  const tabSet = $('tabSet');
  const paneProblem = $('paneProblem');
  const paneSet = $('paneSet');
  const historyProblemList = $('historyProblemList');
  const historySetList = $('historySetList');

  const state = {
    screen: 'settings',   // settings | quiz | history
    settings: {
      opmode: 'add',      // add | sub | mix
      range: 'c2a',       // c2a | c2b | c3
      sum10: false,       // add only
      seconds: 3
    },
    history: {},          // key -> { shown, correct, weight, last_at }
    sets: [],             // { at, total, correct, duration_ms, settings }
    current: null,        // { op,left,right,answer,key }
    prevKey: null,
    timer: null,
    remaining: 0,
    phase: 'settings',    // settings | question | reveal | done
    sessionTotal: 0,
    sessionCorrect: 0,
    sessionStartedAt: 0,
    histFilterOp: 'all',  // all | add | sub
    histTab: 'problem'    // problem | set
  };

  function setStatus(msg) {
    elStatus.textContent = msg || '';
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null');
      if (s && typeof s === 'object') {
        state.settings = { ...state.settings, ...s };
      }
    } catch {}
  }

  function saveSettings() {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings));
  }

  function loadHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(LS_HISTORY) || '{}');
      if (h && typeof h === 'object') state.history = h;
    } catch {
      state.history = {};
    }
  }

  function saveHistory() {
    localStorage.setItem(LS_HISTORY, JSON.stringify(state.history));
  }

  function loadSets() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SETS) || '[]');
      if (Array.isArray(s)) state.sets = s;
    } catch {
      state.sets = [];
    }
  }

  function saveSets() {
    localStorage.setItem(LS_SETS, JSON.stringify(state.sets));
  }

  function clearTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function showScreen(name) {
    state.screen = name;

    if (name === 'settings') {
      elSettings.classList.remove('hidden');
      elSettings.removeAttribute('hidden');
    } else {
      elSettings.classList.add('hidden');
      elSettings.setAttribute('hidden', '');
    }

    if (name === 'quiz') {
      elQuiz.classList.remove('hidden');
      elQuiz.removeAttribute('hidden');
    } else {
      elQuiz.classList.add('hidden');
      elQuiz.setAttribute('hidden', '');
    }

    if (name === 'history') {
      elHistory.classList.remove('hidden');
      elHistory.removeAttribute('hidden');
    } else {
      elHistory.classList.add('hidden');
      elHistory.setAttribute('hidden', '');
    }

    if (name === 'settings') btnToSettings.textContent = 'りれき';
    if (name === 'quiz') btnToSettings.textContent = 'おわる';
    if (name === 'history') btnToSettings.textContent = 'せってい';

    setStatus('');
  }

  function setActiveSeg(selector, value, attr) {
    document.querySelectorAll(selector).forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute(attr) === String(value));
    });
  }

  function normalizeUIBySettings() {
    setActiveSeg('.segBtn[data-opmode]', state.settings.opmode, 'data-opmode');
    setActiveSeg('.segBtn[data-range]', state.settings.range, 'data-range');
    setActiveSeg('.segBtn[data-seconds]', state.settings.seconds, 'data-seconds');

    const showSum10 = (state.settings.opmode === 'add' || state.settings.opmode === 'mix');
    sum10Card.classList.toggle('hidden', !showSum10);
    if (!showSum10) state.settings.sum10 = false;
    chkSum10.checked = !!state.settings.sum10;
  }

  function syncQuizUI() {
    if (state.phase === 'reveal') {
      elAnswer.classList.remove('hidden');
      elControlsReveal.classList.remove('hidden');
    } else {
      elAnswer.classList.add('hidden');
      elControlsReveal.classList.add('hidden');
    }
  }

  function opSymbol(op) {
    return op === 'add' ? '+' : '−';
  }

  function makeKey(op, left, right) {
    return `${op}:${left}:${right}`;
  }

  function getHist(key) {
    const h = state.history[key];
    if (h && typeof h === 'object') return h;
    const init = { shown: 0, correct: 0, weight: 1.0, last_at: 0 };
    state.history[key] = init;
    return init;
  }

  function updateWeight(key, isCorrect) {
    const h = getHist(key);
    h.shown += 1;
    if (isCorrect) {
      h.correct += 1;
      h.weight = Math.max(0.3, +(h.weight * 0.8).toFixed(6));
    } else {
      h.weight = Math.min(3.0, +(h.weight * 1.25).toFixed(6));
    }
    h.last_at = Date.now();
  }

  function getRangeSpec() {
    const r = state.settings.range;

    if (r === 'c2a') {
      return { aMin: 1, aMax: 9, bMin: 1, bMax: 9, mode: 'both' };
    }

    if (r === 'c2b') {
      return { aMin: 1, aMax: 19, bMin: 1, bMax: 19, mode: 'both' };
    }

    return {
      aMin: 10,
      aMax: 99,
      bMin: 1,
      bMax: 9,
      mode: 'one2digit'
    };
  }

  function listCandidatesForOp(op) {
    const spec = getRangeSpec();
    const sum10 = !!state.settings.sum10;

    const out = [];

    if (spec.mode === 'both') {
      for (let a = spec.aMin; a <= spec.aMax; a++) {
        for (let b = spec.bMin; b <= spec.bMax; b++) {
          if (op === 'add') {
            const ans = a + b;
            if (sum10 && ans > 10) continue;
            const key = makeKey(op, a, b);
            out.push({ op, left: a, right: b, answer: ans, key });
          } else {
            const left = Math.max(a, b);
            const right = Math.min(a, b);
            const ans = left - right;
            const key = makeKey(op, left, right);
            out.push({ op, left, right, answer: ans, key });
          }
        }
      }
    } else {
      for (let two = spec.aMin; two <= spec.aMax; two++) {
        for (let one = spec.bMin; one <= spec.bMax; one++) {
          if (op === 'add') {
            let a = two, b = one;
            let ans = a + b;
            if (!(sum10 && ans > 10)) out.push({ op, left: a, right: b, answer: ans, key: makeKey(op, a, b) });

            a = one; b = two;
            ans = a + b;
            if (!(sum10 && ans > 10)) out.push({ op, left: a, right: b, answer: ans, key: makeKey(op, a, b) });
          } else {
            let left = two, right = one;
            if (left < right) [left, right] = [right, left];
            out.push({ op, left, right, answer: left - right, key: makeKey(op, left, right) });

            left = one; right = two;
            if (left < right) [left, right] = [right, left];
            out.push({ op, left, right, answer: left - right, key: makeKey(op, left, right) });
          }
        }
      }
      const seen = new Set();
      const uniq = [];
      for (const p of out) {
        if (seen.has(p.key)) continue;
        seen.add(p.key);
        uniq.push(p);
      }
      return uniq;
    }

    if (op === 'sub') {
      const seen = new Set();
      const uniq = [];
      for (const p of out) {
        if (seen.has(p.key)) continue;
        seen.add(p.key);
        uniq.push(p);
      }
      return uniq;
    }

    return out;
  }

  function listCandidatesBySettings() {
    const m = state.settings.opmode;
    if (m === 'add') return listCandidatesForOp('add');
    if (m === 'sub') return listCandidatesForOp('sub');
    return listCandidatesForOp('add').concat(listCandidatesForOp('sub'));
  }

  function weightedPick(candidates) {
    const filtered = candidates.filter(c => c.key !== state.prevKey);
    const pool = filtered.length ? filtered : candidates;

    let total = 0;
    const weights = new Array(pool.length);

    for (let i = 0; i < pool.length; i++) {
      const h = state.history[pool[i].key];
      const w = (h && typeof h.weight === 'number') ? h.weight : 1.0;
      weights[i] = w;
      total += w;
    }

    if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];

    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function formatProblem(p) {
    return `${p.left} ${opSymbol(p.op)} ${p.right}`;
  }

  function updateProgressDisplay() {
    const now = Math.min(TOTAL_QUESTIONS, state.sessionTotal + 1);
    const remain = Math.max(0, TOTAL_QUESTIONS - state.sessionTotal);
    elNowNo.textContent = String(now);
    elRemainNo.textContent = String(remain);
  }

  function startTimer() {
    clearTimer();

    state.timer = setInterval(() => {
      state.remaining -= 1;

      elCountdown.textContent = `あと ${Math.max(0, state.remaining)} びょう`;

      if (state.remaining <= 0) {
        clearTimer();
        setTimeout(() => revealAnswer(), 80);
      }
    }, 1000);
  }

  function startQuestion() {
    clearTimer();
    state.phase = 'question';
    syncQuizUI();

    elResultWrap.classList.add('hidden');
    elResultWrap.setAttribute('hidden', '');

    updateProgressDisplay();

    const candidates = listCandidatesBySettings();
    if (!candidates.length) {
      setStatus('もんだいが ありません。せっていを かえてね');
      showScreen('settings');
      return;
    }

    const p = weightedPick(candidates);
    state.current = p;
    state.prevKey = p.key;

    elProblem.textContent = formatProblem(p);
    elAnswer.textContent = String(p.answer);
    elAnswer.classList.add('hidden');
    elControlsReveal.classList.add('hidden');

    state.remaining = Number(state.settings.seconds) || 3;
    elCountdown.textContent = `あと ${state.remaining} びょう`;

    startTimer();
  }

  function revealAnswer() {
    clearTimer();
    state.phase = 'reveal';
    syncQuizUI();
  }

  function formatMs(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    const mm = String(m).padStart(2, '0');
    const rr = String(r).padStart(2, '0');
    return `${mm}:${rr}`;
  }

  function renderResult(correct, total, durationMs) {
    const d = formatMs(durationMs);
    elResult.innerHTML = [
      `<div class='resultLine'><span class='resultNum'>${total}</span><span class='resultText'>もん おわり</span></div>`,
      `<div class='resultLine'><span class='resultNum'>${correct}</span><span class='resultText'>もん できた</span></div>`,
      `<div class='itemMeta'>じかん ${d}</div>`
    ].join('');

    elResultWrap.classList.remove('hidden');
    elResultWrap.removeAttribute('hidden');
  }

  function finishSet({ save = true } = {}) {
    clearTimer();
    state.phase = 'done';

    elNowNo.textContent = String(Math.min(TOTAL_QUESTIONS, state.sessionTotal));
    elRemainNo.textContent = '0';
    elCountdown.textContent = 'あと 0 びょう';

    const durationMs = state.sessionStartedAt ? (Date.now() - state.sessionStartedAt) : 0;

    if (state.sessionTotal > 0) {
      renderResult(state.sessionCorrect, state.sessionTotal, durationMs);
    } else {
      elResultWrap.classList.add('hidden');
      elResultWrap.setAttribute('hidden', '');
    }

    if (save && state.sessionTotal > 0) {
      state.sets.unshift({
        at: Date.now(),
        total: state.sessionTotal,
        correct: state.sessionCorrect,
        duration_ms: durationMs,
        settings: { ...state.settings }
      });
      if (state.sets.length > 200) state.sets.length = 200;
      saveSets();
    }
  }

  function submitResult(isCorrect) {
    if (!state.current) return;

    state.sessionTotal += 1;
    if (isCorrect) state.sessionCorrect += 1;

    updateWeight(state.current.key, isCorrect);
    saveHistory();

    if (state.sessionTotal >= TOTAL_QUESTIONS) {
      finishSet({ save: true });
      return;
    }

    startQuestion();
  }

  function openHistory() {
    renderHistory();
    showScreen('history');
  }

  function openSettings() {
    showScreen('settings');
  }

  function openQuizEnd() {
    if (state.screen !== 'quiz') return;
    finishSet({ save: true });
  }

  function setHistTab(name) {
    state.histTab = name;

    if (name === 'problem') {
      tabProblem.classList.add('active');
      tabSet.classList.remove('active');

      paneProblem.classList.remove('hidden');
      paneProblem.removeAttribute('hidden');

      paneSet.classList.add('hidden');
      paneSet.setAttribute('hidden', '');
    } else {
      tabSet.classList.add('active');
      tabProblem.classList.remove('active');

      paneSet.classList.remove('hidden');
      paneSet.removeAttribute('hidden');

      paneProblem.classList.add('hidden');
      paneProblem.setAttribute('hidden', '');
    }
  }

  function accuracyOf(h) {
    if (!h || !h.shown) return 1;
    return h.correct / h.shown;
  }

  function renderHistory() {
    document.querySelectorAll('.chip').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter-op') === state.histFilterOp);
    });

    const rows = Object.entries(state.history).map(([key, h]) => {
      const [op, left, right] = key.split(':');
      return { key, op, left: Number(left), right: Number(right), h };
    }).filter(r => {
      if (state.histFilterOp === 'all') return true;
      return r.op === state.histFilterOp;
    });

    rows.sort((a, b) => {
      const aa = accuracyOf(a.h);
      const bb = accuracyOf(b.h);
      if (aa !== bb) return aa - bb;
      if (a.h.shown !== b.h.shown) return b.h.shown - a.h.shown;
      return b.h.last_at - a.h.last_at;
    });

    historyProblemList.innerHTML = '';
    if (!rows.length) {
      historyProblemList.innerHTML = `<div class='hint'>りれきが ありません</div>`;
    } else {
      for (const r of rows.slice(0, 300)) {
        const acc = accuracyOf(r.h);
        const pct = Math.round(acc * 100);
        const title = `${r.left} ${opSymbol(r.op)} ${r.right}`;
        const meta = `みた ${r.h.shown} / できた ${r.h.correct} / せいかいりつ ${pct}%`;

        const barPct = Math.max(0, Math.min(100, pct));
        const item = document.createElement('div');
        item.className = 'item';
        item.innerHTML = `
          <div class='itemTop'>
            <div class='itemTitle'>${title}</div>
            <div class='itemMeta'>${meta}</div>
          </div>
          <div class='itemBar'><div style='width:${barPct}%'></div></div>
        `;
        historyProblemList.appendChild(item);
      }
    }

    historySetList.innerHTML = '';
    if (!state.sets.length) {
      historySetList.innerHTML = `<div class='hint'>りれきが ありません</div>`;
    } else {
      for (const s of state.sets.slice(0, 200)) {
        const d = new Date(s.at);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');

        const opLabel = (s.settings?.opmode === 'add') ? 'たし' : (s.settings?.opmode === 'sub') ? 'ひき' : 'まぜ';
        const rangeLabel = (s.settings?.range === 'c2a') ? 'ひとけた' : (s.settings?.range === 'c2b') ? '1〜19' : 'にけた';
        const secLabel = `${s.settings?.seconds || 3}びょう`;
        const dur = formatMs(s.duration_ms || 0);

        const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;

        const item = document.createElement('div');
        item.className = 'item';
        item.innerHTML = `
          <div class='itemTop'>
            <div class='itemTitle'>${s.correct}/${s.total}（${acc}%）</div>
            <div class='itemMeta'>${y}-${mo}-${da} ${hh}:${mm}</div>
          </div>
          <div class='itemMeta'>${opLabel} / ${rangeLabel} / ${secLabel} / じかん ${dur}</div>
        `;
        historySetList.appendChild(item);
      }
    }

    setHistTab(state.histTab);
  }

  function resetAll() {
    const ok = confirm('りれきを ぜんぶ けして いい？');
    if (!ok) return;

    state.history = {};
    state.sets = [];
    saveHistory();
    saveSets();
    renderHistory();
    setStatus('りれきを りせっと しました');
    setTimeout(() => setStatus(''), 1200);
  }

  function wireUI() {
    document.querySelectorAll('.segBtn[data-opmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.settings.opmode = btn.getAttribute('data-opmode');
        if (state.settings.opmode === 'sub') state.settings.sum10 = false;
        saveSettings();
        normalizeUIBySettings();
      });
    });

    document.querySelectorAll('.segBtn[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.settings.range = btn.getAttribute('data-range');
        saveSettings();
        normalizeUIBySettings();
      });
    });

    document.querySelectorAll('.segBtn[data-seconds]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.settings.seconds = Number(btn.getAttribute('data-seconds'));
        saveSettings();
        normalizeUIBySettings();
      });
    });

    chkSum10.addEventListener('change', () => {
      state.settings.sum10 = chkSum10.checked;
      saveSettings();
      normalizeUIBySettings();
    });

    btnStart.addEventListener('click', () => {
      saveSettings();

      state.sessionTotal = 0;
      state.sessionCorrect = 0;
      state.sessionStartedAt = Date.now();

      elResultWrap.classList.add('hidden');
      elResultWrap.setAttribute('hidden', '');

      showScreen('quiz');
      startQuestion();
    });

    btnRevealNow.addEventListener('click', () => revealAnswer());
    btnCorrect.addEventListener('click', () => submitResult(true));
    btnWrong.addEventListener('click', () => submitResult(false));

    btnBackToSettings.addEventListener('click', () => {
      clearTimer();
      state.current = null;
      state.phase = 'settings';
      showScreen('settings');
    });

    btnToSettings.addEventListener('click', () => {
      if (state.screen === 'settings') return openHistory();
      if (state.screen === 'history') return openSettings();
      if (state.screen === 'quiz') return openQuizEnd();
    });

    tabProblem.addEventListener('click', () => setHistTab('problem'));
    tabSet.addEventListener('click', () => setHistTab('set'));

    document.querySelectorAll('.chip[data-filter-op]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.histFilterOp = btn.getAttribute('data-filter-op') || 'all';
        renderHistory();
      });
    });

    btnResetAll.addEventListener('click', resetAll);
  }

  function init() {
    loadSettings();
    loadHistory();
    loadSets();
    wireUI();
    normalizeUIBySettings();

    elResultWrap.classList.add('hidden');
    elResultWrap.setAttribute('hidden', '');

    showScreen('settings');
  }

  init();
})();
