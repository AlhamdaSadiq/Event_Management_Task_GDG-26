# Event Management & Registration

A small full-stack app where users browse events and register for them, and admins manage events.

- **Backend:** Flask, SQLite, JWT auth (`backend/app.py`)
- **Frontend:** React + Vite (`frontend/src/App.jsx`)

## Features
- Signup / login with JWT authentication
- Event CRUD (title, description, date/time, venue, capacity, category) - admin only
- Register / unregister for events (duplicates and full events are blocked)
- View your registrations
- Search events by title and filter by category
- Admin panel in the UI to create, edit and delete events

## Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py                   # runs on http://localhost:5000
```
The database (`instance/events.db`) and a default admin are created on first run:
**admin@example.com / admin123**

### Frontend
```bash
cd frontend
npm install
npm run dev                     # runs on http://localhost:5173
```
Open http://localhost:5173. The frontend expects the backend at `http://localhost:5000`.

## API
Send the token as `Authorization: Bearer <token>` for protected routes.

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/api/signup` | public | Create an account |
| POST | `/api/login` | public | Returns a JWT token |
| GET | `/api/events?search=&category=` | public | List / search / filter events |
| GET | `/api/events/<id>` | public | Event details |
| POST | `/api/events` | admin | Create an event |
| PUT | `/api/events/<id>` | admin | Update an event |
| DELETE | `/api/events/<id>` | admin | Delete an event (and its registrations) |
| POST | `/api/events/<id>/register` | user | Register for an event |
| DELETE | `/api/events/<id>/register` | user | Cancel your registration |
| GET | `/api/my-registrations` | user | Events you registered for |

## Business rules
- A user cannot register twice for the same event (enforced by a unique database constraint).
- Registration is rejected when the event is full or has already started.
- Capacity cannot be lowered below the number of current registrations.
- Deleting an event also deletes its registrations.

@alhamdasadiq

## Notes
- Change `JWT_SECRET_KEY` in `backend/app.py` before deploying.
