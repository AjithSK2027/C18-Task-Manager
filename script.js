// ============================================================
// C18 Task Manager — Frontend Script
// IMPORTANT: Replace API_BASE with your deployed Apps Script URL
// ============================================================

const API_BASE = "https://script.google.com/macros/s/AKfycbyahwzrwSVlxJ_5WBc2HEFb6qzfZQkNK1oJvzvW9CSFNqD48Id1FXyx1s8zXLJtQWnI/exec"; // ← paste your /exec URL here

let currentUser = null;
let allTasks    = [];
let employees   = [];
let config      = {};

// ============================================================
// UTILITIES
// ============================================================

function toast(msg, type = "") {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "show" + (type ? " " + type : "");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.className = ""; }, 3500);
}

function showView(view) {
    document.getElementById("viewTasks").style.display  = view === "tasks"  ? "block" : "none";
    document.getElementById("viewCreate").style.display = view === "create" ? "block" : "none";
    // Set active nav item by matching data-view attribute
    document.querySelectorAll(".nav-item").forEach(b => {
        b.classList.toggle("active", b.dataset.view === view);
    });
}

function getStatusClass(status) {
    const map = {
        "To Do":       "status-todo",
        "In Progress": "status-inprog",
        "Done":        "status-done",
        "Pending":     "status-pending",
        "Blocked":     "status-blocked",
    };
    return map[status] || "";
}

function closeModal() {
    document.getElementById("modal").style.display = "none";
}

function openCreateModal() {
    // Clear fields each time
    ["taskTitle","taskDesc","taskDueDate"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    document.getElementById("createModal").style.display = "flex";
}

function closeCreateModal() {
    document.getElementById("createModal").style.display = "none";
}

function setLoading(show) {
    const board = document.getElementById("taskBoard");
    if (show) board.innerHTML = `<div class="loading"><div class="spinner"></div><br>Loading tasks…</div>`;
}

// ============================================================
// API CALLS
// ============================================================

async function apiFetch(params) {
    const url = `${API_BASE}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function apiPost(body) {
    const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ============================================================
// DATA LOADERS
// ============================================================

// FIX: loadEmployees, loadConfig, populateFiltersAndForm are now
// chained in init() to prevent race conditions.

async function loadEmployees() {
    const data = await apiFetch({ action: "getEmployees" });
    // FIX: Apps Script wraps as { employees: [...] }
    employees = data.employees || [];
    const userSelect = document.getElementById("userSelect");
    userSelect.innerHTML = '<option value="">-- Select your name --</option>';
    employees.forEach(emp => {
        const opt = document.createElement("option");
        opt.value = emp.name;
        opt.textContent = `${emp.name} (${emp.department} — ${emp.role})`;
        userSelect.appendChild(opt);
    });
}

async function loadTasks() {
    setLoading(true);
    try {
        const data = await apiFetch({ action: "getTasks" });
        // FIX: Apps Script wraps as { tasks: [...] }
        allTasks = data.tasks || [];
        renderTaskBoard();
    } catch (err) {
        document.getElementById("taskBoard").innerHTML =
            `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load tasks. Check your API_BASE URL.</p></div>`;
    }
}

async function loadConfig() {
    try {
        const data = await apiFetch({ action: "getConfig" });
        config = data || {};
    } catch (e) {
        console.warn("Config load failed:", e);
    }
}

// Populates filter dropdowns AND the create-task form dropdowns.
// FIX: Called after loadEmployees() so employees array is ready.
async function populateFiltersAndForm() {
    // Properties
    const propData = await apiFetch({ action: "getProperties" });
    const properties = propData.properties || [];

    const filterProp = document.getElementById("filterProperty");
    const taskProp   = document.getElementById("taskProperty");
    filterProp.innerHTML = '<option value="">All Properties</option>';
    taskProp.innerHTML   = "";
    properties.forEach(p => {
        filterProp.innerHTML += `<option value="${p}">${p}</option>`;
        taskProp.innerHTML   += `<option value="${p}">${p}</option>`;
    });

    // Departments
    const deptData = await apiFetch({ action: "getDepartments" });
    const depts = deptData.departments || [];

    const filterDept = document.getElementById("filterDept");
    const taskDept   = document.getElementById("taskDept");
    filterDept.innerHTML = '<option value="">All Departments</option>';
    taskDept.innerHTML   = "";
    depts.forEach(d => {
        filterDept.innerHTML += `<option value="${d}">${d}</option>`;
        taskDept.innerHTML   += `<option value="${d}">${d}</option>`;
    });

    // Assignees — FIX: employees already loaded at this point
    const assigneeSelect = document.getElementById("taskAssignee");
    assigneeSelect.innerHTML = "";
    employees.forEach(emp => {
        assigneeSelect.innerHTML += `<option value="${emp.name}">${emp.name} (${emp.department})</option>`;
    });
}

// ============================================================
// TASK ACTIONS
// ============================================================

async function createTask(taskObj) {
    try {
        const result = await apiPost({ action: "addTask", ...taskObj });
        if (result.success) {
            toast("Task created! WhatsApp notification sent.", "success");
            closeCreateModal();
            await loadTasks();
        } else {
            toast("Error: " + (result.error || "Unknown error"), "error");
        }
    } catch (e) {
        toast("Network error creating task.", "error");
    }
}

async function updateTaskStatus(taskId, newStatus) {
    try {
        await apiPost({ action: "updateTaskStatus", id: taskId, status: newStatus, user: currentUser.name });
        await loadTasks();
        toast(`Status updated to "${newStatus}"`, "success");
    } catch (e) {
        toast("Failed to update status.", "error");
    }
}

async function deleteTask(taskId) {
    if (!confirm("Delete this task permanently? This cannot be undone.")) return;
    try {
        await apiPost({ action: "deleteTask", id: taskId });
        await loadTasks();
        toast("Task deleted.", "");
    } catch (e) {
        toast("Failed to delete task.", "error");
    }
}

async function saveEditTask(taskId, updates) {
    try {
        await apiPost({ action: "editTask", id: taskId, ...updates });
        closeModal();
        await loadTasks();
        toast("Task updated.", "success");
    } catch (e) {
        toast("Failed to save changes.", "error");
    }
}

async function addComment(taskId, comment) {
    if (!comment.trim()) return;
    try {
        await apiPost({ action: "addComment", taskId, comment, user: currentUser.name });
        closeModal();
        await loadTasks();
        toast("Comment added.", "success");
    } catch (e) {
        toast("Failed to add comment.", "error");
    }
}

async function addAttachment(taskId, url, fileName) {
    if (!url.trim() || !fileName.trim()) return;
    try {
        await apiPost({ action: "addAttachment", taskId, url, fileName, user: currentUser.name });
        closeModal();
        await loadTasks();
        toast("Attachment saved.", "success");
    } catch (e) {
        toast("Failed to add attachment.", "error");
    }
}

// ============================================================
// MODALS
// ============================================================

function openEditModal(taskId) {
    const task = allTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    document.getElementById("modalTitle").textContent = "Edit Task";
    document.getElementById("modalBody").innerHTML = `
        <div class="form-group">
            <label>Title</label>
            <input type="text" id="editTitle" value="${task.title || ""}">
        </div>
        <div class="form-group">
            <label>Due Date</label>
            <input type="date" id="editDue" value="${task.dueDate || ""}">
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea id="editDesc" rows="3">${task.description || ""}</textarea>
        </div>
    `;
    document.getElementById("modalSaveBtn").onclick = () => {
        saveEditTask(taskId, {
            title:       document.getElementById("editTitle").value,
            dueDate:     document.getElementById("editDue").value,
            description: document.getElementById("editDesc").value,
        });
    };
    document.getElementById("modal").style.display = "flex";
}

function openCommentModal(taskId) {
    const task = allTasks.find(t => String(t.id) === String(taskId));
    document.getElementById("modalTitle").textContent = "Add Comment";

    const existing = (task?.comments || "").trim();
    document.getElementById("modalBody").innerHTML = `
        ${existing ? `<div class="form-group"><label>Previous Comments</label><div class="cell-mini" style="max-width:100%;white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:6px;border:1px solid var(--border)">${existing}</div></div>` : ""}
        <div class="form-group">
            <label>New Comment</label>
            <textarea id="commentText" rows="3" placeholder="Write your comment…"></textarea>
        </div>
    `;
    document.getElementById("modalSaveBtn").onclick = () => {
        addComment(taskId, document.getElementById("commentText").value);
    };
    document.getElementById("modal").style.display = "flex";
}

function openAttachmentModal(taskId) {
    document.getElementById("modalTitle").textContent = "Add Attachment";
    document.getElementById("modalBody").innerHTML = `
        <div class="form-group">
            <label>File URL</label>
            <input type="url" id="attachUrl" placeholder="https://drive.google.com/…">
        </div>
        <div class="form-group">
            <label>File Name</label>
            <input type="text" id="attachName" placeholder="e.g. Invoice_March.pdf">
        </div>
    `;
    document.getElementById("modalSaveBtn").onclick = () => {
        addAttachment(taskId,
            document.getElementById("attachUrl").value,
            document.getElementById("attachName").value
        );
    };
    document.getElementById("modal").style.display = "flex";
}

// ============================================================
// RENDER TASK BOARD
// ============================================================

function renderTaskBoard() {
    let filtered = [...allTasks];

    // Filters
    const propFilter   = document.getElementById("filterProperty").value;
    const deptFilter   = document.getElementById("filterDept").value;
    const statusFilter = document.getElementById("filterStatus").value;
    if (propFilter)   filtered = filtered.filter(t => t.property   === propFilter);
    if (deptFilter)   filtered = filtered.filter(t => t.department  === deptFilter);
    if (statusFilter) filtered = filtered.filter(t => t.status      === statusFilter);

    // Role-based scoping
    if (currentUser.role === "employee") {
        filtered = filtered.filter(t => t.assignedTo === currentUser.name);
    } else if (currentUser.role === "head") {
        filtered = filtered.filter(t => t.department === currentUser.department);
    }
    // admin sees everything

    if (filtered.length === 0) {
        document.getElementById("taskBoard").innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>No tasks match the current filters.</p>
            </div>`;
        return;
    }

    // FIX: correct table header markup (was corrupted with '胺<' garbage)
    let html = `
        <div class="table-wrap">
        <table>
            <thead><tr>
                <th>Title</th>
                <th>Property</th>
                <th>Dept</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Actions</th>
                <th>Notes</th>
            </tr></thead>
            <tbody>`;

    filtered.forEach(task => {
        const tid = task.id;
        const canChangeStatus =
            currentUser.role !== "employee" ||
            task.assignedTo === currentUser.name;

        const isOverdue = task.dueDate && task.status !== "Done" &&
                          new Date(task.dueDate) < new Date(new Date().toDateString());

        const dueCellStyle = isOverdue ? ' style="color:var(--red)"' : "";

        // Status dropdown — always visible, disabled for non-owners (employees)
        const statusSelect = `
            <select class="status-select"
                onchange="updateTaskStatus('${tid}', this.value)"
                ${canChangeStatus ? "" : "disabled"}>
                ${["To Do","In Progress","Done","Pending","Blocked"].map(s =>
                    `<option${task.status === s ? " selected" : ""}>${s}</option>`
                ).join("")}
            </select>`;

        // Action buttons based on role
        let actions = "";
        if (currentUser.role === "head" || currentUser.role === "admin") {
            actions = `
                <button class="btn btn-sm btn-ghost" onclick="openEditModal('${tid}')">✏️ Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteTask('${tid}')">🗑️</button>`;
        } else if (currentUser.role === "employee" &&
                   task.assignedTo === currentUser.name &&
                   task.status !== "Done") {
            actions = `<button class="btn btn-sm btn-primary" onclick="updateTaskStatus('${tid}', 'Done')">✅ Done</button>`;
        }

        // Comment/attachment snippets
        const commentSnippet    = (task.comments    || "").split("\n").slice(-1)[0] || "";
        const attachmentSnippet = (task.attachments || "").split(";").slice(-2,-1)[0] || "";

        html += `
            <tr>
                <td><strong>${task.title}</strong></td>
                <td>${task.property || "—"}</td>
                <td>${task.department || "—"}</td>
                <td>${task.assignedTo || "—"}</td>
                <td>${statusSelect}</td>
                <td${dueCellStyle}>${task.dueDate || "—"}</td>
                <td>
                    <div class="action-cell">
                        ${actions}
                        <button class="btn btn-sm btn-ghost" onclick="openCommentModal('${tid}')">💬</button>
                        <button class="btn btn-sm btn-ghost" onclick="openAttachmentModal('${tid}')">📎</button>
                    </div>
                </td>
                <td>
                    <div class="cell-mini">
                        ${commentSnippet ? `<span title="${task.comments}">💬 ${commentSnippet.slice(0,60)}${commentSnippet.length > 60 ? "…" : ""}</span>` : ""}
                        ${attachmentSnippet ? `<br>📎 ${attachmentSnippet.trim().slice(0,50)}` : ""}
                    </div>
                </td>
            </tr>`;
    });

    html += `</tbody></table></div>`;
    document.getElementById("taskBoard").innerHTML = html;
}

// ============================================================
// EOD REPORT
// ============================================================

async function sendEodWhatsApp() {
    const today = new Date().toISOString().slice(0, 10);
    const completedToday = allTasks.filter(t =>
        t.status === "Done" && t.completedAt && t.completedAt.slice(0, 10) === today
    );
    const pending = allTasks.filter(t => t.status !== "Done");

    let report = `📊 C18 End of Day Report — ${today}\n\n`;
    report += `✅ Completed Today (${completedToday.length}):\n`;
    completedToday.forEach(t => { report += `  • ${t.title} (${t.assignedTo})\n`; });
    report += `\n⏳ Pending (${pending.length}):\n`;
    pending.forEach(t => {
        report += `  • ${t.title} → ${t.assignedTo} (Due: ${t.dueDate || "no deadline"}) [${t.status}]\n`;
    });

    try {
        await navigator.clipboard.writeText(report);
        toast("EOD report copied to clipboard. Paste it into WhatsApp.", "success");
    } catch {
        // Fallback for browsers that block clipboard
        prompt("Copy this EOD report:", report);
    }
}

// ============================================================
// LOGIN / LOGOUT
// ============================================================

document.getElementById("loginBtn").onclick = async () => {
    const selectedName = document.getElementById("userSelect").value;
    if (!selectedName) { toast("Please select your name.", "error"); return; }
    const emp = employees.find(e => e.name === selectedName);
    if (!emp) { toast("Employee not found.", "error"); return; }

    currentUser = emp;
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("appSection").style.display  = "flex";

    // Sidebar user chip
    document.getElementById("userName").textContent  = currentUser.name;
    document.getElementById("userRole").textContent  = currentUser.role;
    document.getElementById("userAvatar").textContent = currentUser.name.charAt(0).toUpperCase();

    // Show "+ New Task" button in header for heads/admins
    const newTaskBtn = document.getElementById("newTaskBtn");
    newTaskBtn.style.display = (currentUser.role === "head" || currentUser.role === "admin") ? "inline-flex" : "none";

    showView("tasks");
    await loadTasks();
};

document.getElementById("logoutBtn").onclick = () => {
    currentUser = null;
    allTasks    = [];
    document.getElementById("appSection").style.display  = "none";
    document.getElementById("loginSection").style.display = "flex";
};

// ============================================================
// CREATE TASK FORM
// ============================================================

document.getElementById("createTaskBtn").onclick = async () => {
    if (!currentUser) { toast("Please log in first.", "error"); return; }
    const title = document.getElementById("taskTitle").value.trim();
    if (!title) { toast("Task title is required.", "error"); return; }

    const newTask = {
        title,
        property:    document.getElementById("taskProperty").value,
        department:  document.getElementById("taskDept").value,
        assignedTo:  document.getElementById("taskAssignee").value,
        dueDate:     document.getElementById("taskDueDate").value,
        description: document.getElementById("taskDesc").value,
        createdBy:   currentUser.name,
        status:      "To Do"
    };

    await createTask(newTask); // modal closed + fields cleared inside createTask/closeCreateModal
};

// ============================================================
// FILTER LISTENERS
// ============================================================

document.getElementById("filterProperty").onchange = renderTaskBoard;
document.getElementById("filterDept").onchange     = renderTaskBoard;
document.getElementById("filterStatus").onchange   = renderTaskBoard;
document.getElementById("refreshBtn").onclick       = loadTasks;
document.getElementById("sendEodWhatsAppBtn").onclick = sendEodWhatsApp;
document.getElementById("newTaskBtn").onclick       = openCreateModal;

// Close modals when clicking the dark overlay
document.getElementById("modal").onclick = (e) => {
    if (e.target === document.getElementById("modal")) closeModal();
};
document.getElementById("createModal").onclick = (e) => {
    if (e.target === document.getElementById("createModal")) closeCreateModal();
};

// Nav — active state is handled inside showView(), so no extra listener needed here.

// ============================================================
// FIX: Sequential init — no race conditions
// ============================================================

async function init() {
    try {
        await loadEmployees();          // 1. employees first
        await loadConfig();             // 2. config
        await populateFiltersAndForm(); // 3. dropdowns (needs employees ready)
    } catch (e) {
        console.error("Init failed:", e);
        toast("Could not connect to backend. Check API_BASE in script.js.", "error");
    }
}

init();
