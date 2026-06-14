// 🧠 Made with human ideas by @jmlucero

// ========= CONSTANTS =========
const DEFAULTS = {
  tickers: ['GOOGL', 'AAPL', 'MSFT', 'AMZN', 'NVDA', 'META'],
  shares: {}, // Format: { 'GOOGL': 10, 'AAPL': 5.5 }
  tasks: [], // Tareas manuales (max 4)
  tasksEnabled: false,
  privacyMode: false,
  greeting: '🤖 HELLO, STRANGER',
  city: 'Buenos Aires'
};
let editTickers = [];
let editShares = {};
let appState = { shares: {}, tasks: [], privacyMode: false };

// Caché para actualizar la UI al instante sin volver a descargar datos
let cachedResults = [];

// ========= DOM REFS =========
const getEl = id => document.getElementById(id);
const dom = {
  clock: getEl('clock'),
  content: getEl('content'),
  overlay: getEl('settingsOverlay'),
  panel: getEl('settingsPanel'),
  tickerInput: getEl('tickerInput'),
  tickerList: getEl('tickerList'),
  toast: getEl('toast'),
  greeting: getEl('greeting'),
  weather: getEl('weatherWidget'),
  greetingInput: getEl('greetingInput'),
  cityInput: getEl('cityInput'),
  searchInput: getEl('searchInput'),
  tasksToggle: getEl('tasksToggle'),

  // Tasks
  tasksRow: getEl('tasksRow'),

  // Links
  linkTooltip: getEl('linkTooltip'),
  makeLinkBtn: getEl('makeLinkBtn'),
  linkInputContainer: getEl('linkInputContainer'),
  linkUrlInput: getEl('linkUrlInput'),

  // Portfolio Bar Elements
  portfolioBar: getEl('portfolioBar'),
  portTotalValue: getEl('portTotalValue'),
  portToday: getEl('portToday'),
  port30D: getEl('port30D'),
  port365D: getEl('port365D'),
  privacyToggle: getEl('privacyToggle'),

  // Backup Elements
  exportBtn: getEl('exportBtn'),
  importBtn: getEl('importBtn'),
  importFile: getEl('importFile')
};

// ========= STORAGE =========
const getStorage = () => new Promise(resolve => {
  chrome.storage.sync.get({
    tickers: DEFAULTS.tickers,
    shares: DEFAULTS.shares,
    tasks: DEFAULTS.tasks,
    tasksEnabled: DEFAULTS.tasksEnabled,
    privacyMode: DEFAULTS.privacyMode,
    greeting: DEFAULTS.greeting,
    city: DEFAULTS.city
  }, data => {
    if (chrome.runtime.lastError) resolve(DEFAULTS);
    else resolve(data);
  });
});

const setStorage = data => new Promise(resolve => {
  chrome.storage.sync.set(data, resolve);
});

// ========= CLOCK =========
const updateClock = () => {
  dom.clock.textContent = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
};
setInterval(updateClock, 1000);
updateClock();

// ========= GOOGLE SEARCH =========
dom.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const q = dom.searchInput.value.trim();
    if (q) window.location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
});
setTimeout(() => dom.searchInput.focus(), 100);

// ========= GREETING =========
const loadGreeting = async () => {
  const data = await getStorage();
  dom.greeting.textContent = data.greeting || DEFAULTS.greeting;
};
loadGreeting();

// ========= WEATHER =========
const loadWeather = async () => {
  const data = await getStorage();
  if (!data.city) {
    dom.weather.innerHTML = '<div class="weather-error">Set city in ⚙</div>';
    return;
  }
  dom.weather.innerHTML = '<div class="weather-loading">...</div>';
  try {
    const wx = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
      chrome.runtime.sendMessage({ action: 'fetchWeather', city: data.city }, response => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!response || !response.success) reject(new Error(response?.error || 'No response'));
        else resolve(response.data);
      });
    });

    dom.weather.innerHTML = `
      <span class="weather-icon">${wx.icon}</span>
      <div class="weather-info">
        <div class="weather-temp">${wx.temp}°C</div>
        <div class="weather-desc">${wx.description}</div>
      </div>
      <div class="weather-city">${wx.city}</div>
    `;
  } catch (e) {
    dom.weather.innerHTML = `<div class="weather-error">⚠ ${e.message}</div>`;
  }
};
loadWeather();

// ========= PRIVACY TOGGLE (EL OJITO) =========
dom.privacyToggle.addEventListener('click', async () => {
  appState.privacyMode = !appState.privacyMode;
  dom.privacyToggle.classList.toggle('active', appState.privacyMode);

  await setStorage({ privacyMode: appState.privacyMode });

  if (cachedResults.length > 0) {
    drawUI(true);
  }
});

// ========= BACKUP & RESTORE =========
dom.exportBtn.addEventListener('click', async () => {
  const data = await getStorage();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup Exported ✓');
});

dom.importBtn.addEventListener('click', () => {
  dom.importFile.click();
});

dom.importFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedData = JSON.parse(event.target.result);
      if (!importedData.tickers && !importedData.greeting) throw new Error("Invalid format");

      await setStorage({
        tickers: importedData.tickers || DEFAULTS.tickers,
        shares: importedData.shares || DEFAULTS.shares,
        tasks: importedData.tasks || DEFAULTS.tasks,
        tasksEnabled: importedData.tasksEnabled !== false,
        privacyMode: !!importedData.privacyMode,
        greeting: importedData.greeting || DEFAULTS.greeting,
        city: importedData.city || DEFAULTS.city
      });

      showToast('Backup Restored! Reloading...');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      showToast('Error: Invalid backup file ❌');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});


// ========= TEXT SELECTION TO LINK LOGIC (CTRL + K) =========
let savedSelection = null;

const showLinkTooltip = () => {
  const sel = window.getSelection();
  if (sel.isCollapsed || sel.rangeCount === 0) return;

  const node = sel.anchorNode;
  if (!node || node.nodeType !== 3) return;
  if (!node.parentElement.closest('.task-content')) return;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  dom.linkTooltip.style.top = `${rect.top + window.scrollY - 40}px`;
  dom.linkTooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (dom.linkTooltip.offsetWidth / 2)}px`;

  dom.makeLinkBtn.style.display = 'none';
  dom.linkInputContainer.style.display = 'block';
  dom.linkTooltip.classList.add('visible');

  savedSelection = range.cloneRange();

  setTimeout(() => {
    dom.linkUrlInput.value = '';
    dom.linkUrlInput.focus();
  }, 10);
};

// Listener para el atajo de teclado Ctrl+K / Cmd+K
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains('task-content')) {
      e.preventDefault();
      showLinkTooltip();
    }
  }
});

// Cerrar tooltip si se hace click afuera
document.addEventListener('mousedown', (e) => {
  if (!dom.linkTooltip.contains(e.target)) {
    dom.linkTooltip.classList.remove('visible');
    dom.linkInputContainer.style.display = 'none';
  }
});

// Lógica al apretar Enter en el input del link
dom.linkUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const url = dom.linkUrlInput.value.trim();
    if (url && savedSelection) {

      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection);

      const finalUrl = url.startsWith('http') ? url : `https://${url}`;

      document.execCommand('createLink', false, finalUrl);

      // Asegurarnos que el link se abre en otra tab
      const linkNode = sel.anchorNode.parentElement;
      if (linkNode && linkNode.tagName === 'A') {
        linkNode.target = "_blank";
      }

      dom.linkTooltip.classList.remove('visible');
      savedSelection = null;
      sel.removeAllRanges();

      // Opcional: Trigger blur para guardar al instante
      if (document.activeElement && document.activeElement.classList.contains('task-content')) {
        document.activeElement.blur();
      }

    }
  } else if (e.key === 'Escape') {
    dom.linkTooltip.classList.remove('visible');
    if (savedSelection) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection);
    }
  }
});


// ========= TASKS UI (INLINE EDITING & DRAG/DROP) =========
const applyTasksVisibility = (enabled) => {
  if (enabled) {
    dom.tasksRow.style.display = '';
    renderTasksUI();
  } else {
    dom.tasksRow.style.display = 'none';
    dom.tasksRow.innerHTML = '';
  }
};

// El interruptor de notas se guarda y aplica al instante, sin pasar por "Save".
dom.tasksToggle.addEventListener('change', async () => {
  const enabled = dom.tasksToggle.checked;
  await setStorage({ tasksEnabled: enabled });
  appState.tasks = (await getStorage()).tasks || [];
  applyTasksVisibility(enabled);
});

const renderTasksUI = () => {
  let html = '';
  while (appState.tasks.length < 4) {
    appState.tasks.push(null);
  }

  for (let i = 0; i < 4; i++) {
    if (appState.tasks[i]) {
      html += `
        <div class="task-item active" draggable="true" data-index="${i}">
          <div class="task-content" contenteditable="true" data-index="${i}" spellcheck="false">${appState.tasks[i]}</div>
          <button class="task-done-btn" data-index="${i}">DONE ✓</button>
        </div>
      `;
    } else {
      html += `
        <div class="task-item empty" data-index="${i}">
          <span>Add Task</span>
        </div>
      `;
    }
  }

  dom.tasksRow.innerHTML = html;

  // Lógica de Edición in situ (Rich Text)
  document.querySelectorAll('.task-content').forEach(contentDiv => {
    contentDiv.addEventListener('mousedown', e => {
      e.stopPropagation();
    });

    // Forzar apertura de links al clickearlos
    contentDiv.addEventListener('click', e => {
      if (e.target.tagName === 'A') {
        e.preventDefault();
        window.open(e.target.href, '_blank');
      }
    });

    contentDiv.addEventListener('blur', async (e) => {
      if (dom.linkTooltip.contains(e.relatedTarget) || dom.linkTooltip.classList.contains('visible')) return;

      const index = parseInt(e.target.dataset.index);
      let newText = e.target.innerHTML.trim();

      if (newText === '' || newText === '<br>') {
        appState.tasks[index] = null;
      } else {
        newText = newText.replace(/<a /g, '<a target="_blank" ');
        appState.tasks[index] = newText;
      }
      await setStorage({ tasks: appState.tasks });
      renderTasksUI();
    });
  });

  // Drag and Drop Listeners
  document.querySelectorAll('#tasksRow .task-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      if (item.classList.contains('empty')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', item.dataset.index);
      setTimeout(() => item.classList.add('dragging'), 0);
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      item.classList.add('drag-over');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', async e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const toIndex = parseInt(item.dataset.index);

      if (!isNaN(fromIndex) && fromIndex !== toIndex) {
        const movedTask = appState.tasks.splice(fromIndex, 1)[0];
        appState.tasks.splice(toIndex, 0, movedTask);

        await setStorage({ tasks: appState.tasks });
        renderTasksUI();
      }
    });
  });

  // Add Done Button Listeners
  document.querySelectorAll('.task-done-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      appState.tasks[index] = null;
      await setStorage({ tasks: appState.tasks });
      renderTasksUI();
    });
  });

  // Add Inline Edit Listeners (para los slots vacíos)
  document.querySelectorAll('.task-item.empty').forEach(slot => {
    slot.addEventListener('click', function () {
      if (this.querySelector('textarea')) return;

      const targetIndex = parseInt(this.dataset.index);

      this.classList.remove('empty');
      this.innerHTML = `<textarea class="task-inline-input" placeholder="Escribe y presiona Enter..." rows="2"></textarea>`;

      const input = this.querySelector('textarea');
      input.focus();

      const saveTask = async () => {
        let val = input.value.trim();
        val = val.replace(/\n/g, '<br>');

        if (val) {
          appState.tasks[targetIndex] = val;
          await setStorage({ tasks: appState.tasks });
        }
        renderTasksUI();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          saveTask();
        }
      });

      input.addEventListener('blur', saveTask);
    });
  });
};


// ========= SETTINGS PANEL =========
const openSettings = async () => {
  dom.overlay.classList.add('open');
  dom.panel.classList.add('open');

  const data = await getStorage();
  editTickers = [...(data.tickers || DEFAULTS.tickers)];
  editShares = { ...(data.shares || DEFAULTS.shares) };

  dom.greetingInput.value = data.greeting || DEFAULTS.greeting;
  dom.cityInput.value = data.city || DEFAULTS.city;
  dom.tasksToggle.checked = data.tasksEnabled !== false;

  renderTickerList();
  updatePresetChips();
};

const closeSettings = () => {
  dom.overlay.classList.remove('open');
  dom.panel.classList.remove('open');
};

getEl('openSettingsBtn').addEventListener('click', openSettings);
getEl('closePanelBtn').addEventListener('click', closeSettings);
dom.overlay.addEventListener('click', closeSettings);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });

const updatePresetChips = () => {
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.classList.toggle('active', editTickers.includes(chip.dataset.ticker));
  });
};

const renderTickerList = () => {
  dom.tickerList.innerHTML = '';
  if (editTickers.length === 0) {
    dom.tickerList.innerHTML = '<div class="hint" style="text-align:center;padding:12px 0;">No tickers yet. Add some above.</div>';
    return;
  }

  editTickers.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'ticker-item';
    item.draggable = true;
    item.dataset.index = i;

    const currentShares = editShares[t] !== undefined ? editShares[t] : '';

    item.innerHTML = `
      <div class="ticker-left">
        <span class="drag-handle">⠿</span>
        <span class="ticker-symbol">${t}</span>
      </div>
      <div class="ticker-right">
        <input type="number" class="share-input" placeholder="Shares" value="${currentShares}" min="0" step="any" data-ticker="${t}">
        <button class="remove-btn" title="Remove">x</button>
      </div>
    `;

    item.querySelector('.share-input').addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) editShares[t] = val;
      else delete editShares[t];
    });

    item.querySelector('.remove-btn').addEventListener('click', () => {
      editTickers.splice(i, 1);
      delete editShares[t];
      renderTickerList();
      updatePresetChips();
    });

    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', i.toString());
      setTimeout(() => item.classList.add('dragging'), 0);
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const from = parseInt(e.dataTransfer.getData('text/plain'));
      if (from !== i) {
        const [moved] = editTickers.splice(from, 1);
        editTickers.splice(i, 0, moved);
        renderTickerList();
        updatePresetChips();
      }
    });

    dom.tickerList.appendChild(item);
  });
};

const addTicker = symbol => {
  const clean = symbol.trim().toUpperCase().replace(/\s+/g, '');
  if (!clean) return;
  if (editTickers.includes(clean)) { showToast(`${clean} is already added`); return; }

  editTickers.push(clean);
  renderTickerList();
  updatePresetChips();
  dom.tickerInput.value = '';
};

getEl('addBtn').addEventListener('click', () => addTicker(dom.tickerInput.value));
dom.tickerInput.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'tickerInput') addTicker(dom.tickerInput.value); });

document.querySelectorAll('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const t = chip.dataset.ticker;
    if (editTickers.includes(t)) {
      editTickers = editTickers.filter(x => x !== t);
      delete editShares[t];
    } else {
      editTickers.push(t);
    }
    renderTickerList();
    updatePresetChips();
  });
});

getEl('saveBtn').addEventListener('click', async () => {
  await setStorage({
    tickers: editTickers,
    shares: editShares,
    greeting: dom.greetingInput.value.trim() || DEFAULTS.greeting,
    city: dom.cityInput.value.trim() || DEFAULTS.city
  });
  showToast('Saved');
  closeSettings();
  loadGreeting();
  loadWeather();
  render();
});

getEl('resetBtn').addEventListener('click', () => {
  editTickers = [...DEFAULTS.tickers];
  editShares = {};
  dom.greetingInput.value = DEFAULTS.greeting;
  dom.cityInput.value = DEFAULTS.city;
  dom.tasksToggle.checked = DEFAULTS.tasksEnabled;
  setStorage({ tasksEnabled: DEFAULTS.tasksEnabled });
  applyTasksVisibility(DEFAULTS.tasksEnabled);
  renderTickerList();
  updatePresetChips();
});

const showToast = msg => {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  setTimeout(() => dom.toast.classList.remove('show'), 2200);
};

// ========= FETCH VIA BACKGROUND WORKER =========
const fetchStock = ticker => new Promise(resolve => {
  const timeout = setTimeout(() => resolve({ ticker, error: true, errorMsg: 'Timeout' }), 15000);

  chrome.runtime.sendMessage({ action: 'fetchStock', ticker }, response => {
    clearTimeout(timeout);
    if (chrome.runtime.lastError) {
      resolve({ ticker, error: true, errorMsg: chrome.runtime.lastError.message });
    } else if (!response || !response.success) {
      resolve({ ticker, error: true, errorMsg: response?.error || 'No response' });
    } else {
      resolve({ ...response.data, error: false });
    }
  });
});

const fetchAllStocks = async tickers => {
  const results = [];
  const batchSize = 3;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(fetchStock)));
    if (i + batchSize < tickers.length) await new Promise(r => setTimeout(r, 300));
  }
  return results;
};

// ========= SPARKLINE =========
const drawSparkline = (canvas, data, isUp) => {
  if (!canvas || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const [w, h, pad] = [rect.width, rect.height, 2];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  ctx.beginPath();
  ctx.strokeStyle = isUp ? '#16a34a' : '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  data.forEach((val, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((val - min) / range) * (h - 2 * pad);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  ctx.stroke();
  ctx.lineTo(pad + (w - 2 * pad), h);
  ctx.lineTo(pad, h);
  ctx.closePath();
  ctx.fillStyle = isUp ? 'rgba(22, 163, 74, 0.06)' : 'rgba(220, 38, 38, 0.06)';
  ctx.fill();
};

// ========= RENDER UI =========
const fmt = (val, cur = 'USD') => {
  if (val == null) return '--';
  try {
    return val.toLocaleString('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 });
  } catch {
    return `$${val.toFixed(2)}`;
  }
};

const pctFrom = (current, extreme) => (!extreme || !current) ? null : ((current - extreme) / extreme) * 100;

const renderMetric = (el, val) => {
  if (!el) return;

  if (appState.privacyMode) {
    el.textContent = '***';
    el.className = 'metric-val';
    return;
  }

  if (val === null || isNaN(val)) {
    el.textContent = '--%';
    el.className = 'metric-val';
    return;
  }

  el.textContent = (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
  el.className = 'metric-val ' + (val >= 0 ? 'up' : 'down');
};

const updatePortfolioSummary = (results) => {
  const { shares, privacyMode } = appState;

  let hasShares = false;
  let totalCurrentValue = 0;
  let totalPrevValue = 0;
  let totalMax30Value = 0;
  let totalMax365Value = 0;

  let equalTodaySum = 0, equalD30Sum = 0, equalD365Sum = 0;
  let countToday = 0, countD30 = 0, countD365 = 0;

  results.forEach(stock => {
    if (stock.error) return;

    const currentPrice = parseFloat(stock.price);
    const myShares = shares[stock.ticker] || 0;

    if (myShares > 0) {
      hasShares = true;
      totalCurrentValue += currentPrice * myShares;

      const prevDayPrice = currentPrice - parseFloat(stock.changeAbs);
      totalPrevValue += prevDayPrice * myShares;

      const max30 = parseFloat(stock.max30);
      if (!isNaN(max30)) totalMax30Value += max30 * myShares;

      const max365 = parseFloat(stock.max365);
      if (!isNaN(max365)) totalMax365Value += max365 * myShares;
    }

    const todayPct = parseFloat(stock.changePct);
    if (!isNaN(todayPct)) { equalTodaySum += todayPct; countToday++; }

    const p30 = pctFrom(currentPrice, parseFloat(stock.max30));
    if (p30 !== null && !isNaN(p30)) { equalD30Sum += p30; countD30++; }

    const p365 = pctFrom(currentPrice, parseFloat(stock.max365));
    if (p365 !== null && !isNaN(p365)) { equalD365Sum += p365; countD365++; }
  });

  if (hasShares && totalCurrentValue > 0) {
    const portToday = totalPrevValue ? ((totalCurrentValue - totalPrevValue) / totalPrevValue) * 100 : 0;
    const port30D = totalMax30Value ? ((totalCurrentValue - totalMax30Value) / totalMax30Value) * 100 : 0;
    const port365D = totalMax365Value ? ((totalCurrentValue - totalMax365Value) / totalMax365Value) * 100 : 0;

    dom.portTotalValue.textContent = privacyMode ? '$***' : fmt(totalCurrentValue);
    dom.portTotalValue.style.display = 'inline-block';

    renderMetric(dom.portToday, portToday);
    renderMetric(dom.port30D, port30D);
    renderMetric(dom.port365D, port365D);
  } else {
    dom.portTotalValue.style.display = 'none';
    renderMetric(dom.portToday, countToday > 0 ? (equalTodaySum / countToday) : null);
    renderMetric(dom.port30D, countD30 > 0 ? (equalD30Sum / countD30) : null);
    renderMetric(dom.port365D, countD365 > 0 ? (equalD365Sum / countD365) : null);
  }
};

const buildCardHTML = (stock, idx) => {
  if (stock.error) {
    return `
      <div class="card" style="animation-delay:${idx * 60}ms">
        <div class="card-top"><div class="ticker">${stock.ticker}</div></div>
        <div class="error-msg"> Error: ${stock.errorMsg}</div>
      </div>
    `;
  }

  const isUp = stock.changePct >= 0;
  const cls = isUp ? 'up' : 'down';
  const arrow = isUp ? '▲' : '▼';
  const p30 = pctFrom(stock.price, stock.max30);
  const p365 = pctFrom(stock.price, stock.max365);

  const myShares = appState.shares[stock.ticker] || 0;
  let holdingsHTML = '';
  if (myShares > 0) {
    const value = myShares * stock.price;
    const displayShares = appState.privacyMode ? '***' : myShares;
    const displayValue = appState.privacyMode ? '$***' : fmt(value, stock.currency);
    holdingsHTML = `<div class="holding-badge">${displayShares} shares • ${displayValue}</div>`;
  }

  const formatPct = p => p !== null ? `<span class="extreme-pct ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '+' : ''}${p.toFixed(1)}%</span>` : '';

  return `
    <div class="card" style="animation-delay:${idx * 60}ms">
      <div class="card-top">
        <div class="ticker">${stock.ticker}</div>
        <div class="daily-change ${cls}">${arrow} ${Math.abs(stock.changePct).toFixed(2)}%</div>
      </div>
      <div class="card-sub">
        <div class="company-name">${stock.name}</div>
        <div class="price-line">${fmt(stock.price, stock.currency)}
          <span class="change-abs ${cls}">(${stock.changeAbs >= 0 ? '+' : ''}${stock.changeAbs.toFixed(2)})</span>
        </div>
      </div>
      
      ${holdingsHTML}

      <div class="extremes">
        <div class="extreme-block">
          <div class="extreme-label">Max 30d</div>
          <div class="extreme-row">
            <span class="extreme-value">${fmt(stock.max30, stock.currency)}</span>
            ${formatPct(p30)}
          </div>
        </div>
        <div class="extreme-block">
          <div class="extreme-label">Max 365d</div>
          <div class="extreme-row">
            <span class="extreme-value">${fmt(stock.max365, stock.currency)}</span>
            ${formatPct(p365)}
          </div>
        </div>
      </div>
      <div class="sparkline-container"><canvas id="spark-${idx}"></canvas></div>
    </div>
  `;
};

const drawUI = (skipAnimation = false) => {
  const errCount = cachedResults.filter(r => r.error).length;
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  updatePortfolioSummary(cachedResults);

  dom.content.innerHTML = `
    <div class="grid ${skipAnimation ? 'no-anim' : ''}">
      ${cachedResults.map((stock, idx) => buildCardHTML(stock, idx)).join('')}
    </div>
    <div class="last-update">
      Updated: ${time} ${errCount ? `· ${errCount} error(s)` : ''}
      · <span class="refresh-link" id="refreshLink">refresh</span>
    </div>
  `;

  getEl('refreshLink')?.addEventListener('click', render);

  requestAnimationFrame(() => {
    cachedResults.forEach((stock, idx) => {
      if (!stock.error && stock.sparkData?.length >= 2) {
        drawSparkline(getEl(`spark-${idx}`), stock.sparkData, stock.changePct >= 0);
      }
    });
  });
};

const render = async () => {
  const data = await getStorage();
  const tickers = data.tickers || [];

  appState.shares = data.shares || {};
  appState.tasks = data.tasks || [];
  appState.privacyMode = !!data.privacyMode;
  dom.privacyToggle.classList.toggle('active', appState.privacyMode);

  applyTasksVisibility(data.tasksEnabled !== false);

  if (tickers.length === 0) {
    if (dom.portfolioBar) dom.portfolioBar.style.display = 'none';
    dom.content.innerHTML = `
      <div class="empty-state">
        <h2>No stocks configured</h2>
        <p>Open Settings to add your favorite tickers.</p>
        <button class="btn" id="emptyOpenSettings">Open Settings</button>
      </div>
    `;
    getEl('emptyOpenSettings').addEventListener('click', openSettings);
    return;
  }

  // La barra "Current Portfolio" solo tiene sentido si cargaste cuántas acciones
  // tenés de algún ticker; sin shares guardadas, no hay un portafolio que resumir.
  const hasShares = Object.values(appState.shares).some(v => v > 0);
  if (dom.portfolioBar) dom.portfolioBar.style.display = hasShares ? 'flex' : 'none';

  dom.content.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading ${tickers.length} tickers...</div>
    </div>
  `;

  cachedResults = await fetchAllStocks(tickers);
  drawUI();
};

// ========= INIT =========
render();
setInterval(render, 5 * 60 * 1000);