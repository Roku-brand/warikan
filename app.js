// app.js
(() => {
  "use strict";

  /* =========================
   * Utils
   * ========================= */
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const clampMoney = (n) => Number.isFinite(n) ? n : 0;

  function formatMoney(n, symbol = "¥") {
    const v = Math.round(n);
    return `${symbol}${v.toLocaleString("ja-JP")}`;
  }

  function applyRounding(value, rule) {
    const v = value;
    if (rule === "NONE") return v;

    const isRound = rule.startsWith("ROUND_");
    const isFloor = rule.startsWith("FLOOR_");
    const isCeil = rule.startsWith("CEIL_");
    const unit = rule.endsWith("_10") ? 10 : rule.endsWith("_100") ? 100 : 1;

    if (unit === 1) return v;

    if (isRound) return Math.round(v / unit) * unit;
    if (isFloor) return Math.floor(v / unit) * unit;
    if (isCeil) return Math.ceil(v / unit) * unit;
    return v;
  }

  /* =========================
   * Storage / State
   * ========================= */
  const STORAGE_KEY = "warikan_app_v1";

  /** @typedef {{
   *  id:string, name:string, currencySymbol:string, roundingRule:string,
   *  members:{id:string,name:string,isActive:boolean}[],
   *  categories:{id:string,name:string}[],
   *  expenses:Expense[],
   *  incentives:Incentive[],
   *  adjustments:Adjustment[]
   * }} Project
   *
   * @typedef {{
   *  id:string, title:string, amount:number, payerId:string, categoryId:string,
   *  date:string, note:string,
   *  shareMode:"EQUAL"|"WEIGHT"|"FIXED"|"PERCENT",
   *  shares:{memberId:string, type:"INCLUDED"|"EXCLUDED", value:number}[]
   * }} Expense
   *
   * @typedef {{ id:string, date:string, type:string, fromId:string|null, toId:string|null, title:string, note:string }} Incentive
   *
   * @typedef {{ id:string, date:string, fromId:string|null, toId:string|null, amount:number, reason:string }} Adjustment
   */

  function defaultData() {
    const pId = uid();
    const a = uid(); const b = uid(); const c = uid();
    const food = uid(); const misc = uid();
    return {
      version: 1,
      activeProjectId: pId,
      projects: [{
        id: pId,
        name: "サンプル旅行",
        currencySymbol: "¥",
        roundingRule: "NONE",
        members: [
          { id: a, name: "A", isActive: true },
          { id: b, name: "B", isActive: true },
          { id: c, name: "C", isActive: true },
        ],
        categories: [
          { id: food, name: "食費" },
          { id: misc, name: "その他" }
        ],
        expenses: [
          {
            id: uid(),
            title: "昼ごはん",
            amount: 3600,
            payerId: a,
            categoryId: food,
            date: todayISO(),
            note: "",
            shareMode: "EQUAL",
            shares: [
              { memberId: a, type: "INCLUDED", value: 1 },
              { memberId: b, type: "INCLUDED", value: 1 },
              { memberId: c, type: "INCLUDED", value: 1 },
            ],
          }
        ],
        incentives: [
          { id: uid(), date: todayISO(), type: "DRIVE", fromId: null, toId: a, title: "運転ありがとう", note: "非数値インセンティブ（方式A）" }
        ],
        adjustments: [
          // 例：全員からAに各200円（合計400円）を反映したいなら、B->A 200 / C->A 200 の調整を作る
        ]
      }]
    };
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.projects) return defaultData();
      return parsed;
    } catch {
      return defaultData();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = load();

  function getActiveProject() {
    return state.projects.find(p => p.id === state.activeProjectId) || state.projects[0];
  }

  function setActiveProject(projectId) {
    state.activeProjectId = projectId;
    save();
    renderAll();
  }

  /* =========================
   * DOM
   * ========================= */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    projectSelect: $("#projectSelect"),
    btnNewProject: $("#btnNewProject"),

    viewProjects: $("#view-projects"),
    viewExpenses: $("#view-expenses"),
    viewSettle: $("#view-settle"),
    viewIncentives: $("#view-incentives"),
    viewSettings: $("#view-settings"),

    projectList: $("#projectList"),
    categoryList: $("#categoryList"),
    adjustmentList: $("#adjustmentList"),

    btnManageMembers: $("#btnManageMembers"),
    btnAddCategory: $("#btnAddCategory"),
    btnAddAdjustment: $("#btnAddAdjustment"),

    btnAddExpense: $("#btnAddExpense"),
    expenseList: $("#expenseList"),
    filterCategory: $("#filterCategory"),
    filterMember: $("#filterMember"),
    filterText: $("#filterText"),

    balanceList: $("#balanceList"),
    settlementList: $("#settlementList"),
    pairMap: $("#pairMap"),

    btnAddIncentive: $("#btnAddIncentive"),
    incentiveList: $("#incentiveList"),

    roundingRule: $("#roundingRule"),
    currencySymbol: $("#currencySymbol"),
    btnExport: $("#btnExport"),
    btnReset: $("#btnReset"),

    modal: $("#modal"),
    modalBackdrop: $("#modalBackdrop"),
    modalClose: $("#modalClose"),
    modalTitle: $("#modalTitle"),
    modalBody: $("#modalBody"),
    modalFooter: $("#modalFooter"),
  };

  /* =========================
   * Modal helpers
   * ========================= */
  function openModal(title, bodyEl, footerButtons = []) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = "";
    els.modalBody.appendChild(bodyEl);
    els.modalFooter.innerHTML = "";
    footerButtons.forEach(btn => els.modalFooter.appendChild(btn));
    els.modal.classList.remove("hidden");
  }
  function closeModal() {
    els.modal.classList.add("hidden");
    els.modalBody.innerHTML = "";
    els.modalFooter.innerHTML = "";
  }
  els.modalBackdrop.addEventListener("click", closeModal);
  els.modalClose.addEventListener("click", closeModal);

  function makeBtn(label, className, onClick) {
    const b = document.createElement("button");
    b.className = `btn ${className || ""}`.trim();
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  /* =========================
   * Core calc
   * ========================= */
  function computeShares(expense, project) {
    const members = project.members.filter(m => m.isActive);
    const included = expense.shares
      .filter(s => s.type === "INCLUDED")
      .map(s => ({ ...s }));

    // fallback: if shares empty -> all included weight=1
    const base = included.length ? included : members.map(m => ({ memberId: m.id, type: "INCLUDED", value: 1 }));

    const amount = clampMoney(expense.amount);
    const roundingRule = project.roundingRule || "NONE";

    /** returns owedByMemberId map */
    const owed = {};
    members.forEach(m => owed[m.id] = 0);

    if (expense.shareMode === "EQUAL") {
      const n = base.length || 1;
      const rawEach = amount / n;
      // rounding: apply per-person, then fix remainder by adding to payer (simple and practical)
      let sum = 0;
      base.forEach(s => {
        const v = applyRounding(rawEach, roundingRule);
        owed[s.memberId] += v;
        sum += v;
      });
      const diff = amount - sum;
      owed[expense.payerId] += diff; // remainder on payer
      return owed;
    }

    if (expense.shareMode === "WEIGHT") {
      const totalW = base.reduce((acc, s) => acc + (Number(s.value) || 0), 0) || 1;
      let sum = 0;
      base.forEach(s => {
        const portion = amount * ((Number(s.value) || 0) / totalW);
        const v = applyRounding(portion, roundingRule);
        owed[s.memberId] += v;
        sum += v;
      });
      const diff = amount - sum;
      owed[expense.payerId] += diff;
      return owed;
    }

    if (expense.shareMode === "PERCENT") {
      const totalP = base.reduce((acc, s) => acc + (Number(s.value) || 0), 0) || 100;
      let sum = 0;
      base.forEach(s => {
        const portion = amount * ((Number(s.value) || 0) / totalP);
        const v = applyRounding(portion, roundingRule);
        owed[s.memberId] += v;
        sum += v;
      });
      const diff = amount - sum;
      owed[expense.payerId] += diff;
      return owed;
    }

    // FIXED
    if (expense.shareMode === "FIXED") {
      let sum = 0;
      base.forEach(s => {
        const v = applyRounding(Number(s.value) || 0, roundingRule);
        owed[s.memberId] += v;
        sum += v;
      });
      const diff = amount - sum;
      owed[expense.payerId] += diff;
      return owed;
    }

    return owed;
  }

  function computeBalances(project) {
    const members = project.members.filter(m => m.isActive);
    const paid = {}; const owed = {}; const balance = {};
    members.forEach(m => { paid[m.id] = 0; owed[m.id] = 0; balance[m.id] = 0; });

    // expenses -> paid & owed
    for (const ex of project.expenses) {
      paid[ex.payerId] = (paid[ex.payerId] || 0) + clampMoney(ex.amount);
      const owedMap = computeShares(ex, project);
      for (const mid of Object.keys(owedMap)) {
        owed[mid] = (owed[mid] || 0) + owedMap[mid];
      }
    }

    // adjustments -> affect balances directly by pair transfer concept
    // adjustment: fromId pays toId amount (if null: treated as "all members" in UI creation we avoid; here handle null gracefully)
    for (const adj of project.adjustments) {
      const amt = clampMoney(adj.amount);
      if (!amt) continue;
      const fromId = adj.fromId;
      const toId = adj.toId;
      if (fromId && members.find(m => m.id === fromId)) {
        balance[fromId] -= amt;
      }
      if (toId && members.find(m => m.id === toId)) {
        balance[toId] += amt;
      }
      // If either side null, we ignore here (UI uses explicit members)
    }

    // base balances from expenses
    for (const m of members) {
      balance[m.id] += (paid[m.id] || 0) - (owed[m.id] || 0);
    }

    return { paid, owed, balance };
  }

  function computeSettlement(project) {
    const members = project.members.filter(m => m.isActive);
    const { balance } = computeBalances(project);

    const creditors = [];
    const debtors = [];
    for (const m of members) {
      const b = balance[m.id] || 0;
      if (b > 0.5) creditors.push({ id: m.id, amt: b });
      else if (b < -0.5) debtors.push({ id: m.id, amt: -b });
    }

    // greedy matching
    const transfers = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i];
      const c = creditors[j];
      const x = Math.min(d.amt, c.amt);
      if (x > 0.5) transfers.push({ fromId: d.id, toId: c.id, amount: x });
      d.amt -= x;
      c.amt -= x;
      if (d.amt <= 0.5) i++;
      if (c.amt <= 0.5) j++;
    }
    return transfers;
  }

  function computePairwiseMap(project) {
    const members = project.members.filter(m => m.isActive);
    const idx = new Map(members.map(m => [m.id, m]));
    // pair key: from->to amount (from owes to)
    const map = new Map();

    function add(fromId, toId, amount) {
      if (!fromId || !toId) return;
      if (fromId === toId) return;
      if (!idx.has(fromId) || !idx.has(toId)) return;
      const key = `${fromId}__${toId}`;
      map.set(key, (map.get(key) || 0) + amount);
    }

    // expenses: each participant owes payer their share (excluding payer's own share still forms self but ignored)
    for (const ex of project.expenses) {
      const owedMap = computeShares(ex, project);
      for (const [mid, amt] of Object.entries(owedMap)) {
        add(mid, ex.payerId, amt);
      }
    }

    // adjustments: from pays to amount -> from owes to
    for (const adj of project.adjustments) {
      add(adj.fromId, adj.toId, clampMoney(adj.amount));
    }

    // reduce opposite directions (A->B and B->A)
    const reduced = [];
    const seen = new Set();
    for (const [key, amt] of map.entries()) {
      const [a, b] = key.split("__");
      const revKey = `${b}__${a}`;
      if (seen.has(key)) continue;
      const revAmt = map.get(revKey) || 0;
      const net = amt - revAmt;
      if (net > 0.5) reduced.push({ fromId: a, toId: b, amount: net });
      else if (net < -0.5) reduced.push({ fromId: b, toId: a, amount: -net });
      seen.add(key);
      seen.add(revKey);
    }

    // sort desc by amount
    reduced.sort((x, y) => y.amount - x.amount);
    return reduced;
  }

  /* =========================
   * Render
   * ========================= */
  function renderProjectSelect() {
    const p = getActiveProject();
    els.projectSelect.innerHTML = "";
    for (const pr of state.projects) {
      const opt = document.createElement("option");
      opt.value = pr.id;
      opt.textContent = pr.name;
      if (pr.id === p.id) opt.selected = true;
      els.projectSelect.appendChild(opt);
    }
  }

  function renderProjectsView() {
    const active = getActiveProject();

    // project list
    els.projectList.innerHTML = "";
    state.projects.forEach(pr => {
      const row = document.createElement("div");
      row.className = "item";
      const left = document.createElement("div");
      left.className = "item__left";
      left.innerHTML = `
        <div class="item__title">${escapeHtml(pr.name)} ${pr.id === active.id ? '<span class="badge">選択中</span>' : ""}</div>
        <div class="item__meta">
          <span>${escapeHtml(pr.currencySymbol || "¥")}</span>
          <span>${escapeHtml(pr.roundingRule || "NONE")}</span>
          <span>メンバー ${pr.members.filter(m=>m.isActive).length}人</span>
          <span>支出 ${pr.expenses.length}件</span>
        </div>
      `;
      const right = document.createElement("div");
      right.className = "item__right";
      right.appendChild(makeBtn("開く", "", () => setActiveProject(pr.id)));
      right.appendChild(makeBtn("編集", "", () => openProjectEditor(pr.id)));
      right.appendChild(makeBtn("削除", "btn--danger", () => deleteProject(pr.id)));
      row.append(left, right);
      els.projectList.appendChild(row);
    });

    // categories
    renderCategories(active);

    // adjustments
    renderAdjustments(active);
  }

  function renderCategories(project) {
    els.categoryList.innerHTML = "";
    project.categories.forEach(cat => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `<span>${escapeHtml(cat.name)}</span>`;
      const del = document.createElement("button");
      del.textContent = "×";
      del.title = "削除";
      del.addEventListener("click", () => {
        // prevent deletion if used
        const used = project.expenses.some(e => e.categoryId === cat.id);
        if (used) {
          alert("このカテゴリは支出で使用中のため削除できません。");
          return;
        }
        project.categories = project.categories.filter(c => c.id !== cat.id);
        save();
        renderAll();
      });
      chip.appendChild(del);
      els.categoryList.appendChild(chip);
    });
  }

  function renderAdjustments(project) {
    els.adjustmentList.innerHTML = "";
    if (!project.adjustments.length) {
      els.adjustmentList.innerHTML = `<div class="muted">調整はまだありません（例：B→A 200円 など）。</div>`;
      return;
    }

    const mName = (id) => project.members.find(m => m.id === id)?.name || "（不明）";

    project.adjustments
      .slice()
      .sort((a,b) => (b.date||"").localeCompare(a.date||""))
      .forEach(adj => {
        const row = document.createElement("div");
        row.className = "item";
        const left = document.createElement("div");
        left.className = "item__left";
        left.innerHTML = `
          <div class="item__title">${escapeHtml(adj.reason || "調整")}</div>
          <div class="item__meta">
            <span>${escapeHtml(adj.date || "")}</span>
            <span>${escapeHtml(mName(adj.fromId))} → ${escapeHtml(mName(adj.toId))}</span>
          </div>
        `;
        const right = document.createElement("div");
        right.className = "item__right";
        right.innerHTML = `<div class="money">${formatMoney(adj.amount, project.currencySymbol)}</div>`;
        right.appendChild(makeBtn("編集", "", () => openAdjustmentEditor(project, adj.id)));
        right.appendChild(makeBtn("削除", "btn--danger", () => {
          project.adjustments = project.adjustments.filter(x => x.id !== adj.id);
          save(); renderAll();
        }));
        row.append(left, right);
        els.adjustmentList.appendChild(row);
      });
  }

  function renderExpenseFilters(project) {
    // category filter
    els.filterCategory.innerHTML = "";
    els.filterCategory.appendChild(new Option("カテゴリ：すべて", ""));
    project.categories.forEach(c => els.filterCategory.appendChild(new Option(c.name, c.id)));

    // member filter
    els.filterMember.innerHTML = "";
    els.filterMember.appendChild(new Option("メンバー：すべて", ""));
    project.members.filter(m => m.isActive).forEach(m => els.filterMember.appendChild(new Option(m.name, m.id)));
  }

  function renderExpensesView() {
    const project = getActiveProject();
    renderExpenseFilters(project);

    const catId = els.filterCategory.value;
    const memberId = els.filterMember.value;
    const q = (els.filterText.value || "").trim().toLowerCase();

    const mName = (id) => project.members.find(m => m.id === id)?.name || "（不明）";
    const cName = (id) => project.categories.find(c => c.id === id)?.name || "（未分類）";

    const filtered = project.expenses
      .filter(ex => !catId || ex.categoryId === catId)
      .filter(ex => {
        if (!memberId) return true;
        if (ex.payerId === memberId) return true;
        return ex.shares?.some(s => s.memberId === memberId && s.type === "INCLUDED");
      })
      .filter(ex => {
        if (!q) return true;
        const text = `${ex.title||""} ${ex.note||""}`.toLowerCase();
        return text.includes(q);
      })
      .slice()
      .sort((a,b) => (b.date||"").localeCompare(a.date||""));

    els.expenseList.innerHTML = "";
    if (!filtered.length) {
      els.expenseList.innerHTML = `<div class="muted">支出がありません。</div>`;
      return;
    }

    filtered.forEach(ex => {
      const row = document.createElement("div");
      row.className = "item";
      const left = document.createElement("div");
      left.className = "item__left";

      const includedCount = (ex.shares || []).filter(s => s.type === "INCLUDED").length || project.members.filter(m=>m.isActive).length;
      left.innerHTML = `
        <div class="item__title">${escapeHtml(ex.title || "（無題）")}</div>
        <div class="item__meta">
          <span>${escapeHtml(ex.date || "")}</span>
          <span>${escapeHtml(cName(ex.categoryId))}</span>
          <span>立替：${escapeHtml(mName(ex.payerId))}</span>
          <span>参加：${includedCount}人</span>
          <span>${escapeHtml(ex.shareMode)}</span>
        </div>
      `;

      const right = document.createElement("div");
      right.className = "item__right";
      right.innerHTML = `<div class="money">${formatMoney(ex.amount, project.currencySymbol)}</div>`;
      right.appendChild(makeBtn("編集", "", () => openExpenseEditor(project, ex.id)));
      right.appendChild(makeBtn("削除", "btn--danger", () => {
        project.expenses = project.expenses.filter(x => x.id !== ex.id);
        save(); renderAll();
      }));

      row.append(left, right);
      els.expenseList.appendChild(row);
    });
  }

  function renderSettleView() {
    const project = getActiveProject();
    const { paid, owed, balance } = computeBalances(project);
    const members = project.members.filter(m => m.isActive);

    // balances
    els.balanceList.innerHTML = "";
    members.forEach(m => {
      const b = balance[m.id] || 0;
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="item__left">
          <div class="item__title">${escapeHtml(m.name)}</div>
          <div class="item__meta">
            <span>支払 ${formatMoney(paid[m.id]||0, project.currencySymbol)}</span>
            <span>負担 ${formatMoney(owed[m.id]||0, project.currencySymbol)}</span>
            <span>調整 ${formatMoney(adjDeltaFor(project, m.id), project.currencySymbol)}</span>
          </div>
        </div>
        <div class="item__right">
          <div class="money ${b>=0 ? "pos":"neg"}">${formatMoney(b, project.currencySymbol)}</div>
        </div>
      `;
      els.balanceList.appendChild(row);
    });

    // settlement transfers
    const transfers = computeSettlement(project);
    els.settlementList.innerHTML = "";
    if (!transfers.length) {
      els.settlementList.innerHTML = `<div class="muted">精算は不要です（全員ほぼ一致）。</div>`;
    } else {
      const mName = (id) => members.find(m => m.id === id)?.name || "（不明）";
      transfers.forEach(t => {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
          <div class="item__left">
            <div class="item__title">${escapeHtml(mName(t.fromId))} → ${escapeHtml(mName(t.toId))}</div>
            <div class="item__meta"><span>送金</span></div>
          </div>
          <div class="item__right">
            <div class="money">${formatMoney(t.amount, project.currencySymbol)}</div>
          </div>
        `;
        els.settlementList.appendChild(row);
      });
    }

    // pair map
    const pairs = computePairwiseMap(project);
    els.pairMap.innerHTML = "";
    if (!pairs.length) {
      els.pairMap.innerHTML = `<div class="muted">ペア別の負債はありません。</div>`;
    } else {
      const mName = (id) => members.find(m => m.id === id)?.name || "（不明）";
      pairs.forEach(p => {
        const row = document.createElement("div");
        row.className = "pair";
        row.innerHTML = `
          <div>
            <div class="pair__left">${escapeHtml(mName(p.fromId))} が ${escapeHtml(mName(p.toId))} に</div>
            <div class="muted">（ペア別ネット）</div>
          </div>
          <div class="pair__right">${formatMoney(p.amount, project.currencySymbol)}</div>
        `;
        els.pairMap.appendChild(row);
      });
    }
  }

  function adjDeltaFor(project, memberId) {
    // delta on balance caused by adjustments: to => +, from => -
    let d = 0;
    for (const adj of project.adjustments) {
      const amt = clampMoney(adj.amount);
      if (adj.fromId === memberId) d -= amt;
      if (adj.toId === memberId) d += amt;
    }
    return d;
  }

  function renderIncentivesView() {
    const project = getActiveProject();
    const mName = (id) => project.members.find(m => m.id === id)?.name || "（不明）";

    els.incentiveList.innerHTML = "";
    const items = project.incentives.slice().sort((a,b) => (b.date||"").localeCompare(a.date||""));
    if (!items.length) {
      els.incentiveList.innerHTML = `<div class="muted">記録がありません（運転のお礼、奢りの感謝など）。</div>`;
      return;
    }

    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "item";
      const rel = [it.fromId ? mName(it.fromId) : null, it.toId ? mName(it.toId) : null].filter(Boolean).join(" → ");
      row.innerHTML = `
        <div class="item__left">
          <div class="item__title">${escapeHtml(it.title || "（記録）")}</div>
          <div class="item__meta">
            <span>${escapeHtml(it.date || "")}</span>
            <span>${escapeHtml(it.type || "NOTE")}</span>
            ${rel ? `<span>${escapeHtml(rel)}</span>` : ""}
          </div>
          ${it.note ? `<div class="muted">${escapeHtml(it.note)}</div>` : ""}
        </div>
        <div class="item__right">
          <button class="btn" data-act="edit">編集</button>
          <button class="btn btn--danger" data-act="del">削除</button>
        </div>
      `;
      row.querySelector('[data-act="edit"]').addEventListener("click", () => openIncentiveEditor(project, it.id));
      row.querySelector('[data-act="del"]').addEventListener("click", () => {
        project.incentives = project.incentives.filter(x => x.id !== it.id);
        save(); renderAll();
      });
      els.incentiveList.appendChild(row);
    });
  }

  function renderSettingsView() {
    const project = getActiveProject();
    els.roundingRule.value = project.roundingRule || "NONE";
    els.currencySymbol.value = project.currencySymbol || "¥";
  }

  function renderAll() {
    renderProjectSelect();
    renderProjectsView();
    renderExpensesView();
    renderSettleView();
    renderIncentivesView();
    renderSettingsView();
  }

  /* =========================
   * Navigation
   * ========================= */
  function showView(key) {
    const map = {
      projects: els.viewProjects,
      expenses: els.viewExpenses,
      settle: els.viewSettle,
      incentives: els.viewIncentives,
      settings: els.viewSettings
    };
    Object.values(map).forEach(v => v.classList.add("hidden"));
    map[key].classList.remove("hidden");
    $$(".tab").forEach(t => t.classList.toggle("is-active", t.dataset.nav === key));
  }

  $$(".tab").forEach(t => t.addEventListener("click", () => showView(t.dataset.nav)));

  /* =========================
   * Editors
   * ========================= */
  function openProjectCreator() {
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="form">
        <div>
          <label>プロジェクト名</label>
          <input id="p_name" placeholder="例：福岡旅行" />
        </div>
        <div class="row2">
          <div>
            <label>通貨記号</label>
            <input id="p_currency" placeholder="例：¥" value="¥" />
          </div>
          <div>
            <label>端数処理</label>
            <select id="p_round">
              <option value="NONE">なし（1円単位）</option>
              <option value="ROUND_10">10円単位（四捨五入）</option>
              <option value="ROUND_100">100円単位（四捨五入）</option>
              <option value="FLOOR_10">10円単位（切り捨て）</option>
              <option value="FLOOR_100">100円単位（切り捨て）</option>
              <option value="CEIL_10">10円単位（切り上げ）</option>
              <option value="CEIL_100">100円単位（切り上げ）</option>
            </select>
          </div>
        </div>
        <div>
          <label>メンバー（カンマ区切り）</label>
          <input id="p_members" placeholder="例：A,B,C" />
        </div>
      </div>
    `;

    openModal("プロジェクト作成", body, [
      makeBtn("作成", "btn--primary", () => {
        const name = $("#p_name").value.trim() || "新規プロジェクト";
        const currencySymbol = $("#p_currency").value.trim() || "¥";
        const roundingRule = $("#p_round").value || "NONE";
        const membersText = $("#p_members").value.trim();
        const names = membersText ? membersText.split(",").map(s => s.trim()).filter(Boolean) : ["A", "B"];

        const pr = {
          id: uid(),
          name,
          currencySymbol,
          roundingRule,
          members: names.map(n => ({ id: uid(), name: n, isActive: true })),
          categories: [{ id: uid(), name: "食費" }, { id: uid(), name: "その他" }],
          expenses: [],
          incentives: [],
          adjustments: []
        };
        state.projects.unshift(pr);
        state.activeProjectId = pr.id;
        save();
        closeModal();
        renderAll();
      }),
      makeBtn("キャンセル", "", closeModal)
    ]);
  }

  function openProjectEditor(projectId) {
    const pr = state.projects.find(p => p.id === projectId);
    if (!pr) return;

    const body = document.createElement("div");
    body.innerHTML = `
      <div class="form">
        <div>
          <label>プロジェクト名</label>
          <input id="pe_name" value="${escapeAttr(pr.name)}" />
        </div>
        <div class="row2">
          <div>
            <label>通貨記号</label>
            <input id="pe_currency" value="${escapeAttr(pr.currencySymbol || "¥")}" />
          </div>
          <div>
            <label>端数処理</label>
            <select id="pe_round">
              <option value="NONE">なし（1円単位）</option>
              <option value="ROUND_10">10円単位（四捨五入）</option>
              <option value="ROUND_100">100円単位（四捨五入）</option>
              <option value="FLOOR_10">10円単位（切り捨て）</option>
              <option value="FLOOR_100">100円単位（切り捨て）</option>
              <option value="CEIL_10">10円単位（切り上げ）</option>
              <option value="CEIL_100">100円単位（切り上げ）</option>
            </select>
          </div>
        </div>
      </div>
    `;
    body.querySelector("#pe_round").value = pr.roundingRule || "NONE";

    openModal("プロジェクト編集", body, [
      makeBtn("保存", "btn--primary", () => {
        pr.name = $("#pe_name").value.trim() || pr.name;
        pr.currencySymbol = $("#pe_currency").value.trim() || "¥";
        pr.roundingRule = $("#pe_round").value || "NONE";
        save(); closeModal(); renderAll();
      }),
      makeBtn("キャンセル", "", closeModal)
    ]);
  }

  function deleteProject(projectId) {
    if (state.projects.length <= 1) {
      alert("最後のプロジェクトは削除できません。");
      return;
    }
    const pr = state.projects.find(p => p.id === projectId);
    if (!pr) return;
    if (!confirm(`「${pr.name}」を削除します。よろしいですか？`)) return;
    state.projects = state.projects.filter(p => p.id !== projectId);
    if (state.activeProjectId === projectId) state.activeProjectId = state.projects[0].id;
    save();
    renderAll();
  }

  function openMembersManager() {
    const pr = getActiveProject();
    const body = document.createElement("div");

    function rerender() {
      body.innerHTML = `
        <div class="form">
          <div class="muted">メンバー名を変更、無効化（除外）できます。既存支出の整合性のため「削除」ではなく「無効化」を推奨。</div>
          <div id="m_list" class="list"></div>
          <div>
            <label>新規メンバー</label>
            <div class="row2">
              <input id="m_new" placeholder="名前" />
              <button class="btn btn--primary" id="m_add">追加</button>
            </div>
          </div>
        </div>
      `;

      const list = body.querySelector("#m_list");
      pr.members.forEach(m => {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
          <div class="item__left">
            <div class="item__title">
              <input data-mid="${m.id}" class="inline-input" value="${escapeAttr(m.name)}" style="width:160px;" />
              ${m.isActive ? "" : '<span class="badge">無効</span>'}
            </div>
            <div class="item__meta"><span>ID保持（支出整合性）</span></div>
          </div>
          <div class="item__right">
            <button class="btn" data-act="toggle">${m.isActive ? "無効化" : "有効化"}</button>
          </div>
        `;
        row.querySelector('[data-act="toggle"]').addEventListener("click", () => {
          m.isActive = !m.isActive;
          save(); rerender(); renderAll();
        });
        row.querySelector("input.inline-input").addEventListener("change", (e) => {
          const val = e.target.value.trim();
          if (val) m.name = val;
          save(); renderAll();
        });
        list.appendChild(row);
      });

      body.querySelector("#m_add").addEventListener("click", () => {
        const name = body.querySelector("#m_new").value.trim();
        if (!name) return;
        pr.members.push({ id: uid(), name, isActive: true });
        save(); rerender(); renderAll();
      });
    }

    rerender();

    openModal("メンバー管理", body, [
      makeBtn("閉じる", "", () => { closeModal(); renderAll(); })
    ]);
  }

  function openCategoryCreator() {
    const pr = getActiveProject();
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="form">
        <div>
          <label>カテゴリ名</label>
          <input id="c_name" placeholder="例：交通費" />
        </div>
      </div>
    `;
    openModal("カテゴリ追加", body, [
      makeBtn("追加", "btn--primary", () => {
        const name = $("#c_name").value.trim();
        if (!name) return;
        pr.categories.push({ id: uid(), name });
        save(); closeModal(); renderAll();
      }),
      makeBtn("キャンセル", "", closeModal),
    ]);
  }

  function openAdjustmentCreator() {
    const pr = getActiveProject();
    openAdjustmentEditor(pr, null);
  }

  function openAdjustmentEditor(project, adjustmentId) {
    const pr = project;
    const isEdit = !!adjustmentId;
    const adj = isEdit ? pr.adjustments.find(a => a.id === adjustmentId) : null;

    const members = pr.members.filter(m => m.isActive);
    const body = document.createElement("div");

    const options = (selectedId) => members.map(m =>
      `<option value="${escapeAttr(m.id)}" ${m.id===selectedId?"selected":""}>${escapeHtml(m.name)}</option>`
    ).join("");

    body.innerHTML = `
      <div class="form">
        <div class="row2">
          <div>
            <label>日付</label>
            <input id="a_date" type="date" value="${escapeAttr(adj?.date || todayISO())}" />
          </div>
          <div>
            <label>金額（from→to）</label>
            <input id="a_amount" type="number" inputmode="numeric" value="${escapeAttr(adj?.amount ?? 0)}" />
          </div>
        </div>

        <div class="row2">
          <div>
            <label>from（支払う側）</label>
            <select id="a_from">${options(adj?.fromId || members[0]?.id)}</select>
          </div>
          <div>
            <label>to（受け取る側）</label>
            <select id="a_to">${options(adj?.toId || members[1]?.id || members[0]?.id)}</select>
          </div>
        </div>

        <div>
          <label>理由</label>
          <input id="a_reason" placeholder="例：運転お礼（B→A）" value="${escapeAttr(adj?.reason || "")}" />
        </div>

        <div class="muted">
          例：Bが運転してくれたAに200円分反映 → from=B, to=A, amount=200。<br/>
          方式A：インセンティブは原則「記録」。金額に反映したいときだけここで調整。
        </div>
      </div>
    `;

    openModal(isEdit ? "調整編集" : "調整追加", body, [
      makeBtn("保存", "btn--primary", () => {
        const date = $("#a_date").value || todayISO();
        const amount = Number($("#a_amount").value || 0);
        const fromId = $("#a_from").value;
        const toId = $("#a_to").value;
        const reason = $("#a_reason").value.trim() || "調整";

        if (!fromId || !toId || fromId === toId) {
          alert("from / to を正しく選択してください。");
          return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          alert("金額は正の数で入力してください。");
          return;
        }

        if (isEdit) {
          adj.date = date; adj.amount = amount; adj.fromId = fromId; adj.toId = toId; adj.reason = reason;
        } else {
          pr.adjustments.push({ id: uid(), date, amount, fromId, toId, reason });
        }
        save(); closeModal(); renderAll();
      }),
      makeBtn("キャンセル", "", closeModal),
    ]);
  }

  function openExpenseEditor(project, expenseId) {
    const pr = project;
    const isEdit = !!expenseId;
    const ex = isEdit ? pr.expenses.find(e => e.id === expenseId) : null;

    const members = pr.members.filter(m => m.isActive);
    const categories = pr.categories;

    const body = document.createElement("div");
    const payerOptions = members.map(m => `<option value="${escapeAttr(m.id)}" ${m.id===(ex?.payerId||members[0]?.id)?"selected":""}>${escapeHtml(m.name)}</option>`).join("");
    const catOptions = categories.map(c => `<option value="${escapeAttr(c.id)}" ${c.id===(ex?.categoryId||categories[0]?.id)?"selected":""}>${escapeHtml(c.name)}</option>`).join("");

    // initial shares
    const initMode = ex?.shareMode || "EQUAL";
    const initShares = ex?.shares?.length
      ? ex.shares
      : members.map(m => ({ memberId: m.id, type: "INCLUDED", value: 1 }));

    const shareRows = () => members.map(m => {
      const s = initShares.find(x => x.memberId === m.id) || { type: "INCLUDED", value: 1 };
      return `
        <div class="item" style="align-items:center;">
          <div class="item__left">
            <div class="item__title">${escapeHtml(m.name)}</div>
            <div class="item__meta"><span>${escapeHtml(m.id)}</span></div>
          </div>
          <div class="item__right" style="gap:6px;">
            <label class="muted" style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" data-share-inc="${escapeAttr(m.id)}" ${s.type==="INCLUDED" ? "checked":""}/>
              参加
            </label>
            <input type="number" data-share-val="${escapeAttr(m.id)}" value="${escapeAttr(s.value ?? 1)}" style="width:110px;" />
          </div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="form">
        <div>
          <label>タイトル</label>
          <input id="e_title" placeholder="例：ホテル代" value="${escapeAttr(ex?.title || "")}" />
        </div>

        <div class="row2">
          <div>
            <label>金額</label>
            <input id="e_amount" type="number" inputmode="numeric" placeholder="0" value="${escapeAttr(ex?.amount ?? "")}" />
          </div>
          <div>
            <label>日付</label>
            <input id="e_date" type="date" value="${escapeAttr(ex?.date || todayISO())}" />
          </div>
        </div>

        <div class="row2">
          <div>
            <label>立替（payer）</label>
            <select id="e_payer">${payerOptions}</select>
          </div>
          <div>
            <label>カテゴリ</label>
            <select id="e_cat">${catOptions}</select>
          </div>
        </div>

        <div>
          <label>負担方式</label>
          <select id="e_mode">
            <option value="EQUAL">等分（参加者で均等）</option>
            <option value="WEIGHT">比率（weight）</option>
            <option value="PERCENT">割合（%）</option>
            <option value="FIXED">固定金額（合計は自動差分をpayerへ）</option>
          </select>
          <div class="muted" style="margin-top:6px;">
            ※ 端数は「設定」の端数処理に従い、差分は payer に寄せます（実務向けの単純ルール）。
          </div>
        </div>

        <div>
          <label>参加者と値（方式によって意味が変わります）</label>
          <div class="muted" style="margin-bottom:8px;">
            等分：値は無視。比率：weight。割合：%（合計は任意）。固定：各人の固定額。
          </div>
          <div id="e_shares" class="list">${shareRows()}</div>
        </div>

        <div>
          <label>メモ</label>
          <textarea id="e_note" placeholder="任意">${escapeHtml(ex?.note || "")}</textarea>
        </div>
      </div>
    `;

    body.querySelector("#e_mode").value = initMode;

    openModal(isEdit ? "支出編集" : "支出追加", body, [
      makeBtn("保存", "btn--primary", () => {
        const title = $("#e_title").value.trim() || "（無題）";
        const amount = Number($("#e_amount").value || 0);
        const date = $("#e_date").value || todayISO();
        const payerId = $("#e_payer").value;
        const categoryId = $("#e_cat").value;
        const shareMode = $("#e_mode").value;

        if (!Number.isFinite(amount) || amount <= 0) {
          alert("金額を正しく入力してください。");
          return;
        }

        // build shares
        const shares = members.map(m => {
          const inc = body.querySelector(`[data-share-inc="${CSS.escape(m.id)}"]`).checked;
          const val = Number(body.querySelector(`[data-share-val="${CSS.escape(m.id)}"]`).value || 0);
          return {
            memberId: m.id,
            type: inc ? "INCLUDED" : "EXCLUDED",
            value: Number.isFinite(val) ? val : 0
          };
        });

        // ensure at least 1 included
        if (!shares.some(s => s.type === "INCLUDED")) {
          alert("参加者が0人です。少なくとも1人を参加にしてください。");
          return;
        }

        if (isEdit) {
          ex.title = title; ex.amount = amount; ex.date = date;
          ex.payerId = payerId; ex.categoryId = categoryId; ex.shareMode = shareMode;
          ex.shares = shares;
          ex.note = $("#e_note").value || "";
        } else {
          pr.expenses.push({
            id: uid(),
            title, amount, date, payerId, categoryId,
            shareMode,
            shares,
            note: $("#e_note").value || ""
          });
        }

        save();
        closeModal();
        renderAll();
      }),
      makeBtn("キャンセル", "", closeModal)
    ]);
  }

  function openIncentiveEditor(project, incentiveId) {
    const pr = project;
    const isEdit = !!incentiveId;
    const it = isEdit ? pr.incentives.find(i => i.id === incentiveId) : null;
    const members = pr.members.filter(m => m.isActive);

    const body = document.createElement("div");
    const memberOpts = (selectedId, allowNone) => {
      const none = allowNone ? `<option value="">（なし）</option>` : "";
      const opts = members.map(m => `<option value="${escapeAttr(m.id)}" ${m.id===selectedId?"selected":""}>${escapeHtml(m.name)}</option>`).join("");
      return none + opts;
    };

    body.innerHTML = `
      <div class="form">
        <div class="row2">
          <div>
            <label>日付</label>
            <input id="i_date" type="date" value="${escapeAttr(it?.date || todayISO())}" />
          </div>
          <div>
            <label>種別</label>
            <select id="i_type">
              <option value="DRIVE">運転</option>
              <option value="TREAT">奢り</option>
              <option value="HOST">幹事</option>
              <option value="HELP">手伝い</option>
              <option value="NOTE">メモ</option>
            </select>
          </div>
        </div>

        <div class="row2">
          <div>
            <label>from（任意）</label>
            <select id="i_from">${memberOpts(it?.fromId || "", true)}</select>
          </div>
          <div>
            <label>to（任意）</label>
            <select id="i_to">${memberOpts(it?.toId || "", true)}</select>
          </div>
        </div>

        <div>
          <label>タイトル</label>
          <input id="i_title" placeholder="例：運転ありがとう" value="${escapeAttr(it?.title || "")}" />
        </div>

        <div>
          <label>詳細メモ</label>
          <textarea id="i_note" placeholder="任意">${escapeHtml(it?.note || "")}</textarea>
        </div>

        <div class="muted">
          方式A：ここでの記録は精算額に自動反映しません。反映したい場合は「手動調整」を追加してください。
        </div>
      </div>
    `;
    body.querySelector("#i_type").value = it?.type || "NOTE";

    openModal(isEdit ? "記録編集" : "記録追加", body, [
      makeBtn("保存", "btn--primary", () => {
        const date = $("#i_date").value || todayISO();
        const type = $("#i_type").value || "NOTE";
        const fromId = $("#i_from").value || null;
        const toId = $("#i_to").value || null;
        const title = $("#i_title").value.trim() || "（記録）";
        const note = $("#i_note").value || "";

        if (isEdit) {
          it.date = date; it.type = type; it.fromId = fromId; it.toId = toId; it.title = title; it.note = note;
        } else {
          pr.incentives.push({ id: uid(), date, type, fromId, toId, title, note });
        }
        save(); closeModal(); renderAll();
      }),
      makeBtn("キャンセル", "", closeModal)
    ]);
  }

  /* =========================
   * Events
   * ========================= */
  els.projectSelect.addEventListener("change", (e) => setActiveProject(e.target.value));
  els.btnNewProject.addEventListener("click", openProjectCreator);

  els.btnManageMembers.addEventListener("click", openMembersManager);
  els.btnAddCategory.addEventListener("click", openCategoryCreator);
  els.btnAddAdjustment.addEventListener("click", openAdjustmentCreator);

  els.btnAddExpense.addEventListener("click", () => openExpenseEditor(getActiveProject(), null));
  els.filterCategory.addEventListener("change", renderExpensesView);
  els.filterMember.addEventListener("change", renderExpensesView);
  els.filterText.addEventListener("input", renderExpensesView);

  els.btnAddIncentive.addEventListener("click", () => openIncentiveEditor(getActiveProject(), null));

  els.roundingRule.addEventListener("change", () => {
    const pr = getActiveProject();
    pr.roundingRule = els.roundingRule.value;
    save(); renderAll();
  });
  els.currencySymbol.addEventListener("change", () => {
    const pr = getActiveProject();
    pr.currencySymbol = els.currencySymbol.value.trim() || "¥";
    save(); renderAll();
  });

  els.btnExport.addEventListener("click", () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `warikan_export_${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  els.btnReset.addEventListener("click", () => {
    if (!confirm("全データを初期化します。よろしいですか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultData();
    save();
    renderAll();
    showView("projects");
  });

  /* =========================
   * Helpers: escape
   * ========================= */
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("\n", " ");
  }

  /* =========================
   * Init
   * ========================= */
  renderAll();
  showView("projects");

})();
