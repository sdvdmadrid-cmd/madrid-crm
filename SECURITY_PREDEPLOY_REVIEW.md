# Security Predeploy Review

Run this before each release candidate.

## Automated checks

- Basic preflight:
  - npm run security:preflight
- Full preflight (includes lint and build):
  - npm run security:preflight:full

## Manual checks

- Follow A/B isolation guide:
  - SECURITY_AB_TEST_GUIDE.md
- Confirm release checklist security gate:
  - RELEASE_CHECKLIST.md

## Release decision

- GO only if:
  - preflight exits with code 0
  - A/B isolation test passes
  - no unresolved HIGH security findings

- NO-GO if:
  - unauthorized access is possible
  - default secrets are still in use
  - lint/build fail in release target
