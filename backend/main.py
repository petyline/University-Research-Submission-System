from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from routes_auth import router as auth_router
from routes_submissions import router as submissions_router
from routes_approval import router as approval_router
#from seed import seed

app = FastAPI(title='ML Research App')

# ✅ Allow frontend requests (CORS fix)
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://frontend:3000",  # for Docker internal calls
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       # You can use ["*"] for testing if needed
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

# ✅ Root endpoint
@app.get('/')
def root():
    return {'message': 'ML Research App backend running'}
