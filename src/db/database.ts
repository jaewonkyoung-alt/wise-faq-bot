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

    -- 학교 가이드(2026 학사제도 및 학업이수가이드)에서 추출한 공식 졸업기준.
    -- 학번 구간(year_from~year_to) 단위로 저장하고, 값은 원문 표기 그대로 문자열("57+모듈1", "2.0", "-")
    CREATE TABLE IF NOT EXISTS graduation_criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dept_no INTEGER NOT NULL,
      department TEXT NOT NULL,
      program TEXT NOT NULL DEFAULT '',
      year_label TEXT NOT NULL,
      year_from INTEGER NOT NULL,
      year_to INTEGER NOT NULL,
      student_type TEXT NOT NULL,
      affiliation TEXT,
      personality_self TEXT, personality TEXT, communication TEXT, liberal_foreign TEXT,
      digital TEXT, academic_basic TEXT, convergence TEXT, foreign_common TEXT,
      major_single TEXT, major_primary TEXT, major_double TEXT,
      total_credits TEXT, gpa TEXT, volunteer TEXT,
      lang_requirement TEXT, lang_test TEXT, thesis TEXT, notes TEXT,
      source_page INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_grad_criteria_lookup
      ON graduation_criteria(department, student_type, year_from, year_to);

    -- 학과 메타 (문의전화 · 원문 PDF) 와 별칭(옛 이름·다른 표기 → 현행 학과명)
    CREATE TABLE IF NOT EXISTS grad_departments (
      name TEXT PRIMARY KEY,
      dept_no INTEGER NOT NULL,
      homepage_name TEXT,
      phone TEXT,
      status TEXT,
      pdf_url TEXT
    );
    CREATE TABLE IF NOT EXISTS department_aliases (
      alias_key TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      department TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link_url TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notices_feed ON notices(published, pinned, updated_at);

    -- 공지 알림 구독자 (카카오 봇 사용자 키). 인증 채널이 아니라 Event API 푸시는 못 쓰므로
    -- 구독자가 다음에 말을 걸 때 새 공지를 먼저 붙여 준다.
    CREATE TABLE IF NOT EXISTS notice_subscribers (
      user_key TEXT PRIMARY KEY,
      subscribed_at TEXT NOT NULL
    );

    -- 공지별 전달 기록: 같은 공지를 같은 학생에게 두 번 보내지 않기 위함
    CREATE TABLE IF NOT EXISTS notice_deliveries (
      user_key TEXT NOT NULL,
      notice_id TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      PRIMARY KEY (user_key, notice_id)
    );
    CREATE INDEX IF NOT EXISTS idx_notice_deliveries_notice ON notice_deliveries(notice_id);

    CREATE TABLE IF NOT EXISTS kakao_sessions (
      user_key TEXT PRIMARY KEY,
      flow TEXT NOT NULL DEFAULT 'menu',
      admission_year INTEGER,
      department TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  ensureGradColumns(database);
  ensureKakaoSessionColumns(database);
}

function ensureKakaoSessionColumns(database: Database.Database): void {
  const cols = (
    database.prepare(`PRAGMA table_info(kakao_sessions)`).all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!cols.includes('college')) {
    database.exec(`ALTER TABLE kakao_sessions ADD COLUMN college TEXT`);
  }
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
