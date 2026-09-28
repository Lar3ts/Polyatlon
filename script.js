// ============================================================
// Архив протоколов — оптимизированный script.js
// Оптимизации: DocumentFragment (вариант 2) + Debounce (вариант 3)
// ============================================================

// --- ВАРИАНТ 3: DEBOUNCE ---
function debounce(func, wait) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      clearTimeout(timeout);
      func.apply(context, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// --- Глобальные переменные ---
var metaEvents = [];
var filteredEvents = [];
var currentAthleteQuery = "";
var tablesCache = {};
var fullDataMode = false;

var DEFAULT_COLUMNS = [
  { key: "p", label: "Место" },
  { key: "n", label: "Имя Фамилия" },
  { key: "y", label: "Год рожд." },
  { key: "c", label: "Страна(Субъект)" },
  { key: "s", label: "Стрельба" },
  { key: "st", label: "Силовая" },
  { key: "r", label: "Гонка" },
  { key: "t", label: "Сумма" }
];

// --- Тема ---
function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeButton(next);
}

function updateThemeButton(theme) {
  var btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = theme === 'dark' ? '&#9728;' : '&#127769;';
}

(function() {
  var saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeButton(saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
    updateThemeButton('dark');
  }
})();

// --- Тултип для поля спортсмена ---
(function() {
  var wrap = document.getElementById('athleteTooltipWrap');
  var tip = document.getElementById('athleteTooltip');
  var arrow = document.getElementById('athleteTooltipArrow');
  if (!wrap || !tip || !arrow) return;

  function showTip() { tip.classList.add('show'); arrow.classList.add('show'); positionTip(); }
  function hideTip() { tip.classList.remove('show'); arrow.classList.remove('show'); }

  function positionTip() {
    var rect = wrap.getBoundingClientRect(), tipRect = tip.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight, margin = 16, gap = 8;
    var placeBelow = true, spaceBelow = vh - rect.bottom, spaceAbove = rect.top;
    if (spaceBelow < tipRect.height + gap + margin && spaceAbove > tipRect.height + gap + margin) placeBelow = false;
    var top, tooltipBg = getComputedStyle(document.documentElement).getPropertyValue('--border-tooltip').trim();
    if (placeBelow) {
      top = rect.bottom + gap;
      arrow.className = 'tooltip-arrow arrow-top show';
      arrow.style.borderBottomColor = tooltipBg;
      arrow.style.borderTopColor = '';
    } else {
      top = rect.top - tipRect.height - gap;
      arrow.className = 'tooltip-arrow arrow-bottom show';
      arrow.style.borderTopColor = tooltipBg;
      arrow.style.borderBottomColor = '';
    }
    var tipWidth = tipRect.width;
    var left = Math.max(margin, rect.left + rect.width / 2 - tipWidth / 2);
    if (left + tipWidth > vw - margin) left = vw - margin - tipWidth;
    if (left < margin) left = margin;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    var arrowLeft = rect.left + rect.width / 2 - 7;
    arrowLeft = Math.max(left + 10, Math.min(arrowLeft, left + tipWidth - 20));
    arrow.style.left = arrowLeft + 'px';
    arrow.style.top = placeBelow ? (top - 7) + 'px' : (top + tipRect.height) + 'px';
  }

  wrap.addEventListener('mouseenter', showTip);
  wrap.addEventListener('mouseleave', hideTip);
  wrap.addEventListener('focus', showTip);
  wrap.addEventListener('blur', hideTip);
  window.addEventListener('scroll', function() { if (tip.classList.contains('show')) positionTip(); }, true);
  window.addEventListener('resize', function() { if (tip.classList.contains('show')) positionTip(); });
})();

// --- Загрузка данных ---
async function loadData() {
  try {
    var res = await fetch('events-meta.json?v=' + Date.now());
    if (res.ok) {
      metaEvents = await res.json();
      fullDataMode = false;
    } else {
      var res2 = await fetch('events.json?v=' + Date.now());
      if (!res2.ok) throw new Error('HTTP ' + res2.status);
      metaEvents = await res2.json();
      fullDataMode = true;
      metaEvents.forEach(function(e) { if (e.tables) tablesCache[e.key] = e.tables; });
    }
    metaEvents.sort(function(a, b) { return b.year - a.year; });
    renderRecent();
    renderTopViewed();
    applyFilters();
  } catch (e) {
    document.getElementById('eventsGrid').innerHTML =
      '<div class="no-results" style="display:block;">Ошибка загрузки (' + e.message + ').<br>' +
      'Запусти: <code>python -m http.server</code> и открой http://localhost:8000</div>';
  }
}

// --- Блоки «Актуальное» и «Рекомендуем» ---
function renderRecent() {
  var list = document.getElementById('recentList');
  if (!list) return;
  list.innerHTML = '';
  metaEvents.slice(0, 4).forEach(function(e) {
    var li = document.createElement('li');
    li.innerHTML = '<a href="#" onclick="openModal(\'' + e.key + '\'); return false;">' +
      e.title + ' — ' + (e.subtitle || '') + '</a>';
    list.appendChild(li);
  });
}

function renderTopViewed() {
  var list = document.getElementById('topViewedList');
  if (!list) return;
  list.innerHTML = '';
  var featured = metaEvents.filter(function(e) { return e.featured === true; });
  if (featured.length === 0) featured = metaEvents.slice(4, 8);
  featured.slice(0, 4).forEach(function(e) {
    var li = document.createElement('li');
    li.innerHTML = '<a href="#" onclick="openModal(\'' + e.key + '\'); return false;">' +
      e.title + ' — ' + (e.subtitle || '') + '</a>';
    list.appendChild(li);
  });
}

// --- Поиск спортсмена ---
function matchAthlete(query, name) {
  if (!query || !name) return false;
  var q = query.toLowerCase().trim(), n = name.toLowerCase().trim();
  if (!q || !n) return false;
  var qTokens = q.split(/\s+/).filter(function(t) { return t.length > 0; });
  var nTokens = n.split(/\s+/).filter(function(t) { return t.length > 0; });
  for (var i = 0; i < qTokens.length; i++) {
    var found = false;
    for (var j = 0; j < nTokens.length; j++) {
      if (nTokens[j].indexOf(qTokens[i]) !== -1 || qTokens[i].indexOf(nTokens[j]) !== -1) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

function eventMatchesAthlete(event, query) {
  if (!query) return false;
  if (tablesCache[event.key]) {
    var tables = tablesCache[event.key];
    for (var i = 0; i < tables.length; i++) {
      var rows = tables[i].rows;
      if (!rows) continue;
      for (var j = 0; j < rows.length; j++) if (matchAthlete(query, rows[j].n)) return true;
    }
    return false;
  }
  if (event.athletes) {
    for (var k = 0; k < event.athletes.length; k++) if (matchAthlete(query, event.athletes[k])) return true;
    return false;
  }
  if (fullDataMode && event.tables) {
    for (var i2 = 0; i2 < event.tables.length; i2++) {
      var rows2 = event.tables[i2].rows;
      if (!rows2) continue;
      for (var j2 = 0; j2 < rows2.length; j2++) if (matchAthlete(query, rows2[j2].n)) return true;
    }
  }
  return false;
}

// --- Фильтрация (чистая логика, без слушателей событий) ---
function applyFilters() {
  var fYear = document.getElementById('filter-year').value;
  var fDisc = document.getElementById('filter-discipline').value;
  var fAge = document.getElementById('filter-age').value;
  var fEvent = document.getElementById('filter-event').value;
  var fAthlete = document.getElementById('filter-athlete').value;
  currentAthleteQuery = fAthlete.trim();

  filteredEvents = metaEvents.filter(function(card) {
    var matchYear = true;
    if (fYear !== '') {
      var cardYear = parseInt(card.year, 10);
      if (fYear.indexOf('-') !== -1) {
        var parts = fYear.split('-');
        matchYear = (cardYear >= parseInt(parts[0], 10) && cardYear <= parseInt(parts[1], 10));
      } else {
        matchYear = (String(card.year) === fYear);
      }
    }

    var matchDisc = (fDisc === '');
    if (fDisc !== '' && card.discipline) {
      if (card.discipline.split(';').map(function(d) { return d.trim(); }).indexOf(fDisc) !== -1) matchDisc = true;
    }

    var matchEvent = (fEvent === '');
    if (fEvent !== '' && card.event) {
      if (card.event.split(';').map(function(ev) { return ev.trim(); }).indexOf(fEvent) !== -1) matchEvent = true;
    }

    var matchAge = (fAge === '');
    if (fAge !== '' && card.age) {
      if (card.age.split(';').map(function(a) { return a.trim(); }).indexOf(fAge) !== -1) matchAge = true;
    }

    var matchAthleteFlag = true;
    if (fAthlete !== '') matchAthleteFlag = eventMatchesAthlete(card, fAthlete);

    return matchYear && matchDisc && matchAge && matchEvent && matchAthleteFlag;
  });

  filteredEvents.sort(function(a, b) { return b.year - a.year; });
  renderPage();
}

// --- Debounced версия для текстового поля ---
var applyFiltersDebounced = debounce(applyFilters, 400);

// --- Сброс фильтров (мгновенный, без задержки) ---
function resetFilters() {
  document.getElementById('filter-year').value = '';
  document.getElementById('filter-discipline').value = '';
  document.getElementById('filter-age').value = '';
  document.getElementById('filter-event').value = '';
  document.getElementById('filter-athlete').value = '';
  currentAthleteQuery = '';
  applyFilters();
}

// --- ВАРИАНТ 2: Рендер через DocumentFragment ---
function renderPage() {
  var grid = document.getElementById('eventsGrid');
  var noResults = document.getElementById('noResults');
  if (!grid) return;

  grid.innerHTML = '';

  if (filteredEvents.length === 0) {
    noResults.style.display = 'block';
    return;
  }
  noResults.style.display = 'none';

  // Собираем все карточки в фрагмент — один reflow вместо сотен
  var fragment = document.createDocumentFragment();

  filteredEvents.forEach(function(e) {
    var card = document.createElement('div');
    card.className = 'event-card-compact';
    var ageDisplay = (e.age || '').split(';').join(', ');
    var imgSrc = e.img || 'files/placeholder.png';

    card.innerHTML =
      '<div class="banner-img-wrapper">' +
        '<img src="' + imgSrc + '" alt="' + e.title + '" onerror="this.src=\'files/placeholder.png\'" />' +
        '<div class="banner-overlay"><h3 class="banner-title">' + e.title +
        '<span>' + (e.subtitle || '') + '</span></h3></div>' +
      '</div>' +
      '<div class="event-details">' +
        '<div class="detail-box"><strong>Дисциплина:</strong> ' + (e.discipline || '-') + '</div>' +
        '<div class="detail-box"><strong>Возрастные группы:</strong> ' + ageDisplay + '</div>' +
      '</div>' +
      '<div class="buttons">' +
        '<a href="' + (e.pdf || '#') + '" download class="btn-download">Скачать</a>' +
        '<button class="btn-view" onclick="openModal(\'' + e.key + '\')">БЫСТРЫЙ ПРОСМОТР</button>' +
      '</div>';

    fragment.appendChild(card);
  });

  // Один вызов appendChild — один reflow
  grid.appendChild(fragment);
}

// --- Построение таблицы для модального окна ---
function buildTable(group, rows, columns) {
  if (!columns || columns.length === 0) columns = DEFAULT_COLUMNS;
  var html = '<div class="table-wrapper"><h4>' + group + '</h4><table><thead><tr>';
  columns.forEach(function(col) { html += '<th>' + (col.label || col.key) + '</th>'; });
  html += '</tr></thead><tbody>';
  if (rows) {
    rows.forEach(function(r) {
      html += '<tr>';
      columns.forEach(function(col) {
        var val = r[col.key];
        if (val === undefined || val === null || val === '') val = '-';
        html += col.key === 't' ? '<td><strong>' + val + '</strong></td>' : '<td>' + val + '</td>';
      });
      html += '</tr>';
    });
  }
  html += '</tbody></table></div>';
  return html;
}

// --- Модальное окно ---
async function openModal(key) {
  var data = metaEvents.find(function(e) { return e.key === key; });
  if (!data) return;
  document.getElementById('modalTitle').textContent = data.title + (data.subtitle ? ' — ' + data.subtitle : '');
  document.getElementById('modalBody').innerHTML = '<div class="modal-loading">Загрузка таблиц...</div>';
  document.getElementById('previewModal').style.display = 'flex';

  var tables = null;
  if (tablesCache[key]) {
    tables = tablesCache[key];
  } else if (fullDataMode && data.tables) {
    tables = data.tables;
    tablesCache[key] = tables;
  } else {
    try {
      var res = await fetch('data/' + key + '.json?v=' + Date.now());
      if (res.ok) {
        var tData = await res.json();
        tables = tData.tables || tData;
        tablesCache[key] = tables;
        var keys = Object.keys(tablesCache);
        if (keys.length > 20) keys.slice(0, keys.length - 20).forEach(function(k) { if (k !== key) delete tablesCache[k]; });
      }
    } catch (e) {}
  }

  if (!tables || tables.length === 0) {
    document.getElementById('modalBody').innerHTML = '<div class="modal-loading">Таблицы не найдены.</div>';
    return;
  }

  var bodyHtml = '';
  tables.forEach(function(t) { bodyHtml += buildTable(t.group, t.rows, t.columns); });
  document.getElementById('modalBody').innerHTML = bodyHtml;

  if (currentAthleteQuery) {
    var rows = document.querySelectorAll('#modalBody tbody tr');
    var firstMatch = null, nameColIndex = 1;
    var firstTable = tables[0];
    if (firstTable && firstTable.columns) {
      for (var ci = 0; ci < firstTable.columns.length; ci++) {
        if (firstTable.columns[ci].key === 'n') { nameColIndex = ci; break; }
      }
    }
    rows.forEach(function(row) {
      var nameCell = row.children[nameColIndex];
      if (nameCell && matchAthlete(currentAthleteQuery, nameCell.textContent)) {
        row.classList.add('athlete-highlight');
        nameCell.classList.add('name-col');
        if (!firstMatch) firstMatch = row;
      }
    });
    if (firstMatch) setTimeout(function() { firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
  }
}

function closeModal() {
  document.getElementById('previewModal').style.display = 'none';
}

// --- Мобильное меню ---
function toggleMobileMenu() {
  document.getElementById('mobileDropdown').classList.toggle('active');
}

// ============================================================
// ПОДКЛЮЧЕНИЕ ОБРАБОТЧИКОВ СОБЫТИЙ (один раз, не при каждом фильтре)
// ============================================================
document.addEventListener('DOMContentLoaded', function() {

  // --- Фильтры: select — мгновенно, input — с debounce ---
  var selects = document.querySelectorAll('select[id^="filter-"]');
  selects.forEach(function(sel) {
    sel.addEventListener('change', applyFilters);
  });

  var athleteInput = document.getElementById('filter-athlete');
  if (athleteInput) {
    athleteInput.addEventListener('input', applyFiltersDebounced);
  }

  var resetBtn = document.querySelector('.btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetFilters);
  }

  // --- Закрытие модального окна по клику на затемнённый фон ---
  window.addEventListener('click', function(event) {
    var modal = document.getElementById('previewModal');
    if (modal && event.target === modal) modal.style.display = 'none';
  });

  // --- Закрытие мобильного меню по клику вне него ---
  document.addEventListener('click', function(e) {
    var dropdown = document.getElementById('mobileDropdown');
    var btn = document.getElementById('mobileMenuBtn');
    if (!dropdown || !btn) return;
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('active');
  });

  // --- Дропдауны из оригинального script.js ---
  document.querySelectorAll('.dropbtn').forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.stopPropagation();
      var dropdown = button.parentElement;
      var isOpen = dropdown.classList.contains('show');

      document.querySelectorAll('.dropdown.show').forEach(function(d) {
        d.classList.remove('show');
        var b = d.querySelector('.dropbtn');
        if (b) b.setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        dropdown.classList.add('show');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Закрытие дропдауна при клике вне
  document.addEventListener('click', function(e) {
    document.querySelectorAll('.dropdown.show').forEach(function(dropdown) {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
        var btn = dropdown.querySelector('.dropbtn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // --- Старт ---
  loadData();
});
