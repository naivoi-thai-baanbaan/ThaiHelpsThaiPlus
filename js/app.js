(function () {
  "use strict";

  // ---------- Constants ----------
  var DAILY_CAP = 200;
  var MONTHLY_CAP = 1000;
  var GOV_RATE = 0.6; // รัฐช่วย 60%
  var STORAGE_KEY = "thpp_state_v1";

  var THAI_DAYS = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
  var THAI_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  // ---------- DOM ----------
  var el = {
    thaiDate: document.getElementById("thaiDate"),
    clock: document.getElementById("clock"),
    dailyLeft: document.getElementById("dailyLeft"),
    monthlyLeft: document.getElementById("monthlyLeft"),
    form: document.getElementById("calcForm"),
    amount: document.getElementById("amount"),
    formError: document.getElementById("formError"),
    btnCalc: document.getElementById("btnCalc"),
    btnSave: document.getElementById("btnSave"),
    result: document.getElementById("result"),
    resGov: document.getElementById("resGov"),
    resPay: document.getElementById("resPay"),
    btnClear: document.getElementById("btnClear"),
    historyBody: document.getElementById("historyBody"),
    historyEmpty: document.getElementById("historyEmpty")
  };

  // Holds the latest computed (but not yet saved) calculation.
  var pending = null;

  // ---------- Helpers ----------
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function dateKey(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function monthKey(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  }

  function money(n) {
    return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // ---------- State / localStorage ----------
  function defaultState() {
    var now = new Date();
    return {
      dailyLeft: DAILY_CAP,
      monthlyLeft: MONTHLY_CAP,
      lastDate: dateKey(now),
      lastMonth: monthKey(now),
      history: []
    };
  }

  function loadState() {
    var state;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? JSON.parse(raw) : defaultState();
    } catch (e) {
      state = defaultState();
    }

    // Validate shape, fall back to defaults for missing fields.
    var base = defaultState();
    if (typeof state.dailyLeft !== "number") state.dailyLeft = base.dailyLeft;
    if (typeof state.monthlyLeft !== "number") state.monthlyLeft = base.monthlyLeft;
    if (!Array.isArray(state.history)) state.history = [];
    if (!state.lastDate) state.lastDate = base.lastDate;
    if (!state.lastMonth) state.lastMonth = base.lastMonth;

    return applyResets(state);
  }

  // Reset daily/monthly caps when the day/month has rolled over (no rollover of unused funds).
  function applyResets(state) {
    var now = new Date();
    var today = dateKey(now);
    var thisMonth = monthKey(now);

    if (state.lastMonth !== thisMonth) {
      state.monthlyLeft = MONTHLY_CAP;
      state.lastMonth = thisMonth;
    }
    if (state.lastDate !== today) {
      state.dailyLeft = DAILY_CAP;
      state.lastDate = today;
    }
    return state;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage may be unavailable (private mode); app still works in-session */
    }
  }

  var state = loadState();
  saveState();

  // ---------- Calculation ----------
  // gov = min(60% of purchase, remaining daily, remaining monthly); user pays the rest.
  function calculate(amount) {
    var gov = Math.min(amount * GOV_RATE, state.dailyLeft, state.monthlyLeft);
    gov = Math.max(0, round2(gov));
    var userPay = round2(amount - gov);
    return { amount: round2(amount), gov: gov, userPay: userPay };
  }

  // ---------- Rendering ----------
  function renderStats() {
    el.dailyLeft.textContent = money(state.dailyLeft);
    el.monthlyLeft.textContent = money(state.monthlyLeft);
  }

  function renderResult(res) {
    if (!res) {
      el.result.hidden = true;
      return;
    }
    el.resGov.textContent = money(res.gov) + " บาท";
    el.resPay.textContent = money(res.userPay) + " บาท";
    el.result.hidden = false;
  }

  function renderHistory() {
    // Clear existing rows (keep the empty-state element reference).
    var rows = el.historyBody.querySelectorAll(".table__row");
    rows.forEach(function (r) { r.remove(); });

    if (!state.history.length) {
      el.historyEmpty.hidden = false;
      return;
    }
    el.historyEmpty.hidden = true;

    state.history.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "table__row";
      row.innerHTML =
        '<span class="cell-date">' + formatTs(item.ts) + "</span>" +
        "<span>" + money(item.amount) + "</span>" +
        '<span class="cell-gov">' + money(item.gov) + "</span>" +
        '<span class="cell-pay">' + money(item.userPay) + "</span>" +
        '<button class="row-del" type="button" title="ลบรายการ" data-id="' + item.id + '" aria-label="ลบรายการ">×</button>';
      el.historyBody.appendChild(row);
    });
  }

  function formatTs(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  // ---------- Clock ----------
  function tick() {
    var now = new Date();
    var be = now.getFullYear() + 543; // Buddhist Era
    el.thaiDate.textContent =
      THAI_DAYS[now.getDay()] + "ที่ " + now.getDate() + " " + THAI_MONTHS[now.getMonth()] + " " + be;
    el.clock.textContent = pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds());
  }

  // ---------- Form handling ----------
  function showError(msg) {
    el.formError.textContent = msg;
    el.formError.hidden = false;
  }

  function clearError() {
    el.formError.hidden = true;
    el.formError.textContent = "";
  }

  function resetPending() {
    pending = null;
    el.btnSave.disabled = true;
    renderResult(null);
  }

  function onCalculate(e) {
    e.preventDefault();
    clearError();

    var value = parseFloat(el.amount.value);
    if (el.amount.value.trim() === "" || isNaN(value)) {
      resetPending();
      showError("กรุณากรอกจำนวนเงิน");
      return;
    }
    if (value <= 0) {
      resetPending();
      showError("จำนวนเงินต้องมากกว่า 0");
      return;
    }

    if (state.dailyLeft <= 0 || state.monthlyLeft <= 0) {
      // Can still purchase, but state pays 0; let user know.
      showError("สิทธิ์รัฐช่วยหมดแล้ว (วันนี้/เดือนนี้) — คุณจ่ายเต็มจำนวน");
    }

    pending = calculate(value);
    renderResult(pending);
    el.btnSave.disabled = false;
  }

  function onSave() {
    if (!pending) return;

    var record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      amount: pending.amount,
      gov: pending.gov,
      userPay: pending.userPay
    };

    state.dailyLeft = round2(state.dailyLeft - pending.gov);
    state.monthlyLeft = round2(state.monthlyLeft - pending.gov);
    state.history.unshift(record);
    saveState();

    renderStats();
    renderHistory();

    // Reset form for the next entry.
    el.form.reset();
    resetPending();
    clearError();
    el.amount.focus();
  }

  function onDeleteRow(e) {
    var btn = e.target.closest(".row-del");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var idx = state.history.findIndex(function (h) { return h.id === id; });
    if (idx === -1) return;

    // Refund the government contribution back to the caps (respecting cap ceilings).
    var item = state.history[idx];
    state.dailyLeft = round2(Math.min(DAILY_CAP, state.dailyLeft + item.gov));
    state.monthlyLeft = round2(Math.min(MONTHLY_CAP, state.monthlyLeft + item.gov));
    state.history.splice(idx, 1);
    saveState();

    renderStats();
    renderHistory();
  }

  function onClearAll() {
    if (!state.history.length) return;
    if (!window.confirm("ต้องการล้างประวัติและคืนสิทธิ์ทั้งหมดหรือไม่?")) return;

    state.dailyLeft = DAILY_CAP;
    state.monthlyLeft = MONTHLY_CAP;
    state.history = [];
    saveState();

    renderStats();
    renderHistory();
    resetPending();
  }

  // Invalidate a pending calc if the user changes the amount.
  function onAmountInput() {
    if (pending) resetPending();
    clearError();
  }

  // ---------- Init ----------
  function init() {
    tick();
    setInterval(tick, 1000);

    renderStats();
    renderHistory();

    el.form.addEventListener("submit", onCalculate);
    el.btnSave.addEventListener("click", onSave);
    el.btnClear.addEventListener("click", onClearAll);
    el.historyBody.addEventListener("click", onDeleteRow);
    el.amount.addEventListener("input", onAmountInput);
  }

  init();
})();
