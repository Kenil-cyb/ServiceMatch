# ServiceMatch AI — Smart Local Services Marketplace

ServiceMatch AI is a production-hardened local services marketplace application built with React, Node.js, Express, MongoDB (Mongoose), and Google Gemini LLM.

---

## Architecture & Project Structure

```text
ServiceMatch/
├── frontend/             # React (Vite, CSS)
│   ├── src/
│   │   ├── services/api.js             # API Client & token manager
│   │   └── utils/matchingEngine.js    # Deterministic matching algorithm
│   ├── .env.example
│   └── package.json
└── backend/              # Node.js Express REST API
    ├── src/
    │   ├── config/       # db.js, env.js (secret validator), seed.js
    │   ├── controllers/  # apiController.js, authController.js, adminController.js
    │   ├── middleware/   # authMiddleware.js, errorMiddleware.js, rateLimitMiddleware.js
    │   ├── models/       # User, Provider, Booking, ServiceRequest, Review, Report, Notification
    │   ├── routes/       # apiRoutes.js
    │   └── services/     # aiService.js, matchingService.js, reviewService.js, notificationService.js
    ├── tests/
    │   ├── backend.test.js             # Unit, security, auth & validation tests
    │   └── mongoIntegration.test.js   # Isolated real MongoDB integration tests
    ├── .env.example
    └── package.json
```

---

## Security & Production Hardening Features

### 1. Environment & Secret Safety
- **Strict Production Startup Validation**: The backend checks `JWT_SECRET` during startup. In `NODE_ENV=production`, the application immediately terminates (`process.exit(1)`) if `JWT_SECRET` is missing, shorter than 32 characters, or contains known default placeholders.
- **Zero Hardcoded Secrets**: Secrets are never hardcoded in source code and are never logged to console output, stdout, or response payloads.
- **External Secret Generation**: All cryptographic secrets must be generated outside the application.
- **Repository Hygiene**: Real `.env` files, `node_modules/`, logs, and `frontend/dist/` are strictly ignored by `.gitignore`. `.env.example` contains only placeholder documentation.

### 2. Password Policy & Authentication Protection
- **Server-Side Password Length**: Enforced minimum length of 8 characters (max 128 characters) on all registration and provisioning paths, including in-memory demo mode.
- **Rate Limiting**: `express-rate-limit` guards sensitive authentication routes:
  - `POST /api/auth/login`: 10 requests / 15 minutes per IP.
  - `POST /api/auth/register`: 10 requests / 60 minutes per IP.
  - `POST /api/admin/users`: 20 requests / 15 minutes per IP.
- **Non-Sensitive Error Messages**: Authentication failures return non-sensitive generic messages ("Invalid credentials.") to prevent account enumeration.
- **Token Strategy Recommendation**: Current tokens use HS256 with 7-day expiration. In high-security multi-tenant deployments, the recommended production pattern is:
  - Short-lived Access Token (15 minutes).
  - Refresh Token (7 days) stored in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie, coupled with a server-side token rotation family and revocation list. Naïve localStorage refresh tokens are avoided to prevent XSS exposure.

### 3. Privileged Account Provisioning
- **Restricted Public Registration**: `POST /api/auth/register` strictly forces `role = "customer"`. Any client payload attempting to specify privileged roles is ignored and coerced.
- **Admin Provisioning Endpoint**: `POST /api/admin/users` requires valid admin JWT authentication (`role: admin`) and validates:
  - Role must be one of `["provider", "admin", "customer"]`.
  - Providers require a valid service specialty.
  - Returns 401 for unauthenticated calls and 403 for customer/provider attempts.

### 4. Authoritative Pricing & Input Validation
- **Server-Derived Pricing**: Client-supplied prices on booking creation are ignored; prices are strictly sourced from the authoritative server provider catalogue record (MongoDB or demo store).
- **Workflow State Machine**: Status transitions (`requested` → `accepted`/`rejected` → `completed`/`cancelled`) are strictly enforced based on caller role. Terminal states cannot be reopened.
- **Input Constraints**: Request queries (max 1000 chars), service names (max 100 chars), ratings (1 to 5), and review eligibility (completed bookings only; duplicate reviews prevented at both service layer and unique DB index).

---

## Configuration & Environment Variables

### Generating Cryptographic Secrets

Generate a 256-bit random hex secret outside the application:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Or with OpenSSL:
```bash
openssl rand -hex 32
```

### Backend (`backend/.env`)

```env
PORT=5000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/servicematch
JWT_SECRET=your_32_character_minimum_random_secret_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### Frontend (`frontend/.env`)

```env
# Local Vite development only; use the deployed backend origin in Vercel.
VITE_API_BASE_URL=http://localhost:5000
```

In Vercel, set `VITE_API_BASE_URL` to your actual Render backend's public origin
(for example, the Render service URL, without credentials). The frontend appends
`/api` automatically, and Vite embeds this public URL at build time. Never put
backend secrets in `VITE_` variables. See [frontend/.env.example](./frontend/.env.example).

---

## Secret Rotation & Token Invalidation Procedure

### Immediate Global Invalidation
To immediately revoke all existing sessions in the event of a secret leak:
1. Generate a new 256-bit secret using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Update `JWT_SECRET` in the hosting platform's environment settings.
3. Restart backend instances.
4. All existing tokens signed with the previous secret will instantly fail verification with `403 Forbidden` (`JsonWebTokenError: invalid signature`).

### Graceful Key Rolling (No-Downtime Migration)
For scheduled maintenance rotations without logging out active users:
1. Support dual secrets in `env.js`: `JWT_SECRET_PRIMARY` (for signing new tokens) and `JWT_SECRET_SECONDARY` (for verifying previous tokens during a grace period).
2. After 7 days (token lifespan), remove `JWT_SECRET_SECONDARY`.

---

## Running Automated Tests

ServiceMatch AI maintains two dedicated test suites:

### 1. Unified Test Suite (Runs all tests)
```powershell
cd backend
npm test
```
*Executes both the unit/security regression suite (45 tests) and the isolated real MongoDB integration suite (16 tests) — 61 tests passing.*

### 2. Unit & Security Regression Suite (Task 1 to 5)
```powershell
cd backend
npm run test:unit
```
*Validates CORS preflight, role coercion, password rules, rate limit headers, state transitions, price override immunity, and input validation without requiring a live database.*

### 3. Isolated MongoDB Integration Suite (Task 6)
```powershell
cd backend
npm run test:db
```
*Runs an isolated in-memory MongoDB instance via `mongodb-memory-server`. Validates real Mongoose persistence, booking lifecycle, duplicate-review unique constraints (code 11000), reconnection survival, and failed-write error bubbling (500 DatabaseError).*

### 4. Frontend Unit Tests & Production Build
```powershell
cd frontend
npm test
npm run build
```
*Validates matching engine weights, distance decay formula, and builds production static bundle in `frontend/dist/`.*

---

## Production Deployment Guide

### 1. Reverse Proxy & HTTPS (Nginx)

Deploy the backend behind Nginx with Let's Encrypt SSL/TLS:

```nginx
server {
    listen 80;
    server_name api.servicematch.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.servicematch.example.com;

    ssl_certificate /etc/letsencrypt/live/api.servicematch.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.servicematch.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. MongoDB Production Configuration
- **Access Control**: Provision a dedicated database user with `readWrite` privileges restricted only to the `servicematch` database.
- **Network Restrictions**: Configure MongoDB Atlas IP Access List / Network Peering to whitelist only the application server's static IP or private VPC CIDR. Never permit `0.0.0.0/0` in production.
- **TLS Connection String**: Use connection strings enforcing TLS:
  ```env
  MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/servicematch?retryWrites=true&w=majority&appName=ServiceMatch
  ```

### 3. Production Environment Checklist
| Variable | Value Description | Production Note |
|---|---|---|
| `NODE_ENV` | `production` | Enables strict secret checks, disables dev logs |
| `PORT` | `5000` (or platform default) | Assigned by hosting provider |
| `FRONTEND_ORIGIN` | `https://servicematch.example.com` | Strict CORS origin; multiple domains comma-separated |
| `MONGODB_URI` | `mongodb+srv://...` | Dedicated user, IP whitelisted |
| `JWT_SECRET` | 32+ char random hex | Generated externally, never committed |
| `GEMINI_API_KEY` | Google AI Studio Key | Used for semantic request parsing |
| `VITE_API_BASE_URL` | Your actual Render backend origin | Set in Vercel; baked into frontend static build |

---

## Troubleshooting

1. **Backend fails to start with `[FATAL CONFIG ERROR]`**:
   - `JWT_SECRET` is missing or shorter than 32 characters while `NODE_ENV=production`.
   - Solution: Generate a strong secret (`openssl rand -hex 32`) and assign to `JWT_SECRET`.
2. **`Cannot connect to the backend` in Frontend**:
   - Verify the backend is running and the Vercel project has `VITE_API_BASE_URL` set to the backend's public origin, then redeploy the frontend build.
3. **`Too many attempts from this IP` (HTTP 429)**:
   - Rate limiting was triggered on auth routes. Wait 15 minutes or adjust thresholds in `rateLimitMiddleware.js`.
