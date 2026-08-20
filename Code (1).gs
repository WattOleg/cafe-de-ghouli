// ═══════════════════════════════════════════════════════════
//  УСТАРЕЛО: приложение переведено на Supabase.
//  Этот скрист больше не используется. Схема: supabase/schema.sql
//  Café de Ghouli — Inventory Apps Script  (v3)
// ═══════════════════════════════════════════════════════════

var SHEET_PREFIX = 'Инв_';
// Sheet names per section
var SECTION_SHEETS = {
  'бар':          'Справочник_бар',
  'кухня':        'Справочник_кухня',
  'кондитерская': 'Справочник_кондитерская',
  'зал':          'Справочник_зал'
};

// ── GET ───────────────────────────────────────────────────────
function doGet(e) {
  var action = (e.parameter && e.parameter.action) || 'catalog';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result;

  try {
    if      (action === 'catalog') {
      var section = e.parameter.section || e.parameter.sheet || 'бар';
      // Accept full sheet name or section key
      var sheetName = SECTION_SHEETS[section] || section;
      result = getCatalog(ss, sheetName);
    }
    else if (action === 'session') {
      var sec = e.parameter.section || 'бар';
      result = getSession(ss, e.parameter.date || todayStr(), sec);
    }
    else if (action === 'ping')    result = { ok: true, time: new Date().toISOString() };
    else if (action === 'editItem')   result = editItem(ss, e.parameter);
    else if (action === 'addItem')    result = addItem(ss, e.parameter);
    else if (action === 'deleteItem') result = deleteItem(ss, e.parameter);
    else if (action === 'visit')    result = trackVisit(ss);
    else if (action === 'getDates') {
      var sec3 = e.parameter.section || 'бар';
      result = getSessionDates(ss, sec3);
    }
    else if (action === 'saveAll') {
      var items = JSON.parse(e.parameter.data || '[]');
      var sec2 = e.parameter.section || 'бар';
      result = saveAll(ss, { date: e.parameter.date || todayStr(), section: sec2, items: items });
    }
    else result = { error: 'Unknown action: ' + action };
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── POST ──────────────────────────────────────────────────────
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Bad JSON' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result;

  try {
    if (body.action === 'saveAll') result = saveAll(ss, body);
    else result = { error: 'Unknown action: ' + body.action };
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── getCatalog ────────────────────────────────────────────────
// Таблица: A=Код, B=Наименование, C=Ед.изм.
// Данные с 3-й строки (1-2 пустые)
function getCatalog(ss, sheetName) {
  // Cache catalog for 5 minutes to speed up repeated loads
  var cache = CacheService.getScriptCache();
  var cacheKey = 'catalog_' + sheetName;
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) { /* cache miss */ }
  }

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    var names = ss.getSheets().map(function(s) { return s.getName(); }).join(', ');
    return { error: 'Лист "' + sheetName + '" не найден. Доступные: ' + names };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return { items: [], debug: 'lastRow=' + lastRow };

  // Read 5 columns: A=Код, B=Наименование, C=игнор, D=Ед.изм, E=Категория
  var data = sheet.getRange(3, 1, lastRow - 2, 5).getValues();
  var items = [];

  for (var i = 0; i < data.length; i++) {
    var code = String(data[i][0] || '').trim();
    var name = String(data[i][1] || '').trim();
    var unit = String(data[i][3] || '').trim() || String(data[i][2] || '').trim() || 'шт';
    var category = String(data[i][4] || '').trim();

    if (!name) continue;
    // Пропускаем строки-заголовки (нет кода и нет единицы)
    if (!code && !unit) continue;

    items.push({
      id: 'r' + (i + 3),
      rowNum: i + 3,
      code: code,
      name: name,
      category: category || 'Разное',
      unit: unit
    });
  }

  var result = { items: items };
  try { cache.put(cacheKey, JSON.stringify(result), 300); } catch(e) { /* too large */ }
  return result;
}

// ── guessCategory ─────────────────────────────────────────────
function guessCategory(name) {
  var n = name.toLowerCase();
  if (/ликер|ликёр|colombo|aperol|campari/.test(n))                          return 'Аперетив';
  if (/пиво|corona|leffe|budweiser|heineken/.test(n))                         return 'Пиво';
  if (/виски|whisky|whiskey|jameson|dewars|macallan|tenjaku|chivas/.test(n)) return 'Виски';
  if (/коньяк|cognac|martell|hennessy|remy/.test(n))                         return 'Коньяк';
  if (/\bром\b|bacardi|havana/.test(n))                                       return 'Ром';
  if (/водка|vodka|absolut|beluga/.test(n))                                   return 'Водка';
  if (/джин|\bgin\b|hendricks|tanqueray|bombay/.test(n))                     return 'Джин';
  if (/текила|tequila|mezcal/.test(n))                                        return 'Текила';
  if (/шампанское|champagne|veuve|perignon|просекко|prosecco|cremant|martini asti|игр |игристое/.test(n)) return 'Игристые вина';
  if (/вино|wine|chardonnay|riesling|merlot|cabernet|sauvignon|syrah|malbec|chianti|beaujolais|blanc|rouge|blush|villa|chateau|don simon|abrau|paladin|casasole|pfefferer|chablis|bourgogne|touraine|antinori|barbera/.test(n)) return 'Вина';
  if (/сок|juice|вода|water|тоник|кола|cola|schweppes|сироп/.test(n))       return 'Безалкогольное';
  if (/baileys|kahlua|cointreau|amaretto/.test(n))                            return 'Ликёры';
  return 'Разное';
}

// ── getSession ────────────────────────────────────────────────
function getSession(ss, date, section) {
  section = section || 'бар';
  var sheet = ss.getSheetByName(SHEET_PREFIX + section + '_' + date);
  if (!sheet) return { date: date, section: section, items: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { date: date, items: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var items = [];
  for (var i = 0; i < data.length; i++) {
    var id = String(data[i][0] || '').trim();
    if (!id) continue;
    items.push({
      id: id,
      code: String(data[i][1] || ''),
      name: String(data[i][2] || ''),
      unit: String(data[i][3] || ''),
      total: parseFloat(String(data[i][4] || '').trim().replace(',', '.')) || 0
    });
  }
  return { date: date, items: items };
}

// ── saveAll ───────────────────────────────────────────────────
function saveAll(ss, body) {
  var date = body.date || todayStr();
  var section = body.section || 'бар';
  var sheet = getOrCreateSessionSheet(ss, date, section);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  var items = body.items || [];
  if (!items.length) return { ok: true, saved: 0 };
  var now = new Date();
  var rows = items.map(function(it) {
    return [it.id, it.code || '', it.name, it.unit, it.total, now];
  });
  sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  return { ok: true, date: date, saved: rows.length };
}

// ── helpers ───────────────────────────────────────────────────
function editItem(ss, p) {
  var sheet = ss.getSheetByName(p.sheet);
  if (!sheet) return { error: 'Лист не найден: ' + p.sheet };
  var row = parseInt(p.rowNum);
  if (!row || row < 3) return { error: 'Неверный rowNum: ' + p.rowNum };
  sheet.getRange(row, 1, 1, 5).setValues([[
    p.code || '',
    p.name || '',
    '',
    p.unit || 'шт',
    p.category || 'Прочее'
  ]]);
  CacheService.getScriptCache().remove('catalog_' + p.sheet);
  return { ok: true, row: row };
}

function addItem(ss, p) {
  var sheet = ss.getSheetByName(p.sheet);
  if (!sheet) return { error: 'Лист не найден: ' + p.sheet };
  var lastRow = sheet.getLastRow();
  var newRow = lastRow + 1;
  sheet.getRange(newRow, 1, 1, 5).setValues([[
    p.code || '',
    p.name || '',
    '',
    p.unit || 'шт',
    p.category || 'Прочее'
  ]]);
  CacheService.getScriptCache().remove('catalog_' + p.sheet);
  return { ok: true, row: newRow };
}

function deleteItem(ss, p) {
  var sheet = ss.getSheetByName(p.sheet);
  if (!sheet) return { error: 'Лист не найден: ' + p.sheet };
  var row = parseInt(p.rowNum);
  if (!row || row < 3) return { error: 'Неверный rowNum: ' + p.rowNum };
  sheet.deleteRow(row);
  CacheService.getScriptCache().remove('catalog_' + p.sheet);
  return { ok: true };
}

function trackVisit(ss) {
  var sheet = ss.getSheetByName('Статистика');
  if (!sheet) {
    sheet = ss.insertSheet('Статистика');
    sheet.getRange(1,1,1,2).setValues([['Дата','Посещения']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  // Find or create today's row
  var today = todayStr();
  var lastRow = sheet.getLastRow();
  var found = false;
  if (lastRow > 1) {
    var dates = sheet.getRange(2, 1, lastRow-1, 1).getValues();
    for (var i = 0; i < dates.length; i++) {
      var cellVal = dates[i][0];
      var cellDateStr = '';
      if (cellVal instanceof Date) {
        cellDateStr = Utilities.formatDate(cellVal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else if (cellVal) {
        cellDateStr = String(cellVal).slice(0, 10);
      }
      if (cellDateStr === today) {
        var countCell = sheet.getRange(i+2, 2);
        var newCount = (countCell.getValue() || 0) + 1;
        countCell.setValue(newCount);
        found = true;
        // Get total visits
        var allCounts = sheet.getRange(2, 2, lastRow-1, 1).getValues();
        var total = allCounts.reduce(function(s,r){ return s + (r[0]||0); }, 0);
        return { visits: total, today: newCount };
      }
    }
  }
  if (!found) {
    sheet.getRange(lastRow+1, 1, 1, 2).setValues([[new Date(), 1]]);
  }
  var allRows = sheet.getLastRow();
  var allCounts = allRows > 1 ? sheet.getRange(2, 2, allRows-1, 1).getValues() : [[1]];
  var total = allCounts.reduce(function(s,r){ return s + (r[0]||0); }, 0);
  return { visits: total, today: 1 };
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function getOrCreateSessionSheet(ss, date, section) {
  section = section || 'бар';
  var name = SHEET_PREFIX + section + '_' + date;
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, 6)
      .setValues([['ID', 'Код', 'Наименование', 'Ед.изм.', 'Остаток', 'Обновлено']])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(3, 300);
    sheet.setColumnWidth(6, 160);
  }
  return sheet;
}

// ── getSessionDates ───────────────────────────────────────────
function getSessionDates(ss, section) {
  var prefix = SHEET_PREFIX + section + '_';
  var sheets = ss.getSheets();
  var dates = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name.indexOf(prefix) === 0) {
      var datePart = name.substring(prefix.length);
      dates.push(datePart);
    }
  }
  dates.sort().reverse();
  return { dates: dates };
}
