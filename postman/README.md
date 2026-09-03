# HustleHub+ Part 1 Postman Tests

This folder contains the concise Postman evidence needed for the implemented Part 1 API.

## Import

1. Start the API over HTTPS using the root `README.md` instructions.
2. In Postman, select **Import**.
3. Import `postman_collection.json` and `postman_environment.json`.
4. Select the **HustleHub+ Part 1 - Local** environment.
5. For this local self-signed certificate only, temporarily turn off **SSL certificate verification** in Postman settings.
6. Run the collection once in its existing order.

## What the 11 requests prove

- The API is served over HTTPS with important security headers.
- Clients and freelancers can register, and password data is not returned.
- Missing fields, public admin registration, malicious names, and duplicate emails are rejected.
- Valid credentials return a JWT while invalid credentials return a generic error.
- The JWT grants access to `/api/auth/me`, while a missing JWT is rejected.

The first request creates unique test email addresses automatically, and the successful login request saves the JWT for the protected request. Restarting the API clears all users because Part 1 uses in-memory storage.

No certificate, private key, JWT signing secret, or real account credential is stored in these files.
