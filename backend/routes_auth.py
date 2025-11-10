from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.hash import pbkdf2_sha256
from database import get_db
from models import User, RoleEnum
from auth_jwt import create_access_token, get_current_user
from pydantic import BaseModel, EmailStr
from typing import Optional

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

# -------------------------------
# Pydantic model for signup input
# -------------------------------
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    reg_number: Optional[str] = None  # Student reg no or Lecturer Staff ID

# -------------------------------
# SIGNUP - Requires Admin Approval
# -------------------------------
@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    if payload.role not in RoleEnum.__members__:
        raise HTTPException(status_code=400, detail="Invalid role selected.")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = pbkdf2_sha256.hash(payload.password)

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hashed_password,
        role=payload.role,
        reg_number=payload.reg_number,
        is_approved=False  # Must be approved by admin first
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Signup successful. Await admin approval.",
        "user_id": user.id
    }

# -------------------------------
# LOGIN - Requires Approval
# -------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    if not user or not pbkdf2_sha256.verify(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_approved:
        raise HTTPException(status_code=403, detail="Account pending admin approval")

    token = create_access_token({
        "id": user.id,
        "role": user.role,
        "name": user.name
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    }

# -------------------------------
# ADMIN - List Pending Accounts
# -------------------------------
@router.get("/pending_approvals")
def list_pending_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view pending approvals")

    return db.query(User).filter(User.is_approved == False).all()

# -------------------------------
# ADMIN - Approve or Reject Signup
# -------------------------------
@router.put("/approve_user/{user_id}")
def approve_user(user_id: int, approve: bool, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can approve users")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if approve:
        user.is_approved = True
        message = f"{user.name} approved."
    else:
        db.delete(user)
        message = f"{user.name} rejected and removed."

    db.commit()
    return {"message": message}

# -------------------------------
# ADMIN - View All Users
# -------------------------------
@router.get("/users")
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view all users")

    return db.query(User).all()
