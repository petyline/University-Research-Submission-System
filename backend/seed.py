from database import engine, Base, SessionLocal
from models import User
from passlib.hash import bcrypt

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(User).filter(User.email=='admin@uni.edu').first():
        admin = User(name='Admin', email='admin@uni.edu', password_hash=bcrypt.hash('adminpass'), role='admin')
        db.add(admin)
    if not db.query(User).filter(User.email=='lect1@uni.edu').first():
        l1 = User(name='Dr. Ada', email='lect1@uni.edu', password_hash=bcrypt.hash('lectpass1'), role='lecturer')
        l2 = User(name='Prof. Bassey', email='lect2@uni.edu', password_hash=bcrypt.hash('lectpass2'), role='lecturer')
        db.add_all([l1,l2])
        db.commit()
    if not db.query(User).filter(User.email=='student1@uni.edu').first():
        s1 = User(name='Jane Student', email='student1@uni.edu', password_hash=bcrypt.hash('studpass1'), role='student', reg_number='CSC/2025/001')
        s2 = User(name='John Student', email='student2@uni.edu', password_hash=bcrypt.hash('studpass2'), role='student', reg_number='CSC/2025/002')
        db.add_all([s1,s2])
        db.commit()
    l1 = db.query(User).filter(User.email=='lect1@uni.edu').first()
    l2 = db.query(User).filter(User.email=='lect2@uni.edu').first()
    s1 = db.query(User).filter(User.email=='student1@uni.edu').first()
    s2 = db.query(User).filter(User.email=='student2@uni.edu').first()
    if l1 and s1 and l1 not in s1.supervisors:
        s1.supervisors.append(l1)
    if l2 and s2 and l2 not in s2.supervisors:
        s2.supervisors.append(l2)
    # Ensure a single settings row exists
        settings = db.query(Settings).first()
        if not settings:
            settings = Settings(
                undergrad_mode="title",      # default as requested
                postgrad_mode="title_plus"   # default as requested
            )
            db.add(settings)
    db.commit()
    db.close()
    print('Seed complete')

if __name__=='__main__':
    seed()
