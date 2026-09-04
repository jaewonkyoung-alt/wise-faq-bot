import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DEFAULT_DB = path.resolve(process.cwd(), 'data', 'wise.db');

let db: Database.Database | null = null;

export function getDbPath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
    : DEFAULT_DB;
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      contact TEXT,
      meeting_time TEXT,
      location TEXT,
      intro TEXT NOT NULL DEFAULT '',
      activities TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs(name);
    CREATE INDEX IF NOT EXISTS idx_clubs_category ON clubs(category);

    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id TEXT NOT NULL,
      chunk_kind TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_club ON embeddings(club_id);

    CREATE TABLE IF NOT EXISTS unanswered_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      reason TEXT NOT NULL,
      route TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_unanswered_created ON unanswered_questions(created_at);

    CREATE TABLE IF NOT EXISTS graduation_requirements (
      id TEXT PRIMARY KEY,
      admission_year INTEGER NOT NULL,
      department TEXT NOT NULL,
      major_type TEXT,
      total_credits INTEGER,
      major_credits INTEGER,
      general_credits INTEGER,
      notes TEXT,
      source_url TEXT,
      verified_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(admission_year, department, major_type)
    );

    CREATE INDEX IF NOT EXISTS idx_grad_year ON graduation_requirements(admission_year);
    CREATE INDEX IF NOT EXISTS idx_grad_dept ON graduation_requirements(department);

    CREATE TABLE IF NOT EXISTS kakao_sessions (
      user_key TEXT PRIMARY KEY,
      flow TEXT NOT NULL DEFAULT 'menu',
      admission_year INTEGER,
      department TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  ensureGradColumns(database);
}

function ensureGradColumns(database: Database.Database): void {
  const cols = (
    database.prepare(`PRAGMA table_info(graduation_requirements)`).all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  const add = (name: string, ddl: string) => {
    if (!cols.includes(name)) {
      database.exec(`ALTER TABLE graduation_requirements ADD COLUMN ${ddl}`);
    }
  };
  add('thesis_required', 'thesis_required INTEGER');
  add('english_requirement', 'english_requirement TEXT');
  add('license_requirement', 'license_requirement TEXT');
  add('track', 'track TEXT');
}
