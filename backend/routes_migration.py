from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User, Submission
import json

router = APIRouter(
    prefix="/migrate",
    tags=["Migration"]
)

SECRET = "changeme123"

@router.post("/{secret}")
def migrate_data(secret: str, db: Session = Depends(get_db)):

    if secret != SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized migration key")

    # Load backup files
    with open("users_backup.json", "r") as f:
        users_data = json.load(f)

    with open("submissions_backup.json", "r") as f:
        submissions_data = json.load(f)

    # Insert Users
    for u in users_data:
        if not db.query(User).filter(User.id == u["id"]).first():
            user = User(
                id=u["id"],
                name=u["name"],
                email=u["email"],
                password_hash=u["password_hash"],
                role=u["role"],
                reg_number=u.get("reg_number"),
                is_approved=u.get("is_approved", False)
            )
            db.add(user)

    db.commit()

    # Insert Submissions
    for s in submissions_data:
        # Extract student_id from nested student object
        student_id = s["student"]["id"]

        if not db.query(Submission).filter(Submission.id == s["id"]).first():
            submission = Submission(
                id=s["id"],
                proposal_type=s["proposal_type"],
                proposed_title=s["proposed_title"],
                background=s["background"],
                aim=s["aim"],
                objectives=s["objectives"],
                methods=s["methods"],
                expected_results=s["expected_results"],
                literature_review=s["literature_review"],
                similarity_score=s.get("similarity_score", 0.0),
                final_decision=s.get("final_decision", "pending"),
                lecturer_decision=s.get("lecturer_decision", "pending"),
                lecturer_decision_at=s.get("lecturer_decision_at"),
                admin_decision=s.get("admin_decision", "pending"),
                student_id=student_id,
                supervisor_id=s.get("supervisor_id")
            )
            db.add(submission)

    db.commit()

    return {"message": "✅ Migration completed successfully"}
