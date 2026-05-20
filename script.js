const API_BASE = "https://script.google.com/macros/s/AKfycbxcSUPA--NazkTmN0BByBGZb_KcvRHjsCwFCqWxXr39ggYdIDLVb5OJty83SQBllZ7d/exec"; // REPLACE WITH YOUR DEPLOYED URL

let currentUser = null;
let allTasks = [];
let employees = [];

// ---------- Helper: WhatsApp direct message (Coffeeland style) ----------
function sendWhatsAppDirect(phoneNumber, message) {
    let ph = String(phoneNumber).replace(/\D/g, '');
    if (!ph.startsWith('91')) ph = '91' + ph;
    const url = `https://wa.me/${ph}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// ---------- Helper: Open WhatsApp group (EOD) ----------
const GROUP_LINK = "https://chat.whatsapp.com/KNKOOhEgIqdE9T1w8Jtjot"; // Your group invite link

function sendEODToGroup(reportText) {
    // Copy report to clipboard
    navigator.clipboard.writeText(reportText).then(() => {
        alert("EOD report copied to clipboard.\n\nNow opening WhatsApp group. Paste the message there.");
        window.open(GROUP_LINK, '_blank');
    }).catch(() => {
        alert("Could not copy automatically. Please copy this report manually:\n\n" + reportText);
        window.open(GROUP_LINK, '_blank');
    });
}

// ---------- API calls ----------
async function loadEmployees() {
    const res = await fetch(`${API_BASE}?action=getEmployees`);
    const data = await res.json();
    employees = data.employees;
    const userSelect = document.getElementById("userSelect");
    userSelect.innerHTML = '<option value="">-- Select --</option>';
    employees.forEach(emp => {
        const opt = document.createElement("option");
        opt.value = emp.name;
        opt.textContent = `${emp.name} (${emp.department} - ${emp.role})`;
        userSelect.appendChild(opt);
    });
}

async function loadTasks() {
    const res = await fetch(`${API_BASE}?action=getTasks`);
    const data = await res.json();
    allTasks = data.tasks;
    renderTaskBoard();
}

async function createTask(taskObj) {
    const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addTask", ...taskObj })
    });
    const result = await res.json();
    if (result.success) {
        // After creation, ask if head wants to send WhatsApp to employee
        const assignee = employees.find(e => e.name === taskObj.assignedTo);
        if (assignee && assignee.whatsapp) {
            const confirmSend = confirm(`Task created. Send WhatsApp notification to ${assignee.name}?`);
            if (confirmSend) {
                const msg = `📋 *New Task from ${currentUser.name}* (${taskObj.department})\n\n*${taskObj.title}*\nProperty: ${taskObj.property}\nDue: ${taskObj.dueDate || "soon"}\nDescription: ${taskObj.description || "-"}\n\nPlease log in to C18 app to update status.`;
                sendWhatsAppDirect(assignee.whatsapp, msg);
            }
        } else {
            alert("Task created. No WhatsApp number for assignee.");
        }
        loadTasks();
    } else {
        alert("Error: " + result.error);
    }
}

async function updateTaskStatus(taskId, newStatus) {
    await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateTaskStatus", id: taskId, status: newStatus, user: currentUser.name })
    });
    loadTasks();
}

async function editTask(taskId, updates) {
    await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "editTask", id: taskId, ...updates })
    });
    loadTasks();
}

async function deleteTask(taskId) {
    if (confirm("Delete this task permanently?")) {
        await fetch(API_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "deleteTask", id: taskId })
        });
        loadTasks();
    }
}

async function addComment(taskId, comment) {
    if (!comment.trim()) return;
    await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addComment", taskId: taskId, comment: comment, user: currentUser.name })
    });
    loadTasks();
}

async function addAttachment(taskId, url, fileName) {
    if (!url.trim()) return;
    await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addAttachment", taskId: taskId, url: url, fileName: fileName, user: currentUser.name })
    });
    loadTasks();
}

// ---------- Generate EOD Report Text ----------
async function generateEODReportText() {
    const res = await fetch(`${API_BASE}?action=getTasks`);
    const data = await res.json();
    const tasks = data.tasks;
    const today = new Date().toISOString().slice(0,10);
    const completedToday = tasks.filter(t => t.status === "Done" && t.completedAt && t.completedAt.slice(0,10) === today);
    const pending = tasks.filter(t => t.status !== "Done");
    let report = `📊 *C18 End of Day Report* - ${today}\n\n✅ *Completed Today (${completedToday.length})*:\n`;
    completedToday.forEach(t => { report += `- ${t.title} (${t.assignedTo})\n`; });
    report += `\n⏳ *Pending / Carried Over (${pending.length})*:\n`;
    pending.forEach(t => { report += `- ${t.title} → ${t.assignedTo} (Due ${t.dueDate || "no deadline"}) [${t.status}]\n`; });
    return report;
}

// ---------- Render Task Board ----------
function renderTaskBoard() {
    let filtered = [...allTasks];
    const propFilter = document.getElementById("filterProperty").value;
    const deptFilter = document.getElementById("filterDept").value;
    const statusFilter = document.getElementById("filterStatus").value;
    if (propFilter) filtered = filtered.filter(t => t.property === propFilter);
    if (deptFilter) filtered = filtered.filter(t => t.department === deptFilter);
    if (statusFilter) filtered = filtered.filter(t => t.status === statusFilter);
    
    if (currentUser.role === "employee") {
        filtered = filtered.filter(t => t.assignedTo === currentUser.name);
    } else if (currentUser.role === "head") {
        filtered = filtered.filter(t => t.department === currentUser.department);
    }
    
    let html = '<table border="1"><tr>' +
        '<th>Title</th><th>Property</th><th>Dept</th><th>Assigned To</th><th>Status</th><th>Due Date</th><th>Actions</th><th>Comments</th><th>Attachments</th>' +
        '</tr>';
    filtered.forEach(task => {
        html += `<tr>
            <td>${task.title}</td>
            <td>${task.property}</td>
            <td>${task.department}</td>
            <td>${task.assignedTo}</td>
            <td>
                <select onchange="updateTaskStatus(${task.id}, this.value)" ${currentUser.role === "employee" && task.assignedTo !== currentUser.name ? 'disabled' : ''}>
                    <option ${task.status === 'To Do' ? 'selected' : ''}>To Do</option>
                    <option ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option ${task.status === 'Done' ? 'selected' : ''}>Done</option>
                    <option ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option ${task.status === 'Blocked' ? 'selected' : ''}>Blocked</option>
                </select>
            </td>
            <td>${task.dueDate || '-'}</td>
            <td>`;
        if (currentUser.role === "head") {
            html += `<button onclick="editTaskPrompt(${task.id})">✏️ Edit</button> <button onclick="deleteTask(${task.id})">🗑️ Delete</button>`;
        } else if (currentUser.role === "employee" && task.assignedTo === currentUser.name && task.status !== "Done") {
            html += `<button onclick="updateTaskStatus(${task.id}, 'Done')">✅ Mark Complete</button>`;
        }
        html += `</td>
            <td><button onclick="addCommentPrompt(${task.id})">💬 Add Comment</button><br><small>${(task.comments || '').slice(-200)}</small></td>
            <td><button onclick="addAttachmentPrompt(${task.id})">📎 Add Attachment</button><br><small>${(task.attachments || '').slice(-100)}</small></td>
        </tr>`;
    });
    html += '</table>';
    document.getElementById("taskBoard").innerHTML = html;
}

// ---------- Prompt helpers ----------
function editTaskPrompt(taskId) {
    const task = allTasks.find(t => t.id == taskId);
    const newTitle = prompt("Edit Title", task.title);
    const newDue = prompt("Edit Due Date (YYYY-MM-DD)", task.dueDate);
    if (newTitle) editTask(taskId, { title: newTitle, dueDate: newDue });
}

function addCommentPrompt(taskId) {
    const comment = prompt("Enter your comment:");
    if (comment) addComment(taskId, comment);
}

function addAttachmentPrompt(taskId) {
    const url = prompt("Enter file URL (Google Drive share link or any public URL):");
    const fileName = prompt("Enter file name:");
    if (url && fileName) addAttachment(taskId, url, fileName);
}

// ---------- Filters & Form Population ----------
async function populateFiltersAndForm() {
    let res = await fetch(`${API_BASE}?action=getProperties`);
    let data = await res.json();
    const properties = data.properties;
    const propSelect = document.getElementById("filterProperty");
    const taskPropSelect = document.getElementById("taskProperty");
    propSelect.innerHTML = '<option value="">All Properties</option>';
    taskPropSelect.innerHTML = '';
    properties.forEach(p => {
        propSelect.innerHTML += `<option value="${p}">${p}</option>`;
        taskPropSelect.innerHTML += `<option value="${p}">${p}</option>`;
    });
    
    res = await fetch(`${API_BASE}?action=getDepartments`);
    data = await res.json();
    const depts = data.departments;
    const deptSelect = document.getElementById("filterDept");
    const taskDeptSelect = document.getElementById("taskDept");
    deptSelect.innerHTML = '<option value="">All Departments</option>';
    taskDeptSelect.innerHTML = '';
    depts.forEach(d => {
        deptSelect.innerHTML += `<option value="${d}">${d}</option>`;
        taskDeptSelect.innerHTML += `<option value="${d}">${d}</option>`;
    });
    
    const statusSelect = document.getElementById("filterStatus");
    statusSelect.innerHTML = '<option value="">All Status</option><option>To Do</option><option>In Progress</option><option>Done</option><option>Pending</option><option>Blocked</option>';
    
    const assigneeSelect = document.getElementById("taskAssignee");
    assigneeSelect.innerHTML = '';
    employees.forEach(emp => {
        assigneeSelect.innerHTML += `<option value="${emp.name}">${emp.name} (${emp.department})</option>`;
    });
}

// ---------- EOD WhatsApp Button Handler ----------
async function onSendEodWhatsApp() {
    const report = await generateEODReportText();
    sendEODToGroup(report);
}

// ---------- Login & UI ----------
document.getElementById("loginBtn").onclick = async () => {
    const selectedName = document.getElementById("userSelect").value;
    if (!selectedName) return;
    const emp = employees.find(e => e.name === selectedName);
    if (!emp) return;
    currentUser = emp;
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("appSection").style.display = "block";
    document.getElementById("userName").innerText = currentUser.name;
    document.getElementById("userRole").innerText = currentUser.role;
    if (currentUser.role === "head" || currentUser.role === "admin") {
        document.getElementById("addTaskForm").style.display = "block";
    } else {
        document.getElementById("addTaskForm").style.display = "none";
    }
    await loadTasks();
};

document.getElementById("logoutBtn").onclick = () => {
    currentUser = null;
    document.getElementById("loginSection").style.display = "block";
    document.getElementById("appSection").style.display = "none";
};

document.getElementById("createTaskBtn").onclick = async () => {
    const newTask = {
        title: document.getElementById("taskTitle").value,
        property: document.getElementById("taskProperty").value,
        department: document.getElementById("taskDept").value,
        assignedTo: document.getElementById("taskAssignee").value,
        dueDate: document.getElementById("taskDueDate").value,
        description: document.getElementById("taskDesc").value,
        createdBy: currentUser.name,
        status: "To Do"
    };
    if (!newTask.title) return alert("Title required");
    await createTask(newTask);
    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDesc").value = "";
    document.getElementById("taskDueDate").value = "";
};

document.getElementById("filterProperty").onchange = () => renderTaskBoard();
document.getElementById("filterDept").onchange = () => renderTaskBoard();
document.getElementById("filterStatus").onchange = () => renderTaskBoard();
document.getElementById("refreshBtn").onclick = () => loadTasks();
document.getElementById("sendEodWhatsAppBtn").onclick = onSendEodWhatsApp;

// ---------- Initial Load ----------
loadEmployees();
populateFiltersAndForm();
