# routes_submissions.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import Submission, User, ProposalTypeEnum, Settings
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
def submit_proposal(payload: ProposalSubmission, db: Session = Depends(get_db)):

    student = (
        db.query(User)
        .filter(User.id == payload.student_id, User.role == "student")
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if not student.supervisors or len(student.supervisors) == 0:
        raise HTTPException(status_code=400, detail="No supervisor assigned")

    supervisor = student.supervisors[0]

    # SETTINGS
    settings = db.query(Settings).first()
    undergrad_mode = settings.undergrad_mode if settings else "title"
    postgrad_mode = settings.postgrad_mode if settings else "title_plus"
    allow_multiple = settings.allow_multiple_submissions if settings else False

    # ENFORCE ONE SUBMISSION PER TYPE
    if not allow_multiple:
        existing_same_type = db.query(Submission).filter(
            Submission.student_id == student.id,
            Submission.proposal_type == payload.proposal_type
        ).first()

        if existing_same_type:
            raise HTTPException(
                status_code=400,
                detail=f"You have already submitted a {payload.proposal_type}. "
                       f"Multiple submissions of the same type are not allowed."
            )

    # Determine similarity mode
    level = get_degree_level(payload.proposal_type)
    mode = undergrad_mode if level == "undergrad" else postgrad_mode

    # Build text for similarity
    existing = db.query(Submission).filter(
        Submission.proposal_type == payload.proposal_type
    ).all()

    existing_texts = []
    for e in existing:
        parts = [
            e.background, e.aim, e.objectives, e.methods,
            e.expected_results, e.literature_review
        ]
        existing_texts.append(build_text_for_mode(mode, e.proposed_title, parts))

    new_parts = [
        payload.background, payload.aim, payload.objectives,
        payload.methods, payload.expected_results, payload.literature_review
    ]
    new_text = build_text_for_mode(mode, payload.proposed_title, new_parts)

    similarity = compute_similarity_percent(new_text, existing_texts)

    # SAVE SUBMISSION
    submission = Submission(
        student_id=student.id,
        supervisor_id=supervisor.id,
        proposal_type=payload.proposal_type,
        proposed_title=payload.proposed_title,
        background=payload.background,
        aim=payload.aim,
        objectives=payload.objectives,
        methods=payload.methods,
        expected_results=payload.expected_results,
        literature_review=payload.literature_review,
        similarity_score=similarity,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # Notify student
    send_email(
        student.email,
        "Submission received",
        f"<p>Your {payload.proposal_type} submission was received. Similarity: <b>{similarity}%</b>.</p>"
    )

    # Notify supervisor
    warn = '<p style="color:red"><b>⚠ High similarity detected</b></p>' if similarity >= 70 else ""
    send_email(
        supervisor.email,
        f"New submission from {student.reg_number or student.email}",
        f"""
        <p>Student <b>{student.name} ({student.reg_number})</b> submitted a {payload.proposal_type}.</p>
        <p>Similarity: <b>{similarity}%</b>.</p>
        {warn}
        <p>Please log in to review.</p>
        """
    )

    return {"id": submission.id, "similarity": similarity}


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

    # Access control
    if current_user.role == "student" and current_user.id != sub.student_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.role == "lecturer":
        student = db.query(User).filter(User.id == sub.student_id).first()
        if not student or current_user not in student.supervisors:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Prevent duplicate type on change
    settings = db.query(Settings).first()
    allow_multiple = settings.allow_multiple_submissions if settings else False

    if payload.proposal_type and not allow_multiple:
        duplicate = db.query(Submission).filter(
            Submission.student_id == sub.student_id,
            Submission.proposal_type == payload.proposal_type,
            Submission.id != sub.id
        ).first()

        if duplicate:
            raise HTTPException(
                status_code=400,
                detail=f"You already have a {payload.proposal_type} submission. Cannot change type."
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
@router.get("/student_submissions/{student_id}")
def get_student_submissions(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if current_user.role == "student" and current_user.id != student_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.role == "lecturer":
        student = db.query(User).filter(User.id == student_id).first()
        if student and current_user not in student.supervisors:
            raise HTTPException(status_code=403, detail="Not authorized")

    submissions = db.query(Submission).filter(
        Submission.student_id == student_id
    ).order_by(Submission.created_at.desc()).all()

    return submissions


# ============================================================
#   ADMIN / LECTURER VIEW ALL SUBMISSIONS
# ============================================================
@router.get("/submissions")
def get_all_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role == "student":
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(Submission)

    if current_user.role == "lecturer":
        query = query.filter(Submission.supervisor_id == current_user.id)

    submissions = query.order_by(Submission.created_at.desc()).all()

    result = []
    for s in submissions:
        result.append({
            "id": s.id,
            "proposal_type": s.proposal_type.value,
            "proposed_title": s.proposed_title,

            # RETURN ALL FIELDS NEEDED IN LECTURER PANEL
            "background": s.background,
            "aim": s.aim,
            "objectives": s.objectives,
            "methods": s.methods,
            "expected_results": s.expected_results,
            "literature_review": s.literature_review,

            "similarity_score": float(s.similarity_score or 0),

            "student": {
                "id": s.student.id,
                "name": s.student.name,
                "email": s.student.email,
                "reg_number": s.student.reg_number
            } if s.student else None,

            "supervisor": {
                "id": s.supervisor.id,
                "name": s.supervisor.name,
                "email": s.supervisor.email
            } if s.supervisor else None,

            "lecturer_decision": s.lecturer_decision,
            "final_decision": s.final_decision,
            "created_at": s.created_at
        })

    return result
