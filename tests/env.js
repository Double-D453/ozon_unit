// Мок-окружение Apps Script для прогона syncDrr / syncSales локально.
function makeEnv() {
  const grid = {};   // sheetName -> {rows: [[...]], name}

  function cell(r, c) { return ''; }

  function Range(sh, row, col, nRows, nCols) {
    this.sh = sh; this.row = row; this.col = col; this.nRows = nRows; this.nCols = nCols;
    this._ensure = function () {
      while (sh.rows.length < this.row - 1 + this.nRows) {
        sh.rows.push([]);
      }
      sh.rows.forEach(function (r) { while (r.length < 0) r.push(''); });
    };
  }
  Range.prototype.getValues = function () {
    const out = [];
    for (let i = 0; i < this.nRows; i++) {
      const r = this.sh.rows[this.row - 1 + i] || [];
      const line = [];
      for (let j = 0; j < this.nCols; j++) {
        const v = r[this.col - 1 + j];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  };
  Range.prototype.setValues = function (vals) {
    if (vals.length !== this.nRows) {
      throw new Error('MOCK: диапазон ' + this.sh.name + ' [' + this.row + ',' + this.col + ' ' +
        this.nRows + 'x' + this.nCols + '] получил строк ' + vals.length);
    }
    vals.forEach(function (v, i) {
      if (v.length !== this.nCols) {
        throw new Error('MOCK: диапазон ' + this.sh.name + ' [' + this.row + ',' + this.col + ' ' +
          this.nRows + 'x' + this.nCols + '] строка ' + i + ' шириной ' + v.length);
      }
    }, this);
    this._ensure();
    for (let i = 0; i < vals.length; i++) {
      const target = this.sh.rows[this.row - 1 + i];
      for (let j = 0; j < vals[i].length; j++) target[this.col - 1 + j] = vals[i][j];
    }
    return this;
  };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setValue = function (v) { this._ensure(); this.sh.rows[this.row - 1][this.col - 1] = v; return this; };
  Range.prototype.clearContent = function () {
    this._ensure();
    for (let i = 0; i < this.nRows; i++) {
      const r = this.sh.rows[this.row - 1 + i];
      for (let j = 0; j < this.nCols; j++) r[this.col - 1 + j] = '';
    }
    return this;
  };
  Range.prototype.getFormulas = function () {
    const out = [];
    for (let i = 0; i < this.nRows; i++) {
      const line = [];
      for (let j = 0; j < this.nCols; j++) {
        const v = (this.sh.rows[this.row - 1 + i] || [])[this.col - 1 + j];
        line.push(typeof v === 'string' && v.charAt(0) === '=' ? v : '');
      }
      out.push(line);
    }
    return out;
  };
  Range.prototype.setFormulas = function (f) { return this.setValues(f); };
  Range.prototype.setFontSize = function () { return this; };
  Range.prototype.setWrap = function () { return this; };
  Range.prototype.getFormula = function () {
    const v = (this.sh.rows[this.row - 1] || [])[this.col - 1];
    return typeof v === 'string' && v.charAt(0) === '=' ? v : '';
  };
  ['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setFrozenRows', 'setWrap', 'setFontSize'].forEach(function (m) {
    Range.prototype[m] = function () { return this; };
  });

  function Sheet(name) {
    this.name = name;
    if (!grid[name]) grid[name] = { rows: [] };
    this.rows = grid[name].rows;
  }
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getLastRow = function () {
    let last = 0;
    for (let i = 0; i < this.rows.length; i++) {
      if ((this.rows[i] || []).some(function (v) { return v !== '' && v !== undefined && v !== null; })) last = i + 1;
    }
    return last;
  };
  Sheet.prototype.getMaxRows = function () { return Math.max(this.rows.length, 1); };
  Sheet.prototype.getMaxColumns = function () { return 26; };
  Sheet.prototype.insertRowsAfter = function (after, n) { for (let i = 0; i < n; i++) this.rows.push([]); };
  Sheet.prototype.setFrozenRows = function () { return this; };
  Sheet.prototype.clear = function () { this.rows.length = 0; return this; };
  Sheet.prototype.setColumnWidth = function () { return this; };
  Sheet.prototype.getRangeList = function () { return { setBackground: function () {} }; };
  Sheet.prototype.getRange = function (r, c, nr, nc) {
    if (nr === undefined) nr = 1;
    if (nc === undefined) nc = 1;
    return new Range(this, r, c, nr, nc);
  };

  const sheets = {};
  const SpreadsheetApp = {
    getActiveSpreadsheet: function () { return this; },
    getActiveSheet: function () { return this.getSheetByName('Номенклатура'); },
    getSheetByName: function (n) { return sheets[n] || null; },
    insertSheet: function (n) { sheets[n] = new Sheet(n); return sheets[n]; },
    getSheets: function () { return Object.keys(sheets).map(function (k) { return sheets[k]; }); },
    flush: function () {},
    getUi: function () { return { alert: function () {}, ButtonSet: { YES_NO: 1, OK: 1 }, Button: { YES: 1, OK: 1 } }; },
    _get: function (n) { if (!sheets[n]) sheets[n] = new Sheet(n); return sheets[n]; }
  };

  const store = {};
  const PropertiesService = {
    getScriptProperties: function () {
      return {
        getProperty: function (k) { return store[k] === undefined ? null : store[k]; },
        setProperty: function (k, v) { store[k] = String(v); },
        deleteProperty: function (k) { delete store[k]; }
      };
    }
  };

  const Utilities = {
    formatDate: function (d, tz, fmt) {
      const p = function (n) { return (n < 10 ? '0' : '') + n; };
      return fmt.replace('yyyy', d.getUTCFullYear()).replace('MM', p(d.getUTCMonth() + 1))
        .replace('dd', p(d.getUTCDate())).replace('HH', p(d.getUTCHours()))
        .replace('mm', p(d.getUTCMinutes())).replace('ss', p(d.getUTCSeconds()));
    },
    sleep: function (ms) { SLEPT += ms; },
    unzip: function (b) { return b._parts || [b]; }
  };
  let SLEPT = 0;
  const Session = { getScriptTimeZone: function () { return 'Europe/Moscow'; } };

  return { SpreadsheetApp: SpreadsheetApp, PropertiesService: PropertiesService,
           Utilities: Utilities, Session: Session, sheets: sheets, store: store,
           slept: function () { return SLEPT; }, resetSleep: function () { SLEPT = 0; } };
}
