# routes_auth.py
from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from passlib.hash import pbkdf2_sha256, bcrypt
from database import get_db
from models import User, RoleEnum, AcademicSession
from auth_jwt import create_access_token, get_current_user
from pydantic import BaseModel, EmailStr
from typing import Optional
from passlib.context import CryptContext
from utils_email import send_email
import uuid

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

# We'll use pbkdf2_sha256 as the canonical hashing algorithm for new hashes.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# -------------------------------
# Local helper (replaces missing utils_password)
# -------------------------------
def hash_password(plain: str) -> str:
    """Hash with pbkdf2_sha256 (consistent across app)."""
    return pbkdf2_sha256.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against stored hash. Handles bcrypt -> pbkdf2 upgrade path."""
    if not hashed:
        return False

    # If stored is bcrypt, use bcrypt.verify then (optionally) upgrade to pbkdf2 in DB caller
    if hashed.startswith("$2b$") or hashed.startswith("$2a$") or hashed.startswith("$2y$"):
        try:
            return bcrypt.verify(plain, hashed)
        except Exception:
            return False

    # Default: pbkdf2_sha256
    try:
        return pbkdf2_sha256.verify(plain, hashed)
    except Exception:
        return False


# -------------------------------
# Pydantic models
# -------------------------------
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    reg_number: Optional[str] = None
    matric_year: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

# -------------------------------
# PUBLIC - Get Active Academic Session
# -------------------------------
@router.get("/active-session")
def get_active_session(db: Session = Depends(get_db)):

    active_sessions = db.query(AcademicSession).filter(
        AcademicSession.is_active == True
    ).all()

    if not active_sessions:
        raise HTTPException(
            status_code=404,
            detail="No active academic session has been configured."
        )

    if len(active_sessions) > 1:
        raise HTTPException(
            status_code=500,
            detail="Multiple active academic sessions found. Contact the administrator."
        )

    session = active_sessions[0]

    return {
        "id": session.id,
        "name": session.name
    }



# -------------------------------
# SIGNUP - Requires Admin Approval
# Academic Session Automatically Assigned
# -------------------------------
@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):

    # Validate role
    if payload.role not in RoleEnum.__members__:
        raise HTTPException(
            status_code=400,
            detail="Invalid role selected."
        )

    # Email uniqueness
    if db.query(User).filter(
        User.email == payload.email
    ).first():
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    matric_year = None
    academic_session = None

    # ---------------------------------
    # STUDENT REGISTRATION VALIDATION
    # ---------------------------------
    if payload.role == "student":

        # Registration number validation
        if not payload.reg_number:
            raise HTTPException(
                status_code=400,
                detail="Registration number is required for students"
            )

        if not payload.reg_number.isdigit() or len(payload.reg_number) != 6:
            raise HTTPException(
                status_code=400,
                detail="Registration number must be EXACTLY 6 digits"
            )

        # Registration number uniqueness
        if db.query(User).filter(
            User.reg_number == payload.reg_number
        ).first():
            raise HTTPException(
                status_code=400,
                detail="A student with this registration number already exists"
            )

        # Matriculation year validation
        valid_matric_years = {
            f"{year:02d}" for year in range(15, 25)
        }

        if payload.matric_year not in valid_matric_years:
            raise HTTPException(
                status_code=400,
                detail="Please select a valid matriculation year between 15 and 24."
            )

        matric_year = payload.matric_year

        # Retrieve the active academic session
        active_sessions = db.query(AcademicSession).filter(
            AcademicSession.is_active == True
        ).all()

        if not active_sessions:
            raise HTTPException(
                status_code=400,
                detail="Student registration is currently unavailable because no active academic session has been configured."
            )

        if len(active_sessions) > 1:
            raise HTTPException(
                status_code=500,
                detail="Multiple active academic sessions found. Please contact the administrator."
            )

        academic_session = active_sessions[0]

    # ---------------------------------
    # CREATE USER
    # ---------------------------------
    hashed_password = hash_password(payload.password)

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hashed_password,
        role=RoleEnum(payload.role),
        reg_number=payload.reg_number if payload.role == "student" else None,
        matric_year=matric_year,
        academic_session_id=(
            academic_session.id if academic_session else None
        ),
        is_approved=False
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Registration failed. Please try again."
        )

    response = {
        "message": "Signup successful. Await admin approval.",
        "user_id": user.id
    }

    if academic_session:
        response["academic_session"] = academic_session.name
        response["academic_session_id"] = academic_session.id
        response["matric_year"] = user.matric_year

    return response

# -------------------------------
# LOGIN - Requires Approval
# -------------------------------
@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    stored_hash = getattr(user, "password_hash", None)
    if not stored_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # If bcrypt-stored hash -> verify with bcrypt then upgrade to pbkdf2
    if stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$") or stored_hash.startswith("$2y$"):
        if not bcrypt.verify(payload.password, stored_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        # Upgrade stored hash to pbkdf2_sha256
        user.password_hash = hash_password(payload.password)
        db.commit()
    else:
        if not pbkdf2_sha256.verify(payload.password, stored_hash):
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
# ADMIN - Reset password (to fixed '1234567')
# -------------------------------
@router.put("/reset_password/{user_id}")
def reset_password(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Only admin allowed
    if getattr(current_user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Only admin can reset passwords")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password("1234567")
    db.commit()

    return {"message": "Password reset to 1234567"}


# -------------------------------
# ADMIN - List Pending Accounts
# -------------------------------
@router.get("/pending_approvals")
def list_pending_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if getattr(current_user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view pending approvals")

    return db.query(User).filter(User.is_approved == False).all()


# -------------------------------
# ADMIN - Approve or Reject Signup
# -------------------------------
@router.put("/approve_user/{user_id}")
def approve_user(user_id: int, approve: bool, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if getattr(current_user, "role", None) != "admin":
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
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if getattr(current_user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view all users")

    users = db.query(User).all()

    result = []
    for u in users:
        result.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "reg_number": u.reg_number,
            "is_approved": u.is_approved,
            "supervisors": [
                {
                    "id": sup.id,
                    "name": sup.name,
                    "email": sup.email
                }
                for sup in u.supervisors
            ] if u.role == "student" else []
        })

    return result


# -------------------------------
# CHANGE PASSWORD for current user
# -------------------------------
@router.put("/change_password")
def change_password(
    old_password: str = Body(..., embed=True),
    new_password: str = Body(..., embed=True),
    confirm_password: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Allows any authenticated user (student, lecturer, or admin) to change their password.
    """

    # Validate new password confirmation
    if new_password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation do not match.",
        )

    # Fetch user from DB
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify old password using verify_password helper
    if not verify_password(old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Old password is incorrect.",
        )

    # Hash and save new password
    user.password_hash = hash_password(new_password)
    db.commit()

    return {"message": "Password changed successfully."}


# -------------------------------
# FORGOT PASSWORD - sends reset link (simple token)
# -------------------------------
@router.post("/forgot_password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = payload.email

    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Security: do not reveal whether email exists
        return {"message": "If this email exists, a password reset link has been sent."}

    # Create token and save to user.reset_token (create attribute on User if exists)
    token = str(uuid.uuid4())
    # attach token to user - ensure your User model has reset_token column if you want persistence
    setattr(user, "reset_token", token)
    db.commit()

    # Generate reset link (adjust domain as needed)
    reset_link = f"https://university-research-submission-system-1.onrender.com/reset-password/{token}"

    subject = "Password Reset Request"
    body_html = f"""
    <p>Hello {user.name},</p>

    <p>You requested to reset your password for the University Research Submission System.</p>

    <p><a href="{reset_link}" 
        style="padding:10px 20px;background:#0275d8;color:white;text-decoration:none;border-radius:6px;">
        Reset Your Password
    </a></p>

    <p>If you did not request this, you may ignore this email.</p>

    <p>Regards,<br>University Research Submission System</p>
    """

    send_email(email, subject, body_html)

    return {"message": "Password reset link sent if the email exists."}
