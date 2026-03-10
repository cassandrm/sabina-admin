# Backend Admin

Standalone admin service for Document Types management.

## Features

- **Document Types Management**: CRUD operations for document types/schemas
- **JWT Authentication**: Secure user authentication
- **Azure Content Understanding Integration**: Fetch available analyzers

## Quick Start

### Prerequisites

- Python 3.12+
- MySQL database (shared with main SABINA project)

### Local Development

1. Create virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Linux/Mac
   # or
   .venv\Scripts\Activate.ps1  # Windows
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Run the server:
   ```bash
   uvicorn src.main:app --reload --port 8002
   ```

### Docker

```bash
docker build -t backend-admin .
docker run -p 8002:8002 --env-file .env backend-admin
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| POST | /auth/login | User login |
| GET | /auth/me | Get current user info |
| GET | /admin/schemas | List all document types |
| POST | /admin/schemas | Create document type |
| PUT | /admin/schemas/{id} | Update document type |
| DELETE | /admin/schemas/{id} | Delete document type |
| GET | /api/analyzers | List Azure analyzers |

## Environment Variables

| Variable | Description |
|----------|-------------|
| SQLALCHEMY_DATABASE_URL | MySQL connection string |
| API_KEY | API key for service authentication |
| JWT_SECRET_KEY | Secret key for JWT token signing |
| ACCESS_TOKEN_EXPIRE_MINUTES | JWT token expiration (default: 30) |
| AZURE_CONTENT_UNDERSTANDING_ENDPOINT | Azure CU endpoint URL |
| AZURE_CONTENT_UNDERSTANDING_KEY | Azure CU API key |
