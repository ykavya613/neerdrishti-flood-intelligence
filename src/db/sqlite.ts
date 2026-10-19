import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'neerdrishti.db');

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    try {
      const candidateDirs = [
        path.join(process.cwd(), 'data'),
        path.join(process.cwd(), '..', 'data'),
      ];
      let targetPath = path.join(process.cwd(), 'data', 'neerdrishti.db');
      for (const d of candidateDirs) {
        try {
          if (!fs.existsSync(d)) {
            fs.mkdirSync(d, { recursive: true });
          }
          targetPath = path.join(d, 'neerdrishti.db');
          break;
        } catch {
          // continue
        }
      }
      dbInstance = new DatabaseSync(targetPath);
      dbInstance.exec('PRAGMA foreign_keys = ON;');
    } catch (err) {
      console.warn('[SQLite] Falling back to in-memory database:', err);
      dbInstance = new DatabaseSync(':memory:');
      dbInstance.exec('PRAGMA foreign_keys = ON;');
    }
  }
  return dbInstance;
}

export interface StoredCitizenReport {
  id: number;
  district_id: string;
  location_description: string | null;
  incident_type: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Critical';
  description: string;
  image_reference: string | null;
  reported_at: string;
  created_at: string;
  classification_source: 'Meta Llama' | 'Rule-Based Fallback' | 'Manual Input';
  classification_confidence: number;
  ai_processed: number;
  status: 'New' | 'Reviewed' | 'Validated' | 'Resolved' | 'Rejected';
  // Joined classification fields
  impact?: string;
  priority?: string;
  summary?: string;
  recommended_action?: string;
  model_provider?: string;
  model_name?: string;
  processing_timestamp?: string;
}

export interface ReportClassificationRecord {
  id?: number;
  report_id: number;
  incident_type: string;
  severity: string;
  impact: string;
  priority: string;
  summary: string;
  recommended_action: string;
  model_provider: string;
  model_name: string;
  processing_timestamp: string;
}

export interface DistrictAggregationSummary {
  district: string;
  total_reports: number;
  reports_24h: number;
  high_severity_reports: number;
  critical_reports: number;
  citizen_report_score: number;
  citizen_points_contribution: number;
  recent_trend: 'Increasing' | 'Stable' | 'Decreasing';
  explainability: string;
}

export function initDatabase() {
  const db = getDb();

  // 1. DISTRICTS Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS districts (
      district_id TEXT PRIMARY KEY,
      district_name TEXT NOT NULL UNIQUE,
      monitoring_category TEXT NOT NULL,
      region_zone TEXT NOT NULL,
      data_source_mode TEXT NOT NULL,
      data_confidence TEXT NOT NULL
    );
  `);

  // 2. CITIZEN_REPORTS Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS citizen_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district_id TEXT NOT NULL,
      district TEXT,
      location_description TEXT,
      incident_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      image_reference TEXT,
      reported_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      classification_source TEXT NOT NULL,
      classification_confidence REAL DEFAULT 1.0,
      ai_processed INTEGER DEFAULT 0,
      status TEXT DEFAULT 'New'
    );
  `);

  // Migrate any legacy columns if table was created with older schema
  try {
    const pragmaStmt = db.prepare("PRAGMA table_info(citizen_reports)");
    const cols = (pragmaStmt.all() as any[]).map((c: any) => c.name);
    if (!cols.includes('district_id')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN district_id TEXT;");
      if (cols.includes('district')) {
        db.exec("UPDATE citizen_reports SET district_id = district WHERE district_id IS NULL;");
      }
    }
    if (!cols.includes('district')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN district TEXT;");
      db.exec("UPDATE citizen_reports SET district = district_id WHERE district IS NULL;");
    }
    if (!cols.includes('location_description')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN location_description TEXT;");
      if (cols.includes('location')) {
        db.exec("UPDATE citizen_reports SET location_description = location WHERE location_description IS NULL;");
      }
    }
    if (!cols.includes('incident_type')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN incident_type TEXT DEFAULT 'Waterlogging';");
      if (cols.includes('ai_category')) {
        db.exec("UPDATE citizen_reports SET incident_type = ai_category WHERE ai_category IS NOT NULL;");
      }
    }
    if (!cols.includes('image_reference')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN image_reference TEXT;");
      if (cols.includes('image_url')) {
        db.exec("UPDATE citizen_reports SET image_reference = image_url WHERE image_url IS NOT NULL;");
      }
    }
    if (!cols.includes('created_at')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN created_at TEXT;");
      if (cols.includes('reported_at')) {
        db.exec("UPDATE citizen_reports SET created_at = reported_at WHERE created_at IS NULL;");
      }
    }
    if (!cols.includes('classification_source')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN classification_source TEXT DEFAULT 'Rule-Based Fallback';");
    }
    if (!cols.includes('classification_confidence')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN classification_confidence REAL DEFAULT 1.0;");
    }
    if (!cols.includes('ai_processed')) {
      db.exec("ALTER TABLE citizen_reports ADD COLUMN ai_processed INTEGER DEFAULT 1;");
    }
  } catch (err) {
    console.error('Column migration check failed:', err);
  }

  // 3. REPORT_CLASSIFICATION Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_classification (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL UNIQUE,
      incident_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      impact TEXT NOT NULL,
      priority TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      model_name TEXT NOT NULL,
      processing_timestamp TEXT NOT NULL,
      FOREIGN KEY (report_id) REFERENCES citizen_reports(id) ON DELETE CASCADE
    );
  `);

  // 4. EXTERNAL_SIGNALS Table (Phase D1: Real-Time Data Ingestion & Signal Ledger)
  db.exec(`
    CREATE TABLE IF NOT EXISTS external_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      data_mode TEXT NOT NULL DEFAULT 'LIVE',
      freshness TEXT NOT NULL DEFAULT 'FRESH',
      confidence REAL NOT NULL DEFAULT 1.0,
      is_valid INTEGER NOT NULL DEFAULT 1,
      recorded_at TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ext_signals_district ON external_signals(district_id);
    CREATE INDEX IF NOT EXISTS idx_ext_signals_type ON external_signals(signal_type);
    CREATE INDEX IF NOT EXISTS idx_ext_signals_recorded ON external_signals(recorded_at);
  `);

  // 5. HYDROLOGICAL_STATIONS Table (Phase D2: Hydrological Signal Intelligence)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hydrological_stations (
      station_id TEXT PRIMARY KEY,
      station_name TEXT NOT NULL,
      water_body_name TEXT NOT NULL,
      water_body_type TEXT NOT NULL,
      district_id TEXT NOT NULL,
      basin TEXT,
      latitude REAL,
      longitude REAL,
      warning_threshold REAL,
      danger_threshold REAL,
      unit TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_hydro_stn_district ON hydrological_stations(district_id);
    CREATE INDEX IF NOT EXISTS idx_hydro_stn_type ON hydrological_stations(water_body_type);
  `);

  // 6. FORECAST_SNAPSHOTS Table (Phase E: Predictive Flood Risk Modeling & Forecast Intelligence)
  db.exec(`
    CREATE TABLE IF NOT EXISTS forecast_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district_id TEXT NOT NULL,
      forecast_generated_at TEXT NOT NULL,
      forecast_horizon_hours INTEGER NOT NULL,
      projected_risk_score REAL NOT NULL,
      current_risk_score REAL NOT NULL,
      projected_risk_change REAL NOT NULL,
      risk_trend TEXT NOT NULL,
      outlook_category TEXT NOT NULL,
      confidence TEXT NOT NULL,
      confidence_score REAL NOT NULL,
      data_mode TEXT NOT NULL,
      primary_drivers TEXT,
      supporting_signals TEXT,
      forecast_sources TEXT,
      limitations TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_district ON forecast_snapshots(district_id);
    CREATE INDEX IF NOT EXISTS idx_forecast_horizon ON forecast_snapshots(forecast_horizon_hours);
    CREATE INDEX IF NOT EXISTS idx_forecast_generated ON forecast_snapshots(forecast_generated_at);
  `);

  // 7. ALERTS_HISTORY Table (Phase F: Alert Intelligence and Public Safety Decision Layer)
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id TEXT NOT NULL UNIQUE,
      district_id TEXT NOT NULL,
      district_name TEXT NOT NULL,
      alert_level TEXT NOT NULL,
      alert_level_code INTEGER NOT NULL,
      primary_alert_type TEXT NOT NULL,
      headline TEXT NOT NULL,
      current_risk REAL NOT NULL,
      projected_risk REAL NOT NULL,
      peak_horizon TEXT NOT NULL,
      trend TEXT NOT NULL,
      rate_of_change TEXT NOT NULL,
      risk_delta REAL NOT NULL,
      trigger_reasons TEXT,
      trigger_signals TEXT,
      citizen_signal TEXT,
      basin_signal TEXT,
      confidence TEXT NOT NULL,
      confidence_score REAL NOT NULL,
      data_mode TEXT NOT NULL,
      advisories TEXT,
      timeline_escalation TEXT,
      secondary_alerts TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_district ON alerts_history(district_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts_history(alert_level);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts_history(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts_history(created_at);
  `);


  // Seed hydrological stations if empty
  try {
    const countStnStmt = db.prepare('SELECT COUNT(*) as count FROM hydrological_stations');
    const stnCount = (countStnStmt.get() as any)?.count || 0;
    const hydroStationsPath = path.join(process.cwd(), 'data', 'hydrological_stations.json');
    if (fs.existsSync(hydroStationsPath)) {
      const raw = fs.readFileSync(hydroStationsPath, 'utf-8');
      const stnList = JSON.parse(raw);
      if (stnCount < stnList.length) {
        const insertStn = db.prepare(`
          INSERT OR REPLACE INTO hydrological_stations (
            station_id, station_name, water_body_name, water_body_type, district_id,
            basin, latitude, longitude, warning_threshold, danger_threshold, unit, active, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const stn of stnList) {
          insertStn.run(
            stn.station_id,
            stn.station_name,
            stn.water_body_name,
            stn.water_body_type,
            stn.district_id,
            stn.basin || null,
            stn.latitude || null,
            stn.longitude || null,
            stn.warning_threshold || null,
            stn.danger_threshold || null,
            stn.unit || 'm',
            stn.active ? 1 : 0,
            stn.metadata ? JSON.stringify(stn.metadata) : null
          );
        }
      }
    }
  } catch (err) {
    console.error('Failed seeding hydrological stations:', err);
  }

  // Seed districts if empty
  const countDistrictsStmt = db.prepare('SELECT COUNT(*) as count FROM districts');
  const dCount = (countDistrictsStmt.get() as any)?.count || 0;

  if (dCount === 0) {
    const districtsJsonPath = path.join(process.cwd(), 'data', 'telangana_districts.json');
    if (fs.existsSync(districtsJsonPath)) {
      try {
        const raw = fs.readFileSync(districtsJsonPath, 'utf-8');
        const districtsList = JSON.parse(raw);
        const insertDistrict = db.prepare(`
          INSERT OR REPLACE INTO districts (
            district_id, district_name, monitoring_category, region_zone, data_source_mode, data_confidence
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const d of districtsList) {
          if (d.district_name) {
            insertDistrict.run(
              d.district_id || `TG-${d.district_name.toUpperCase().slice(0, 3)}`,
              d.district_name,
              d.monitoring_category || 'Standard Monitoring',
              d.region_zone || 'Central Telangana',
              d.data_source_mode || 'Simulated Data',
              d.data_confidence || 'Medium'
            );
          }
        }
      } catch (err) {
        console.error('Failed seeding districts:', err);
      }
    }
  }

  // Seed initial prototype reports if empty
  const countReportsStmt = db.prepare('SELECT COUNT(*) as count FROM citizen_reports');
  const rCount = (countReportsStmt.get() as any)?.count || 0;

  if (rCount === 0) {
    const now = new Date();
    const subHours = (h: number) => new Date(now.getTime() - h * 3600000).toISOString().replace('T', ' ').slice(0, 19);

    const seedReports = [
      {
        district_id: 'Hyderabad',
        location_description: 'Nadeem Colony, Tolichowki',
        incident_type: 'Water Entering Buildings',
        severity: 'High',
        description: 'Water level rising rapidly up to waist height in street 4. Drain choked with plastic debris. 4 vehicles stuck.',
        image_reference: null,
        reported_at: subHours(2),
        created_at: subHours(2),
        classification_source: 'Meta Llama',
        classification_confidence: 0.95,
        ai_processed: 1,
        status: 'New',
        classification: {
          incident_type: 'Water Entering Buildings',
          severity: 'High',
          impact: 'Residential lanes and ground floors affected',
          priority: 'Immediate Review',
          summary: 'Waist-deep water accumulation and drainage bottleneck in Nadeem Colony.',
          recommended_action: 'Avoid traveling through street 4; contact local municipal disaster team for stormwater pumping.',
          model_provider: 'Meta Llama',
          model_name: 'llama3.2:3b',
        },
      },
      {
        district_id: 'Hyderabad',
        location_description: 'Moosarambagh Causeway',
        incident_type: 'River Overflow',
        severity: 'Critical',
        description: 'Musi river water overflowing across the causeway road. Traffic completely blocked. Sluice gates open upstream.',
        image_reference: null,
        reported_at: subHours(1),
        created_at: subHours(1),
        classification_source: 'Meta Llama',
        classification_confidence: 0.98,
        ai_processed: 1,
        status: 'Validated',
        classification: {
          incident_type: 'River Overflow',
          severity: 'Critical',
          impact: 'Major arterial causeway and riverbank roads',
          priority: 'Immediate Review',
          summary: 'Musi river overtopping Moosarambagh bridge, traffic halted.',
          recommended_action: 'Maintain barricades; divert traffic via Golnaka new bridge; keep emergency rescue teams alerted.',
          model_provider: 'Meta Llama',
          model_name: 'llama3.2:3b',
        },
      },
      {
        district_id: 'Warangal',
        location_description: 'Hunter Road lowlands',
        incident_type: 'Drainage Overflow',
        severity: 'Moderate',
        description: 'Water stagnation around residential area due to silt in roadside canal. Knee-deep water on access lanes.',
        image_reference: null,
        reported_at: subHours(4),
        created_at: subHours(4),
        classification_source: 'Rule-Based Fallback',
        classification_confidence: 0.85,
        ai_processed: 1,
        status: 'Reviewed',
        classification: {
          incident_type: 'Drainage Overflow',
          severity: 'Moderate',
          impact: 'Roadside access lanes and local shops',
          priority: 'Review',
          summary: 'Silt blockage leading to knee-deep stagnation along Hunter Road.',
          recommended_action: 'Exercise caution while driving; municipal de-silting crew alerted.',
          model_provider: 'Rule Engine',
          model_name: 'Rule-Based Fallback',
        },
      },
      {
        district_id: 'Bhadradri Kothagudem',
        location_description: 'Bhadrachalam Vista Complex',
        incident_type: 'River Overflow',
        severity: 'High',
        description: 'Godavari river water reached steps of bathing ghats. Backflow entering town drainage channels.',
        image_reference: null,
        reported_at: subHours(5),
        created_at: subHours(5),
        classification_source: 'Meta Llama',
        classification_confidence: 0.94,
        ai_processed: 1,
        status: 'Validated',
        classification: {
          incident_type: 'River Overflow',
          severity: 'High',
          impact: 'Bathing ghats and low-lying riverside residential colonies',
          priority: 'Immediate Review',
          summary: 'Godavari second warning level approach with backwater surge in Bhadrachalam.',
          recommended_action: 'Move valuable items to upper floors; monitor Central Water Commission gauge updates.',
          model_provider: 'Meta Llama',
          model_name: 'llama3.2:3b',
        },
      },
      {
        district_id: 'Nirmal',
        location_description: 'Khanapur downstream path',
        incident_type: 'Road Flooding',
        severity: 'High',
        description: 'Kadam project canal overflowing near cultivation fields. Culvert submerged preventing vehicular passage.',
        image_reference: null,
        reported_at: subHours(6),
        created_at: subHours(6),
        classification_source: 'Rule-Based Fallback',
        classification_confidence: 0.88,
        ai_processed: 1,
        status: 'New',
        classification: {
          incident_type: 'Road Flooding',
          severity: 'High',
          impact: 'Culvert and rural transit route to agricultural fields',
          priority: 'High Priority',
          summary: 'Submerged culvert caused by Kadam canal spillover.',
          recommended_action: 'Avoid crossing submerged culverts; use alternate upland bypass road.',
          model_provider: 'Rule Engine',
          model_name: 'Rule-Based Fallback',
        },
      },
    ];

    for (const rep of seedReports) {
      try {
        insertReportWithClassification({
          district_id: rep.district_id,
          location_description: rep.location_description,
          incident_type: rep.incident_type,
          severity: rep.severity as any,
          description: rep.description,
          image_reference: rep.image_reference,
          reported_at: rep.reported_at,
          created_at: rep.created_at,
          classification_source: rep.classification_source as any,
          classification_confidence: rep.classification_confidence,
          status: rep.status as any,
          classification: rep.classification,
        });
      } catch (err) {
        console.error('Error inserting seed report:', err);
      }
    }
  }
}

export function insertReportWithClassification(data: {
  district_id: string;
  location_description?: string | null;
  incident_type: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Critical';
  description: string;
  image_reference?: string | null;
  reported_at?: string;
  created_at?: string;
  classification_source: 'Meta Llama' | 'Rule-Based Fallback' | 'Manual Input';
  classification_confidence?: number;
  status?: 'New' | 'Reviewed' | 'Validated' | 'Resolved' | 'Rejected';
  classification: {
    incident_type: string;
    severity: string;
    impact: string;
    priority: string;
    summary: string;
    recommended_action: string;
    model_provider?: string;
    model_name?: string;
  };
}): StoredCitizenReport {
  const db = getDb();
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const reportedAt = data.reported_at || nowStr;
  const createdAt = data.created_at || nowStr;
  const status = data.status || 'New';
  const confidence = data.classification_confidence ?? 1.0;
  const locDesc = (data.location_description || '').slice(0, 200);
  const desc = data.description.slice(0, 1000);

  db.exec('BEGIN TRANSACTION;');
  try {
    const insertRepStmt = db.prepare(`
      INSERT INTO citizen_reports (
        district_id, location_description, incident_type, severity,
        description, image_reference, reported_at, created_at,
        classification_source, classification_confidence, ai_processed, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const repResult = insertRepStmt.run(
      data.district_id,
      locDesc,
      data.incident_type,
      data.severity,
      desc,
      data.image_reference || null,
      reportedAt,
      createdAt,
      data.classification_source,
      confidence,
      1,
      status
    );

    const reportId = Number(repResult.lastInsertRowid);

    const insertClfStmt = db.prepare(`
      INSERT INTO report_classification (
        report_id, incident_type, severity, impact, priority,
        summary, recommended_action, model_provider, model_name, processing_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertClfStmt.run(
      reportId,
      data.classification.incident_type || data.incident_type,
      data.classification.severity || data.severity,
      data.classification.impact || 'Localized hazard area',
      data.classification.priority || 'Review',
      data.classification.summary || desc.slice(0, 150),
      data.classification.recommended_action || 'Avoid waterlogged areas.',
      data.classification.model_provider || (data.classification_source === 'Meta Llama' ? 'Meta Llama' : 'Rule Engine'),
      data.classification.model_name || (data.classification_source === 'Meta Llama' ? 'llama3.2:3b' : 'Rule-Based Fallback'),
      nowStr
    );

    db.exec('COMMIT;');

    const fetchStmt = db.prepare(`
      SELECT r.*,
             c.impact, c.priority, c.summary,
             c.recommended_action, c.model_provider, c.model_name, c.processing_timestamp
      FROM citizen_reports r
      LEFT JOIN report_classification c ON r.id = c.report_id
      WHERE r.id = ?
    `);

    return fetchStmt.get(reportId) as unknown as StoredCitizenReport;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

export function getReports(options: {
  district?: string;
  severity?: string;
  status?: string;
  page?: number;
  limit?: number;
}): { reports: StoredCitizenReport[]; total: number; page: number; limit: number } {
  const db = getDb();
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];

  if (options.district && options.district !== 'All') {
    conditions.push('(LOWER(r.district_id) = LOWER(?) OR LOWER(r.district) = LOWER(?))');
    params.push(options.district, options.district);
  }

  if (options.severity && options.severity !== 'All') {
    conditions.push('LOWER(r.severity) = LOWER(?)');
    params.push(options.severity);
  }

  if (options.status && options.status !== 'All') {
    conditions.push('LOWER(r.status) = LOWER(?)');
    params.push(options.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM citizen_reports r ${whereClause}`);
  const total = Number((countStmt.get(...params) as any)?.count || 0);

  const selectStmt = db.prepare(`
    SELECT r.*,
           c.impact, c.priority, c.summary,
           c.recommended_action, c.model_provider, c.model_name, c.processing_timestamp
    FROM citizen_reports r
    LEFT JOIN report_classification c ON r.id = c.report_id
    ${whereClause}
    ORDER BY r.id DESC
    LIMIT ? OFFSET ?
  `);

  const reports = selectStmt.all(...params, limit, offset) as unknown as StoredCitizenReport[];

  return {
    reports,
    total,
    page,
    limit,
  };
}

export function getReportById(id: number): StoredCitizenReport | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT r.*,
           c.impact, c.priority, c.summary,
           c.recommended_action, c.model_provider, c.model_name, c.processing_timestamp
    FROM citizen_reports r
    LEFT JOIN report_classification c ON r.id = c.report_id
    WHERE r.id = ?
  `);
  const res = stmt.get(id);
  return (res as unknown as StoredCitizenReport) || null;
}

export function updateReportStatus(id: number, status: string): StoredCitizenReport | null {
  const db = getDb();
  const valid = ['New', 'Reviewed', 'Validated', 'Resolved', 'Rejected'];
  if (!valid.includes(status)) {
    throw new Error(`Invalid status '${status}'. Must be one of: ${valid.join(', ')}`);
  }

  const updateStmt = db.prepare('UPDATE citizen_reports SET status = ? WHERE id = ?');
  updateStmt.run(status, id);

  return getReportById(id);
}

export function getDistrictAggregation(districtName: string): DistrictAggregationSummary {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT r.*, c.severity as ai_severity, c.priority
    FROM citizen_reports r
    LEFT JOIN report_classification c ON r.id = c.report_id
    WHERE (LOWER(r.district_id) = LOWER(?) OR LOWER(r.district) = LOWER(?)) AND r.status NOT IN ('Rejected', 'dismissed')
    ORDER BY r.id DESC
  `);
  const rows = stmt.all(districtName, districtName) as any[];

  const total = rows.length;
  if (total === 0) {
    return {
      district: districtName,
      total_reports: 0,
      reports_24h: 0,
      high_severity_reports: 0,
      critical_reports: 0,
      citizen_report_score: 0.0,
      citizen_points_contribution: 0.0,
      recent_trend: 'Stable',
      explainability: `No active citizen flood reports registered for ${districtName}.`,
    };
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600000);

  let reports24h = 0;
  let highCount = 0;
  let criticalCount = 0;
  let rawScore = 0.0;

  for (const r of rows) {
    const sev = (r.ai_severity || r.severity || 'Moderate').toLowerCase();
    const createdDate = new Date(r.created_at || r.reported_at || now.toISOString());
    const isRecent = createdDate >= twentyFourHoursAgo;
    const recencyWeight = isRecent ? 1.0 : 0.40;

    if (isRecent) {
      reports24h++;
    }

    let sevPts = 3.0;
    if (sev === 'critical') {
      criticalCount++;
      highCount++;
      sevPts = 30.0;
    } else if (sev === 'high') {
      highCount++;
      sevPts = 18.0;
    } else if (sev === 'moderate') {
      sevPts = 8.0;
    } else {
      sevPts = 3.0;
    }

    rawScore += (sevPts * recencyWeight);
  }

  if (highCount >= 2) {
    rawScore += Math.min(20.0, highCount * 5.0);
  }

  const citizenReportScore = Math.min(100.0, Math.round(rawScore * 100) / 100);
  const citizenPointsContribution = Math.round(citizenReportScore * 0.15 * 100) / 100;

  let trend: 'Increasing' | 'Stable' | 'Decreasing' = 'Stable';
  if (reports24h >= 3) {
    trend = 'Increasing';
  } else if (reports24h >= 1) {
    trend = 'Stable';
  } else {
    trend = 'Decreasing';
  }

  const explainability = (highCount > 0 || criticalCount > 0)
    ? `${total} reports registered (${reports24h} in last 24h), including ${highCount} High/Critical incidents. Ground field hazard telemetry contributes ${citizenPointsContribution} pts to composite flood risk index.`
    : `${total} reports registered (${reports24h} in last 24h) with minor/moderate waterlogging. Ground telemetry contributes ${citizenPointsContribution} pts.`;

  return {
    district: districtName,
    total_reports: total,
    reports_24h: reports24h,
    high_severity_reports: highCount,
    critical_reports: criticalCount,
    citizen_report_score: citizenReportScore,
    citizen_points_contribution: citizenPointsContribution,
    recent_trend: trend,
    explainability,
  };
}

export function getAllDistrictAggregations(districtNames: string[]): Record<string, DistrictAggregationSummary> {
  const result: Record<string, DistrictAggregationSummary> = {};
  for (const name of districtNames) {
    result[name] = getDistrictAggregation(name);
  }
  return result;
}

// ==========================================
// Phase D1: EXTERNAL SIGNAL DAL OPERATIONS
// ==========================================

export interface InsertSignalInput {
  district_id: string;
  source_name: string;
  source_type: string;
  signal_type: string;
  value: number;
  unit: string;
  data_mode?: 'LIVE' | 'HISTORICAL' | 'SIMULATED' | 'UNAVAILABLE';
  freshness?: 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED';
  confidence?: number;
  is_valid?: number; // 1 or 0
  recorded_at: string;
  ingested_at?: string;
  metadata?: any;
}

export function insertExternalSignal(input: InsertSignalInput): number {
  const db = getDb();
  const ingestedAt = input.ingested_at || new Date().toISOString();
  const dataMode = input.data_mode || 'LIVE';
  const freshness = input.freshness || 'FRESH';
  const confidence = input.confidence !== undefined ? input.confidence : 1.0;
  const isValid = input.is_valid !== undefined ? input.is_valid : 1;
  const metaStr = input.metadata ? (typeof input.metadata === 'string' ? input.metadata : JSON.stringify(input.metadata)) : null;

  const stmt = db.prepare(`
    INSERT INTO external_signals (
      district_id, source_name, source_type, signal_type,
      value, unit, data_mode, freshness, confidence,
      is_valid, recorded_at, ingested_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    input.district_id,
    input.source_name,
    input.source_type,
    input.signal_type,
    input.value,
    input.unit,
    dataMode,
    freshness,
    confidence,
    isValid,
    input.recorded_at,
    ingestedAt,
    metaStr
  );

  return Number(info.lastInsertRowid);
}

export function detectDuplicateSignal(
  districtId: string,
  sourceName: string,
  signalType: string,
  recordedAt: string
): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id FROM external_signals
    WHERE district_id = ? AND source_name = ? AND signal_type = ? AND recorded_at = ?
    LIMIT 1
  `);
  const row = stmt.get(districtId, sourceName, signalType, recordedAt);
  return Boolean(row);
}

export function getLatestRainfallSignal(districtId: string): any | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM external_signals
    WHERE district_id = ? AND signal_type = 'rainfall' AND is_valid = 1
    ORDER BY recorded_at DESC
    LIMIT 1
  `);
  const row = stmt.get(districtId);
  return row || null;
}

export function getDistrictSignals(districtId: string, limit: number = 20): any[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM external_signals
    WHERE district_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `);
  return stmt.all(districtId, limit) as any[];
}

export function getAllHydrologicalStations(districtId?: string): any[] {
  const db = getDb();
  if (districtId) {
    const stmt = db.prepare(`
      SELECT * FROM hydrological_stations
      WHERE district_id = ?
      ORDER BY station_name ASC
    `);
    return stmt.all(districtId) as any[];
  }
  const stmt = db.prepare('SELECT * FROM hydrological_stations ORDER BY district_id, station_name ASC');
  return stmt.all() as any[];
}

export function getHydrologicalStationById(stationId: string): any | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM hydrological_stations WHERE station_id = ? LIMIT 1');
  return (stmt.get(stationId) as any) || null;
}

export function insertHydrologicalStation(stn: {
  station_id: string;
  station_name: string;
  water_body_name: string;
  water_body_type: string;
  district_id: string;
  basin?: string;
  latitude?: number;
  longitude?: number;
  warning_threshold?: number;
  danger_threshold?: number;
  unit: string;
  active?: number;
  metadata?: any;
}): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO hydrological_stations (
      station_id, station_name, water_body_name, water_body_type, district_id,
      basin, latitude, longitude, warning_threshold, danger_threshold, unit, active, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const metaStr = stn.metadata ? (typeof stn.metadata === 'string' ? stn.metadata : JSON.stringify(stn.metadata)) : null;
  stmt.run(
    stn.station_id,
    stn.station_name,
    stn.water_body_name,
    stn.water_body_type,
    stn.district_id,
    stn.basin || null,
    stn.latitude || null,
    stn.longitude || null,
    stn.warning_threshold || null,
    stn.danger_threshold || null,
    stn.unit,
    stn.active !== undefined ? stn.active : 1,
    metaStr
  );
}

export function getLatestHydrologicalSignals(districtId?: string, signalType?: string): any[] {
  const db = getDb();
  const hydroTypes = [
    'river_level',
    'river_flow',
    'reservoir_level',
    'reservoir_storage',
    'reservoir_release',
    'dam_discharge',
    'hydrological_alert'
  ];

  if (districtId && signalType) {
    const stmt = db.prepare(`
      SELECT * FROM external_signals
      WHERE district_id = ? AND signal_type = ? AND is_valid = 1
      ORDER BY recorded_at DESC
    `);
    return stmt.all(districtId, signalType) as any[];
  } else if (districtId) {
    const placeholders = hydroTypes.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT * FROM external_signals
      WHERE district_id = ? AND signal_type IN (${placeholders}) AND is_valid = 1
      ORDER BY recorded_at DESC
    `);
    return stmt.all(districtId, ...hydroTypes) as any[];
  } else if (signalType) {
    const stmt = db.prepare(`
      SELECT * FROM external_signals
      WHERE signal_type = ? AND is_valid = 1
      ORDER BY recorded_at DESC
    `);
    return stmt.all(signalType) as any[];
  } else {
    const placeholders = hydroTypes.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT * FROM external_signals
      WHERE signal_type IN (${placeholders}) AND is_valid = 1
      ORDER BY recorded_at DESC
    `);
    return stmt.all(...hydroTypes) as any[];
  }
}

export function getStationSignalHistory(
  districtId: string,
  signalType: string,
  stationId?: string,
  limit: number = 10
): any[] {
  const db = getDb();
  if (stationId) {
    const stmt = db.prepare(`
      SELECT * FROM external_signals
      WHERE district_id = ? AND signal_type = ? AND is_valid = 1
        AND (metadata LIKE ? OR source_name LIKE ?)
      ORDER BY recorded_at DESC
      LIMIT ?
    `);
    return stmt.all(districtId, signalType, `%"station_id":"${stationId}"%`, `%${stationId}%`, limit) as any[];
  }
  const stmt = db.prepare(`
    SELECT * FROM external_signals
    WHERE district_id = ? AND signal_type = ? AND is_valid = 1
    ORDER BY recorded_at DESC
    LIMIT ?
  `);
  return stmt.all(districtId, signalType, limit) as any[];
}

// -------------------------------------------------------------
// Phase E: Forecast Snapshots Database Operations
// -------------------------------------------------------------

export function insertForecastSnapshot(data: {
  district_id: string;
  forecast_generated_at: string;
  forecast_horizon_hours: number;
  projected_risk_score: number;
  current_risk_score: number;
  projected_risk_change: number;
  risk_trend: string;
  outlook_category: string;
  confidence: string;
  confidence_score: number;
  data_mode: string;
  primary_drivers?: any[];
  supporting_signals?: any[];
  forecast_sources?: string[];
  limitations?: string[];
  metadata?: Record<string, any>;
}): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO forecast_snapshots (
      district_id, forecast_generated_at, forecast_horizon_hours,
      projected_risk_score, current_risk_score, projected_risk_change,
      risk_trend, outlook_category, confidence, confidence_score, data_mode,
      primary_drivers, supporting_signals, forecast_sources, limitations,
      metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const info = stmt.run(
    data.district_id,
    data.forecast_generated_at,
    data.forecast_horizon_hours,
    data.projected_risk_score,
    data.current_risk_score,
    data.projected_risk_change,
    data.risk_trend,
    data.outlook_category,
    data.confidence,
    data.confidence_score,
    data.data_mode,
    data.primary_drivers ? JSON.stringify(data.primary_drivers) : null,
    data.supporting_signals ? JSON.stringify(data.supporting_signals) : null,
    data.forecast_sources ? JSON.stringify(data.forecast_sources) : null,
    data.limitations ? JSON.stringify(data.limitations) : null,
    data.metadata ? JSON.stringify(data.metadata) : null,
    now
  );

  return Number(info.lastInsertRowid);
}

export function getLatestDistrictForecastSnapshots(districtId: string): any[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM forecast_snapshots
    WHERE district_id = ?
    ORDER BY forecast_generated_at DESC, forecast_horizon_hours ASC
    LIMIT 4
  `);
  return stmt.all(districtId) as any[];
}

export function insertAlertRecord(alert: any): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO alerts_history (
      alert_id, district_id, district_name, alert_level, alert_level_code,
      primary_alert_type, headline, current_risk, projected_risk, peak_horizon,
      trend, rate_of_change, risk_delta, trigger_reasons, trigger_signals,
      citizen_signal, basin_signal, confidence, confidence_score, data_mode,
      advisories, timeline_escalation, secondary_alerts, status, created_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    alert.alert_id,
    alert.district_id,
    alert.district_name,
    alert.alert_level,
    alert.alert_level_code ?? 0,
    alert.primary_alert_type,
    alert.headline,
    alert.current_risk,
    alert.projected_risk,
    alert.peak_horizon,
    alert.trend,
    alert.rate_of_change,
    alert.risk_delta,
    alert.trigger_reasons ? JSON.stringify(alert.trigger_reasons) : null,
    alert.trigger_signals ? JSON.stringify(alert.trigger_signals) : null,
    alert.citizen_signal ? JSON.stringify(alert.citizen_signal) : null,
    alert.basin_signal ? JSON.stringify(alert.basin_signal) : null,
    alert.confidence,
    alert.confidence_score ?? 0.8,
    alert.data_mode,
    alert.advisories ? JSON.stringify(alert.advisories) : null,
    alert.timeline_escalation ? JSON.stringify(alert.timeline_escalation) : null,
    alert.secondary_alerts ? JSON.stringify(alert.secondary_alerts) : null,
    alert.status || 'Active',
    alert.created_at || new Date().toISOString(),
    alert.resolved_at || null
  );

  return Number(info.lastInsertRowid);
}

export function getAlertsHistoryForDistrict(districtId: string, limit = 20): any[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM alerts_history
    WHERE district_id = ? OR district_name = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(districtId, districtId, limit) as any[];
}

export function getAllAlertsHistory(limit = 100): any[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM alerts_history
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit) as any[];
}

export function updateAlertStatus(alertId: string, status: string): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE alerts_history
    SET status = ?, resolved_at = ?
    WHERE alert_id = ?
  `);
  const resolvedAt = (status === 'Resolved' || status === 'Acknowledged') ? new Date().toISOString() : null;
  const result = stmt.run(status, resolvedAt, alertId);
  return result.changes > 0;
}


