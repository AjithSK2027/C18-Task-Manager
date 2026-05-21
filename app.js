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
    els.userSelect.innerHTML = '<option value="">Set API_BASE in app.js first</option>';
    els.userSelect.disabled = true;
    els.pinInput.disabled = true;
    els.loginBtn.disabled = true;
    els.loginHelp.textContent = "Set API_BASE in app.js to your deployed Google Apps Script /exec URL.";
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

async function onLogin() {
  const userId = (els.userSelect.value || "").trim();
  const pin = (els.pinInput.value || "").trim();

  if (!userId) {
    showToast("Please choose a user", true);
    return;
  }

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

  users
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((user) => {
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
  properties.forEach((propertyName) => {
    els.propertyFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(propertyName)}">${escapeHtml(propertyName)}</option>`);
  });

  els.departmentFilter.innerHTML = '<option value="">All Departments</option>';
  departments.forEach((departmentName) => {
    els.departmentFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(departmentName)}">${escapeHtml(departmentName)}</option>`);
  });
}

function populateCreateTaskOptions() {
  const properties = state.bootstrap.properties || [];
  const departments = state.bootstrap.departments || [];

  els.taskProperty.innerHTML = "";
  properties.forEach((propertyName) => {
    els.taskProperty.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(propertyName)}">${escapeHtml(propertyName)}</option>`);
  });

  els.taskDepartment.innerHTML = "";
  departments.forEach((departmentName) => {
    els.taskDepartment.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(departmentName)}">${escapeHtml(departmentName)}</option>`);
  });

  syncAssigneeOptions();
  ensureTaskItemsReady();
}

function getActiveUsers() {
  const users = state.bootstrap && Array.isArray(state.bootstrap.users) ? state.bootstrap.users : [];
  return users.filter((user) => Boolean(user.isActive));
}

function canCreateTasks() {
  if (!state.user) return false;
  return state.user.role === "head" || state.user.role === "admin";
}

function canUpdateStatus(task) {
  if (!state.user || !task) return false;
  if (state.user.role === "admin") return true;
  if (state.user.role === "head") return toKey(state.user.department) === toKey(task.department);
  return state.user.id === task.assignedToUserId;
}

function canCommentOnTask(task) {
  if (!state.user || !task) return false;
  if (state.user.role === "admin") return true;
  if (state.user.role === "head") return toKey(state.user.department) === toKey(task.department);
  return state.user.id === task.assignedToUserId;
}

function openCreateTaskModal() {
  if (!canCreateTasks()) {
    showToast("Only heads can create tasks", true);
    return;
  }

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

function ensureTaskItemsReady() {
  if (!els.taskItemsList.children.length) {
    addTaskItemRow();
  }
}

function addTaskItemRow(prefill = {}) {
  state.taskDraftCounter += 1;
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
      <input type="text" class="task-item-title" placeholder="Task title">
      <input type="date" class="task-item-due" aria-label="Due Date">
      <textarea class="task-item-notes" rows="3" placeholder="Notes or instructions"></textarea>
    </div>
  `;

  row.querySelector(".task-item-title").value = prefill.title || "";
  row.querySelector(".task-item-due").value = prefill.dueDate || "";
  row.querySelector(".task-item-notes").value = prefill.notes || "";

  els.taskItemsList.appendChild(row);
  refreshTaskItemLabels();
}

function onCreateTaskFormClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.classList.contains("task-item-remove")) {
    const row = target.closest(".task-item-row");
    if (row) row.remove();

    if (!els.taskItemsList.children.length) {
      addTaskItemRow();
    } else {
      refreshTaskItemLabels();
    }
  }
}

function refreshTaskItemLabels() {
  const rows = Array.from(els.taskItemsList.querySelectorAll(".task-item-row"));

  rows.forEach((row, index) => {
    const label = row.querySelector(".task-item-label");
    if (label) label.textContent = `Task ${index + 1}`;

    const removeBtn = row.querySelector(".task-item-remove");
    if (removeBtn) removeBtn.disabled = rows.length === 1;
  });
}

function syncAssigneeOptions() {
  const selectedDepartment = (els.taskDepartment.value || "").trim();
  const users = getActiveUsers().filter((user) => {
    return user.role === "employee" && toKey(user.department) === toKey(selectedDepartment);
  });

  els.taskAssignee.innerHTML = "";

  if (!users.length) {
    els.taskAssignee.innerHTML = '<option value="">No active employee in this department</option>';
    els.taskAssignee.disabled = true;
    return;
  }

  els.taskAssignee.disabled = false;
  users.forEach((user) => {
    els.taskAssignee.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`);
  });
}

function readTaskItemsFromForm() {
  const rows = Array.from(els.taskItemsList.querySelectorAll(".task-item-row"));
  const items = [];

  rows.forEach((row) => {
    const title = (row.querySelector(".task-item-title")?.value || "").trim();
    const dueDate = (row.querySelector(".task-item-due")?.value || "").trim();
    const notes = (row.querySelector(".task-item-notes")?.value || "").trim();

    if (!title && !dueDate && !notes) return;
    if (!title) throw new Error("Each task item needs a title");

    items.push({ title, dueDate, notes });
  });

  if (!items.length) throw new Error("Add at least one task item");
  return items;
}

async function onCreateTaskSubmit(event) {
  event.preventDefault();
  if (!state.user) return;

  // Re-enable assignee in case it was disabled
  els.taskAssignee.disabled = false;

  // Quick check: department must have employees
  if (els.taskAssignee.options.length === 0 || els.taskAssignee.value === "") {
    showToast("⚠️ Select an assignee. Make sure the department has active employees.", true);
    return;
  }

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
    tasksJson: JSON.stringify(taskItems),
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

    const note = response.notifications || {};
    const emailCount = Number(note.emailCount || 0);
    const whatsappCount = Number(note.whatsappCount || 0);
    const createdCount = Number(response.createdCount || taskItems.length);

    showToast(`Created ${createdCount} task(s). Email: ${emailCount}, WhatsApp: ${whatsappCount}`);
  } catch (error) {
    showToast(error.message || "Task creation failed", true);
  }
}

function renderSummary() {
  const visible = getFilteredTasks();
  const pending = visible.filter((task) => task.status === "Pending").length;
  const done = visible.filter((task) => task.status === "Done").length;
  const cancelled = visible.filter((task) => task.status === "Cancelled").length;

  els.summaryStrip.innerHTML = [
    renderSummaryCard("Visible Tasks", String(visible.length)),
    renderSummaryCard("Pending", String(pending)),
    renderSummaryCard("Done", String(done)),
    renderSummaryCard("Cancelled", String(cancelled)),
  ].join("");
}

function renderSummaryCard(label, value) {
  return `<article class="summary-card"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function renderTasksTable() {
  const tasks = getFilteredTasks();

  if (!tasks.length) {
    els.taskTableWrap.innerHTML = '<div class="empty-state">No tasks match your filters.</div>';
    return;
  }

  const cards = tasks.map((task) => {
    const comments = Array.isArray(task.comments) ? task.comments : [];
    const latestComment = comments.length ? comments[comments.length - 1].comment : "";
    const dueDate = task.dueDate ? formatDate(task.dueDate) : "Not set";
    const canUpdate = canUpdateStatus(task);

    const statusControl = canUpdate
      ? renderStatusSelect(task)
      : `<span class="status-chip ${statusClass(task.status)}">${escapeHtml(task.status || "Pending")}</span>`;

    return `
      <article class="task-card">
        <div class="task-card-head">
          <div class="task-card-title">${escapeHtml(task.title || "")}</div>
          ${statusControl}
        </div>

        <div class="task-card-meta">
          <div class="meta-cell"><span class="meta-label">Property</span><span class="meta-value">${escapeHtml(task.property || "-")}</span></div>
          <div class="meta-cell"><span class="meta-label">Department</span><span class="meta-value">${escapeHtml(task.department || "-")}</span></div>
          <div class="meta-cell"><span class="meta-label">Assignee</span><span class="meta-value">${escapeHtml(task.assignedToName || "-")}</span></div>
          <div class="meta-cell"><span class="meta-label">Due Date</span><span class="meta-value">${escapeHtml(dueDate)}</span></div>
        </div>

        <div class="task-card-notes">${escapeHtml(task.notes || "No notes")}</div>
        <div class="task-card-comments">
          ${comments.length} comment(s)
          ${latestComment ? `<br>${escapeHtml(shorten(latestComment, 110))}` : ""}
        </div>

        <div class="card-actions">
          <button class="btn btn-secondary" data-action="comment" data-task-id="${escapeHtml(task.id)}" ${canCommentOnTask(task) ? "" : "disabled"}>Comments</button>
        </div>
      </article>
    `;
  });

  els.taskTableWrap.innerHTML = `<div class="task-cards-grid">${cards.join("")}</div>`;
}

function renderStatusSelect(task) {
  const options = STATUS_VALUES.map((status) => {
    const selected = status === task.status ? "selected" : "";
    return `<option value="${status}" ${selected}>${status}</option>`;
  }).join("");

  return `
    <select class="status-select" data-action="status" data-task-id="${escapeHtml(task.id)}">
      ${options}
    </select>
  `;
}

function getFilteredTasks() {
  const property = (els.propertyFilter.value || "").trim();
  const department = (els.departmentFilter.value || "").trim();
  const status = (els.statusFilter.value || "").trim();

  const filtered = state.tasks.filter((task) => {
    if (property && toKey(task.property) !== toKey(property)) return false;
    if (department && toKey(task.department) !== toKey(department)) return false;
    if (status && toKey(task.status) !== toKey(status)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const order = { Pending: 1, Done: 2, Cancelled: 3 };
    const sA = order[a.status] || 99;
    const sB = order[b.status] || 99;
    if (sA !== sB) return sA - sB;

    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;

    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  return filtered;
}

async function onTableActionChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const action = target.getAttribute("data-action");
  if (action !== "status") return;

  const taskId = target.getAttribute("data-task-id") || "";
  const status = target.value;

  if (!taskId || !STATUS_VALUES.includes(status)) return;

  try {
    const response = await apiPost("updateTaskStatus", {
      actorUserId: state.user.id,
      taskId,
      status,
    });

    if (!response.success) throw new Error(response.error || "Could not update status");

    await refreshTasks();
    showToast(`Status updated to ${status}`);
  } catch (error) {
    showToast(error.message || "Status update failed", true);
  }
}

function onTableActionClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const action = target.getAttribute("data-action");
  const taskId = target.getAttribute("data-task-id") || "";

  if (action === "comment" && taskId) {
    openCommentModal(taskId);
  }
}

function openCommentModal(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
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
  const blocks = [];

  if (task.notes) {
    blocks.push(`
      <div class="comment-item">
        <small>Original Task Note</small>
        <div>${escapeHtml(task.notes)}</div>
      </div>
    `);
  }

  comments.forEach((comment) => {
    const author = comment.authorName || "Unknown";
    const when = comment.createdAt ? formatDateTime(comment.createdAt) : "";
    blocks.push(`
      <div class="comment-item">
        <small>${escapeHtml(author)}${when ? ` - ${escapeHtml(when)}` : ""}</small>
        <div>${escapeHtml(comment.comment || "")}</div>
      </div>
    `);
  });

  els.commentHistory.innerHTML = blocks.length ? blocks.join("") : '<p class="muted">No comments yet.</p>';
}

async function onSaveComment() {
  const taskId = state.activeCommentTaskId;
  const comment = (els.commentInput.value || "").trim();

  if (!taskId || !comment) {
    showToast("Comment cannot be empty", true);
    return;
  }

  try {
    const response = await apiPost("addComment", {
      actorUserId: state.user.id,
      taskId,
      comment,
    });

    if (!response.success) throw new Error(response.error || "Comment could not be saved");

    await refreshTasks();

    const updatedTask = state.tasks.find((task) => task.id === taskId);
    if (updatedTask) {
      renderCommentHistory(updatedTask);
      els.commentInput.value = "";
    }

    showToast("Comment added");
  } catch (error) {
    showToast(error.message || "Comment update failed", true);
  }
}

async function onOpenTeamWhatsApp() {
  const teamUrl = getTeamWhatsAppUrl();
  if (!teamUrl) {
    showToast("Team WhatsApp URL not configured", true);
    return;
  }

  window.open(teamUrl, "_blank", "noopener,noreferrer");
}

function getTeamWhatsAppUrl() {
  if (!state.bootstrap) return "";
  const directUrl = (state.bootstrap.teamWhatsAppUrl || "").trim();
  if (directUrl) return directUrl;

  const groupNumber = digitsOnly(state.bootstrap.whatsappGroupNumber || "");
  if (!groupNumber) return "";

  const text = encodeURIComponent("C18 team workspace update");
  return `https://wa.me/${groupNumber}?text=${text}`;
}

async function onSendEod() {
  if (!state.user) return;

  try {
    const response = await apiPost("sendEodReportNow", { actorUserId: state.user.id });
    if (!response.success) throw new Error(response.error || "Could not send EOD report");

    const channels = [];
    if (response.sentWhatsapp) channels.push("whatsapp group");
    if (response.sentEmail) channels.push("email");

    showToast(`EOD report sent via ${channels.length ? channels.join(" + ") : "configured channels not available"}`);
  } catch (error) {
    showToast(error.message || "EOD report failed", true);
  }
}

async function apiGet(action, params = {}) {
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(`${API_BASE}?${query.toString()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function apiPost(action, payload = {}) {
  const params = new URLSearchParams({ action, ...payload });
  const response = await fetch(API_BASE, {
    method: "POST",
    body: params,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.className = `toast show${isError ? " error" : ""}`;

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.className = "toast";
  }, 3400);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status) {
  const value = toKey(status);
  if (value === "done") return "status-done";
  if (value === "cancelled") return "status-cancelled";
  return "status-pending";
}

function toTitleCase(value) {
  const input = String(value || "").toLowerCase();
  if (!input) return "";
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function toKey(value) {
  return String(value || "").trim().toLowerCase();
}

function digitsOnly(value) {
  return String(value || "").replace(/\D+/g, "");
}

function shorten(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
