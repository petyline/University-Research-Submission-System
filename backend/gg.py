from sqlalchemy import text
from database import SessionLocal
from datetime import datetime

db = SessionLocal()

# Replace corrupted created_at values with current timestamp
db.execute(text("""
UPDATE submissions
SET created_at = :now
WHERE created_at NOT LIKE '%-%-% %:%:%'
   OR created_at IS NULL
"""), {"now": datetime.utcnow().isoformat()})

# Replace corrupted lecturer_decision_at with NULL
db.execute(text("""
UPDATE submissions
SET lecturer_decision_at = NULL
WHERE lecturer_decision_at IS NOT NULL
  AND lecturer_decision_at NOT LIKE '%-%-% %:%:%'
"""))

db.commit()
db.close()

exit()
