from sqlalchemy import (Column, Integer, String, Float, DateTime, create_engine)
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone
import hashlib
import os
import secrets
from dotenv import load_dotenv

load_dotenv()

Base = declarative_base()

# Gibt Hash mit random Salt zurück.
def _hash_password(plain: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 123_456)
    return f"{salt.hex()}${dk.hex()}"

# Dummy hash damit Angreifer nicht erkennen können,
# ob ein Benutzer existiert oder nicht.
_DUMMY_HASH = _hash_password("dummy")


#Passwort vergleich.
def _verify_password(input: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", input.encode(), salt, 123_456)
    return secrets.compare_digest(dk.hex(), dk_hex)


#Benutzertabelle definieren.
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)

class Prediction(Base):
    __tablename__ = "predictions"
    id = Column(Integer, primary_key=True)
    prediction = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    model_version = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    #Benutzername einfügen, um das Ergebnis einem Benutzer zuzuordnen.
    username = Column(String, nullable=True)

# Build the connection string in code from a single plain secret.
# DB_PASSWORD is a literal value with no ${...}, so bash, python-dotenv,
# and systemd's EnvironmentFile all read it identically. Interpolating
# ${DB_PASSWORD} inside .env would break under systemd, which does not
# expand variables in an EnvironmentFile.
DB_PASSWORD = os.getenv("DB_PASSWORD")
DATABASE_URL = f"postgresql://pixelwise:{DB_PASSWORD}@localhost/pixelwise"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)