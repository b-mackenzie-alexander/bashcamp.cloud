# [Ticket #0042] — User kgarcia cannot run sudo commands

**Priority:** High
**Reported by:** kgarcia (via helpdesk)
**Environment:** Ubuntu 22.04

---

## What the user reported

> Hi, I can't run any sudo commands. Every time I try I get an error that says
> something about a "parse error" in sudoers. I didn't change anything. I just
> logged in this morning and sudo stopped working. I need to restart the app
> deployment but I can't get root access. Please help.

---

## Your objective

Restore sudo access for `kgarcia` without logging in directly as root. The sudoers
configuration must be valid when you are done.

---

## Hints

- A parse error in `/etc/sudoers` prevents `sudo` from running at all — even for
  users who should have access. The file must be repaired before any sudo command
  will succeed.
- There is a standard tool for safely editing the sudoers file that validates syntax
  before writing changes. There is also a way to invoke it without sudo when sudo
  itself is broken.

---

## Exam objectives covered

- [1.5] — Manage file permissions and ownership
- [3.1] — Understand and apply access control lists
- [3.3] — Configure and manage sudo access
- [3.4] — Troubleshoot access and authentication issues
