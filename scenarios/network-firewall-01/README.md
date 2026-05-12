# [Ticket #0078] — Web app unreachable from load balancer

**Priority:** High
**Reported by:** mlopez (via helpdesk)
**Environment:** Ubuntu 22.04

---

## Your context

You are **sr_sysadmin**, the senior sysadmin on duty. mlopez reported that the company's
demo web application went offline shortly after a "routine firewall update" was applied
this morning. External health checks are failing and the load balancer is marking the
backend as down.

The application process is running — mlopez confirmed the webapp service is active.
The problem is somewhere in the network path.

**Your credentials for this server:**

| Account | Password | Role |
|---|---|---|
| sr_sysadmin | BashcampAdmin1! | You — senior sysadmin |
| mlopez | webdev99 | Web developer (reporter) |
| bchen | changeme | Secondary user (not affected) |

---

## What the user reported

> Hi, I deployed the webapp this morning and it was working fine. Someone from the
> network team said they pushed a firewall rule update around 09:15. After that,
> the load balancer health checks started failing with "connection refused." The
> webapp service is definitely running — I can see it in systemctl status. But I
> can't reach port 80 from anywhere. Please take a look.

---

## Your objective

Find and fix the firewall rule that is blocking incoming traffic on port 80, and verify
that the web application is reachable again. Do not break SSH access in the process.

---

## Hints

- The firewall on this system is managed by `nftables`. Start by listing the current
  ruleset to understand what rules are in place.
- Look for any rule that `drop`s traffic destined for port 80.
- You can delete a specific rule by its handle number. Use `nft list ruleset -a` to show
  handles alongside rules, then `nft delete rule` to remove it.
- Alternatively, you can `nft flush chain` to clear all rules in a chain and rewrite it
  from scratch — but be careful to keep the SSH allow rule or you will lock yourself out.
- After removing the blocking rule, verify connectivity with `curl http://127.0.0.1:80`.

---

## Key commands for this scenario

```bash
# List the full ruleset
nft list ruleset

# List ruleset with rule handles (needed to delete a specific rule)
nft list ruleset -a

# Delete a specific rule (replace TABLE, CHAIN, HANDLE with your values)
nft delete rule inet TABLE CHAIN handle HANDLE

# Verify the service is reachable
curl http://127.0.0.1:80
ss -ltnp | grep :80
```

---

## Exam objectives covered

- [4.1] — Configure and verify network connectivity
- [4.2] — Understand and manage firewall rules
- [4.4] — Troubleshoot network services and connectivity
