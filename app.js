const API_BASE = "https://script.google.com/macros/s/AKfycbz9sCf54W8rjASthCcVDx7nAHbd4_iHB2VoyrPhADEEynN3weugEVU5IECNi0i4LAh_/exec";
const STATUS_VALUES = ["Pending", "Done", "Cancelled"];

const state = { bootstrap: null, user: null, tasks: [], activeCommentTaskId: null };
const els = {};

// ─── Utility functions ────────────────────────────
const toKey = v => String(v || "").trim().toLowerCase();
const escapeHtml = v => String(v || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const toTitleCase = v => { const s = String(v || "").toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : ""; };
const formatDate = v => { const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }); };
const formatDateTime = v => { const d = new Date(v); return isNaN(d) ? v : d.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }); };
const statusClass = s => { const k = toKey(s); return k === "done" ? "status-done" : k === "cancelled" ? "status-cancelled" : "status-pending"; };

function showToast(msg, error = false) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.className = `toast show${error ? " error" : ""}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { els.toast.className = "toast"; }, 4000);
}

// ─── API helpers ──────────────────────────────────
async function apiGet(action, params = {}) {
  const q = new URLSearchParams({ action, ...params });
  const res = await fetch(`${API_BASE}?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(action, payload = {}) {
  const params = new URLSearchParams({ action, ...payload });
  const res = await fetch(API_BASE, { method: "POST", body: params });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Data helpers ─────────────────────────────────
function getActiveUsers() { return (state.bootstrap?.users || []).filter(u => u.isActive); }
function canCreateTasks() { return state.user && (state.user.role === "head" || state.user.role === "admin"); }
function canUpdateStatus(task) {
  if (!state.user || !task) return false;
  if (state.user.role === "admin") return true;
  if (state.user.role === "head") return toKey(state.user.department) === toKey(task.department);
  return state.user.id === task.assignedToUserId;
}
function canCommentOnTask(task) { return canUpdateStatus(task); }

// ─── Bootstrap & UI population ────────────────────
function populateLoginUsers() {
  if (!els.userSelect) return console.warn("userSelect missing");
  const users = getActiveUsers();
  let opts = '<option value="">Select user</option>';
  users.sort((a,b) => a.name.localeCompare(b.name)).forEach(u => {
    opts += `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} - ${toTitleCase(u.role)} (${escapeHtml(u.department||"General")})</option>`;
  });
  els.userSelect.innerHTML = opts;
  console.log("Users populated:", users.length);
}

function populateFilterOptions() {
  if (els.propertyFilter) {
    els.propertyFilter.innerHTML = '<option value="">All Properties</option>';
    (state.bootstrap.properties || []).forEach(p => els.propertyFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(p)}">${p}</option>`));
  }
  if (els.departmentFilter) {
    els.departmentFilter.innerHTML = '<option value="">All Departments</option>';
    (state.bootstrap.departments || []).forEach(d => els.departmentFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(d)}">${d}</option>`));
  }
}

function buildFilterPills() {
  const container = document.getElementById("filterPills");
  if (!container) return;
  const props = state.bootstrap.properties || [];
  const depts = state.bootstrap.departments || [];

  function createPill(label, id, options, currentValue, onChange) {
    const wrap = document.createElement("div"); wrap.className = "filter-pill-wrap";
    const sel = document.createElement("select"); sel.className = "filter-select";
    options.forEach(o => {
      const v = typeof o === "string" ? o : o.value;
      const t = typeof o === "string" ? o : o.text;
      sel.insertAdjacentHTML("beforeend", `<option value="${v}" ${v === currentValue ? "selected" : ""}>${t}</option>`);
    });
    sel.addEventListener("change", onChange);
    wrap.appendChild(sel);
    return wrap;
  }

  container.innerHTML = "";
  container.appendChild(createPill("prop", "propertyPill", props, els.propertyFilter?.value || "", e => {
    if (els.propertyFilter) els.propertyFilter.value = e.target.value;
    renderTasksTable();
  }));
  container.appendChild(createPill("dept", "deptPill", depts, els.departmentFilter?.value || "", e => {
    if (els.departmentFilter) els.departmentFilter.value = e.target.value;
    renderTasksTable();
  }));
  container.appendChild(createPill("stat", "statusPill", [
    { value: "", text: "● All Status" },
    { value: "Pending", text: "⏳ Pending" },
    { value: "Done", text: "✅ Done" },
    { value: "Cancelled", text: "✕ Cancelled" }
  ], els.statusFilter?.value || "", e => {
    if (els.statusFilter) els.statusFilter.value = e.target.value;
    renderTasksTable();
  }));
}

// ─── Task list & summary ──────────────────────────
function getFilteredTasks() {
  const prop = (els.propertyFilter?.value || "").trim();
  const dept = (els.departmentFilter?.value || "").trim();
  const status = (els.statusFilter?.value || "").trim();
  return state.tasks.filter(t => {
    if (prop && toKey(t.property) !== toKey(prop)) return false;
    if (dept && toKey(t.department) !== toKey(dept)) return false;
    if (status && toKey(t.status) !== toKey(status)) return false;
    return true;
  }).sort((a,b) => {
    const order = { Pending:1, Done:2, Cancelled:3 };
    return (order[a.status]||99) - (order[b.status]||99) || (a.dueDate||"").localeCompare(b.dueDate||"") || (b.createdAt||"").localeCompare(a.createdAt||"");
  });
}

function renderSummary() {
  if (!els.summaryStrip) return;
  const visible = getFilteredTasks();
  const total = visible.length;
  const pending = visible.filter(t => t.status === "Pending").length;
  const done = visible.filter(t => t.status === "Done").length;
  const cancelled = visible.filter(t => t.status === "Cancelled").length;
  els.summaryStrip.innerHTML = `
    <div class="summary-pills">
      <span class="summary-pill">📋 ${total} Total</span>
      <span class="summary-pill status-pending">⏳ ${pending} Pending</span>
      <span class="summary-pill status-done">✅ ${done} Done</span>
      <span class="summary-pill status-cancelled">✕ ${cancelled} Cancelled</span>
    </div>`;
}

function renderTasksTable() {
  if (!els.taskTableWrap) return;
  const tasks = getFilteredTasks();
  if (!tasks.length) {
    els.taskTableWrap.innerHTML = '<div class="empty-state">No tasks match your filters.</div>';
    return;
  }

  const grouped = {};
  tasks.forEach(t => {
    const p = t.property || "Uncategorized";
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(t);
  });

  let html = '<div class="task-list-view">';
  Object.entries(grouped).forEach(([prop, list]) => {
    const done = list.filter(t => t.status === "Done").length;
    html += `<div class="task-group">
      <div class="task-group-header">
        <h3>${escapeHtml(prop)}</h3>
        <span class="task-group-count">${done}/${list.length} done</span>
      </div>
      <div class="task-rows">`;
    list.forEach((task, idx) => {
      const ctrl = canUpdateStatus(task)
        ? `<select class="status-select" data-action="status" data-task-id="${escapeHtml(task.id)}">
            ${STATUS_VALUES.map(s => `<option value="${s}" ${s===task.status?"selected":""}>${s}</option>`).join("")}
          </select>`
        : `<span class="status-chip ${statusClass(task.status)}">${escapeHtml(task.status)}</span>`;
      html += `<div class="task-row" data-task-id="${task.id}">
        <span class="task-row-num">${idx+1}</span>
        <div class="task-row-content">
          <div class="task-row-title">${escapeHtml(task.title)}</div>
          <div class="task-row-meta">${escapeHtml(task.assignedToName||"")} · ${formatDate(task.dueDate)}</div>
        </div>
        ${ctrl}
        <button class="btn btn-ghost task-row-comment" data-action="comment" data-task-id="${escapeHtml(task.id)}">💬</button>
      </div>`;
    });
    html += `</div></div>`;
  });
  els.taskTableWrap.innerHTML = html + '</div>';
}

// ─── Auth ─────────────────────────────────────────
async function refreshTasks() {
  if (!state.user) return;
  try {
    const res = await apiGet("getTasks", { userId: state.user.id });
    if (!res.success) throw new Error(res.error);
    state.tasks = Array.isArray(res.tasks) ? res.tasks : [];
    renderSummary();
    renderTasksTable();
  } catch (err) {
    showToast(err.message, true);
    console.error("refreshTasks failed:", err);
  }
}

async function onLogin() {
  console.log("onLogin called");
  if (!els.userSelect || !els.pinInput) {
    console.error("Missing login elements");
    return;
  }
  const userId = els.userSelect.value.trim();
  const pin = els.pinInput.value.trim();
  if (!userId) {
    showToast("Choose a user", true);
    return;
  }
  console.log("Attempting login for", userId);
  try {
    const res = await apiPost("login", { userId, pin });
    console.log("Login response:", res);
    if (!res.success) throw new Error(res.error || "Login failed");

    state.user = res.user;
    state.tasks = [];
    console.log("User set:", state.user);

    // Switch views
    if (els.loginView) els.loginView.style.display = "none";
    if (els.appView) {
      els.appView.style.display = "grid";
      console.log("appView display set to grid");
    } else {
      console.error("appView element not found!");
    }

    if (els.sessionMeta) els.sessionMeta.textContent = `${state.user.name} | ${toTitleCase(state.user.role)} | ${state.user.department || "General"}`;
    if (els.openCreateBtn) els.openCreateBtn.hidden = !canCreateTasks();
    if (els.sendEodBtn) {
      els.sendEodBtn.hidden = false;
      els.sendEodBtn.disabled = false;
      els.sendEodBtn.textContent = "Send EOD to WhatsApp Group";
    }

    await refreshTasks();
    showToast(`Welcome, ${state.user.name}`);
  } catch (err) {
    showToast(err.message, true);
    console.error("Login error:", err);
    // Even if login fails, show app for debugging? No, keep it hidden.
  }
}

function onLogout() {
  state.user = null;
  state.tasks = [];
  if (els.pinInput) els.pinInput.value = "";
  if (els.statusFilter) els.statusFilter.value = "";
  if (els.departmentFilter) els.departmentFilter.value = "";
  if (els.propertyFilter) els.propertyFilter.value = "";
  if (els.appView) els.appView.style.display = "none";
  if (els.loginView) els.loginView.style.display = "grid";
  if (els.createTaskModal) els.createTaskModal.style.display = "none";
  if (els.commentModal) els.commentModal.style.display = "none";
  if (els.summaryStrip) els.summaryStrip.innerHTML = "";
  if (els.taskTableWrap) els.taskTableWrap.innerHTML = "";
}

// ─── Dump task modal (same as before) ─────────────
function parseDump(text) {
  const lines = text.split("\n");
  const tasks = [];
  let currentProp = "";
  const isPropLine = line => /[\u{1F300}-\u{1FAFF}]/u.test(line) || /^[\*]?[A-Z\s]{3,}[\*]?$/.test(line) || /^[A-Z][a-z]+ [a-z]+/.test(line);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (isPropLine(trimmed)) {
      currentProp = trimmed.replace(/^\*+|\*+$/g, "").replace(/[^a-zA-Z0-9\s\-&]/g, "").trim() || trimmed;
      return;
    }
    const match = trimmed.match(/^(\d{1,3})[\.\)]\s*(.*)/);
    if (match) tasks.push({ title: match[2].trim(), property: currentProp || "General", dueDate: "", notes: "" });
  });
  return tasks;
}

function syncAssigneeOptions() {
  if (!els.taskDepartment || !els.taskAssignee) return;
  const dept = els.taskDepartment.value.trim();
  const users = getActiveUsers().filter(u => u.role === "employee" && toKey(u.department) === toKey(dept));
  els.taskAssignee.innerHTML = users.length
    ? users.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join("")
    : '<option value="">⚠️ No employee</option>';
  els.taskAssignee.disabled = users.length === 0;
}

function onParseDump() {
  const textarea = document.getElementById("dumpTextarea");
  if (!textarea) return;
  const raw = textarea.value.trim();
  if (!raw) return showToast("Paste tasks first", true);
  const tasks = parseDump(raw);
  if (!tasks.length) return showToast("No tasks found", true);
  if (!els.taskItemsList) return;

  els.taskItemsList.innerHTML = tasks.map(t => `
    <div class="task-item-row">
      <div class="task-item-top">
        <span class="task-item-label">${escapeHtml(t.property || "Task")}</span>
        <button type="button" class="btn btn-ghost task-item-remove">✕</button>
      </div>
      <input type="text" class="task-item-title" value="${escapeHtml(t.title)}" placeholder="Title">
      <div style="display:flex; gap:8px;">
        <input type="date" class="task-item-due" value="${escapeHtml(t.dueDate||"")}" style="flex:1;">
      </div>
    </div>`).join("");

  els.taskItemsList.querySelectorAll(".task-item-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest(".task-item-row").remove();
      document.getElementById("dumpCount").textContent = els.taskItemsList.children.length;
      if (!els.taskItemsList.children.length) document.getElementById("dumpPreview").style.display = "none";
    });
  });
  document.getElementById("dumpPreview").style.display = "block";
  document.getElementById("dumpCount").textContent = tasks.length;
}

function openCreateTaskModal() {
  if (!canCreateTasks()) return showToast("Only heads can create tasks", true);
  if (!els.createTaskForm || !els.createTaskModal) return;

  els.createTaskForm.innerHTML = `
    <div class="form-field">
      <label>Department</label>
      <div class="dept-pills-wrap" id="deptPills"></div>
      <select id="taskDepartment" class="dept-select-hidden" required></select>
    </div>
    <div class="form-field">
      <label for="taskAssignee">Assign To</label>
      <select id="taskAssignee" required></select>
    </div>
    <div class="form-field">
      <label for="dumpTextarea">Paste / Type Tasks</label>
      <textarea id="dumpTextarea" rows="8" placeholder="*OPERATION*\n⛺Camp ALPHA ⛺\n1. Collect balance payment\n2. Pay all outstanding bills\n\nGood earth 🌎\n1. Garden lamps wire repair\n..."></textarea>
      <div class="dump-hint">Use numbers (1. 2.) to separate tasks. Empty line = new property.</div>
    </div>
    <button type="button" id="parseDumpBtn" class="btn btn-secondary btn-full">🔍 Parse & Preview</button>
    <div id="dumpPreview" class="task-items-box" style="display:none;">
      <div class="task-items-head">
        <h4>Tasks to create (<span id="dumpCount">0</span>)</h4>
        <button type="button" class="btn btn-ghost btn-sm" id="clearDumpBtn">Clear</button>
      </div>
      <div id="taskItemsList" class="task-items-list"></div>
    </div>
    <div class="modal-actions">
      <button type="submit" class="btn btn-primary btn-full btn-lg">Create All Tasks</button>
    </div>`;

  els.taskDepartment = document.getElementById("taskDepartment");
  els.taskAssignee = document.getElementById("taskAssignee");
  els.taskItemsList = document.getElementById("taskItemsList");

  const departments = state.bootstrap.departments || [];
  els.taskDepartment.innerHTML = departments.map(d => `<option value="${escapeHtml(d)}">${d}</option>`).join("");
  if (departments.length) els.taskDepartment.value = departments[0];
  syncAssigneeOptions();
  initDeptPills();

  document.getElementById("parseDumpBtn").addEventListener("click", onParseDump);
  document.getElementById("clearDumpBtn").addEventListener("click", () => {
    document.getElementById("dumpPreview").style.display = "none";
    els.taskItemsList.innerHTML = "";
  });
  els.taskDepartment.addEventListener("change", syncAssigneeOptions);

  els.createTaskModal.style.display = "grid";
}

function closeCreateTaskModal() {
  if (els.createTaskModal) els.createTaskModal.style.display = "none";
}

async function onCreateTaskSubmit(e) {
  e.preventDefault();
  if (!state.user) return;
  const assigneeId = (els.taskAssignee?.value || "").trim();
  if (!assigneeId) return showToast("Select assignee", true);
  const rows = [...(els.taskItemsList?.querySelectorAll(".task-item-row") || [])];
  if (!rows.length) return showToast("No tasks to create", true);

  const taskItems = rows.map(row => ({
    title: row.querySelector(".task-item-title")?.value.trim() || "",
    dueDate: row.querySelector(".task-item-due")?.value.trim() || "",
    notes: "",
    property: row.querySelector(".task-item-label")?.textContent.trim() || ""
  })).filter(t => t.title);

  if (!taskItems.length) return showToast("Each task needs a title", true);

  try {
    const res = await apiPost("createTaskBatch", {
      actorUserId: state.user.id,
      department: els.taskDepartment.value,
      assignedToUserId: assigneeId,
      tasksJson: JSON.stringify(taskItems)
    });
    if (!res.success) throw new Error(res.error);
    closeCreateTaskModal();
    await refreshTasks();
    showToast(`Created ${taskItems.length} task(s)`);
  } catch (err) { showToast(err.message, true); }
}

// ─── Status & comments ────────────────────────────
async function onTableActionChange(e) {
  const target = e.target;
  if (target.getAttribute("data-action") !== "status") return;
  const taskId = target.getAttribute("data-task-id");
  const status = target.value;
  if (!taskId || !STATUS_VALUES.includes(status)) return;
  try {
    const res = await apiPost("updateTaskStatus", { actorUserId: state.user.id, taskId, status });
    if (!res.success) throw new Error(res.error);
    await refreshTasks();
    showToast(`Status → ${status}`);
  } catch (err) { showToast(err.message, true); }
}

function onTableActionClick(e) {
  const btn = e.target.closest("[data-action='comment']");
  if (btn) openCommentModal(btn.getAttribute("data-task-id"));
}

function openCommentModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !els.commentModal) return;
  state.activeCommentTaskId = taskId;
  els.commentInput.value = "";
  renderCommentHistory(task);
  els.commentModal.style.display = "grid";
}

function closeCommentModal() {
  state.activeCommentTaskId = null;
  if (els.commentModal) els.commentModal.style.display = "none";
}

function renderCommentHistory(task) {
  if (!els.commentHistory) return;
  const comments = Array.isArray(task.comments) ? task.comments : [];
  let html = task.notes ? `<div class="comment-item"><small>Note</small><div>${escapeHtml(task.notes)}</div></div>` : "";
  comments.forEach(c => html += `<div class="comment-item"><small>${escapeHtml(c.authorName||"")} · ${formatDateTime(c.createdAt)}</small><div>${escapeHtml(c.comment)}</div></div>`);
  els.commentHistory.innerHTML = html || '<p class="muted">No comments yet.</p>';
}

async function onSaveComment() {
  const taskId = state.activeCommentTaskId;
  if (!taskId || !els.commentInput) return;
  const comment = els.commentInput.value.trim();
  if (!comment) return showToast("Comment cannot be empty", true);
  try {
    const res = await apiPost("addComment", { actorUserId: state.user.id, taskId, comment });
    if (!res.success) throw new Error(res.error);
    await refreshTasks();
    renderCommentHistory(state.tasks.find(t => t.id === taskId));
    els.commentInput.value = "";
    showToast("Comment added");
  } catch (err) { showToast(err.message, true); }
}

// ─── WhatsApp & EOD ───────────────────────────────
function onOpenTeamWhatsApp() {
  const url = state.bootstrap?.teamWhatsAppUrl ||
    (state.bootstrap?.whatsappGroupNumber ? `https://wa.me/${state.bootstrap.whatsappGroupNumber.replace(/\D+/g,"")}` : "");
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  else showToast("Team WhatsApp URL not configured", true);
}

async function onSendEod() {
  if (!state.user) return;
  try {
    const res = await apiPost("sendEodReportNow", { actorUserId: state.user.id });
    showToast(res.success ? "EOD report sent" : res.error, !res.success);
  } catch (err) { showToast(err.message, true); }
}

// ─── Department pills & calendar ──────────────────
function initDeptPills() {
  const select = document.getElementById("taskDepartment");
  const wrap = document.getElementById("deptPills");
  if (!select || !wrap) return;
  const EMOJI = { sales:'💼', marketing:'📣', operations:'⚙️', management:'🏗️' };
  function build() {
    wrap.innerHTML = '';
    Array.from(select.options).filter(o => o.value).forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dept-pill" + (select.value === opt.value ? " active" : "");
      btn.textContent = (EMOJI[opt.value.toLowerCase()] || "🏢") + " " + opt.text;
      btn.dataset.val = opt.value;
      btn.addEventListener("click", () => { select.value = opt.value; select.dispatchEvent(new Event("change")); });
      wrap.appendChild(btn);
    });
  }
  select.addEventListener("change", () => wrap.querySelectorAll(".dept-pill").forEach(p => p.classList.toggle("active", p.dataset.val === select.value)));
  new MutationObserver(build).observe(select, { childList: true });
  build();
}

function renderCalendar() {
  const now = new Date();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthEl = document.getElementById("calendarMonth");
  const daysEl = document.getElementById("calendarDays");
  if (!monthEl || !daysEl) return;
  monthEl.textContent = monthNames[now.getMonth()] + " " + now.getFullYear();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  daysEl.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const today = d.toDateString() === now.toDateString();
    const el = document.createElement("div");
    el.className = "cal-day" + (today ? " cal-today" : "");
    el.innerHTML = `<span class="cal-day-name">${dayNames[i]}</span><span class="cal-day-num">${d.getDate()}</span>`;
    daysEl.appendChild(el);
  }
}

// ─── Initialisation ───────────────────────────────
async function initializeApp() {
  // Show login, hide others
  if (els.loginView) els.loginView.style.display = "grid";
  if (els.appView) els.appView.style.display = "none";
  if (els.createTaskModal) els.createTaskModal.style.display = "none";
  if (els.commentModal) els.commentModal.style.display = "none";

  try {
    const res = await apiGet("bootstrap");
    console.log("Bootstrap:", res);
    if (!res.success) throw new Error(res.error || "Failed to load data");
    state.bootstrap = res;
    populateLoginUsers();
    populateFilterOptions();
    buildFilterPills();
  } catch (err) {
    showToast(err.message, true);
    if (els.loginHelp) els.loginHelp.textContent = "Error: " + err.message;
    console.error("Bootstrap error:", err);
  }
}

// ─── DOM ready ────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Capture all elements
  els.loginView = document.getElementById("loginView");
  els.appView = document.getElementById("appView");
  els.userSelect = document.getElementById("userSelect");
  els.pinInput = document.getElementById("pinInput");
  els.loginBtn = document.getElementById("loginBtn");
  els.loginHelp = document.getElementById("loginHelp");
  els.sessionMeta = document.getElementById("sessionMeta");
  els.refreshBtn = document.getElementById("refreshBtn");
  els.openCreateBtn = document.getElementById("openCreateBtn");
  els.openTeamWhatsAppBtn = document.getElementById("openTeamWhatsAppBtn");
  els.sendEodBtn = document.getElementById("sendEodBtn");
  els.logoutBtn = document.getElementById("logoutBtn");
  els.propertyFilter = document.getElementById("propertyFilter");
  els.departmentFilter = document.getElementById("departmentFilter");
  els.statusFilter = document.getElementById("statusFilter");
  els.summaryStrip = document.getElementById("summaryStrip");
  els.taskTableWrap = document.getElementById("taskTableWrap");
  els.createTaskModal = document.getElementById("createTaskModal");
  els.createTaskForm = document.getElementById("createTaskForm");
  // taskDepartment, taskAssignee, taskItemsList re-assigned inside modal
  els.cancelCreateBtn = document.getElementById("cancelCreateBtn");
  els.commentModal = document.getElementById("commentModal");
  els.commentHistory = document.getElementById("commentHistory");
  els.commentInput = document.getElementById("commentInput");
  els.cancelCommentBtn = document.getElementById("cancelCommentBtn");
  els.saveCommentBtn = document.getElementById("saveCommentBtn");
  els.toast = document.getElementById("toast");

  console.log("Elements captured. appView exists:", !!els.appView);

  // Bind events (with null checks)
  if (els.loginBtn) els.loginBtn.addEventListener("click", onLogin);
  if (els.logoutBtn) els.logoutBtn.addEventListener("click", onLogout);
  if (els.refreshBtn) els.refreshBtn.addEventListener("click", refreshTasks);
  if (els.openTeamWhatsAppBtn) els.openTeamWhatsAppBtn.addEventListener("click", onOpenTeamWhatsApp);
  if (els.sendEodBtn) els.sendEodBtn.addEventListener("click", onSendEod);
  if (els.openCreateBtn) els.openCreateBtn.addEventListener("click", openCreateTaskModal);
  if (els.cancelCreateBtn) els.cancelCreateBtn.addEventListener("click", closeCreateTaskModal);
  if (els.createTaskForm) els.createTaskForm.addEventListener("submit", onCreateTaskSubmit);
  if (els.taskTableWrap) {
    els.taskTableWrap.addEventListener("change", onTableActionChange);
    els.taskTableWrap.addEventListener("click", onTableActionClick);
  }
  if (els.cancelCommentBtn) els.cancelCommentBtn.addEventListener("click", closeCommentModal);
  if (els.saveCommentBtn) els.saveCommentBtn.addEventListener("click", onSaveComment);
  if (els.createTaskModal) els.createTaskModal.addEventListener("click", e => { if (e.target === els.createTaskModal) closeCreateTaskModal(); });
  if (els.commentModal) els.commentModal.addEventListener("click", e => { if (e.target === els.commentModal) closeCommentModal(); });

  // Mobile nav delegation
  const mCreate = document.getElementById("openCreateBtn-m");
  const mWhatsApp = document.getElementById("openTeamWhatsAppBtn-m");
  const mEod = document.getElementById("sendEodBtn-m");
  const mLogout = document.getElementById("logoutBtn-m");
  if (mCreate && els.openCreateBtn) mCreate.addEventListener("click", () => els.openCreateBtn.click());
  if (mWhatsApp && els.openTeamWhatsAppBtn) mWhatsApp.addEventListener("click", () => els.openTeamWhatsAppBtn.click());
  if (mEod && els.sendEodBtn) mEod.addEventListener("click", () => els.sendEodBtn.click());
  if (mLogout && els.logoutBtn) mLogout.addEventListener("click", () => els.logoutBtn.click());

  window.initDeptPills = initDeptPills;

  initializeApp();
  renderCalendar();
});
