from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from database import get_db
from models import Submission, User, Settings, AcademicSession
from auth_jwt import get_current_user
from datetime import datetime
from fastapi.encoders import jsonable_encoder 
from pydantic import BaseModel

router = APIRouter()


# ---------- Academic Session Administration ----------

class CreateAcademicSessionRequest(BaseModel):
    name: str


@router.get("/admin/academic-sessions")
def admin_get_academic_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    sessions = db.query(AcademicSession).order_by(
        AcademicSession.name.desc()
    ).all()

    result = []

    for session in sessions:
        student_count = db.query(User).filter(
            User.role == "student",
            User.academic_session_id == session.id
        ).count()

        submission_count = db.query(Submission).filter(
            Submission.academic_session_id == session.id
        ).count()

        result.append({
            "id": session.id,
            "name": session.name,
            "is_active": session.is_active,
            "student_count": student_count,
            "submission_count": submission_count,
            "created_at": session.created_at
        })

    return result


@router.post("/admin/academic-sessions")
def admin_create_academic_session(
    payload: CreateAcademicSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    name = payload.name.strip()

    # Require consecutive academic years, e.g. 2027/2028
    import re
    match = re.fullmatch(r"(20\d{2})/(20\d{2})", name)

    if not match:
        raise HTTPException(
            status_code=400,
            detail="Use the format YYYY/YYYY, e.g. 2027/2028"
        )

    start_year = int(match.group(1))
    end_year = int(match.group(2))

    if end_year != start_year + 1:
        raise HTTPException(
            status_code=400,
            detail="Academic session years must be consecutive"
        )

    existing = db.query(AcademicSession).filter(
        AcademicSession.name == name
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="This academic session already exists"
        )

    session = AcademicSession(
        name=name,
        is_active=False
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "message": f"Academic session {name} created successfully",
        "id": session.id,
        "name": session.name,
        "is_active": session.is_active
    }


@router.put("/admin/academic-sessions/{session_id}/activate")
def admin_activate_academic_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    session = db.query(AcademicSession).filter(
        AcademicSession.id == session_id
    ).first()

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Academic session not found"
        )

    try:
        # Deactivate all sessions first.
        db.query(AcademicSession).update(
            {AcademicSession.is_active: False},
            synchronize_session=False
        )

        # Activate the selected session.
        session.is_active = True

        db.commit()
        db.refresh(session)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to activate academic session"
        )

    return {
        "message": f"{session.name} is now the active academic session",
        "id": session.id,
        "name": session.name,
        "is_active": session.is_active
    }

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
        "ca_score": submission.ca_score,

        "academic_session_id": submission.academic_session_id,
        "academic_session": (
            submission.academic_session.name
            if submission.academic_session else None
        ),

        "student": {
            "id": submission.student.id,
            "name": submission.student.name,
            "reg_number": submission.student.reg_number,
            "email": submission.student.email,
            "matric_year": submission.student.matric_year
        } if submission.student else None,

        "supervisor_id": submission.supervisor_id
    }

@router.get("/lecturer/academic-sessions")
def get_lecturer_academic_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "lecturer":
        raise HTTPException(
            status_code=403,
            detail="Only lecturers can access this endpoint."
        )

    sessions = db.query(AcademicSession).order_by(
        AcademicSession.name.desc()
    ).all()

    results = []

    for session in sessions:
        submission_count = db.query(Submission).filter(
            Submission.supervisor_id == current_user.id,
            Submission.academic_session_id == session.id
        ).count()

        results.append({
            "id": session.id,
            "name": session.name,
            "is_active": session.is_active,
            "submission_count": submission_count
        })

    return results


@router.get('/submissions')
def list_all_submissions(
    academic_session_id: int = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == 'admin':
        query = db.query(Submission)

    elif current_user.role == 'lecturer':
        query = db.query(Submission).filter(
            Submission.supervisor_id == current_user.id
        )

    elif current_user.role == 'student':
        query = db.query(Submission).filter(
            Submission.student_id == current_user.id
        )

    else:
        raise HTTPException(
            status_code=403,
            detail="Not authorized."
        )

    # Apply session filter when supplied
    if academic_session_id is not None:
        query = query.filter(
            Submission.academic_session_id == academic_session_id
        )

    submissions = query.order_by(
        Submission.created_at.desc()
    ).all()

    return [
        serialize_submission(s)
        for s in submissions
    ]    


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
        s = Settings(
            undergrad_mode="title",
            postgrad_mode="title_plus",
            allow_multiple_submissions=False,
            show_ca_to_students=False   # ⭐ NEW
        )
        db.add(s)
        db.commit()
        db.refresh(s)

    return {
        "undergrad_mode": s.undergrad_mode,
        "postgrad_mode": s.postgrad_mode,
        "allow_multiple_submissions": s.allow_multiple_submissions,
        "show_ca_to_students": s.show_ca_to_students  # ⭐ NEW
    }

@router.put("/admin/settings")
def update_settings(
    undergrad_mode: str = Body(..., embed=True),
    postgrad_mode: str = Body(..., embed=True),
    allow_multiple_submissions: bool = Body(False, embed=True),

    # ⭐ NEW FIELD
    show_ca_to_students: bool = Body(False, embed=True),

    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    # 🔒 Admin only
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    # Validate
    if undergrad_mode not in ("title", "title_plus") or \
       postgrad_mode not in ("title", "title_plus"):
        raise HTTPException(
            status_code=400,
            detail="Modes must be 'title' or 'title_plus'"
        )

    s = db.query(Settings).first()

    if not s:
        s = Settings()
        db.add(s)

    # Update fields
    s.undergrad_mode = undergrad_mode
    s.postgrad_mode = postgrad_mode
    s.allow_multiple_submissions = allow_multiple_submissions

    # ⭐ NEW
    s.show_ca_to_students = show_ca_to_students

    db.commit()
    db.refresh(s)

    return {
        "message": "Settings updated successfully",
        "undergrad_mode": s.undergrad_mode,
        "postgrad_mode": s.postgrad_mode,
        "allow_multiple_submissions": s.allow_multiple_submissions,
        "show_ca_to_students": s.show_ca_to_students
    }
@router.get("/student_supervisor/{student_id}")
def get_student_supervisor(student_id: int, db: Session = Depends(get_db)):
    # Fetch student
    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Check assignments
    if not student.supervisors or len(student.supervisors) == 0:
        return {"assigned": False}

    # You can allow multiple supervisors; take first for now
    sup = student.supervisors[0]

    return {
        "assigned": True,
        "name": sup.name,
        "email": sup.email,
        "department": getattr(sup, "department", "N/A"),
        "id": sup.id
    }

@router.put("/lecturer/add_ca/{submission_id}")
def add_ca_score(
    submission_id: int,
    score: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "lecturer":
        raise HTTPException(status_code=403, detail="Only lecturers can add CA score")

    if score < 0 or score > 30:
        raise HTTPException(status_code=400, detail="CA score must be between 0 and 30")

    sub = db.query(Submission).filter(Submission.id == submission_id).first()

    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if sub.proposal_type != "Seminar":
        raise HTTPException(status_code=400, detail="CA score only applies to Seminar")

    # ensure lecturer supervises the student
    student = db.query(User).filter(User.id == sub.student_id).first()
    if current_user not in student.supervisors:
        raise HTTPException(status_code=403, detail="Not your student")

    sub.ca_score = score
    db.commit()
    db.refresh(sub)

    return {
        "message": "CA score recorded",
        "ca_score": sub.ca_score
    }

@router.post("/lecturer/decision/{submission_id}")
def lecturer_decide_submission(
    submission_id: int,
    decision: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 👉 Lecturer-only access
    if current_user.role != "lecturer":
        raise HTTPException(status_code=403, detail="Only lecturers can make decisions")

    # Fetch submission
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Ensure lecturer supervises the student
    if sub.supervisor_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not supervise this student")

    # Validate decision
    if decision not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'")

    # Save decision
    sub.lecturer_decision = decision
    sub.final_decision = decision   # Lecturer’s decision becomes final immediately
    sub.lecturer_decision_at = datetime.utcnow()

    db.commit()
    db.refresh(sub)

    return {
        "message": f"Submission {decision} successfully",
        "id": sub.id,
        "final_decision": sub.final_decision
    }




