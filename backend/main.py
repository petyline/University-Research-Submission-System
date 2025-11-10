from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from routes_auth import router as auth_router
from routes_submissions import router as submissions_router
from routes_approval import router as approval_router
from routes_migration import router as migration_router

#from seed import seed

app = FastAPI(title='ML Research App')

origins = [
    "https://university-research-submission-system-1.onrender.com",
    "http://localhost:3000",  # keep for local dev
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Create database tables
Base.metadata.create_all(bind=engine)

# ✅ Seed initial data
#try:
#   seed()
#except Exception as e:
#   print('Seed error:', e)

# ✅ Include route modules
app.include_router(auth_router)
app.include_router(submissions_router)
app.include_router(approval_router)
app.include_router(migration_router)

# ✅ Root endpoint
@app.get('/')
def root():
    return {'message': 'ML Research App backend running'}
