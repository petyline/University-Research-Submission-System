# routes_submissions.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import Submission, User, ProposalTypeEnum, Settings
from auth_jwt import get_current_user
from utils_similarity import compute_similarity_percent
from utils_email import send_email
from fastapi.responses import StreamingResponse
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from textwrap import wrap   
from utils_pdf import generate_pdf  # your PDF generator

router = APIRouter()


@router.get("/submission/{submission_id}/pdf")
def get_submission_pdf(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)  # <---- This now reads Bearer token
):
    # Fetch submission
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Access control
    if current_user.role == "student" and sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.role == "lecturer" and sub.supervisor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")


    # Generate PDF
    pdf_bytes = generate_pdf(sub)

    return StreamingResponse(
        pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=submission_{submission_id}.pdf"}
    )




# map proposal_type -> level
def get_degree_level(ptype: ProposalTypeEnum) -> str:
    if ptype in (ProposalTypeEnum.Seminar, ProposalTypeEnum.Project):
        return "undergrad"
    return "postgrad"  # Dissertation, Thesis

# JSON models (unchanged)
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

def build_text_for_mode(mode: str, title: str, parts: list[str]) -> str:
    if mode == "title":
        return title or ""
    # title_plus
    return " ".join(filter(None, [title] + parts))

@router.post("/submit")
def submit_proposal(payload: ProposalSubmission, db: Session = Depends(get_db)):
    student = db.query(User).filter(User.id == payload.student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if not student.supervisors or len(student.supervisors) == 0:
        raise HTTPException(status_code=400, detail="No supervisor assigned")

    # load settings
    settings = db.query(Settings).first()
    undergrad_mode = (settings.undergrad_mode if settings else "title")
    postgrad_mode = (settings.postgrad_mode if settings else "title_plus")
    allow_multiple = (settings.allow_multiple_submissions if settings else False)

    # 🔒 Restrict duplicate submissions
    if not allow_multiple:
        existing_same_type = db.query(Submission).filter(
            Submission.student_id == student.id,
            Submission.proposal_type == payload.proposal_type
        ).first()
        if existing_same_type:
            raise HTTPException(
                status_code=400,
                detail=f"You have already submitted a {payload.proposal_type}. Multiple submissions are not allowed."
            )

    level = get_degree_level(payload.proposal_type)
    mode = undergrad_mode if level == "undergrad" else postgrad_mode

    # gather existing texts of same proposal_type
    existing = db.query(Submission).filter(Submission.proposal_type == payload.proposal_type).all()
    existing_texts = []
    for e in existing:
        parts = [e.background, e.aim, e.objectives, e.methods, e.expected_results, e.literature_review]
        existing_texts.append(build_text_for_mode(mode, e.proposed_title, parts))

    # new text per mode
    new_parts = [
        payload.background,
        payload.aim,
        payload.objectives,
        payload.methods,
        payload.expected_results,
        payload.literature_review,
    ]
    new_text = build_text_for_mode(mode, payload.proposed_title, new_parts)

    similarity = compute_similarity_percent(new_text, existing_texts)
    supervisor = student.supervisors[0]

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

    # notify
    subj_student = "Submission received"
    body_student = (
        f"<p>Dear {student.name},</p>"
        f"<p>Your {payload.proposal_type} submission was received. "
        f"Similarity: <b>{similarity}%</b>.</p>"
    )
    send_email(student.email, subj_student, body_student)

    subj_sup = f"New submission from {student.reg_number or student.email}"
    warn = '<p style="color:red"><b>⚠️ High similarity detected</b></p>' if similarity >= 70 else ""
    body_sup = (
        f"<p>Dear {supervisor.name},</p>"
        f"<p>Student <b>{student.name} ({student.reg_number})</b> submitted a {payload.proposal_type}.</p>"
        f"<p>Similarity: <b>{similarity}%</b>.</p>{warn}<p>Please log in to review.</p>"
    )
    send_email(supervisor.email, subj_sup, body_sup)

    return {"id": submission.id, "similarity": similarity, "warning": similarity >= 70}

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

    # auth rules unchanged...
    if current_user.role == "student" and sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this submission")
    if current_user.role == "lecturer":
        student = db.query(User).filter(User.id == sub.student_id).first()
        if not student or current_user not in student.supervisors:
            raise HTTPException(status_code=403, detail="Not authorized to update this submission")

    # apply updates
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(sub, field, value)

    # recompute similarity if any content changed OR proposal_type/title changed
    fields_that_affect = {"proposal_type","proposed_title","background","aim","objectives","methods","expected_results","literature_review"}
    if any(f in payload.dict(exclude_unset=True) for f in fields_that_affect):
        settings = db.query(Settings).first()
        undergrad_mode = (settings.undergrad_mode if settings else "title")
        postgrad_mode = (settings.postgrad_mode if settings else "title_plus")

        level = get_degree_level(sub.proposal_type)
        mode = undergrad_mode if level == "undergrad" else postgrad_mode

        existing = db.query(Submission).filter(
            Submission.proposal_type == sub.proposal_type,
            Submission.id != sub.id
        ).all()
        existing_texts = []
        for e in existing:
            parts = [e.background, e.aim, e.objectives, e.methods, e.expected_results, e.literature_review]
            existing_texts.append(build_text_for_mode(mode, e.proposed_title, parts))

        parts_new = [sub.background, sub.aim, sub.objectives, sub.methods, sub.expected_results, sub.literature_review]
        new_text = build_text_for_mode(mode, sub.proposed_title, parts_new)
        sub.similarity_score = compute_similarity_percent(new_text, existing_texts)

    db.commit()
    db.refresh(sub)
    return {"id": sub.id, "similarity": sub.similarity_score, "message": "Submission updated successfully"}



@router.get("/student_submissions/{student_id}")
def get_student_submissions(student_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Only the student, their supervisor, or admin can view
    if current_user.role == "student" and current_user.id != student_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.role == "lecturer":
        student = db.query(User).filter(User.id == student_id).first()
        if student and current_user not in student.supervisors:
            raise HTTPException(status_code=403, detail="You do not supervise this student")

    # Admin always allowed

    submissions = db.query(Submission).filter(Submission.student_id == student_id).order_by(Submission.created_at.desc()).all()
    return submissions

@router.get("/submissions")
def get_all_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Admin and lecturers only:
      - Admin sees all submissions
      - Lecturer sees submissions only from students they supervise
    """

    query = db.query(Submission)

    # Lecturer restriction
    if current_user.role == "lecturer":
        query = query.filter(Submission.supervisor_id == current_user.id)

    # Students are NOT allowed to view this
    if current_user.role == "student":
        raise HTTPException(status_code=403, detail="Not authorized")

    submissions = query.order_by(Submission.created_at.desc()).all()

    result = []
    for s in submissions:
        result.append({
            "id": s.id,
            "proposal_type": s.proposal_type.value if hasattr(s.proposal_type, "value") else s.proposal_type,
            "proposed_title": s.proposed_title,
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

