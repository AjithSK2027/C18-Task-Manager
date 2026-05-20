# C18 Task Workspace

Web app for internal task management at C18.

## Stack
- Frontend: static HTML/CSS/JS (ideal for GitHub Pages)
- Backend: Google Apps Script + Google Sheets
- Notifications: Email (`MailApp`) + WhatsApp (provider webhook)

## Features
- Role login (`head`, `employee`, `admin`) with PIN
- Heads create and assign tasks to employees
- Employee workspace to update status: `Pending`, `Done`, `Cancelled`
- Task notes + threaded comments
- Notification on task creation (email + WhatsApp)
- Manual and scheduled EOD report to WhatsApp group and email

## C18 Seeded Organization
- Company: `C18`
- Properties:
  - `Camp Alpha`
  - `Good Earth Swimming Pool Homestay`
- Departments:
  - `sales`
  - `marketing`
  - `operations/management`
- People seeded in `initializeWorkspace()`:
  - Sales: Lexi (Head), Koushik (Employee)
  - Operations/Management: Keith (Head), Karthik (Employee)
  - Marketing: Ajith (Head), placeholder employee row inactive

## File Map
- `index.html` - app structure
- `styles.css` - responsive UI theme
- `app.js` - frontend logic + API calls
- `apps-script/Code.gs` - Google Apps Script backend
- `apps-script/SETUP.md` - deployment checklist

## Frontend Deployment (GitHub Pages)
1. Create a GitHub repo and push this project.
2. In repository settings, enable **Pages** from the main branch root.
3. Open `app.js` and set:
   - `API_BASE = "https://script.google.com/macros/s/.../exec"`
4. Wait for Pages build and open the public URL.

## Backend Deployment (Google Apps Script)
Follow `apps-script/SETUP.md`.

## Notes
- This login model is simple internal PIN-based access.
- Update seeded emails and WhatsApp numbers before production use.
- WhatsApp payload is generic; adjust in `sendWhatsApp_()` for your provider.
