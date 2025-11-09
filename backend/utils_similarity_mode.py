from sqlalchemy.orm import Session
from models import Settings, ProposalTypeEnum, Submission
from utils_similarity import compute_similarity_percent

def get_similarity_mode(submission: Submission, db: Session):
    settings = db.query(Settings).first()
    if not settings:
        return "title_plus"  # fallback for safety
    
    # Undergraduate
    if submission.proposal_type in (ProposalTypeEnum.Seminar, ProposalTypeEnum.Project):
        return settings.undergrad_mode

    # Postgraduate
    return settings.postgrad_mode


def build_text_for_similarity(submission: Submission, mode: str):
    # Always include title
    parts = [submission.proposed_title or ""]

    if mode == "title_plus":
        parts += [
            submission.background or "",
            submission.aim or "",
            submission.objectives or "",
            submission.methods or "",
            submission.expected_results or "",
            submission.literature_review or "",
        ]

    return "\n".join([p.strip() for p in parts if p])


def calculate_submission_similarity(submission: Submission, db: Session):
    mode = get_similarity_mode(submission, db)

    new_text = build_text_for_similarity(submission, mode)

    # Build corpus from existing submissions (excluding self)
    existing_texts = []
    all_other_submissions = (
        db.query(Submission)
        .filter(Submission.id != submission.id)
        .all()
    )

    for s in all_other_submissions:
        text = build_text_for_similarity(s, mode)
        existing_texts.append(text)

    # Call your original TF-IDF cosine similarity function
    score = compute_similarity_percent(new_text, existing_texts)
    return score
