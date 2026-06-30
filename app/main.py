from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
from app.classifier import classify_batch
from fastapi import Header, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from app.models import (Base,Prediction,SessionLocal,User,_DUMMY_HASH,_hash_password,_verify_password,engine,)
from sqlalchemy import text
import os
from typing import Optional


class ClassifyRequest(BaseModel):
	pixels: list[list[int]]
	username: Optional[str] = None

class ClassifyResponse(BaseModel):
	prediction: str
	confidence: float
	scores: dict[str, float]

class RegisterRequest(BaseModel):
	username: str
	password: str

class LoginRequest(BaseModel):
	username: str
	password: str

app = FastAPI()


@app.on_event("startup")
def ensure_database_tables() -> None:
	# Fehlende Tabellen erstellen, falls sie nicht existieren.
	Base.metadata.create_all(bind=engine)
	# Kompatibilität: predictions.username hinzufügen, falls fehlt.
	# Gab beim testen Errors. wenn 41 - 42 fehlte.
	with engine.begin() as conn:
		conn.execute(text("ALTER TABLE IF EXISTS predictions ADD COLUMN IF NOT EXISTS username VARCHAR"))

@app.get("/health")
def health():
	return {"status": "ok", "model_version": "v1"}


# wenn username angegeben
# dann die letzten 20 Ergebnisse für diesen username zurückgeben.
@app.get("/results")
def results(username: Optional[str] = None):
	db = SessionLocal()
	query = db.query(Prediction).order_by(Prediction.created_at.desc())
	if username:
		query = query.filter(Prediction.username == username)
	rows = query.limit(20).all()
	db.close()
	return {"results": [{	"id": r.id,
				"prediction": r.prediction,
				"confidence": r.confidence,
				"model_version": r.model_version,
				"created_at": r.created_at.isoformat(),
				"username": r.username}
	for r in rows]}


#erstellt Benutzer.
#Name wird auf duplikate geprüft.
#Passwort wird gehashed und gespeichert.
@app.post("/auth/register")
def register(req: RegisterRequest):
	if not req.username.strip() or len(req.username) > 69:
		raise HTTPException(status_code=422, detail="Username must be 1–69 characters")
	if len(req.password) < 1 or len(req.password) > 69:
		raise HTTPException(status_code=422, detail="Password must be 1–69 characters")
	db = SessionLocal()
	existing = db.query(User).filter(User.username == req.username.strip()).first()
	if existing:
		db.close()
		raise HTTPException(status_code=400, detail="Username already taken")
	db.add(User(username=req.username.strip(), password=_hash_password(req.password)))
	db.commit()
	db.close()
	return {"status": "ok"}



#Loginfunktion.
#für Angreifer wird Dummy_Hash verwendet.
@app.post("/auth/login")
def login(req: LoginRequest):
	db = SessionLocal()
	user = db.query(User).filter(User.username == req.username).first()
	db.close()
	stored = user.password if user else _DUMMY_HASH
	if not user or not _verify_password(req.password, stored):
		raise HTTPException(status_code=401, detail="Invalid username or password")
	return {"username": user.username}


limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

def verify_api_key(x_api_key: str = Header(...)):
	if x_api_key != os.getenv("SECRET_API_KEY"):
		raise HTTPException(status_code=401, detail="Invalid API key")

@app.post("/classify", response_model=ClassifyResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("30/minute")
def classify(request: Request, req: ClassifyRequest):
	arr = np.array(req.pixels, dtype=np.uint8)[np.newaxis]
	result = classify_batch(arr)[0]
	db = SessionLocal()
	db.add(Prediction(prediction=result["prediction"], confidence=result["confidence"], model_version="v1", username=req.username))
	db.commit()
	db.close()
	return result