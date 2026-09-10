from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, String, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./complaints.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class Complaint(Base):
    __tablename__ = "complaints"

    complaint_id: Mapped[str] = mapped_column(String, primary_key=True)
    victim_location: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        columns = conn.execute(text("PRAGMA table_info(complaints)")).fetchall()
        if columns and not any(column[1] == "created_at" for column in columns):
            conn.execute(
                text("ALTER TABLE complaints ADD COLUMN created_at DATETIME")
            )
            conn.execute(
                text(
                    "UPDATE complaints SET created_at = CURRENT_TIMESTAMP "
                    "WHERE created_at IS NULL"
                )
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
