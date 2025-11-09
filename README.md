# ML Research App (Persistent SQLite)

This project bundles backend (FastAPI) and frontend (React + Tailwind) for the student seminar/project submission system.
SQLite DB is stored at `backend/data/app.db` and persisted with Docker volume `db_data`.

## Quickstart with Docker

1. Extract the ZIP.
2. In project root, run:
   ```bash
   docker-compose up --build
   ```
3. Backend: http://localhost:8000
   Frontend: http://localhost:3000

Seed accounts (created on first run):
- admin@uni.edu / adminpass
- lect1@uni.edu / lectpass1
- lect2@uni.edu / lectpass2
- student1@uni.edu / studpass1
- student2@uni.edu / studpass2
