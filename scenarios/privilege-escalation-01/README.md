# [Ticket #0042] — User kgarcia cannot run sudo commands

**Priority:** High
**Reported by:** kgarcia (via helpdesk)
**Environment:** Ubuntu 22.04

---

## Your context

You are **sr_sysadmin**, the senior sysadmin on duty. kgarcia submitted a helpdesk ticket at
07:52 — she cannot run any sudo commands and needs to restart an application deployment.
You have been paged to resolve it.

**Your credentials for this server:**

| Account | Password | Role |
|---|---|---|
| sr_sysadmin | BashcampAdmin1! | You — senior sysadmin |
| kgarcia | linux+practice | Affected user |
| jdeng | changeme | Secondary user (not affected) |

---

## What the user reported

> Hi, I can't run any sudo commands. Every time I try I get an error that says
> something about a "parse error" in sudoers. I didn't change anything. I just
> logged in this morning and sudo stopped working. I need to restart the app
> deployment but I can't get root access. Please help.

---

## Your objective

Repair `/etc/sudoers` so that `kgarcia` can use sudo again. You must do this without
logging in directly as root. Verify the fix by confirming kgarcia's sudo access works
after the repair.

---

## Hints

- A parse error in `/etc/sudoers` prevents `sudo` from running at all — including for
  you. Even as sr_sysadmin, `sudo` will fail until the file is repaired.
- There is a standard tool for safely editing the sudoers file that validates syntax
  before writing changes. There is also a way to invoke it that bypasses sudo entirely,
  using PolicyKit authentication instead. Look for it.
- After fixing sudoers, use `su - kgarcia` (password in the credentials table above)
  and confirm her sudo access is restored.

---

## Exam objectives covered

- [1.5] — Manage file permissions and ownership
- [3.1] — Understand and apply access control lists
- [3.3] — Configure and manage sudo access
- [3.4] — Troubleshoot access and authentication issues
