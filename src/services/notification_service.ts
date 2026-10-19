import { getDb } from '../db/sqlite';
import { DistrictAlert } from '../types/alerts';

export type NotificationChannel = 
  | 'In-App Decision Support'
  | 'Browser Push'
  | 'SMS Mock Gateway'
  | 'WhatsApp Mock Dispatch'
  | 'Email Digest';

export interface DecisionSupportNotification {
  id: string;
  districtId: string;
  districtName: string;
  alertLevel: 'NORMAL' | 'ADVISORY' | 'WATCH' | 'WARNING' | 'EMERGENCY';
  channel: NotificationChannel;
  title: string;
  message: string;
  recommendedAction: string;
  signalsTriggered: string[];
  status: 'Delivered' | 'Dispatched (Prototype)' | 'Simulated Queue';
  recipientGroup: 'State Disaster Control Room' | 'District Collectorate' | 'Municipal Emergency Cells' | 'Field Responders' | 'Public Safety Broadcast';
  timestamp: string;
  isPrototype: boolean;
  metadata?: Record<string, any>;
}

class NotificationService {
  private inMemoryLedger: DecisionSupportNotification[] = [];

  constructor() {
    this.initLedgerTable();
  }

  private initLedgerTable() {
    try {
      const db = getDb();
      if (db) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS notification_history (
            id TEXT PRIMARY KEY,
            district_id TEXT NOT NULL,
            district_name TEXT NOT NULL,
            alert_level TEXT NOT NULL,
            channel TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            recommended_action TEXT,
            signals_triggered TEXT,
            status TEXT NOT NULL,
            recipient_group TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            is_prototype INTEGER DEFAULT 1,
            metadata TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_notif_dist ON notification_history(district_id);
          CREATE INDEX IF NOT EXISTS idx_notif_time ON notification_history(timestamp);
        `);
      }
    } catch (err) {
      console.warn('[NotificationService] SQLite notification table initialization warning:', err);
    }
  }

  /**
   * Dispatches a prototype decision support notification
   */
  public dispatchNotification(params: {
    districtId: string;
    districtName: string;
    alertLevel: 'NORMAL' | 'ADVISORY' | 'WATCH' | 'WARNING' | 'EMERGENCY';
    channel?: NotificationChannel;
    title: string;
    message: string;
    recommendedAction?: string;
    signalsTriggered?: string[];
    recipientGroup?: DecisionSupportNotification['recipientGroup'];
    metadata?: Record<string, any>;
  }): DecisionSupportNotification {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = params.channel || 'In-App Decision Support';
    const timestamp = new Date().toISOString();
    const recipientGroup = params.recipientGroup || (
      params.alertLevel === 'EMERGENCY' || params.alertLevel === 'WARNING'
        ? 'State Disaster Control Room'
        : 'District Collectorate'
    );

    const notif: DecisionSupportNotification = {
      id,
      districtId: params.districtId,
      districtName: params.districtName,
      alertLevel: params.alertLevel,
      channel,
      title: params.title,
      message: params.message,
      recommendedAction: params.recommendedAction || 'Monitor hydro-meteorological stations and maintain field liaison.',
      signalsTriggered: params.signalsTriggered || ['Model Deterministic Threshold'],
      status: channel === 'In-App Decision Support' ? 'Delivered' : 'Dispatched (Prototype)',
      recipientGroup,
      timestamp,
      isPrototype: true,
      metadata: params.metadata,
    };

    // Store in memory
    this.inMemoryLedger.unshift(notif);
    if (this.inMemoryLedger.length > 200) {
      this.inMemoryLedger.pop();
    }

    // Persist to SQLite
    try {
      const db = getDb();
      if (db) {
        const stmt = db.prepare(`
          INSERT INTO notification_history (
            id, district_id, district_name, alert_level, channel, title, message,
            recommended_action, signals_triggered, status, recipient_group, timestamp, is_prototype, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          notif.id,
          notif.districtId,
          notif.districtName,
          notif.alertLevel,
          notif.channel,
          notif.title,
          notif.message,
          notif.recommendedAction,
          JSON.stringify(notif.signalsTriggered),
          notif.status,
          notif.recipientGroup,
          notif.timestamp,
          1,
          JSON.stringify(notif.metadata || {})
        );
      }
    } catch (err) {
      console.warn('[NotificationService] Failed persisting notification to SQLite:', err);
    }

    return notif;
  }

  /**
   * Generates prototype notification broadcast for an evaluated district alert
   */
  public dispatchAlertBroadcast(alert: DistrictAlert): DecisionSupportNotification[] {
    const notifications: DecisionSupportNotification[] = [];
    const triggerNames = (alert.trigger_signals || []).map(t => t.description || t.signal_type);

    const level = alert.alert_level === 'CRITICAL' ? 'EMERGENCY' : alert.alert_level === 'HIGH' ? 'WARNING' : alert.alert_level === 'ELEVATED' ? 'WATCH' : alert.alert_level === 'WATCH' ? 'ADVISORY' : 'NORMAL';

    // 1. In-App Control Room Notification
    const inApp = this.dispatchNotification({
      districtId: alert.district_id,
      districtName: alert.district_name,
      alertLevel: level,
      channel: 'In-App Decision Support',
      title: `[${alert.alert_level}] Flood Alert: ${alert.district_name}`,
      message: alert.headline || `${alert.district_name} reached ${alert.alert_level} status with score ${alert.current_risk}/100.`,
      recommendedAction: alert.trigger_reasons?.[0] || 'Deploy field inspection team and monitor gauge networks.',
      signalsTriggered: triggerNames,
      recipientGroup: level === 'EMERGENCY' ? 'State Disaster Control Room' : 'District Collectorate',
    });
    notifications.push(inApp);

    // 2. High severity mock multi-channel dispatch (SMS / Push)
    if (alert.alert_level === 'HIGH' || alert.alert_level === 'CRITICAL') {
      const sms = this.dispatchNotification({
        districtId: alert.district_id,
        districtName: alert.district_name,
        alertLevel: level,
        channel: 'SMS Mock Gateway',
        title: `CRITICAL ALERT: ${alert.district_name}`,
        message: `EMERGENCY ALERT: High risk flood escalation detected in ${alert.district_name}. Projected Peak: ${alert.projected_risk}/100 at ${alert.peak_horizon}.`,
        recommendedAction: 'Immediate coordination with SDRF/Municipal local emergency stations.',
        signalsTriggered: triggerNames,
        recipientGroup: 'Municipal Emergency Cells',
      });
      notifications.push(sms);
    }

    return notifications;
  }

  /**
   * Retrieves notification ledger history
   */
  public getHistory(limit: number = 50, districtId?: string): DecisionSupportNotification[] {
    try {
      const db = getDb();
      if (db) {
        let query = 'SELECT * FROM notification_history';
        const params: any[] = [];
        if (districtId) {
          query += ' WHERE district_id = ? OR district_name = ?';
          params.push(districtId, districtId);
        }
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);

        const rows = db.prepare(query).all(...params) as any[];
        if (rows && rows.length > 0) {
          return rows.map(r => ({
            id: r.id,
            districtId: r.district_id,
            districtName: r.district_name,
            alertLevel: r.alert_level as any,
            channel: r.channel as any,
            title: r.title,
            message: r.message,
            recommendedAction: r.recommended_action,
            signalsTriggered: r.signals_triggered ? JSON.parse(r.signals_triggered) : [],
            status: r.status as any,
            recipientGroup: r.recipient_group as any,
            timestamp: r.timestamp,
            isPrototype: true,
            metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
          }));
        }
      }
    } catch (err) {
      console.warn('[NotificationService] Error querying SQLite history, using memory:', err);
    }

    if (districtId) {
      return this.inMemoryLedger.filter(n => n.districtId === districtId || n.districtName === districtId).slice(0, limit);
    }
    return this.inMemoryLedger.slice(0, limit);
  }

  /**
   * Get notification stats
   */
  public getStats() {
    const history = this.getHistory(200);
    const byChannel: Record<string, number> = {};
    const byLevel: Record<string, number> = {};

    for (const notif of history) {
      byChannel[notif.channel] = (byChannel[notif.channel] || 0) + 1;
      byLevel[notif.alertLevel] = (byLevel[notif.alertLevel] || 0) + 1;
    }

    return {
      totalDispatched: history.length,
      byChannel,
      byLevel,
      lastDispatchedAt: history[0]?.timestamp || null,
    };
  }
}

export const notificationService = new NotificationService();
