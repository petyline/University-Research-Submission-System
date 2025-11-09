# models.py
from sqlalchemy import Column, Integer, String, Float, Enum, ForeignKey, DateTime, Table, Text, Boolean, event
from sqlalchemy.orm import relationship
from database import Base
import enum
from datetime import datetime



class RoleEnum(str, enum.Enum):
    student = "student"
    lecturer = "lecturer"
    admin = "admin"

class ProposalTypeEnum(str, enum.Enum):
    Seminar = "Seminar"
    Project = "Project"
    Dissertation = "Dissertation"
    Thesis = "Thesis"

# NEW: global settings to control similarity modes
# mode values: "title" or "title_plus"
class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    undergrad_mode = Column(String, default="title")       # "title" or "title_plus"
    postgrad_mode = Column(String, default="title_plus")   # "title" or "title_plus"

student_supervisors = Table(
    "student_supervisors",
    Base.metadata,
    Column("student_id", Integer, ForeignKey("users.id")),
    Column("lecturer_id", Integer, ForeignKey("users.id"))
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), nullable=False)
    reg_number = Column(String, nullable=True)
    is_approved = Column(Boolean, default=False)

    supervisors = relationship(
        'User',
        secondary=student_supervisors,
        primaryjoin=id == student_supervisors.c.student_id,
        secondaryjoin=id == student_supervisors.c.lecturer_id,
        backref='students'
    )

    submissions = relationship("Submission", back_populates="student", foreign_keys='Submission.student_id')

class Submission(Base):
    __tablename__ = "submissions"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"))
    supervisor_id = Column(Integer, ForeignKey("users.id"))
    proposal_type = Column(Enum(ProposalTypeEnum), default=ProposalTypeEnum.Seminar)
    proposed_title = Column(String, nullable=False)
    background = Column(Text)
    aim = Column(Text)
    objectives = Column(Text)
    methods = Column(Text)
    expected_results = Column(Text)
    literature_review = Column(Text)
    similarity_score = Column(Float, default=0.0)
    lecturer_decision = Column(String, default="pending")
    admin_decision = Column(String, default="pending")
    final_decision = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    lecturer_decision_at = Column(DateTime, nullable=True)

    student = relationship("User", foreign_keys=[student_id], back_populates="submissions")
    supervisor = relationship("User", foreign_keys=[supervisor_id])


@event.listens_for(Submission, "load")
def fix_datetime_on_load(submission, _):
    # If date fields were stored as text, convert safely
    if isinstance(submission.created_at, str):
        try:
            submission.created_at = datetime.fromisoformat(submission.created_at)
        except:
            submission.created_at = datetime.utcnow()

    if isinstance(submission.lecturer_decision_at, str):
        try:
            submission.lecturer_decision_at = datetime.fromisoformat(submission.lecturer_decision_at)
        except:
            submission.lecturer_decision_at = None
