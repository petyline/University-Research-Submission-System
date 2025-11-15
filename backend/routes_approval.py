from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from database import get_db
from models import Submission, User, Settings
from auth_jwt import get_current_user
from datetime import datetime
from fastapi.encoders import jsonable_encoder 
from pydantic import BaseModel

router = APIRouter()

@router.post('/admin/decide_submission/{submission_id}')
def admin_decide_submission(submission_id: int, decision: str, current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Allows an admin to approve, reject, or close a student's submission.
    """
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail='Admins only')

    # Fetch the submission
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail='Submission not found')

    # Validate decision
    valid_decisions = ['approved', 'rejected', 'closed']
    if decision not in valid_decisions:
        raise HTTPException(
            status_code=400, 
            detail=f"Decision must be one of {valid_decisions}"
        )

    # Apply decision
    submission.admin_decision = decision
    submission.final_decision = decision
    submission.admin_decision_at = datetime.utcnow()

    # Optionally, close all pending lecturer actions if admin closes
    if decision == 'closed':
        submission.lecturer_decision = 'closed'
        submission.lecturer_decision_at = datetime.utcnow()

    db.commit()
    db.refresh(submission)

    return {
        'id': submission.id,
        'final_decision': submission.final_decision,
        'message': f'Submission {decision} successfully by admin'
    }

@router.post('/admin/auto_decide')
def admin_auto_decide(threshold: float = 70.0, current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail='Admins only')
    submissions = db.query(Submission).all()
    updated = {'approved':0,'rejected':0,'skipped':0}
    for s in submissions:
        if s.lecturer_decision in ['approved','rejected']:
            updated['skipped'] += 1
            continue
        if s.similarity_score < threshold:
            s.admin_decision = 'approved'
            s.final_decision = 'approved'
            updated['approved'] += 1
        else:
            s.admin_decision = 'rejected'
            s.final_decision = 'rejected'
            updated['rejected'] += 1
    db.commit()
    return {'summary': updated}




def serialize_submission(submission: Submission):
    """Convert Submission + related student to a JSON-serializable dict"""
    return {
        "id": submission.id,
        "proposal_type": submission.proposal_type,
        "proposed_title": submission.proposed_title,
        "background": submission.background,
        "aim": submission.aim,
        "objectives": submission.objectives,
        "methods": submission.methods,
        "expected_results": submission.expected_results,
        "literature_review": submission.literature_review,
        "similarity_score": submission.similarity_score,
        "final_decision": submission.final_decision,
        "lecturer_decision": submission.lecturer_decision,
        "lecturer_decision_at": submission.lecturer_decision_at,
        "admin_decision": submission.admin_decision,
        "student": {
            "id": submission.student.id,
            "name": submission.student.name,
            "reg_number": submission.student.reg_number,
            "email": submission.student.email
        } if submission.student else None,
        "supervisor_id": submission.supervisor_id
    }

@router.get('/submissions')
def list_all_submissions(current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == 'admin':
        submissions = db.query(Submission).all()
    elif current_user.role == 'lecturer':
        submissions = db.query(Submission).filter(Submission.supervisor_id==current_user.id).all()
    elif current_user.role == 'student':
        submissions = db.query(Submission).filter(Submission.student_id==current_user.id).all()
    else:
        submissions = []

    return [serialize_submission(s) for s in submissions]
    


class AssignSupervisorRequest(BaseModel):
    student_id: int
    supervisor_id: int

@router.post("/admin/assign_supervisor")
def assign_supervisor(payload: dict, db: Session = Depends(get_db)):
    student_id = payload.get("student_id")
    supervisor_id = payload.get("supervisor_id")

    # Validate inputs
    if not student_id or not supervisor_id:
        raise HTTPException(status_code=400, detail="Both student_id and supervisor_id are required")

    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    supervisor = db.query(User).filter(User.id == supervisor_id, User.role == "lecturer").first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    # Prevent duplicates
    if supervisor in student.supervisors:
        raise HTTPException(status_code=400, detail="Supervisor already assigned")

    # Establish relationship
    student.supervisors.append(supervisor)
    db.commit()

    return {"message": f"{supervisor.name} assigned to {student.name} successfully"}

# routes_approval.py (append)


@router.get("/admin/settings")
def get_settings(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    s = db.query(Settings).first()
    if not s:
        s = Settings(undergrad_mode="title", postgrad_mode="title_plus")
        db.add(s)
        db.commit()
        db.refresh(s)
    return {"undergrad_mode": s.undergrad_mode, "postgrad_mode": s.postgrad_mode}


@router.put("/admin/settings")
def update_settings(
    undergrad_mode: str = Body(..., embed=True),
    postgrad_mode: str = Body(..., embed=True),
    allow_multiple_submissions: bool = Body(False, embed=True),  # ✅ New field
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 🔒 Admin-only access
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    # Validate allowed modes
    if undergrad_mode not in ("title", "title_plus") or postgrad_mode not in ("title", "title_plus"):
        raise HTTPException(status_code=400, detail="Modes must be 'title' or 'title_plus'")

    # Retrieve or create settings record
    s = db.query(Settings).first()
    if not s:
        s = Settings()
        db.add(s)

    # Update fields
    s.undergrad_mode = undergrad_mode
    s.postgrad_mode = postgrad_mode
    s.allow_multiple_submissions = allow_multiple_submissions  # ✅ new setting

    db.commit()
    db.refresh(s)

    return {
        "message": "Settings updated successfully",
        "undergrad_mode": s.undergrad_mode,
        "postgrad_mode": s.postgrad_mode,
        "allow_multiple_submissions": s.allow_multiple_submissions
    }

@router.get("/student_supervisor/{student_id}")
def get_student_supervisor(student_id: int, db: Session = Depends(get_db)):
    student = db.query(User).filter(User.id == student_id, User.role == "student").first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # supervisors is a relationship list
    if not student.supervisors or len(student.supervisors) == 0:
        return None

    # Take the first supervisor
    sup = student.supervisors[0]

    return {
        "name": sup.name,
        "email": sup.email,
        "department": sup.department if hasattr(sup, "department") else "N/A",
        "id": sup.id
    }



