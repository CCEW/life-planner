# Life Planner

A monorepo for the Life Planner application, managing both the frontend dashboard and the backend academic APIs.

## 🛠 Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **Turborepo** | Monorepo build system and task orchestrator. |
| **Next.js** | Frontend framework for the student dashboard. |
| **Express.js** | Backend REST API server. |
| **PostgreSQL** | Relational database for schedules, courses, and users. |
| **Prisma** | TypeScript ORM for database interactions. |
| **Zod** | Schema validation for API requests and shared types. |
| **Tailwind CSS** | Utility-first CSS framework for frontend styling. |

## 📦 Project Structure

```text
life-planner/
├── apps/
│   ├── api/        # Express backend
│   └── web/        # Next.js frontend
└── packages/
    ├── db/         # Prisma client and database schemas
    ├── schemas/    # Shared Zod validation schemas
    └── types/      # Shared TypeScript interfaces

```

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed on your machine:

* [Node.js](https://nodejs.org/) (v18 or higher)
* [Git](https://git-scm.com/)
* [PostgreSQL](https://www.postgresql.org/) (Running locally or via a cloud provider)

### Setup Instructions

1. **Clone the repository:**
```bash
git clone <your-github-repo-url>
cd life-planner
```


2. **Install all dependencies:**

*(Do not install packages inside individual folders. Run this at the root.)*
   ```bash
   npm install
```

3. **Set up Environment Variables:**
* Duplicate `.env.example` in the root and rename it to `.env`.
* Fill in your local PostgreSQL database URL.


4. **Initialize the Database:**
```bash
cd packages/db
npx prisma db push
cd ../../
```

5. **Start the Development Servers:**
```bash
   npm run dev
```

* Frontend: `http://localhost:3000`
* Backend API: `http://localhost:4000`

---

## 🧭 Developer Onboarding

### Primary Onboarding (all teammates)
These are the minimal steps required for most frontend and feature work. Backend-specific steps (migrations, generating Prisma client) are optional and documented separately below.

1. Clone and install (use the committed lockfile for consistent versions):
```bash
git clone <your-github-repo-url>
cd life-planner
npm ci
```

2. Create local env file from the example and add only values required for frontend or mock APIs:
```bash
cp .env.example .env
# edit .env to fill values
```

3. Start developer servers (runs both apps):
```bash
npm run dev
```

4. Run linters and formatting checks before committing:
```bash
npm run lint
npm run format
```

5. Tests (if present):
```bash
npm test
```

### Optional: Backend Onboarding (backend maintainers only)
Follow these steps only if you're responsible for database changes or running the API locally with a real DB.

1. Ensure PostgreSQL is running locally or use a connection string pointing to a dev database.
2. From the `packages/db` directory run the following to apply migrations and generate the Prisma client:
```bash
cd packages/db
npx prisma migrate dev --name init
npx prisma generate
cd ../../
```
3. If the project provides seeds, run them as documented in `packages/db`.

> Note: Prisma migrations are source-controlled in `packages/db/prisma/migrations/`. Do not reformat or delete migration files.

## ✅ Commit & Branching Workflow
We recommend a feature-branch + PR workflow targeting `main`. We commit `package-lock.json` to lock dependency versions so everyone's installs are consistent.

- Branch naming: `feature/short-description`, `fix/short-description`, `chore/short-description`
- Keep commits small and focused. Use Conventional Commits for clear history.

Example Conventional Commit messages:

- `feat(api): add course enrollment endpoint`
- `fix(web): correct datetime display bug`
- `docs: update README onboarding`
- `chore: bump deps`

Example commit sequence:
```bash
# create a feature branch
git checkout -b feature/add-user-endpoint

# stage changes
git add -A

# commit with a concise Conventional Commit message
git commit -m "feat(api): add user create endpoint"

# push branch and open a PR
git push -u origin feature/add-user-endpoint
```

If you must push directly to `main` (avoid when possible), ensure CI/lint/tests pass locally and use:
```bash
git checkout main
git pull
git merge --no-ff feature/add-user-endpoint -m "chore: merge feature/add-user-endpoint"
git push origin main
```

### Commit message tips
- Start with a type: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.
- Scope is optional but useful: `feat(api): ...` or `fix(web): ...`.
- Keep the subject line <= 72 chars. Optionally add a longer body separated by a blank line.

Example full commit with body:
```text
feat(api): add course enrollment endpoint

Adds POST /courses/:id/enroll to allow students to enroll. Validates
request body with Zod and returns 201 on success.

Closes: #123
```

### Pre-push checklist (recommended)
- Run `npm ci` (uses committed `package-lock.json`)
- Run `npm run lint` and address issues
- Run `npm test` (if tests exist)
- Build production bundles if changing build output: `npm run build`


