# routes_submissions.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import Submission, User, ProposalTypeEnum, Settings, RoleEnum
from auth_jwt import get_current_user
from utils_similarity import compute_similarity_percent
from utils_email import send_email
from fastapi.responses import StreamingResponse
from utils_pdf import generate_pdf

router = APIRouter()

# ============================================================
#   PDF DOWNLOAD
# ============================================================
@router.get("/submission/{submission_id}/pdf")
def get_submission_pdf(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Role checks
    if current_user.role == "student" and sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.role == "lecturer" and sub.supervisor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    pdf_bytes = generate_pdf(sub)

    return StreamingResponse(
        pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=submission_{submission_id}.pdf"}
    )


# ============================================================
#   HELPERS
# ============================================================
def get_degree_level(ptype: ProposalTypeEnum) -> str:
    if ptype in (ProposalTypeEnum.Seminar, ProposalTypeEnum.Project):
        return "undergrad"
    return "postgrad"


def build_text_for_mode(mode: str, title: str, parts: list[str]):
    if mode == "title":
        return title or ""
    return " ".join(filter(None, [title] + parts))


# ============================================================
#   PAYLOAD MODELS
# ============================================================
class ProposalSubmission(BaseModel):
    student_id: int
    proposal_type: ProposalTypeEnum
    proposed_title: str
    background: str
    aim: str
    objectives: str
    methods: str
    expected_results: str
    literature_review: str


class ProposalUpdate(BaseModel):
    proposal_type: ProposalTypeEnum | None = None
    proposed_title: str | None = None
    background: str | None = None
    aim: str | None = None
    objectives: str | None = None
    methods: str | None = None
    expected_results: str | None = None
    literature_review: str | None = None


# ============================================================
#   SUBMIT PROPOSAL
# ============================================================

@router.post("/submit")
def submit_proposal(
    payload: ProposalSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # ---------------------------------
    # AUTHENTICATION AND ACCESS CONTROL
    # ---------------------------------
    if current_user.role != RoleEnum.student:
        raise HTTPException(
            status_code=403,
            detail="Only students can submit proposals."
        )

    if current_user.id != payload.student_id:
        raise HTTPException(
            status_code=403,
            detail="You cannot submit a proposal on behalf of another student."
        )

    student = db.query(User).filter(
        User.id == current_user.id,
        User.role == RoleEnum.student
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found."
        )

    # ---------------------------------
    # ACADEMIC SESSION VALIDATION
    # ---------------------------------
    if not student.academic_session_id:
        raise HTTPException(
            status_code=400,
            detail="Your academic session has not been assigned. Please contact the administrator."
        )

    academic_session_id = student.academic_session_id

    # ---------------------------------
    # SUPERVISOR VALIDATION
    # ---------------------------------
    if not student.supervisors:
        raise HTTPException(
            status_code=400,
            detail="No supervisor assigned."
        )

    supervisor = student.supervisors[0]

    # ---------------------------------
    # SETTINGS
    # ---------------------------------
    settings = db.query(Settings).first()

    undergrad_mode = settings.undergrad_mode if settings else "title"
    postgrad_mode = settings.postgrad_mode if settings else "title_plus"

    # ---------------------------------
    # STRICT CATEGORY CONTROL
    # Within the student's academic session
    # ---------------------------------
    existing_same_type = db.query(Submission).filter(
        Submission.student_id == student.id,
        Submission.proposal_type == payload.proposal_type,
        Submission.academic_session_id == academic_session_id
    ).first()

    if existing_same_type:

        if (
            existing_same_type.final_decision
            and existing_same_type.final_decision.lower() == "approved"
        ):
            raise HTTPException(
                status_code=400,
                detail=f"You already have an APPROVED {payload.proposal_type.value}. Editing or new submission is not allowed."
            )

        if (
            existing_same_type.final_decision
            and existing_same_type.final_decision.lower() == "rejected"
        ):
            db.delete(existing_same_type)
            db.commit()

        else:
            raise HTTPException(
                status_code=400,
                detail=f"You already submitted a {payload.proposal_type.value}. Please edit the existing one."
            )

    # ---------------------------------
    # SIMILARITY MODE
    # ---------------------------------
    level = get_degree_level(payload.proposal_type)

    mode = (
        undergrad_mode
        if level == "undergrad"
        else postgrad_mode
    )

    # Compare against existing submissions of the same category.
    # Cross-session comparison is retained for similarity checking.
    existing = db.query(Submission).filter(
        Submission.proposal_type == payload.proposal_type
    ).all()

    existing_texts = []

    for e in existing:
        parts = [
            e.background,
            e.aim,
            e.objectives,
            e.methods,
            e.expected_results,
            e.literature_review
        ]

        existing_texts.append(
            build_text_for_mode(mode, e.proposed_title, parts)
        )

    new_parts = [
        payload.background,
        payload.aim,
        payload.objectives,
        payload.methods,
        payload.expected_results,
        payload.literature_review
    ]

    new_text = build_text_for_mode(
        mode,
        payload.proposed_title,
        new_parts
    )

    similarity = compute_similarity_percent(
        new_text,
        existing_texts
    )

    # ---------------------------------
    # SAVE SUBMISSION
    # ---------------------------------
    submission = Submission(
        student_id=student.id,
        supervisor_id=supervisor.id,
        academic_session_id=academic_session_id,
        proposal_type=payload.proposal_type,
        proposed_title=payload.proposed_title,
        background=payload.background,
        aim=payload.aim,
        objectives=payload.objectives,
        methods=payload.methods,
        expected_results=payload.expected_results,
        literature_review=payload.literature_review,
        similarity_score=similarity
    )

    try:
        db.add(submission)
        db.commit()
        db.refresh(submission)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Submission could not be saved. Please try again."
        )

    # ---------------------------------
    # NOTIFY STUDENT
    # ---------------------------------
    send_email(
        student.email,
        "Submission received",
        f"""
        <p>Your {payload.proposal_type.value} submission was received.</p>
        <p>Academic Session: <b>{student.academic_session.name}</b></p>
        <p>Similarity: <b>{similarity}%</b>.</p>
        """
    )

    # ---------------------------------
    # NOTIFY SUPERVISOR
    # ---------------------------------
    warn = (
        '<p style="color:red"><b>⚠ High similarity detected</b></p>'
        if similarity >= 70 else ""
    )

    send_email(
        supervisor.email,
        f"New submission from {student.reg_number or student.email}",
        f"""
        <p>Student <b>{student.name} ({student.reg_number})</b>
        submitted a {payload.proposal_type.value}.</p>

        <p>Academic Session: <b>{student.academic_session.name}</b></p>
        <p>Similarity: <b>{similarity}%</b>.</p>
        {warn}
        <p>Please log in to review.</p>
        """
    )

    return {
        "id": submission.id,
        "similarity": similarity,
        "academic_session_id": submission.academic_session_id,
        "academic_session": student.academic_session.name,
        "message": "Submission received successfully."
    }


# ============================================================
#   UPDATE SUBMISSION
# ============================================================
@router.put("/update_submission/{submission_id}")
def update_submission(
    submission_id: int,
    payload: ProposalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    # 🔥 LOCK AFTER APPROVAL
    if sub.final_decision and sub.final_decision.lower() == "approved":
        raise HTTPException(
            status_code=400,
            detail="This proposal has been approved and can no longer be edited."
        )

    # Access control
    if current_user.role == "student" and current_user.id != sub.student_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.role == "lecturer":
        student = db.query(User).filter(User.id == sub.student_id).first()
        if not student or current_user not in student.supervisors:
            raise HTTPException(status_code=403, detail="Not authorized")

    # SETTINGS
    settings = db.query(Settings).first()
    allow_multiple = settings.allow_multiple_submissions if settings else False

    # Prevent duplicate type change
    if payload.proposal_type and not allow_multiple:
        duplicate = db.query(Submission).filter(
            Submission.student_id == sub.student_id,
            Submission.proposal_type == payload.proposal_type,
            Submission.id != sub.id
        ).first()

        if duplicate:
            raise HTTPException(
                status_code=400,
                detail=f"You already have a {payload.proposal_type} submission."
            )

    # Apply updates
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(sub, field, value)

    # Recompute similarity
    undergrad_mode = settings.undergrad_mode if settings else "title"
    postgrad_mode = settings.postgrad_mode if settings else "title_plus"

    level = get_degree_level(sub.proposal_type)
    mode = undergrad_mode if level == "undergrad" else postgrad_mode

    existing = db.query(Submission).filter(
        Submission.proposal_type == sub.proposal_type,
        Submission.id != sub.id
    ).all()

    existing_texts = []
    for e in existing:
        parts = [
            e.background, e.aim, e.objectives, e.methods,
            e.expected_results, e.literature_review
        ]
        existing_texts.append(build_text_for_mode(mode, e.proposed_title, parts))

    new_parts = [
        sub.background, sub.aim, sub.objectives, sub.methods,
        sub.expected_results, sub.literature_review
    ]
    new_text = build_text_for_mode(mode, sub.proposed_title, new_parts)

    sub.similarity_score = compute_similarity_percent(new_text, existing_texts)

    db.commit()
    db.refresh(sub)

    return {
        "id": sub.id,
        "similarity": sub.similarity_score,
        "message": "Submission updated successfully"
    }

# ============================================================
#   VIEW STUDENT SUBMISSIONS
# ============================================================

# ============================================================
# VIEW STUDENT SUBMISSIONS
# ============================================================
@router.get("/student_submissions/{student_id}")
def get_student_submissions(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ---------------------------
    # Access Control
    # ---------------------------
    if current_user.role == RoleEnum.student and current_user.id != student_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.role == RoleEnum.lecturer:
        student = db.query(User).filter(
            User.id == student_id
        ).first()

        if not student or current_user not in student.supervisors:
            raise HTTPException(status_code=403, detail="Not authorized")

    # ---------------------------
    # Get Settings (for CA visibility)
    # ---------------------------
    settings = db.query(Settings).first()

    show_ca = settings.show_ca_to_students if settings else False

    # ---------------------------
    # Fetch Submissions
    # ---------------------------
    submissions = db.query(Submission).filter(
        Submission.student_id == student_id
    ).order_by(
        Submission.created_at.desc()
    ).all()

    # ---------------------------
    # Format Response
    # ---------------------------
    result = []

    for s in submissions:
        result.append({
            "id": s.id,
            "student_id": s.student_id,
            "supervisor_id": s.supervisor_id,

            "proposal_type": s.proposal_type,
            "proposed_title": s.proposed_title,

            "background": s.background,
            "aim": s.aim,
            "objectives": s.objectives,
            "methods": s.methods,
            "expected_results": s.expected_results,
            "literature_review": s.literature_review,

            "similarity_score": s.similarity_score,

            # Academic session
            "academic_session_id": s.academic_session_id,
            "academic_session": (
                s.academic_session.name
                if s.academic_session else None
            ),

            "lecturer_decision": s.lecturer_decision,
            "admin_decision": s.admin_decision,
            "final_decision": s.final_decision,

            "created_at": s.created_at,
            "lecturer_decision_at": s.lecturer_decision_at,

            # CA visibility control
            "ca_score": (
                s.ca_score
                if show_ca or current_user.role != RoleEnum.student
                else None
            )
        })

    return result


# ============================================================
# ADMIN / LECTURER VIEW ALL SUBMISSIONS
# ============================================================

# ============================================================
# ADMIN / LECTURER VIEW ALL SUBMISSIONS
# ============================================================
@router.get("/submissions")
def get_all_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == RoleEnum.student:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(Submission)

    if current_user.role == RoleEnum.lecturer:
        query = query.filter(
            Submission.supervisor_id == current_user.id
        )

    submissions = query.order_by(
        Submission.created_at.desc()
    ).all()

    result = []

    for s in submissions:
        result.append({
            "id": s.id,
            "proposal_type": s.proposal_type.value,
            "proposed_title": s.proposed_title,

            # Proposal details
            "background": s.background,
            "aim": s.aim,
            "objectives": s.objectives,
            "methods": s.methods,
            "expected_results": s.expected_results,
            "literature_review": s.literature_review,

            # Similarity and CA
            "similarity_score": float(s.similarity_score or 0),
            "ca_score": s.ca_score,

            # Academic session
            "academic_session_id": s.academic_session_id,
            "academic_session": (
                s.academic_session.name
                if s.academic_session else None
            ),

            # Student information
            "student": {
                "id": s.student.id,
                "name": s.student.name,
                "email": s.student.email,
                "reg_number": s.student.reg_number,
                "matric_year": s.student.matric_year
            } if s.student else None,

            # Supervisor information
            "supervisor": {
                "id": s.supervisor.id,
                "name": s.supervisor.name,
                "email": s.supervisor.email
            } if s.supervisor else None,

            # Decisions
            "lecturer_decision": s.lecturer_decision,
            "final_decision": s.final_decision,

            # Dates
            "created_at": s.created_at
        })

    return result

