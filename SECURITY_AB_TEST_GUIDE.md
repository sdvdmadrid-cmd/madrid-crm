# Security A/B Isolation Test Guide

Use this guide to validate tenant and user isolation with two real accounts.

## Goal

Confirm user B cannot view or modify data created by user A.

## Preconditions

- App is running locally or in staging.
- You have two non-admin users:
  - User A
  - User B
- Both users belong to different tenants/workspaces if your setup allows it.

## Test 1: Protected routes require auth

1. Open an incognito window.
2. Navigate to /dashboard.
3. Expected: redirect to /login.

## Test 2: Data visibility isolation

1. Log in as user A.
2. Create one unique client record:
   - Name: AB-ISOLATION-CLIENT-A-<timestamp>
3. Verify user A can see that record.
4. Log out.
5. Log in as user B.
6. Search clients for AB-ISOLATION-CLIENT-A-<timestamp>.
7. Expected: user B does not see user A record.

## Test 3: Data modification isolation

1. Stay logged in as user B.
2. Try direct API access to user A record id (if known):
   - GET /api/clients/<id>
   - PATCH /api/clients/<id>
3. Expected: 404 or 403 depending on handler behavior.
4. No update must be applied.

## Test 4: Protected API auth behavior

1. Log out.
2. Call GET /api/clients without auth.
3. Expected: 401.

## Pass Criteria

- All expected outcomes above are satisfied.
- No cross-tenant or cross-user data leakage observed.

## Evidence to keep

- Screenshots for each step.
- HTTP status codes captured from network tab or API client.
- Timestamp and environment (local/staging/prod).
