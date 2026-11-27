(() => {
  const STORAGE_KEY = 'tarot_dharmacodex_progress_v1';
  const SETTINGS_KEY = 'tarot_dharmacodex_settings_v1';
  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

  let deck = [];
  let spreads = [];
  let progress = loadProgress();
  let settings = loadSettings();
  let currentQuizCard = null;
  let quizRevealed = false;
  let currentSpreadDraw = null;

  // --- Cryptographic Random Helpers ---
  function cryptoRandomInt(maxExclusive) {
    if (maxExclusive <= 1) return 0;
    const array = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    let rand;
    do {
      window.crypto.getRandomValues(array);
      rand = array[0];
    } while (rand >= limit);
    return rand % maxExclusive;
  }

  function cryptoCoinFlip() {
    const array = new Uint8Array(1);
    window.crypto.getRandomValues(array);
    return (array[0] & 1) === 1;
  }

  function shuffleDeck(cards) {
    const copy = [...cards];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Exact binomial probability P(X = k) for n fair coins (p = 0.5)
  function binomialProbability(n, k) {
    let coeff = 1;
    for (let i = 1; i <= k; i++) {
      coeff = (coeff * (n - i + 1)) / i;
    }
    return coeff * Math.pow(0.5, n);
  }

  // --- Persistence ---
  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    updateHeaderStats();
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : { allowReversed: true };
    } catch {
      return { allowReversed: true };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function getCardRecord(id) {
    return progress[id] || {
      status: 'nueva', // 'nueva' | 'practica' | 'dominada'
      difficult: false,
      note: '',
      lastReviewed: null
    };
  }

  function updateCardRecord(id, patch) {
    const current = getCardRecord(id);
    progress[id] = {
      ...current,
      ...patch,
      lastReviewed: patch.lastReviewed !== undefined ? patch.lastReviewed : Date.now()
    };
    saveProgress();
  }

  function needsReview(record) {
    if (record.difficult) return true;
    if (record.status !== 'nueva' && record.lastReviewed) {
      return Date.now() - record.lastReviewed > FIVE_DAYS_MS;
    }
    return false;
  }

  // --- Toast ---
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  // --- Image & Placeholder Renderer ---
  function getSuitGlyph(card) {
    if (card.arcano === 'mayor') return '✦';
    const map = { Bastos: '🜂', Copas: '🜄', Espadas: '🜁', Oros: '🜃' };
    return map[card.palo] || '✧';
  }

  function renderCardVisual(card, isReversed = false) {
    const imgSrc = card.imagen || `/img/cartas/${card.id}.webp`;
    const rotClass = isReversed ? 'rotated-180' : '';
    const subtitle = card.arcano === 'mayor'
      ? `Arcano Mayor · ${card.numero}`
      : `${card.palo} · ${card.figura || card.numero}`;

    return `
      <div class="card-thumb-wrap ${rotClass}">
        <img
          src="${imgSrc}"
          alt="${card.nombre}"
          loading="lazy"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <div class="card-placeholder" style="display:none;">
          <span class="cp-top">${card.id}</span>
          <span class="cp-symbol">${getSuitGlyph(card)}</span>
          <div>
            <div class="cp-title">${card.nombre}</div>
            <div class="cp-sub">${subtitle}</div>
          </div>
        </div>
      </div>
    `;
  }

  // --- Navigation ---
  function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.view;
        document.getElementById(`view-${target}`).classList.add('active');
        if (target === 'progreso') renderProgressView();
        if (target === 'quiz' && !currentQuizCard) nextQuizCard();
      });
    });
  }

  function updateHeaderStats() {
    const total = deck.length || 78;
    let studied = 0;
    let mastered = 0;
    deck.forEach((c) => {
      const r = getCardRecord(c.id);
      if (r.status !== 'nueva') studied++;
      if (r.status === 'dominada') mastered++;
    });
    document.getElementById('headerStats').textContent =
      `Estudiadas: ${studied}/${total} · Dominadas: ${mastered}`;
  }

  // --- View 1: Explorar ---
  function renderExploreGrid() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const arcano = document.getElementById('filterArcano').value;
    const palo = document.getElementById('filterPalo').value;
    const numFilter = document.getElementById('filterNumero').value;
    const estado = document.getElementById('filterEstado').value;

    const filtered = deck.filter((card) => {
      if (arcano !== 'todos' && card.arcano !== arcano) return false;
      if (palo !== 'todos' && card.palo !== palo) return false;

      if (numFilter !== 'todos') {
        if (numFilter === '11-21') {
          if (card.arcano !== 'mayor' || card.numero < 11) return false;
        } else if (['Paje', 'Caballero', 'Reina', 'Rey'].includes(numFilter)) {
          if (card.figura !== numFilter) return false;
        } else {
          if (String(card.numero) !== numFilter) return false;
        }
      }

      const rec = getCardRecord(card.id);
      if (estado === 'repasar') {
        if (!needsReview(rec)) return false;
      } else if (estado !== 'todos' && rec.status !== estado) {
        return false;
      }

      if (q) {
        const haystack = [
          card.nombre,
          card.esencia,
          ...(card.palabras_clave || []),
          card.palo || '',
          card.figura || ''
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    document.getElementById('resultsMeta').textContent =
      `Mostrando ${filtered.length} de ${deck.length} cartas`;

    const grid = document.getElementById('cardsGrid');
    grid.innerHTML = filtered.map((card) => {
      const rec = getCardRecord(card.id);
      const statusLabels = {
        nueva: 'Nueva',
        practica: 'En práctica',
        dominada: 'Dominada'
      };
      return `
        <article class="deck-card" data-card-id="${card.id}">
          ${renderCardVisual(card, false)}
          <div class="deck-card-header">
            <h3 class="deck-card-title">${card.nombre}</h3>
            <span class="badge badge-${rec.status}">${statusLabels[rec.status]}</span>
          </div>
          ${needsReview(rec) ? '<span class="badge badge-repasar">Para repasar</span>' : ''}
          <div class="kw-list">
            ${(card.palabras_clave || []).map((k) => `<span class="kw-chip">${k}</span>`).join('')}
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.deck-card').forEach((el) => {
      el.addEventListener('click', () => openCardModal(el.dataset.cardId));
    });
  }

  // --- Card Sheet Modal (Exact Reading Order) ---
  function openCardModal(cardId) {
    const card = deck.find((c) => c.id === cardId);
    if (!card) return;
    const rec = getCardRecord(card.id);

    const arcanoLabel = card.arcano === 'mayor'
      ? `Arcano Mayor · Número ${card.numero}`
      : `Arcano Menor · Palo de ${card.palo} · ${card.figura || 'Número ' + card.numero}`;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
      <div class="sheet-horizontal">
        <div class="sheet-media">
          ${renderCardVisual(card, false)}
          <div class="sheet-study-box">
            <label for="modalStatusSelect">Nivel de estudio</label>
            <select id="modalStatusSelect">
              <option value="nueva" ${rec.status === 'nueva' ? 'selected' : ''}>Nueva</option>
              <option value="practica" ${rec.status === 'practica' ? 'selected' : ''}>En práctica</option>
              <option value="dominada" ${rec.status === 'dominada' ? 'selected' : ''}>Dominada</option>
            </select>

            <label class="checkbox-row">
              <input type="checkbox" id="modalDifficultCheck" ${rec.difficult ? 'checked' : ''} />
              <span>Marcar para repasar</span>
            </label>

            <label for="modalNoteInput">Nota personal</label>
            <textarea id="modalNoteInput" placeholder="Escribe tus reflexiones o asociaciones simbólicas...">${rec.note || ''}</textarea>
          </div>
        </div>

        <div class="sheet-details">
          <h2 id="modalCardTitle">${card.nombre}</h2>
          <div class="sheet-subtitle">${arcanoLabel} · ${(card.palabras_clave || []).join(' · ')}</div>

          <div class="reading-block">
            <h4>1. Esencia</h4>
            <p>${card.esencia}</p>
          </div>

          <div class="reading-block">
            <h4>2. Significado</h4>
            <p>${card.significado}</p>
          </div>

          <div class="reading-block">
            <h4>3. Símbolos</h4>
            <ul class="pill-list">
              ${(card.simbolos || []).map((s) => `<li>${s}</li>`).join('')}
            </ul>
          </div>

          <div class="reading-dual">
            <div class="reading-block">
              <h4>4. Luz</h4>
              <ul class="pill-list">
                ${(card.luz || []).map((l) => `<li>${l}</li>`).join('')}
              </ul>
            </div>
            <div class="reading-block">
              <h4>5. Sombra</h4>
              <ul class="pill-list">
                ${(card.sombra || []).map((s) => `<li>${s}</li>`).join('')}
              </ul>
            </div>
          </div>

          <div class="reading-block">
            <h4>6. Amor y vínculos</h4>
            <p>${card.amor}</p>
          </div>

          <div class="reading-block">
            <h4>7. Trabajo y recursos</h4>
            <p>${card.trabajo_dinero}</p>
          </div>

          <div class="reading-block">
            <h4>8. Espiritualidad</h4>
            <p>${card.espiritualidad}</p>
          </div>

          <div class="reading-block">
            <h4>9. Consejo</h4>
            <p>${card.consejo}</p>
          </div>

          <div class="reading-block">
            <h4>10. Pregunta de reflexión</h4>
            <p class="reflection-quote">${card.reflexion}</p>
          </div>

          <div class="reading-block">
            <h4>11. Carta invertida</h4>
            <p>${card.invertida}</p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalStatusSelect').addEventListener('change', (e) => {
      updateCardRecord(card.id, { status: e.target.value });
      renderExploreGrid();
      showToast(`Estado actualizado: ${card.nombre}`);
    });

    document.getElementById('modalDifficultCheck').addEventListener('change', (e) => {
      updateCardRecord(card.id, { difficult: e.target.checked });
      renderExploreGrid();
      showToast(e.target.checked ? 'Añadida a la lista de repaso' : 'Quitada de repaso');
    });

    document.getElementById('modalNoteInput').addEventListener('input', (e) => {
      updateCardRecord(card.id, { note: e.target.value });
    });

    document.getElementById('cardModal').classList.remove('hidden');
  }

  function closeCardModal() {
    document.getElementById('cardModal').classList.add('hidden');
    if (document.getElementById('view-progreso').classList.contains('active')) {
      renderProgressView();
    }
  }

  // --- View 2: Tiradas ---
  function initSpreadsView() {
    const select = document.getElementById('spreadSelect');
    const grouped = {};
    spreads.forEach((s) => {
      if (!grouped[s.nivel]) grouped[s.nivel] = [];
      grouped[s.nivel].push(s);
    });

    select.innerHTML = Object.entries(grouped).map(([nivel, items]) => `
      <optgroup label="Nivel: ${nivel}">
        ${items.map((s) => `<option value="${s.id}">${s.nombre} (${s.cantidad} ${s.cantidad === 1 ? 'carta' : 'cartas'})</option>`).join('')}
      </optgroup>
    `).join('');

    const toggleGlobal = document.getElementById('toggleInvertidasGlobal');
    toggleGlobal.checked = settings.allowReversed;
    toggleGlobal.addEventListener('change', (e) => {
      settings.allowReversed = e.target.checked;
      saveSettings();
      renderSpreadInfo();
    });

    select.addEventListener('change', () => {
      renderSpreadInfo();
      document.getElementById('spreadBoard').innerHTML = '';
      document.getElementById('spreadProbabilityBanner').classList.add('hidden');
      document.getElementById('spreadGuideBox').classList.add('hidden');
    });

    document.getElementById('btnDrawSpread').addEventListener('click', drawCurrentSpread);
    renderSpreadInfo();
  }

  function getSelectedSpread() {
    const id = document.getElementById('spreadSelect').value;
    return spreads.find((s) => s.id === id) || spreads[0];
  }

  function renderSpreadInfo() {
    const s = getSelectedSpread();
    if (!s) return;
    const activeInv = s.invertidas && settings.allowReversed;
    const invNote = !s.invertidas
      ? 'Práctica pura con cartas derechas (0 % invertidas en esta tirada).'
      : activeInv
        ? 'Cartas invertidas activas: 50 % de probabilidad independiente por carta.'
        : 'Invertidas desactivadas temporalmente en tu configuración (0 % invertidas).';

    document.getElementById('spreadInfoBox').innerHTML = `
      <p><strong>Propósito:</strong> ${s.proposito}</p>
      <p style="margin-top:0.4rem;"><strong>Pregunta guía:</strong> <em>«${s.pregunta_guia}»</em></p>
      <p class="muted small" style="margin-top:0.4rem;">${invNote}</p>
    `;
  }

  function drawCurrentSpread() {
    const s = getSelectedSpread();
    if (!s || deck.length < s.cantidad) return;

    const shuffled = shuffleDeck(deck);
    const chosen = shuffled.slice(0, s.cantidad);
    const allowInv = s.invertidas && settings.allowReversed;

    const slots = s.posiciones.map((pos, idx) => ({
      position: pos,
      card: chosen[idx],
      isReversed: allowInv ? cryptoCoinFlip() : false,
      revealed: false
    }));

    currentSpreadDraw = { spread: s, slots, allowInv };
    renderSpreadBoard();
  }

  function renderSpreadBoard() {
    const { spread, slots, allowInv } = currentSpreadDraw;
    const n = slots.length;
    const k = slots.filter((x) => x.isReversed).length;

    const probBanner = document.getElementById('spreadProbabilityBanner');
    probBanner.classList.remove('hidden');

    if (allowInv) {
      const binProb = (binomialProbability(n, k) * 100).toFixed(1);
      const cardProb = ((n / deck.length) * 100).toFixed(1);
      probBanner.innerHTML = `
        <span><strong>Probabilidad de inversión:</strong> 50 % independiente por carta</span>
        <span><strong>Combinación actual:</strong> ${k} de ${n} invertidas (probabilidad binomial: ${binProb} %)</span>
        <span><strong>Aparición por carta:</strong> ${n}/${deck.length} (≈ ${cardProb} %)</span>
      `;
    } else {
      const cardProb = ((n / deck.length) * 100).toFixed(1);
      probBanner.innerHTML = `
        <span><strong>Modo solo derechas activo:</strong> 0 % probabilidad de inversión</span>
        <span><strong>Aparición por carta sin reemplazo:</strong> ${n}/${deck.length} (≈ ${cardProb} %)</span>
      `;
    }

    const board = document.getElementById('spreadBoard');
    board.innerHTML = slots.map((slot, index) => {
      if (!slot.revealed) {
        return `
          <div class="spread-slot">
            <div class="slot-pos-header">
              <span class="slot-num">${slot.position.numero}. ${slot.position.nombre}</span>
            </div>
            <p class="slot-meaning">${slot.position.significado}</p>
            <div class="card-back" data-slot-index="${index}">
              <span style="font-size:1.6rem;">✦</span>
              <span style="margin-top:0.5rem;font-weight:600;">Tocar para revelar carta</span>
            </div>
          </div>
        `;
      }

      const orientationBadge = slot.isReversed
        ? '<span class="badge badge-inv">Invertida</span>'
        : '<span class="badge badge-der">Derecha</span>';

      const reflectionSummary = slot.isReversed ? slot.card.invertida : slot.card.esencia;

      return `
        <div class="spread-slot">
          <div class="slot-pos-header">
            <span class="slot-num">${slot.position.numero}. ${slot.position.nombre}</span>
            ${orientationBadge}
          </div>
          <p class="slot-meaning">${slot.position.significado}</p>
          ${renderCardVisual(slot.card, slot.isReversed)}
          <h4>${slot.card.nombre}</h4>
          <p class="small">${reflectionSummary}</p>
          <p class="small muted"><strong>Consejo:</strong> ${slot.card.consejo}</p>
          <button class="btn-secondary small" data-open-card="${slot.card.id}">Abrir ficha completa</button>
        </div>
      `;
    }).join('');

    board.querySelectorAll('.card-back').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.slotIndex);
        currentSpreadDraw.slots[idx].revealed = true;
        renderSpreadBoard();
      });
    });

    board.querySelectorAll('[data-open-card]').forEach((btn) => {
      btn.addEventListener('click', () => openCardModal(btn.dataset.openCard));
    });

    const guideBox = document.getElementById('spreadGuideBox');
    guideBox.classList.remove('hidden');
    document.getElementById('spreadGuideText').textContent = spread.lectura_sugerida;
  }

  // --- View 3: Quiz ---
  function nextQuizCard() {
    if (!deck.length) return;
    const mode = document.getElementById('quizMode').value;
    let pool = deck;
    if (mode === 'repasar') {
      const reviewPool = deck.filter((c) => needsReview(getCardRecord(c.id)));
      if (reviewPool.length > 0) pool = reviewPool;
    }
    currentQuizCard = pool[cryptoRandomInt(pool.length)];
    quizRevealed = false;
    renderQuizStage();
  }

  function renderQuizStage() {
    const card = currentQuizCard;
    if (!card) return;
    const mode = document.getElementById('quizMode').value;
    const stage = document.getElementById('quizCardArea');

    if (!quizRevealed) {
      const promptHtml = mode === 'clave'
        ? `
          <p class="muted small">¿A qué arcano corresponden estas palabras clave y esencia?</p>
          <div class="kw-list" style="margin:0.8rem 0;">
            ${(card.palabras_clave || []).map((k) => `<span class="kw-chip">${k}</span>`).join('')}
          </div>
          <p style="font-size:1.05rem;">«${card.esencia}»</p>
        `
        : `
          <p class="muted small">Intenta recordar su esencia, palabras clave y orientación antes de revelar:</p>
          <h3 style="font-size:1.6rem;color:var(--gold);margin:0.8rem 0;">${card.nombre}</h3>
          <p class="muted small">${card.arcano === 'mayor' ? 'Arcano Mayor' : 'Arcano Menor · ' + card.palo}</p>
        `;

      stage.innerHTML = `
        ${promptHtml}
        <div class="quiz-actions">
          <button id="btnRevealQuiz" class="btn-primary">Revelar respuesta</button>
        </div>
      `;
      document.getElementById('btnRevealQuiz').addEventListener('click', () => {
        quizRevealed = true;
        renderQuizStage();
      });
    } else {
      stage.innerHTML = `
        <div class="sheet-horizontal">
          <div>${renderCardVisual(card, false)}</div>
          <div>
            <h3 style="font-size:1.4rem;color:var(--gold);">${card.nombre}</h3>
            <p class="muted small" style="margin-bottom:0.6rem;">${(card.palabras_clave || []).join(' · ')}</p>
            <p><strong>Esencia:</strong> ${card.esencia}</p>
            <p style="margin-top:0.5rem;"><strong>Consejo:</strong> ${card.consejo}</p>
            <p style="margin-top:0.5rem;"><strong>Invertida:</strong> ${card.invertida}</p>

            <div class="quiz-actions">
              <button id="btnQuizHard" class="btn-danger">Me costó · Marcar para repasar</button>
              <button id="btnQuizGood" class="btn-primary">La recordé bien · Continuar</button>
              <button id="btnQuizSheet" class="btn-secondary">Ver ficha completa</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('btnQuizHard').addEventListener('click', () => {
        const rec = getCardRecord(card.id);
        updateCardRecord(card.id, {
          status: rec.status === 'nueva' ? 'practica' : rec.status,
          difficult: true
        });
        showToast('Marcada para repasar');
        nextQuizCard();
      });

      document.getElementById('btnQuizGood').addEventListener('click', () => {
        const rec = getCardRecord(card.id);
        const nextStatus = rec.status === 'nueva' ? 'practica' : 'dominada';
        updateCardRecord(card.id, {
          status: nextStatus,
          difficult: false
        });
        showToast(`Progreso guardado (${nextStatus})`);
        nextQuizCard();
      });

      document.getElementById('btnQuizSheet').addEventListener('click', () => openCardModal(card.id));
    }
  }

  // --- View 4: Progreso ---
  function renderProgressView() {
    let nuevas = 0;
    let practica = 0;
    let dominadas = 0;
    const toReview = [];

    deck.forEach((c) => {
      const r = getCardRecord(c.id);
      if (r.status === 'nueva') nuevas++;
      else if (r.status === 'practica') practica++;
      else if (r.status === 'dominada') dominadas++;
      if (needsReview(r)) toReview.push({ card: c, record: r });
    });

    document.getElementById('progressOverview').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${practica + dominadas} / ${deck.length}</div>
        <div class="stat-label">Cartas iniciadas</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${dominadas}</div>
        <div class="stat-label">Dominadas</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${practica}</div>
        <div class="stat-label">En práctica</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${nuevas}</div>
        <div class="stat-label">Sin explorar</div>
      </div>
    `;

    const reviewList = document.getElementById('reviewList');
    if (toReview.length === 0) {
      reviewList.innerHTML = `<p class="muted small">No tienes cartas pendientes de repaso en este momento.</p>`;
    } else {
      reviewList.innerHTML = toReview.map(({ card, record }) => `
        <div class="review-item" data-review-id="${card.id}">
          <div>
            <strong>${card.nombre}</strong>
            <div class="muted small">${record.difficult ? 'Marcada como difícil' : 'Más de 5 días sin repasar'}</div>
          </div>
          <span class="badge badge-repasar">Repasar</span>
        </div>
      `).join('');

      reviewList.querySelectorAll('.review-item').forEach((item) => {
        item.addEventListener('click', () => openCardModal(item.dataset.reviewId));
      });
    }
  }

  function initBackupControls() {
    document.getElementById('btnExportProgress').addEventListener('click', () => {
      const payload = {
        app: 'tarot.dharmacodex.org',
        exportedAt: new Date().toISOString(),
        settings,
        progress
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `progreso_tarot_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Progreso exportado correctamente');
    });

    document.getElementById('inputImportProgress').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || typeof parsed.progress !== 'object') {
            throw new Error('Formato inválido');
          }
          progress = parsed.progress;
          if (parsed.settings) {
            settings = parsed.settings;
            saveSettings();
          }
          saveProgress();
          renderExploreGrid();
          renderProgressView();
          showToast('Progreso importado con éxito');
        } catch {
          showToast('El archivo seleccionado no es un respaldo válido');
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btnResetProgress').addEventListener('click', () => {
      if (confirm('¿Seguro que deseas borrar todo tu progreso y notas personales de este dispositivo?')) {
        progress = {};
        saveProgress();
        renderExploreGrid();
        renderProgressView();
        showToast('Progreso local reiniciado');
      }
    });
  }

  // --- Bootstrap ---
  async function init() {
    try {
      const [cardsRes, spreadsRes] = await Promise.all([
        fetch('/data/cartas_tarot_v2.2.json'),
        fetch('/data/tiradas.json')
      ]);
      deck = await cardsRes.json();
      spreads = await spreadsRes.json();
    } catch (err) {
      console.error('Error cargando datos:', err);
      showToast('Error al cargar los archivos JSON');
      return;
    }

    initNavigation();
    updateHeaderStats();

    ['searchInput', 'filterArcano', 'filterPalo', 'filterNumero', 'filterEstado'].forEach((id) => {
      document.getElementById(id).addEventListener('input', renderExploreGrid);
      document.getElementById(id).addEventListener('change', renderExploreGrid);
    });

    document.getElementById('modalClose').addEventListener('click', closeCardModal);
    document.getElementById('modalBackdrop').addEventListener('click', closeCardModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCardModal();
    });

    document.getElementById('btnNextQuiz').addEventListener('click', nextQuizCard);
    document.getElementById('quizMode').addEventListener('change', nextQuizCard);

    renderExploreGrid();
    initSpreadsView();
    initBackupControls();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
