from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import io

app = FastAPI()

# --- НАСТРОЙКИ БД ---
DB_USER = "root"
DB_PASSWORD = "5150079As1!!"
DB_HOST = "localhost"
DB_NAME = "polystat"

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"
engine = create_engine(DATABASE_URL)

# Создаем фабрику сессий (нужно для Depends)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Функция для получения сессии БД (обязательна для Depends)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- МОДЕЛИ (Pydantic) ---
class CompetitionCreate(BaseModel):
    name: str
    date: str
    discipline: str
    period: str
    location: str

# --- РОУТЫ ---

# 1. Создание карточки соревнования (POST /competitions)
@app.post("/competitions")
def create_competition(comp: CompetitionCreate, db: Session = Depends(get_db)):
    result = db.execute(text("""
        INSERT INTO competitions (name, date, discipline, period, location)
        VALUES (:name, :date, :discipline, :period, :location)
    """), {
        "name": comp.name,
        "date": comp.date,
        "discipline": comp.discipline,
        "period": comp.period,
        "location": comp.location
    })
    db.commit()
    competition_id = result.lastrowid
    return {"id": competition_id, "name": comp.name, "date": comp.date}

# 2. Загрузка Excel (POST /upload-excel)
# ВАЖНО: Теперь обязательно передавай competition_id, чтобы привязать результаты к конкретному турниру
@app.post("/upload-excel")
async def upload_excel(
    file: UploadFile = File(...), 
    competition_id: int = None, # Теперь это обязательный параметр для привязки
    db: Session = Depends(get_db)
):
    if competition_id is None:
        raise HTTPException(status_code=400, detail="Необходимо указать competition_id для привязки результатов")

    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Только .xlsx или .xls")

    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать файл: {str(e)}")

    # Критически важно: названия колонок в Excel должны точно совпадать с этим списком
    required_cols = ["full_name", "birth_date", "gender", "age_group", "city", "place", "total_score"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"В Excel нет колонок: {', '.join(missing)}. Доступные: {list(df.columns)}")

    inserted_athletes = 0
    inserted_results = 0
    updated_results = 0

    for _, row in df.iterrows():
        # ЛОГИКА СПОРТСМЕНА: Ищем по ФИО + Дата рождения
        athlete_res = db.execute(text("""
            SELECT id FROM athletes
            WHERE full_name = :name AND birth_date = :bd
        """), {"name": str(row["full_name"]), "bd": str(row["birth_date"])}).fetchone()

        if athlete_res:
            athlete_id = athlete_res # Берем первый элемент кортежа (ID)
        else:
            res = db.execute(text("""
                INSERT INTO athletes (full_name, birth_date, gender, age_group, city)
                VALUES (:name, :bd, :gender, :ag, :city)
            """), {
                "name": str(row["full_name"]),
                "bd": str(row["birth_date"]),
                "gender": str(row["gender"]),
                "ag": str(row["age_group"]),
                "city": str(row["city"])
            })
            db.commit()
            athlete_id = res.lastrowid
            inserted_athletes += 1

        # ЛОГИКА РЕЗУЛЬТАТА: Вставляем или обновляем
        existing_res = db.execute(text("""
            SELECT id FROM results
            WHERE athlete_id = :aid AND competition_id = :cid
        """), {"aid": athlete_id, "cid": competition_id}).fetchone()

        place_val = int(row["place"]) if pd.notna(row["place"]) else None
        score_val = float(row["total_score"]) if pd.notna(row["total_score"]) else None

        if existing_res:
            rid = existing_res
            db.execute(text("""
                UPDATE results SET place = :place, points = :points, score = :score
                WHERE id = :rid
            """), {
                "rid": rid,
                "place": place_val,
                "points": score_val,
                "score": str(row["total_score"])
            })
            updated_results += 1
        else:
            db.execute(text("""
                INSERT INTO results (athlete_id, competition_id, place, points, score)
                VALUES (:aid, :cid, :place, :points, :score)
            """), {
                "aid": athlete_id,
                "cid": competition_id,
                "place": place_val,
                "points": score_val,
                "score": str(row["total_score"])
            })
            inserted_results += 1
        
        db.commit() # Коммитим после каждой строки, чтобы не потерять данные при ошибке в середине файла

    return {
        "message": "Успешно",
        "competition_id": competition_id,
        "athletes_added": inserted_athletes,
        "results_added": inserted_results,
        "results_updated": updated_results
    }

# 3. Получение данных (GET)
@app.get("/competitions")
def get_competitions(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM competitions ORDER BY date DESC"))
    return [dict(row._mapping) for row in rows]

@app.get("/athletes")
def get_athletes(limit: int = 100, db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM athletes LIMIT :lim"), {"lim": limit})
    return [dict(row._mapping) for row in rows]

@app.get("/results")
def get_results(competition_id: int, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT a.full_name, a.gender, a.age_group, a.city,
               c.name AS competition_name, r.place, r.points, r.score
        FROM results r
        JOIN athletes a ON r.athlete_id = a.id
        JOIN competitions c ON r.competition_id = c.id
        WHERE r.competition_id = :cid
        ORDER BY r.place
    """), {"cid": competition_id})
    return [dict(row._mapping) for row in rows]

@app.get("/")
def read_root():
    return {"status": "API работает"}

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
