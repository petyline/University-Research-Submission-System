import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is missing!")

"""
WHY THIS CONFIGURATION?

Render Free Tier sleeps.
When it wakes, existing DB connections are STALE.
Students experience:
    - Empty submissions page
    - Random " sometimes loads, sometimes blank "
    - Must logout/login to refresh token & reload DB session

FIXES:
1. pool_pre_ping=True → checks DB connection before using it
2. pool_recycle=1800 → recycle connections every 30 mins
3. pool_size=5 / max_overflow=10 → normal pool for production
4. connect_args={"connect_timeout": 10} → prevents long hanging
5. NullPool fallback → recommended on Render Free + PostgreSQL
"""

# Use stronger connection handling
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=5,
    max_overflow=10,
    connect_args={"connect_timeout": 10},
)

# SECOND IMPORTANT FIX:
# When running on Render Free Tier, the database SLEEPS.
# If SQLAlchemy crashes due to stale pool connections,
# recommending use of NullPool.
if os.getenv("RENDER") == "true":
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool,       # ensures fresh connection ALWAYS
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10}
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    """
    Ensures CLEAN session for every request.
    Prevents zombie connections when Render sleeps.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
