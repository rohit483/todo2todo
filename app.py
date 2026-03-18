from typing import List
import os
import json
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from pydantic import BaseModel, ConfigDict
import firebase_admin
from firebase_admin import credentials, auth

# --- Database Configuration ---
# DATABASE_URL tells SQLAlchemy where the database lives.
# We read it from the environment variable provided by Docker Compose,
# or default to a local Postgres instance if running purely via local uvicorn.
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/todo2")

# Create a SQLAlchemy engine (core DB object).
engine = create_engine(DATABASE_URL)

# SessionLocal is a factory that will create new database sessions for each request.
# We set autocommit/autoflush explicitly to avoid surprises for beginners.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is the declarative base class that our ORM models will inherit from.
Base = declarative_base()

# --- Database Model ---
class TodoModel(Base):
    """SQLAlchemy model for todo items.

    Each class inheriting from `Base` maps to a database table. Attributes are columns.
    This model defines the shape of data stored in the `todo2` table.
    """
    __tablename__ = "todo2"

    id = Column(Integer, primary_key=True, index=True)

    # `user_uid` links this todo to a specific Firebase user
    user_uid = Column(String, index=True, nullable=False)

    # `user_email` stores the email of the Firebase user for analytics/database visibility
    user_email = Column(String, nullable=True)

    # `task` holds the text of the todo. `nullable=False` ensures a task must be provided.
    task = Column(String, index=True, nullable=False)

    # `completed` is a boolean flag indicating whether the task is done.
    completed = Column(Boolean, default=False, nullable=False)

# --- Pydantic Schemas ---
class TodoBase(BaseModel):
    """Pydantic base model used for request/response validation.
    Pydantic models validate and serialize data for incoming requests and outgoing responses.
    """
    task: str
    completed: bool = False

class TodoCreate(TodoBase):
    """Schema for creating todo items. Inherits from TodoBase.
    We keep this separate so we can extend or change create/update/request schemas
    later without touching the response model.
    """
    pass

class Todo(TodoBase):
    """Schema representing a todo item returned by the API."""
    id: int
    user_email: str | None = None
    model_config = ConfigDict(from_attributes=True)  # Modern Pydantic V2 configuration

# Initialize database tables
Base.metadata.create_all(bind=engine)

# --- FastAPI App Setup ---
# Create the FastAPI application instance. The extra metadata helps interactive docs (Swagger).
app = FastAPI(
    title="Todo API",
    description="A simple TODO API built with FastAPI",
    version="1.0.0",
)

# Serve files in the `static` directory at the `/static` URL path. Useful for CSS/JS.
app.mount("/static", StaticFiles(directory="static"), name="static")

# Jinja2 templates are used to render the index HTML page. Templates live in `templates/`.
templates = Jinja2Templates(directory="templates")

# CORS (Cross-Origin Resource Sharing) is configured here. For development we allow all origins.
# In production restrict `allow_origins` to the domains that should access your API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Dependency ---
def get_db():
    """Provide a database session to path operation functions.
    FastAPI dependencies can yield values. Here we yield a SQLAlchemy session and ensure
    it is closed after the request finishes (even if an exception occurs).
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Firebase Auth Setup ---
if not firebase_admin._apps:
    try:
        # Check if we have the Hugging Face secret injected as an environment variable
        firebase_creds_json = os.getenv("FIREBASE_CREDENTIALS")
        if firebase_creds_json:
            # Parse the JSON string from the secret and create a certificate
            cred_dict = json.loads(firebase_creds_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
        else:
            # Fallback to local application default credentials
            firebase_admin.initialize_app(options={'projectId': 'todo-e8628'})
    except Exception as e:
        print(f"Warning: Failed to initialize Firebase Admin SDK: {e}")

security = HTTPBearer()

def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verifies that the provided token is a valid Firebase ID token."""
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        print(f"Error validating token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# --- API Routes ---
@app.get("/")
async def home(request: Request):
    """Serve the main HTML page.
    This returns a rendered template. The `request` is required by Jinja2Templates.
    The template should include client-side JavaScript that calls the API endpoints.
    """
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/todo2/", response_model=Todo, status_code=201)
async def create_todo(todo: TodoCreate, db: Session = Depends(get_db), user: dict = Depends(verify_firebase_token)):
    """Create a new todo item.
    - The request body is validated against `TodoCreate`.
    - We build a `TodoModel` instance and save it to the DB.
    - On success we return the created object (Pydantic converts it for the response).
    """
    # Convert the Pydantic model to a dictionary suitable for SQLAlchemy. `model_dump()` is V2.
    # The Firebase JWT token usually contains the user's email address if it was requested
    email = user.get('email')
    db_todo = TodoModel(**todo.model_dump(), user_uid=user['uid'], user_email=email)
    db.add(db_todo)
    try:
        # Commit the transaction to persist data.
        db.commit()
        # Refresh the instance to load generated fields (like `id`).
        db.refresh(db_todo)
        return db_todo
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create todo")

@app.get("/todo2/", response_model=List[Todo])
async def read_todos(db: Session = Depends(get_db), user: dict = Depends(verify_firebase_token)):
    """Return all todo items.
    The returned objects are SQLAlchemy models; Pydantic's `from_attributes` setting
    allows converting them to the response schema automatically.
    """
    return db.query(TodoModel).filter(TodoModel.user_uid == user['uid']).all()

@app.put("/todo2/{todo_id}", response_model=Todo)
async def update_todo(todo_id: int, db: Session = Depends(get_db), user: dict = Depends(verify_firebase_token)):
    """Toggle the `completed` status for a todo item.
    - We validate the `todo_id` and attempt to find the row.
    - Using `filter(...).first()` returns None if not found (preferred over `.get()` in newer SQLAlchemy).
    """
    if todo_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid todo ID")

    try:
        db_todo = db.query(TodoModel).filter(TodoModel.id == todo_id, TodoModel.user_uid == user['uid']).first()
        if not db_todo:
            # If the item doesn't exist, return 404 (Not Found).
            raise HTTPException(status_code=404, detail="Todo not found")

        # Toggle the boolean flag and save.
        current_status = bool(db_todo.completed)
        setattr(db_todo, 'completed', not current_status)
        db.commit()
        db.refresh(db_todo)
        return db_todo
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update todo")

@app.delete("/todo2/{todo_id}", status_code=204)
async def delete_todo(todo_id: int, db: Session = Depends(get_db), user: dict = Depends(verify_firebase_token)):
    """Delete a todo item from the database.
    - Returns 204 No Content on success.
    - Validates the id and ensures the item exists before deleting.
    """
    if todo_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid todo ID")

    try:
        db_todo = db.query(TodoModel).filter(TodoModel.id == todo_id, TodoModel.user_uid == user['uid']).first()
        if not db_todo:
            raise HTTPException(status_code=404, detail="Todo not found")

        db.delete(db_todo)
        db.commit()
        # Returning None with status_code=204 results in an empty response body (expected for 204).
        return None
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete todo")

@app.delete("/user/", status_code=204)
async def delete_user_account(db: Session = Depends(get_db), user: dict = Depends(verify_firebase_token)):
    """Delete all user data and remove the user from Firebase Auth."""
    try:
        # Delete the user's todos from the database
        db.query(TodoModel).filter(TodoModel.user_uid == user['uid']).delete()
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        print(f"Failed to delete user: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user account")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=7860)