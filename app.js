const API_BASE = "https://script.google.com/macros/s/AKfycbz9sCf54W8rjASthCcVDx7nAHbd4_iHB2VoyrPhADEEynN3weugEVU5IECNi0i4LAh_/exec";
const STATUS_VALUES = ["Pending", "Done", "Cancelled"];

const state = {
  bootstrap: null,
  user: null,
  tasks: [],
  activeCommentTaskId: null,
  taskDraftCounter: 0,
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
  els.taskProperty = document.getElementById("taskProperty");
  els.taskDepartment = document.getElementById("taskDepartment");
  els.taskAssignee = document.getElementById("taskAssignee");
  els.taskItemsList = document.getElementById("taskItemsList");
  els.addTaskItemBtn = document.getElementById("addTaskItemBtn");
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
  els.createTaskForm.addEventListener("click", onCreateTaskFormClick);
  els.taskDepartment.addEventListener("change", syncAssigneeOptions);
  els.addTaskItemBtn.addEventListener("click", () => addTaskItemRow());

  els.taskTableWrap.addEventListener("change", onTableActionChange);
  els.taskTableWrap.addEventListener("click", onTableActionClick);

  els.cancelCommentBtn.addEventListener("click", closeCommentModal);
  els.saveCommentBtn.addEventListener("click", onSaveComment);

  els.createTaskModal.addEventListener("click", (event) => {
    if (event.target === els.createTaskModal) closeCreateTaskModal();
  });
  els.commentModal.addEventListener("click", (event) => {
    if (event.target === els.commentModal) closeCommentModal();
  });
}

async function initializeApp() {
  els.loginView.hidden = false;
  els.loginView.style.display = "grid";
  els.appView.hidden = true;
  els.appView.style.display = "none";
  els.createTaskModal.hidden = true;
  els.createTaskModal.style.display = "none";
  els.commentModal.hidden = true;
  els.commentModal.style.display = "none";

  if (!isApiConfigured()) {
    els.userSelect.innerHTML = '<option value="">Set API_BASE first</option>';
    els.userSelect.disabled = true;
    els.pinInput.disabled = true;
    els.loginBtn.disabled = true;
    els.loginHelp.textContent = "Set API_BASE in app.js";
    return;
  }

  try {
    const response = await apiGet("bootstrap");
    if (!response.success) throw new Error(response.error || "Could not load initial data");
    state.bootstrap = response;
    populateLoginUsers();
    populateFilterOptions();
    populateCreateTaskOptions();
  } catch (error) {
    showToast(error.message || "Failed to initialize app", true);
  }
}

function isApiConfigured() {
  return API_BASE && API_BASE.startsWith("https://script.google.com/macros/s/") && API_BASE.endsWith("/exec");
}

/* ── LOGIN / LOGOUT ── */
async function onLogin() {
  const userId = (els.userSelect.value || "").trim();
  const pin = (els.pinInput.value || "").trim();
  if (!userId) { showToast("Please choose a user", true); return; }

  try {
    const response = await apiPost("login", { userId, pin });
    if (!response.success) throw new Error(response.error || "Login failed");
    state.user = response.user;
    state.tasks = [];
    state.activeCommentTaskId = null;

    els.loginView.hidden = true;
    els.loginView.style.display = "none";
    els.appView.hidden = false;
    els.appView.style.display = "grid";

    const role = toTitleCase(state.user.role);
    const department = state.user.department || "General";
    els.sessionMeta.textContent = `${state.user.name} | ${role} | ${department}`;

    const canManage = canCreateTasks();
    els.openCreateBtn.hidden = !canManage;
    els.openTeamWhatsAppBtn.hidden = false;
    els.sendEodBtn.hidden = false;
    els.sendEodBtn.disabled = false;
    els.sendEodBtn.textContent = "Send EOD to WhatsApp Group";

    await refreshTasks();
    showToast(`Welcome, ${state.user.name}`);
  } catch (error) {
    showToast(error.message || "Login error", true);
  }
}

function onLogout() {
  state.user = null;
  state.tasks = [];
  state.activeCommentTaskId = null;
  els.pinInput.value = "";
  els.statusFilter.value = "";
  els.departmentFilter.value = "";
  els.propertyFilter.value = "";
  els.appView.hidden = true;
  els.appView.style.display = "none";
  els.loginView.hidden = false;
  els.loginView.style.display = "grid";
  els.createTaskModal.hidden = true;
  els.createTaskModal.style.display = "none";
  els.commentModal.hidden = true;
  els.commentModal.style.display = "none";
  els.sendEodBtn.textContent = "Send EOD to WhatsApp Group";
  els.summaryStrip.innerHTML = "";
  els.taskTableWrap.innerHTML = "";
}

async function refreshTasks() {
  if (!state.user) return;
  try {
    const response = await apiGet("getTasks", { userId: state.user.id });
    if (!response.success) throw new Error(response.error || "Failed to fetch tasks");
    state.tasks = Array.isArray(response.tasks) ? response.tasks : [];
    renderSummary();
    renderTasksTable();
  } catch (error) {
    showToast(error.message || "Could not refresh tasks", true);
  }
}

function populateLoginUsers() {
  const users = getActiveUsers();
  const options = ['<option value="">Select user</option>'];
  users.sort((a,b) => a.name.localeCompare(b.name)).forEach(user => {
    const role = toTitleCase(user.role);
    const dept = user.department || "General";
    options.push(`<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} - ${escapeHtml(role)} (${escapeHtml(dept)})</option>`);
  });
  els.userSelect.innerHTML = options.join("");
}

function populateFilterOptions() {
  const properties = state.bootstrap.properties || [];
  const departments = state.bootstrap.departments || [];
  els.propertyFilter.innerHTML = '<option value="">All Properties</option>';
  properties.forEach(p => els.propertyFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`));
  els.departmentFilter.innerHTML = '<option value="">All Departments</option>';
  departments.forEach(d => els.departmentFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`));
}

function populateCreateTaskOptions() {
  const properties = state.bootstrap.properties || [];
  const departments = state.bootstrap.departments || [];
  els.taskProperty.innerHTML = "";
  properties.forEach(p => els.taskProperty.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`));
  els.taskDepartment.innerHTML = "";
  departments.forEach(d => els.taskDepartment.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`));
  syncAssigneeOptions();
  addTaskItemRow();
}

function getActiveUsers() {
  const users = state.bootstrap && Array.isArray(state.bootstrap.users) ? state.bootstrap.users : [];
  return users.filter(u => Boolean(u.isActive));
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
function canCommentOnTask(task) {
  return canUpdateStatus(task);
}

/* ── CREATE TASK MODAL (original form, fixed freeze) ── */
function openCreateTaskModal() {
  if (!canCreateTasks()) { showToast("Only heads can create tasks", true); return; }
  resetCreateTaskForm();
  els.createTaskModal.hidden = false;
  els.createTaskModal.style.display = "grid";
}

function closeCreateTaskModal() {
  els.createTaskModal.hidden = true;
  els.createTaskModal.style.display = "none";
}

function resetCreateTaskForm() {
  els.createTaskForm.reset();
  syncAssigneeOptions();
  state.taskDraftCounter = 0;
  els.taskItemsList.innerHTML = "";
  addTaskItemRow();
}

function addTaskItemRow(prefill = {}) {
  state.taskDraftCounter++;
  const itemId = `task-item-${Date.now()}-${state.taskDraftCounter}`;
  const row = document.createElement("div");
  row.className = "task-item-row";
  row.dataset.itemId = itemId;
  row.innerHTML = `
    <div class="task-item-top">
      <span class="task-item-label">Task Item</span>
      <button type="button" class="btn btn-ghost task-item-remove">Remove</button>
    </div>
    <div class="task-item-grid">
      <input type="text" class="task-item-title" placeholder="Task title" value="${escapeHtml(prefill.title||'')}">
      <input type="date" class="task-item-due" value="${escapeHtml(prefill.dueDate||'')}">
      <textarea class="task-item-notes" rows="2" placeholder="Notes">${escapeHtml(prefill.notes||'')}</textarea>
    </div>
  `;
  els.taskItemsList.appendChild(row);
  refreshTaskItemLabels();
}

function onCreateTaskFormClick(event) {
  if (!event.target.classList.contains("task-item-remove")) return;
  const row = event.target.closest(".task-item-row");
  if (row) row.remove();
  if (!els.taskItemsList.children.length) addTaskItemRow();
  else refreshTaskItemLabels();
}

function refreshTaskItemLabels() {
  const rows = Array.from(els.taskItemsList.querySelectorAll(".task-item-row"));
  rows.forEach((row, idx) => {
    row.querySelector(".task-item-label").textContent = `Task ${idx+1}`;
    row.querySelector(".task-item-remove").disabled = rows.length === 1;
  });
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

function readTaskItemsFromForm() {
  const rows = Array.from(els.taskItemsList.querySelectorAll(".task-item-row"));
  const items = [];
  rows.forEach(row => {
    const title = (row.querySelector(".task-item-title")?.value || "").trim();
    if (!title) throw new Error("Each task needs a title");
    items.push({
      title,
      dueDate: (row.querySelector(".task-item-due")?.value || "").trim(),
      notes: (row.querySelector(".task-item-notes")?.value || "").trim()
    });
  });
  if (items.length === 0) throw new Error("Add at least one task");
  return items;
}

async function onCreateTaskSubmit(event) {
  event.preventDefault();
  if (!state.user) return;

  // FIX: re-enable assignee in case it was disabled
  els.taskAssignee.disabled = false;

  let taskItems;
  try {
    taskItems = readTaskItemsFromForm();
  } catch (error) {
    showToast(error.message, true);
    return;
  }

  const payload = {
    actorUserId: state.user.id,
    property: (els.taskProperty.value || "").trim(),
    department: (els.taskDepartment.value || "").trim(),
    assignedToUserId: (els.taskAssignee.value || "").trim(),
    tasksJson: JSON.stringify(taskItems)
  };

  if (!payload.assignedToUserId) {
    showToast("Choose an assignee", true);
    return;
  }

  try {
    const response = await apiPost("createTaskBatch", payload);
    if (!response.success) throw new Error(response.error || "Could not create tasks");
    closeCreateTaskModal();
    await refreshTasks();
    showToast(`Created ${response.createdCount || taskItems.length} task(s)`);
  } catch (error) {
    showToast(error.message || "Task creation failed", true);
  }
}

/* ── TASK LIST (property-grouped checklist) ── */
function renderSummary() {
  const visible = getFilteredTasks();
  els.summaryStrip.innerHTML = [
    { label:"Visible", value: visible.length },
    { label:"Pending", value: visible.filter(t=>t.status==="Pending").length },
    { label:"Done", value: visible.filter(t=>t.status==="Done").length },
    { label:"Cancelled", value: visible.filter(t=>t.status==="Cancelled").length },
  ].map(c => `<article class="summary-card"><span class="muted">${c.label}</span><strong>${c.value}</strong></article>`).join("");
}

function renderTasksTable() {
  const tasks = getFilteredTasks();
  if (!tasks.length) {
    els.taskTableWrap.innerHTML = '<div class="empty-state">No tasks match your filters.</div>';
    return;
  }

  const grouped = {};
  tasks.forEach(task => {
    const prop = task.property || "Uncategorized";
    if (!grouped[prop]) grouped[prop] = [];
    grouped[prop].push(task);
  });

  let html = '<div class="task-list-view">';
  Object.keys(grouped).forEach(prop => {
    const groupTasks = grouped[prop];
    const doneCount = groupTasks.filter(t => t.status === "Done").length;
    html += `<div class="task-group">
      <div class="task-group-header">
        <h3>${escapeHtml(prop)}</h3>
        <span class="task-group-count">${doneCount}/${groupTasks.length} done</span>
      </div>
      <div class="task-rows">`;

    groupTasks.forEach((task, idx) => {
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
          <div class="task-row-meta">
            ${escapeHtml(task.assignedToName||'')} · ${escapeHtml(formatDate(task.dueDate))}
          </div>
        </div>
        ${statusControl}
        <button class="btn btn-ghost task-row-comment" data-action="comment" data-task-id="${escapeHtml(task.id)}">💬</button>
      </div>`;
    });
    html += '</div></div>';
  });
  html += '</div>';
  els.taskTableWrap.innerHTML = html;
}

function getFilteredTasks() {
  const property = (els.propertyFilter.value || "").trim();
  const department = (els.departmentFilter.value || "").trim();
  const status = (els.statusFilter.value || "").trim();
  return state.tasks.filter(task => {
    if (property && toKey(task.property) !== toKey(property)) return false;
    if (department && toKey(task.department) !== toKey(department)) return false;
    if (status && toKey(task.status) !== toKey(status)) return false;
    return true;
  }).sort((a,b) => {
    const order = { Pending:1, Done:2, Cancelled:3 };
    return (order[a.status]||99) - (order[b.status]||99) || 
           (a.dueDate||"").localeCompare(b.dueDate||"") ||
           (b.createdAt||"").localeCompare(a.createdAt||"");
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
    const resp = await apiPost("updateTaskStatus", { actorUserId: state.user.id, taskId, status });
    if (!resp.success) throw new Error(resp.error || "Update failed");
    await refreshTasks();
    showToast(`Status → ${status}`);
  } catch(e) { showToast(e.message, true); }
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
  els.commentModal.hidden = false;
  els.commentModal.style.display = "grid";
}
function closeCommentModal() {
  state.activeCommentTaskId = null;
  els.commentModal.hidden = true;
  els.commentModal.style.display = "none";
}
function renderCommentHistory(task) {
  const comments = Array.isArray(task.comments) ? task.comments : [];
  let html = task.notes ? `<div class="comment-item"><small>Note</small><div>${escapeHtml(task.notes)}</div></div>` : "";
  comments.forEach(c => {
    html += `<div class="comment-item"><small>${escapeHtml(c.authorName||"")} · ${formatDateTime(c.createdAt)}</small><div>${escapeHtml(c.comment)}</div></div>`;
  });
  els.commentHistory.innerHTML = html || '<p class="muted">No comments yet.</p>';
}
async function onSaveComment() {
  const taskId = state.activeCommentTaskId;
  const comment = (els.commentInput.value || "").trim();
  if (!taskId || !comment) { showToast("Comment cannot be empty", true); return; }
  try {
    const resp = await apiPost("addComment", { actorUserId: state.user.id, taskId, comment });
    if (!resp.success) throw new Error(resp.error || "Save failed");
    await refreshTasks();
    renderCommentHistory(state.tasks.find(t => t.id === taskId));
    els.commentInput.value = "";
    showToast("Comment added");
  } catch(e) { showToast(e.message, true); }
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
    const resp = await apiPost("sendEodReportNow", { actorUserId: state.user.id });
    if (!resp.success) throw new Error(resp.error || "EOD failed");
    showToast("EOD report sent");
  } catch(e) { showToast(e.message, true); }
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
function formatDate(v) { const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString("en-IN", {day:"2-digit", month:"short", year:"numeric"}); }
function formatDateTime(v) { const d = new Date(v); return isNaN(d) ? v : d.toLocaleString("en-IN", {day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit"}); }
function statusClass(s) { const k = toKey(s); if(k==="done") return "status-done"; if(k==="cancelled") return "status-cancelled"; return "status-pending"; }
function toTitleCase(v) { const s = String(v||"").toLowerCase(); return s ? s[0].toUpperCase()+s.slice(1) : ""; }
function toKey(v) { return String(v||"").trim().toLowerCase(); }
function digitsOnly(v) { return String(v||"").replace(/\D+/g,""); }
function escapeHtml(v) { return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

/* ── DEPARTMENT PILLS (init called from inline script) ── */
function initDeptPills() {
  const select = document.getElementById("taskDepartment");
  const wrap = document.getElementById("deptPills");
  if (!select || !wrap) return;
  const EMOJI = { 'sales':'💼', 'marketing':'📣', 'operations/management':'⚙️', 'operations':'⚙️', 'management':'🏗️' };
  function build() {
    wrap.innerHTML = '';
    const opts = Array.from(select.options).filter(o=>o.value);
    if (!opts.length) return;
    if (!select.value || !opts.find(o=>o.value===select.value)) select.value = opts[0].value;
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dept-pill' + (select.value===opt.value?' active':'');
      btn.textContent = (EMOJI[opt.value.toLowerCase()]||'🏢') + ' ' + opt.text;
      btn.dataset.val = opt.value;
      btn.addEventListener('click', () => { select.value = opt.value; select.dispatchEvent(new Event('change')); });
      wrap.appendChild(btn);
    });
  }
  select.addEventListener('change', () => {
    wrap.querySelectorAll('.dept-pill').forEach(p => p.classList.toggle('active', p.dataset.val === select.value));
  });
  new MutationObserver(build).observe(select, { childList:true });
  build();
}
