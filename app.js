/* ========================================================
   C18 Task Workspace — Final Clean App Logic
   ======================================================== */
const API_BASE = "https://script.google.com/macros/s/AKfycbz9sCf54W8rjASthCcVDx7nAHbd4_iHB2VoyrPhADEEynN3weugEVU5IECNi0i4LAh_/exec";
const STATUS_VALUES = ["Pending", "Done", "Cancelled"];

const state = {
  bootstrap: null,
  user: null,
  tasks: [],
  activeCommentTaskId: null
};

const els = {};

window.addEventListener("DOMContentLoaded", () => {
  captureElements();
  bindEvents();
  initializeApp();
  window.initDeptPills = initDeptPills;
});

function captureElements() {
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
  els.taskDepartment = document.getElementById("taskDepartment");
  els.taskAssignee = document.getElementById("taskAssignee");
  els.taskItemsList = document.getElementById("taskItemsList");
  els.cancelCreateBtn = document.getElementById("cancelCreateBtn");
  els.commentModal = document.getElementById("commentModal");
  els.commentHistory = document.getElementById("commentHistory");
  els.commentInput = document.getElementById("commentInput");
  els.cancelCommentBtn = document.getElementById("cancelCommentBtn");
  els.saveCommentBtn = document.getElementById("saveCommentBtn");
  els.toast = document.getElementById("toast");
}

function bindEvents() {
  els.loginBtn.addEventListener("click", onLogin);
  els.logoutBtn.addEventListener("click", onLogout);
  els.refreshBtn.addEventListener("click", refreshTasks);
  els.openTeamWhatsAppBtn.addEventListener("click", onOpenTeamWhatsApp);
  els.sendEodBtn.addEventListener("click", onSendEod);
  els.propertyFilter.addEventListener("change", renderTasksTable);
  els.departmentFilter.addEventListener("change", renderTasksTable);
  els.statusFilter.addEventListener("change", renderTasksTable);
  els.openCreateBtn.addEventListener("click", openCreateTaskModal);
  els.cancelCreateBtn.addEventListener("click", closeCreateTaskModal);
  els.createTaskForm.addEventListener("submit", onCreateTaskSubmit);
  els.taskDepartment.addEventListener("change", syncAssigneeOptions);
  els.taskTableWrap.addEventListener("change", onTableActionChange);
  els.taskTableWrap.addEventListener("click", onTableActionClick);
  els.cancelCommentBtn.addEventListener("click", closeCommentModal);
  els.saveCommentBtn.addEventListener("click", onSaveComment);
  els.createTaskModal.addEventListener("click", (e) => { if (e.target === els.createTaskModal) closeCreateTaskModal(); });
  els.commentModal.addEventListener("click", (e) => { if (e.target === els.commentModal) closeCommentModal(); });
}

async function initializeApp() {
  els.loginView.hidden = false; els.loginView.style.display = "grid";
  els.appView.hidden = true; els.appView.style.display = "none";
  els.createTaskModal.hidden = true; els.createTaskModal.style.display = "none";
  els.commentModal.hidden = true; els.commentModal.style.display = "none";
  if (!isApiConfigured()) {
    els.userSelect.innerHTML = '<option value="">Set API_BASE first</option>';
    els.userSelect.disabled = true;
    els.pinInput.disabled = true;
    els.loginBtn.disabled = true;
    els.loginHelp.textContent = "Set API_BASE in app.js";
    return;
  }
  try {
    const res = await apiGet("bootstrap");
    if (!res.success) throw new Error(res.error || "Failed to load data");
    state.bootstrap = res;
    populateLoginUsers();
    populateFilterOptions();
  } catch (err) { showToast(err.message, true); }
}

function isApiConfigured() { return API_BASE && API_BASE.startsWith("https://script.google.com/macros/s/") && API_BASE.endsWith("/exec"); }

/* ── LOGIN / LOGOUT ── */
async function onLogin() {
  const userId = (els.userSelect.value || "").trim();
  const pin = (els.pinInput.value || "").trim();
  if (!userId) return showToast("Choose a user", true);
  try {
    const res = await apiPost("login", { userId, pin });
    if (!res.success) throw new Error(res.error || "Login failed");
    state.user = res.user;
    state.tasks = [];
    state.activeCommentTaskId = null;
    els.loginView.hidden = true; els.loginView.style.display = "none";
    els.appView.hidden = false; els.appView.style.display = "grid";
    els.sessionMeta.textContent = `${state.user.name} | ${toTitleCase(state.user.role)} | ${state.user.department || "General"}`;
    els.openCreateBtn.hidden = !canCreateTasks();
    els.openTeamWhatsAppBtn.hidden = false;
    els.sendEodBtn.hidden = false;
    els.sendEodBtn.disabled = false;
    els.sendEodBtn.textContent = "Send EOD to WhatsApp Group";
    await refreshTasks();
    showToast(`Welcome, ${state.user.name}`);
  } catch (err) { showToast(err.message, true); }
}

function onLogout() {
  state.user = null; state.tasks = [];
  els.pinInput.value = "";
  els.statusFilter.value = els.departmentFilter.value = els.propertyFilter.value = "";
  els.appView.hidden = true; els.appView.style.display = "none";
  els.loginView.hidden = false; els.loginView.style.display = "grid";
  els.createTaskModal.hidden = true; els.commentModal.hidden = true;
  els.summaryStrip.innerHTML = els.taskTableWrap.innerHTML = "";
}

async function refreshTasks() {
  if (!state.user) return;
  try {
    const res = await apiGet("getTasks", { userId: state.user.id });
    if (!res.success) throw new Error(res.error);
    state.tasks = Array.isArray(res.tasks) ? res.tasks : [];
    renderSummary(); renderTasksTable();
  } catch (err) { showToast(err.message, true); }
}

function populateLoginUsers() {
  const users = getActiveUsers();
  let opts = '<option value="">Select user</option>';
  users.sort((a,b) => a.name.localeCompare(b.name)).forEach(u => {
    opts += `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} - ${toTitleCase(u.role)} (${escapeHtml(u.department||"General")})</option>`;
  });
  els.userSelect.innerHTML = opts;
}

function populateFilterOptions() {
  els.propertyFilter.innerHTML = '<option value="">All Properties</option>';
  (state.bootstrap.properties||[]).forEach(p => els.propertyFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`));
  els.departmentFilter.innerHTML = '<option value="">All Departments</option>';
  (state.bootstrap.departments||[]).forEach(d => els.departmentFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`));
}

/* ── HELPERS ── */
function getActiveUsers() {
  return (state.bootstrap?.users||[]).filter(u => u.isActive);
}
function canCreateTasks() {
  return state.user && (state.user.role === "head" || state.user.role === "admin");
}
function canUpdateStatus(task) {
  if (!state.user || !task) return false;
  if (state.user.role === "admin") return true;
  if (state.user.role === "head") return toKey(state.user.department) === toKey(task.department);
  return state.user.id === task.assignedToUserId;
}
function canCommentOnTask(task) { return canUpdateStatus(task); }

/* ── DUMP TASKS MODAL ── */
function openCreateTaskModal() {
  if (!canCreateTasks()) return showToast("Only heads can create tasks", true);

  // Set up department / assignee and the textarea
  els.createTaskForm.innerHTML = `
    <div class="form-field">
      <label>Department</label>
      <div class="dept-pills-wrap" id="deptPills"></div>
      <select id="taskDepartment" name="taskDepartment" required class="dept-select-hidden"></select>
    </div>
    <div class="form-field">
      <label for="taskAssignee">Assign To</label>
      <select id="taskAssignee" name="taskAssignee" required></select>
    </div>
    <div class="form-field">
      <label for="dumpTextarea">Paste / Type Tasks</label>
      <textarea id="dumpTextarea" rows="8" placeholder="*OPERATION*
⛺Camp ALPHA ⛺
1. Collect balance payment
2. Pay all outstanding bills

Good earth 🌎
1. Garden lamps wire repair
..."></textarea>
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
    </div>
  `;

  // Populate department dropdown
  const departments = state.bootstrap.departments || [];
  els.taskDepartment.innerHTML = "";
  departments.forEach(d => els.taskDepartment.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`));
  syncAssigneeOptions();
  initDeptPills();

  // Bind new buttons
  document.getElementById("parseDumpBtn").addEventListener("click", onParseDump);
  document.getElementById("clearDumpBtn").addEventListener("click", () => {
    document.getElementById("dumpPreview").style.display = "none";
    els.taskItemsList.innerHTML = "";
  });

  els.taskDepartment.addEventListener("change", syncAssigneeOptions);
  els.createTaskModal.hidden = false;
  els.createTaskModal.style.display = "grid";
}

function closeCreateTaskModal() {
  els.createTaskModal.hidden = true;
  els.createTaskModal.style.display = "none";
}

function syncAssigneeOptions() {
  const dept = (els.taskDepartment.value || "").trim();
  const users = getActiveUsers().filter(u => u.role === "employee" && toKey(u.department) === toKey(dept));
  els.taskAssignee.innerHTML = "";
  if (!users.length) {
    els.taskAssignee.innerHTML = '<option value="">No employee in department</option>';
    els.taskAssignee.disabled = true;
  } else {
    els.taskAssignee.disabled = false;
    users.forEach(u => els.taskAssignee.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`));
  }
}

function onParseDump() {
  const raw = document.getElementById("dumpTextarea").value.trim();
  if (!raw) return showToast("Paste or type some tasks first", true);
  
  const tasks = parseDump(raw);
  if (tasks.length === 0) return showToast("No tasks found. Use 1. 2. format.", true);

  els.taskItemsList.innerHTML = "";
  tasks.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "task-item-row";
    row.innerHTML = `
      <div class="task-item-top">
        <span class="task-item-label">${escapeHtml(t.property || "Task")}</span>
        <button type="button" class="btn btn-ghost task-item-remove">✕</button>
      </div>
      <input type="text" class="task-item-title" value="${escapeHtml(t.title)}" placeholder="Title">
      <input type="date" class="task-item-due" value="${escapeHtml(t.dueDate||"")}">
    `;
    row.querySelector(".task-item-remove").addEventListener("click", () => {
      row.remove();
      if (els.taskItemsList.children.length === 0) {
        document.getElementById("dumpPreview").style.display = "none";
      }
      document.getElementById("dumpCount").textContent = els.taskItemsList.children.length;
    });
    els.taskItemsList.appendChild(row);
  });

  document.getElementById("dumpCount").textContent = tasks.length;
  document.getElementById("dumpPreview").style.display = "block";
}

function parseDump(text) {
  const lines = text.split("\n");
  const tasks = [];
  let currentProperty = "";

  const isPropertyLine = (line) => {
    // Emoji detection via surrogate pairs (no u flag needed)
    return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(line) ||
           /^[\*]?[A-Z\s]{3,}[\*]?$/.test(line) ||
           /^[A-Z][a-z]+ [a-z]+/.test(line);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isPropertyLine(trimmed)) {
      currentProperty = trimmed.replace(/^\*+|\*+$/g, "").replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim();
      if (!currentProperty) currentProperty = trimmed;
      continue;
    }

    const match = trimmed.match(/^(\d{1,3})[\.\)]\s*(.*)/);
    if (match) {
      const title = match[2].trim();
      if (title) {
        tasks.push({
          title,
          property: currentProperty || "General",
          dueDate: "",
          notes: ""
        });
      }
    }
  }
  return tasks;
}

async function onCreateTaskSubmit(event) {
  event.preventDefault();
  if (!state.user) return;

  // ensure assignee is enabled
  els.taskAssignee.disabled = false;

  const assigneeId = (els.taskAssignee.value || "").trim();
  if (!assigneeId) return showToast("Select an assignee", true);

  const rows = Array.from(els.taskItemsList.querySelectorAll(".task-item-row"));
  if (rows.length === 0) return showToast("No tasks to create", true);

  const taskItems = rows.map(row => ({
    title: row.querySelector(".task-item-title")?.value.trim() || "",
    dueDate: row.querySelector(".task-item-due")?.value.trim() || "",
    notes: "",
    property: row.querySelector(".task-item-label")?.textContent.trim() || ""
  })).filter(t => t.title);

  if (!taskItems.length) return showToast("Each task needs a title", true);

  const payload = {
    actorUserId: state.user.id,
    department: els.taskDepartment.value,
    assignedToUserId: assigneeId,
    tasksJson: JSON.stringify(taskItems)
  };

  try {
    const res = await apiPost("createTaskBatch", payload);
    if (!res.success) throw new Error(res.error);
    closeCreateTaskModal();
    await refreshTasks();
    showToast(`Created ${taskItems.length} task(s)`);
  } catch (err) { showToast(err.message, true); }
}

/* ── TASK LIST (grouped checklist) ── */
function renderSummary() {
  const visible = getFilteredTasks();
  els.summaryStrip.innerHTML = [
    { label:"Visible", value: visible.length },
    { label:"Pending", value: visible.filter(t=>t.status==="Pending").length },
    { label:"Done", value: visible.filter(t=>t.status==="Done").length },
    { label:"Cancelled", value: visible.filter(t=>t.status==="Cancelled").length }
  ].map(c => `<article class="summary-card"><span class="muted">${c.label}</span><strong>${c.value}</strong></article>`).join("");
}

function renderTasksTable() {
  const tasks = getFilteredTasks();
  if (!tasks.length) {
    els.taskTableWrap.innerHTML = '<div class="empty-state">No tasks match your filters.</div>';
    return;
  }

  const grouped = {};
  tasks.forEach(t => {
    const prop = t.property || "Uncategorized";
    if (!grouped[prop]) grouped[prop] = [];
    grouped[prop].push(t);
  });

  let html = '<div class="task-list-view">';
  for (const prop in grouped) {
    const list = grouped[prop];
    const done = list.filter(t => t.status === "Done").length;
    html += `<div class="task-group">
      <div class="task-group-header">
        <h3>${escapeHtml(prop)}</h3>
        <span class="task-group-count">${done}/${list.length} done</span>
      </div>
      <div class="task-rows">`;
    list.forEach((task, idx) => {
      const canUpdate = canUpdateStatus(task);
      const statusControl = canUpdate
        ? `<select class="status-select" data-action="status" data-task-id="${escapeHtml(task.id)}">
            ${STATUS_VALUES.map(s => `<option value="${s}" ${s===task.status?"selected":""}>${s}</option>`).join("")}
          </select>`
        : `<span class="status-chip ${statusClass(task.status)}">${escapeHtml(task.status)}</span>`;

      html += `<div class="task-row" data-task-id="${task.id}">
        <span class="task-row-num">${idx+1}</span>
        <div class="task-row-content">
          <div class="task-row-title">${escapeHtml(task.title)}</div>
          <div class="task-row-meta">${escapeHtml(task.assignedToName||"")} · ${escapeHtml(formatDate(task.dueDate))}</div>
        </div>
        ${statusControl}
        <button class="btn btn-ghost task-row-comment" data-action="comment" data-task-id="${escapeHtml(task.id)}">💬</button>
      </div>`;
    });
    html += `</div></div>`;
  }
  html += '</div>';
  els.taskTableWrap.innerHTML = html;
}

function getFilteredTasks() {
  const prop = (els.propertyFilter.value || "").trim();
  const dept = (els.departmentFilter.value || "").trim();
  const status = (els.statusFilter.value || "").trim();
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

/* ── STATUS & COMMENTS ── */
async function onTableActionChange(event) {
  const target = event.target;
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

function onTableActionClick(event) {
  const btn = event.target.closest("[data-action='comment']");
  if (btn) openCommentModal(btn.getAttribute("data-task-id"));
}

function openCommentModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  state.activeCommentTaskId = taskId;
  els.commentInput.value = "";
  renderCommentHistory(task);
  els.commentModal.hidden = false; els.commentModal.style.display = "grid";
}
function closeCommentModal() {
  state.activeCommentTaskId = null;
  els.commentModal.hidden = true; els.commentModal.style.display = "none";
}
function renderCommentHistory(task) {
  const comments = Array.isArray(task.comments) ? task.comments : [];
  let html = task.notes ? `<div class="comment-item"><small>Note</small><div>${escapeHtml(task.notes)}</div></div>` : "";
  comments.forEach(c => html += `<div class="comment-item"><small>${escapeHtml(c.authorName||"")} · ${formatDateTime(c.createdAt)}</small><div>${escapeHtml(c.comment)}</div></div>`);
  els.commentHistory.innerHTML = html || '<p class="muted">No comments yet.</p>';
}
async function onSaveComment() {
  const taskId = state.activeCommentTaskId;
  const comment = els.commentInput.value.trim();
  if (!taskId || !comment) return showToast("Comment cannot be empty", true);
  try {
    const res = await apiPost("addComment", { actorUserId: state.user.id, taskId, comment });
    if (!res.success) throw new Error(res.error);
    await refreshTasks();
    renderCommentHistory(state.tasks.find(t => t.id === taskId));
    els.commentInput.value = "";
    showToast("Comment added");
  } catch (err) { showToast(err.message, true); }
}

/* ── WHATSAPP & EOD ── */
async function onOpenTeamWhatsApp() {
  const url = getTeamWhatsAppUrl();
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  else showToast("Team WhatsApp URL not configured", true);
}
function getTeamWhatsAppUrl() {
  if (!state.bootstrap) return "";
  const direct = (state.bootstrap.teamWhatsAppUrl || "").trim();
  if (direct) return direct;
  const num = digitsOnly(state.bootstrap.whatsappGroupNumber || "");
  return num ? `https://wa.me/${num}?text=${encodeURIComponent("C18 team workspace")}` : "";
}
async function onSendEod() {
  if (!state.user) return;
  try {
    const res = await apiPost("sendEodReportNow", { actorUserId: state.user.id });
    if (!res.success) throw new Error(res.error);
    showToast("EOD report sent");
  } catch (err) { showToast(err.message, true); }
}

/* ── API HELPERS ── */
async function apiGet(action, params={}) {
  const q = new URLSearchParams({ action, ...params });
  const res = await fetch(`${API_BASE}?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function apiPost(action, payload={}) {
  const params = new URLSearchParams({ action, ...payload });
  const res = await fetch(API_BASE, { method:"POST", body: params });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ── UTILITIES ── */
function showToast(msg, error=false) {
  els.toast.textContent = msg;
  els.toast.className = `toast show${error?" error":""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.className = "toast", 3400);
}
function formatDate(v) { const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }); }
function formatDateTime(v) { const d = new Date(v); return isNaN(d) ? v : d.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }); }
function statusClass(s) { const k = toKey(s); if(k==="done") return "status-done"; if(k==="cancelled") return "status-cancelled"; return "status-pending"; }
function toTitleCase(v) { const s = String(v||"").toLowerCase(); return s ? s[0].toUpperCase()+s.slice(1) : ""; }
function toKey(v) { return String(v||"").trim().toLowerCase(); }
function digitsOnly(v) { return String(v||"").replace(/\D+/g,""); }
function escapeHtml(v) { return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

/* ── DEPARTMENT PILLS ── */
function initDeptPills() {
  const select = document.getElementById("taskDepartment");
  const wrap = document.getElementById("deptPills");
  if (!select || !wrap) return;
  const EMOJI = { 'sales':'💼', 'marketing':'📣', 'operations/management':'⚙️', 'operations':'⚙️', 'management':'🏗️' };
  function build() {
    wrap.innerHTML = '';
    Array.from(select.options).filter(o => o.value).forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dept-pill" + (select.value === opt.value ? " active" : "");
      btn.textContent = (EMOJI[opt.value.toLowerCase()]||"🏢") + " " + opt.text;
      btn.dataset.val = opt.value;
      btn.addEventListener("click", () => { select.value = opt.value; select.dispatchEvent(new Event("change")); });
      wrap.appendChild(btn);
    });
  }
  select.addEventListener("change", () => {
    wrap.querySelectorAll(".dept-pill").forEach(p => p.classList.toggle("active", p.dataset.val === select.value));
  });
  new MutationObserver(build).observe(select, { childList:true });
  build();
}
