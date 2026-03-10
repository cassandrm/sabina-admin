# Frontend Admin

Standalone admin frontend for Document Types management built with Deno Fresh.

## Features

- **Login/Authentication**: JWT-based authentication
- **Document Types Dashboard**: View, create, edit, and delete document types
- **Schema Editor**: Edit validation rules for document types
- **Responsive Design**: Works on desktop and mobile

## Quick Start

### Prerequisites

- Deno 1.41.0+

### Local Development

1. Start the development server:
   ```bash
   deno task start
   ```

2. Open http://localhost:8001 in your browser

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| BACKEND_URL | Backend admin API URL | http://localhost:8002 |

### Docker

```bash
docker build -t frontend-admin .
docker run -p 8001:8001 -e BACKEND_URL=http://backend-admin:8002 frontend-admin
```

## Project Structure

```
frontend-admin/
├── deno.json           # Deno configuration
├── fresh.config.ts     # Fresh configuration
├── fresh.gen.ts        # Generated manifest
├── main.ts             # Production entry point
├── dev.ts              # Development entry point
├── islands/            # Interactive components
│   ├── AuthGuard.tsx
│   ├── LoginForm.tsx
│   ├── DocumentTypesDashboard.tsx
│   └── SchemaEditor.tsx
├── routes/             # File-system routing
│   ├── _app.tsx
│   ├── _404.tsx
│   ├── index.tsx
│   ├── login.tsx
│   └── api/            # API proxy routes
├── static/             # Static assets
│   └── css/
└── utils/              # Utilities
    ├── api.ts
    └── config.ts
```

## API Proxy Routes

The frontend proxies API requests to the backend:

| Frontend Route | Backend Endpoint |
|----------------|------------------|
| /api/auth/login | /auth/login |
| /api/auth/me | /auth/me |
| /api/admin/schemas | /admin/schemas |
| /api/admin/schemas/:id | /admin/schemas/:id |
| /api/analyzers | /api/analyzers |
