from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import User, Submission, RoleEnum, ProposalTypeEnum
import json
import os

router = APIRouter(tags=["MIGRATION"])

# IMPORTANT: Only allow migration once
MIGRATION_SECRET = os.environ.get("MIGRATION_SECRET", "changeme123")

@router.post("/migrate/{secret}")
def migrate_data(secret: str, db: Session = Depends(get_db)):
    if secret != MIGRATION_SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized")

    # Load JSON files (ensure they are uploaded into backend/)
    with open("users_backup.json", "r") as f:
        users = json.load(f)

    with open("submissions_backup.json", "r") as f:
        submissions = json.load(f)

    # Insert Users
    for u in users:
        # Avoid duplicates
        if db.query(User).filter(User.id == u["id"]).first():
            continue
        new_user = User(
            id=u["id"],
            name=u["name"],
            email=u["email"],
            password_hash=u["password_hash"],
            role=u["role"],
            reg_number=u["reg_number"],
            is_approved=u["is_approved"]
        )
        db.add(new_user)
    db.commit()

    # Insert Submissions
    for s in submissions:
        if db.query(Submission).filter(Submission.id == s["id"]).first():
            continue
        new_sub = Submission(
            id=s["id"],
            student_id=s["student_id"],
            supervisor_id=s["supervisor_id"],
            proposal_type=s["proposal_type"],
            proposed_title=s["proposed_title"],
            background=s["background"],
            aim=s["aim"],
            objectives=s["objectives"],
            methods=s["methods"],
            expected_results=s["expected_results"],
            literature_review=s["literature_review"],
            similarity_score=s["similarity_score"],
            lecturer_decision=s["lecturer_decision"],
            admin_decision=s["admin_decision"],
            final_decision=s["final_decision"],
            created_at=s["created_at"]
        )
        db.add(new_sub)
    db.commit()

    return {"message": "Migration completed successfully"}
