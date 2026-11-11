## 2025-02-28 - [Mitigate Timing Attack Vulnerability on Login Endpoint]
**Vulnerability:** [The `authenticateUser` function in `auth-service.ts` skipped the expensive `verifyPassword` scrypt hashing step when a user email was not found or the account was locked out, creating a timing difference. An attacker could use this discrepancy to enumerate valid user emails (timing attack).]
**Learning:** [Even if the application returns a generic message like "E-mail ou senha incorretos", skipping computational steps like password verification for invalid users exposes the true state through the response time. The mitigation must equalize the response time.]
**Prevention:** [Always execute a dummy hash check against a fixed/dummy password hash when a user is not found to equalize response times, avoiding timing vulnerabilities for user enumeration.]
## 2023-10-24 - [CSRF Bypass due to missing headers]
**Vulnerability:** A CSRF check was implemented as `if (sourceToVerify && !isAllowedOrigin(sourceToVerify, host))` which bypassed the check entirely if both `Origin` and `Referer` headers were completely missing (e.g. suppressed by `<meta name="referrer" content="no-referrer">`).
**Learning:** Truthy checks on the variable holding the headers are dangerous because they can evaluate to false and skip the subsequent negative checks when the headers are actively stripped by an attacker.
**Prevention:** Always fail-closed on missing origin headers for mutating requests unless a custom header (like `x-requested-with`) is present which confirms it is an API client unable to be spoofed by cross-origin browser requests.

## 2024-05-24 - [E2E Test Backdoor Exposure]
**Vulnerability:** A hardcoded mock token ('e2e-token-valido-teste') for E2E testing was accessible based merely on `NODE_ENV !== 'production'`.
**Learning:** Relying on `NODE_ENV !== 'production'` can inadvertently expose test backdoors if environments like staging or local deployments are misconfigured. It doesn't follow the principle of least privilege.
**Prevention:** Use specific, explicit environment variables (e.g., `ALLOW_E2E_MOCK_TOKENS=true`) designed solely to enable such backdoors rather than relying on generic environment flags.
