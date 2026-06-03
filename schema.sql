-- ═══════════════════════════════════════════════════════════
--  Geoform Monitor — MySQL Schema
--  Run this ONCE in your MySQL database to create all tables.
-- ═══════════════════════════════════════════════════════════

-- Main vessel table (mirrors your Excel sheet)
CREATE TABLE IF NOT EXISTS vessels (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  principal        VARCHAR(100),
  vessel           VARCHAR(150) UNIQUE NOT NULL,
  pic              VARCHAR(80),
  last_approved    VARCHAR(20),
  issue            TEXT,
  issue_type       VARCHAR(100),
  biofuel          VARCHAR(10),
  biofuel_onboard  VARCHAR(10),
  issue_month      VARCHAR(20),
  resolved_month   VARCHAR(20),
  year_end         VARCHAR(50),
  updated_by       VARCHAR(80),
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_principal (principal),
  INDEX idx_pic       (pic)
);

-- Audit log — every single edit is recorded here permanently
CREATE TABLE IF NOT EXISTS audit_log (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  vessel        VARCHAR(150)  NOT NULL,
  principal     VARCHAR(100),
  field_changed VARCHAR(80)   NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  updated_by    VARCHAR(80),
  ts            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_vessel (vessel),
  INDEX idx_ts     (ts)
);

-- MoM error trend (populated via Excel sync or manual entry)
CREATE TABLE IF NOT EXISTS mom_errors (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  manager     VARCHAR(150)  NOT NULL,
  week_label  VARCHAR(30)   NOT NULL,
  error_count INT DEFAULT 0,

  UNIQUE KEY uq_manager_week (manager, week_label)
);
