# database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

DATABASE_URL = os.environ.get("postgresql://university_research_db_user:ehnr44SsLZF7luJHWtoVukPJpzmCDNjn@dpg-d48otcre5dus73cb0680-a.oregon-postgres.render.com/university_research_db")  # <-- THIS WILL COME FROM RENDER

engine = create_engine(DATABASE_URL, connect_args={})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
