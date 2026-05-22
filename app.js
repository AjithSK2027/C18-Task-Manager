const API_BASE = "https://script.google.com/macros/s/AKfycbzxNCbAJ0kBz3TkxFfn2pfXXB9UlGsURkRsIZdZQsT7qAu3d2GmEbyi9Y7ht70929S4/exec"; // <-- UPDATE TO YOUR NEW URL
const STATUS_VALUES = ["Pending", "Done", "Cancelled"];

const state = { bootstrap: null, user: null, tasks: [], activeCommentTaskId: null };
const els = {};

// Utility functions (keep as in your original)
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

function getActiveUsers() { return (state.bootstrap?.users || []).filter(u => u.isActive); }
function canCreateTasks() { return state.user && (state.user.role === "head" || state.user.role === "admin"); }
function canUpdateStatus(task) { /* same as before */ }
function canCommentOnTask(task) { return canUpdateStatus(task); }

function populateLoginUsers() { /* same as before */ }
function populateFilterOptions() { /* same as before */ }
function buildFilterPills() { /* same as before */ }
function getFilteredTasks() { /* same as before */ }
function renderSummary() { /* same as before */ }
function renderTasksTable() { /* same as before – no change */ }
async function refreshTasks() { /* same as before */ }
async function onLogin() { /* same as before */ }
function onLogout() { /* same as before */ }

// ----- Task creation helpers -----
function parseDump(text) {
  const lines = String(text || "").split("\n");
  const tasks = [];
  const today = new Date().toISOString().slice(0,10);
  const isTaskLine = line => /^(\d{1,3}[\.\)]\s+|[-*]\s+)/.test(line);
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isTaskLine(trimmed)) {
      const title = trimmed.replace(/^(\d{1,3}[\.\)]\s+|[-*]\s+)/, "").trim();
      if (title) tasks.push({ title, dueDate: today, notes: "" });
    }
  }
  return tasks;
}

function syncAssigneeOptions() {
  if (!els.taskDepartment || !els.taskAssignee) return;
  const dept = els.taskDepartment.value.trim();
  const users = getActiveUsers().filter(u => u.role === "employee" && toKey(u.department) === toKey(dept));
  els.taskAssignee.innerHTML = users.length ? users.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join("") : '<option value="">⚠️ No employee</option>';
  els.taskAssignee.disabled = users.length === 0;
}

function addManualTaskRow(prefill = {}) {
  if (!els.taskItemsList) return;
  const wrap = document.getElementById("dumpPreview");
  if (wrap) wrap.style.display = "block";
  const today = new Date().toISOString().slice(0,10);
  const due = prefill.dueDate || today;
  const row = document.createElement("div");
  row.className = "task-item-row";
  row.innerHTML = `
    <div class="task-item-top">
      <span class="task-item-label">Task</span>
      <button type="button" class="btn btn-ghost task-item-remove">✕</button>
    </div>
    <input type="text" class="task-item-title" value="${escapeHtml(prefill.title || "")}" placeholder="Title">
    <div style="display:flex; gap:8px;">
      <input type="date" class="task-item-due" value="${due}" style="flex:1;">
    </div>
  `;
  row.querySelector(".task-item-remove").addEventListener("click", () => {
    row.remove();
    const countEl = document.getElementById("dumpCount");
    if (countEl) countEl.textContent = els.taskItemsList.children.length;
  });
  els.taskItemsList.appendChild(row);
  const countEl = document.getElementById("dumpCount");
  if (countEl) countEl.textContent = els.taskItemsList.children.length;
}

function onParseDump() {
  const textarea = document.getElementById("dumpTextarea");
  if (!textarea) return;
  const raw = textarea.value.trim();
  if (!raw) return showToast("Paste tasks first", true);
  const tasks = parseDump(raw);
  if (!tasks.length) return showToast("No tasks found (use numbered lines)", true);
  if (!els.taskItemsList) return;
  els.taskItemsList.innerHTML = "";
  tasks.forEach(t => addManualTaskRow(t));
  document.getElementById("dumpPreview").style.display = "block";
  document.getElementById("dumpCount").textContent = tasks.length;
}

function openCreateTaskModal() {
  try {
    if (!canCreateTasks()) return showToast("Only heads can create tasks", true);
    if (!els.createTaskForm || !els.createTaskModal) return showToast("Create task modal not found", true);
    if (!state.bootstrap) return showToast("App data not loaded. Please refresh.", true);

    const propertyOptions = (state.bootstrap.properties || []).map(p => `<option value="${escapeHtml(p)}">${p}</option>`).join('');

    els.createTaskForm.innerHTML = `
    <div class="form-field">
      <label for="taskProperty">Property / Location</label>
      <select id="taskProperty" required>
        <option value="">Select property</option>
        ${propertyOptions}
      </select>
      <small class="muted">All tasks will be created under this property.</small>
    </div>
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
      <textarea id="dumpTextarea" rows="8" placeholder="1. Check room readiness\n2. Confirm staff schedule"></textarea>
      <div class="dump-hint">Use numbered lines (e.g., "1. Task title") – one task per line.</div>
    </div>
    <div style="display:flex; gap:8px;">
      <button type="button" id="parseDumpBtn" class="btn btn-secondary">Parse and Preview</button>
      <button type="button" id="addTaskBtn" class="btn btn-secondary">Add Task Manually</button>
    </div>
    <div id="dumpPreview" class="task-items-box" style="display:none;">
      <div class="task-items-head">
        <h4>Tasks to create (<span id="dumpCount">0</span>)</h4>
        <button type="button" class="btn btn-ghost btn-sm" id="clearDumpBtn">Clear</button>
      </div>
      <div id="taskItemsList" class="task-items-list"></div>
    </div>
    <div class="modal-actions">
      <button type="submit" class="btn btn-primary btn-full btn-lg" id="createSubmitBtn">Create All Tasks</button>
    </div>`;

    els.taskProperty = document.getElementById("taskProperty");
    els.taskDepartment = document.getElementById("taskDepartment");
    els.taskAssignee = document.getElementById("taskAssignee");
    els.taskItemsList = document.getElementById("taskItemsList");
    els.createSubmitBtn = document.getElementById("createSubmitBtn");

    const departments = state.bootstrap.departments || [];
    if (!departments.length) return showToast("No departments configured", true);
    els.taskDepartment.innerHTML = departments.map(d => `<option value="${escapeHtml(d)}">${d}</option>`).join("");
    els.taskDepartment.value = departments[0];
    syncAssigneeOptions();
    initDeptPills();

    document.getElementById("parseDumpBtn").addEventListener("click", onParseDump);
    document.getElementById("addTaskBtn").addEventListener("click", () => addManualTaskRow());
    document.getElementById("clearDumpBtn").addEventListener("click", () => {
      document.getElementById("dumpPreview").style.display = "none";
      els.taskItemsList.innerHTML = "";
      document.getElementById("dumpCount").textContent = "0";
    });
    els.taskDepartment.addEventListener("change", syncAssigneeOptions);
    addManualTaskRow();

    els.createTaskModal.hidden = false;
    els.createTaskModal.style.display = "grid";
  } catch (err) {
    console.error(err);
    showToast("Could not open create task modal", true);
  }
}

function closeCreateTaskModal() {
  if (els.createTaskModal) {
    els.createTaskModal.hidden = true;
    els.createTaskModal.style.display = "none";
  }
}

async function onCreateTaskSubmit(e) {
  e.preventDefault();
  if (!state.user) return;

  const globalProperty = els.taskProperty?.value.trim();
  if (!globalProperty) return showToast("Please select a property", true);

  const assigneeId = (els.taskAssignee?.value || "").trim();
  if (!assigneeId) return showToast("Select assignee", true);

  let rows = [...(els.taskItemsList?.querySelectorAll(".task-item-row") || [])];
  if (!rows.length) {
    const raw = document.getElementById("dumpTextarea")?.value.trim();
    if (!raw) return showToast("Type or paste tasks first", true);
    const parsed = parseDump(raw);
    if (!parsed.length) return showToast("Could not parse tasks. Use numbered lines.", true);
    parsed.forEach(item => addManualTaskRow(item));
    rows = [...(els.taskItemsList?.querySelectorAll(".task-item-row") || [])];
  }

  const today = new Date().toISOString().slice(0,10);
  const taskItems = rows.map(row => ({
    title: row.querySelector(".task-item-title")?.value.trim() || "",
    dueDate: row.querySelector(".task-item-due")?.value.trim() || today,
    notes: "",
    property: globalProperty
  })).filter(t => t.title);

  if (!taskItems.length) return showToast("Each task needs a title", true);

  if (els.createSubmitBtn) {
    els.createSubmitBtn.disabled = true;
    els.createSubmitBtn.textContent = "Creating...";
  }
  showToast(`Creating ${taskItems.length} tasks...`, false);

  try {
    const payload = {
      actorUserId: state.user.id,
      department: els.taskDepartment.value,
      assignedToUserId: assigneeId,
      tasksJson: JSON.stringify(taskItems)
    };
    const res = await apiPost("createTaskBatch", payload);
    if (!res.success) throw new Error(res.error);
    closeCreateTaskModal();
    await refreshTasks();
    showToast(`Created ${taskItems.length} task(s)`);

    const assigneeName = els.taskAssignee.options[els.taskAssignee.selectedIndex]?.text || assigneeId;
    const summaryLines = [
      `📋 *New tasks created*`,
      `Property: ${globalProperty}`,
      `Department: ${els.taskDepartment.value}`,
      `Assigned to: ${assigneeName}`,
      ``,
      ...taskItems.map((t, i) => `${i+1}. ${t.title}${t.dueDate ? ` (Due: ${t.dueDate})` : ""}`)
    ];
    const summary = summaryLines.join("\n");
    await navigator.clipboard.writeText(summary);
    const groupLink = state.bootstrap?.teamWhatsAppUrl;
    if (groupLink) {
      if (confirm("Tasks created! Summary copied. Open WhatsApp group to paste?")) window.open(groupLink, '_blank');
    } else {
      showToast("Summary copied! (No group link configured)", false);
    }
  } catch (err) {
    showToast(err.message || "Create task failed", true);
  } finally {
    if (els.createSubmitBtn) {
      els.createSubmitBtn.disabled = false;
      els.createSubmitBtn.textContent = "Create All Tasks";
    }
  }
}

// ----- Status, comments, WhatsApp (keep your existing functions) -----
async function onTableActionChange(e) { /* same as before */ }
function onTableActionClick(e) { /* same as before */ }
function openCommentModal(taskId) { /* same as before */ }
function closeCommentModal() { /* same as before */ }
function renderCommentHistory(task) { /* same as before */ }
async function onSaveComment() { /* same as before */ }
function onOpenTeamWhatsApp() { /* same as before */ }
async function onSendEod() { /* same as before – the clipboard+group version */ }
function initDeptPills() { /* same as before */ }
function renderCalendar() { /* same as before */ }
async function initializeApp() { /* same as before */ }

// DOMContentLoaded event listener – keep your existing one, it already references the functions above.
