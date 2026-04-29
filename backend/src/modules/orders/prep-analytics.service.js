/**
 * @fileoverview Prep Time Analytics — KDS-level cook-time metrics.
 * Computes avg prep time per item, per station, hourly heatmap, SLA compliance, trends.
 * @module modules/orders/prep-analytics.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/* ─── helpers ─────────────────────────────────────────────── */

/** Seconds → "Xm Ys" */
function fmtSecs(secs) {
  if (!secs || secs <= 0) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Build a date range WHERE clause for Prisma */
function dateRange(from, to) {
  const filter = {};
  if (from) filter.gte = new Date(from);
  if (to)   filter.lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  return Object.keys(filter).length ? filter : undefined;
}

/* ─── 1. KOT-level stats per station ─────────────────────── */

/**
 * Average KOT completion time (created_at → completed_at) grouped by station.
 */
async function getStationStats(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const where = {
      outlet_id: outletId,
      is_deleted: false,
      status: 'completed',
      completed_at: { not: null },
      ...(from || to ? { created_at: dateRange(from, to) } : {}),
    };

    const kots = await prisma.kOT.findMany({
      where,
      select: { station: true, created_at: true, started_at: true, completed_at: true, items_count: true },
    });

    const map = {};
    for (const kot of kots) {
      const st = kot.station || 'KITCHEN';
      if (!map[st]) map[st] = { station: st, count: 0, total_secs: 0, cook_secs: 0, items: 0 };
      const totalSecs = (kot.completed_at - kot.created_at) / 1000;
      const cookSecs  = kot.started_at
        ? (kot.completed_at - kot.started_at) / 1000
        : totalSecs;
      map[st].count      += 1;
      map[st].total_secs += totalSecs;
      map[st].cook_secs  += cookSecs;
      map[st].items      += kot.items_count || 0;
    }

    return Object.values(map).map(s => ({
      station:          s.station,
      kots_completed:   s.count,
      items_processed:  s.items,
      avg_total_secs:   s.count ? Math.round(s.total_secs / s.count) : 0,
      avg_cook_secs:    s.count ? Math.round(s.cook_secs  / s.count) : 0,
      avg_total_fmt:    fmtSecs(s.count ? s.total_secs / s.count : 0),
      avg_cook_fmt:     fmtSecs(s.count ? s.cook_secs  / s.count : 0),
    }));
  } catch (err) {
    logger.error('getStationStats failed', { error: err.message });
    throw err;
  }
}

/* ─── 2. Item-level avg prep time ────────────────────────── */

/**
 * Average time from KOTItem creation (its KOT's created_at) to ready_at, grouped by menu item name.
 */
async function getItemStats(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const where = {
      is_deleted: false,
      status: 'ready',
      ready_at: { not: null },
      kot: {
        outlet_id: outletId,
        is_deleted: false,
        ...(from || to ? { created_at: dateRange(from, to) } : {}),
      },
    };

    const items = await prisma.kOTItem.findMany({
      where,
      select: {
        ready_at:   true,
        created_at: true,
        quantity:   true,
        kot: { select: { created_at: true, station: true } },
        order_item: { select: { name: true, kitchen_station: true } },
      },
    });

    const map = {};
    for (const item of items) {
      const name    = item.order_item?.name || 'Unknown';
      const station = item.order_item?.kitchen_station || item.kot?.station || 'KITCHEN';
      const secs    = (item.ready_at - item.kot.created_at) / 1000;
      if (secs <= 0 || secs > 7200) continue; // ignore bogus durations >2 h

      if (!map[name]) map[name] = { name, station, count: 0, total_secs: 0, min_secs: Infinity, max_secs: 0 };
      map[name].count      += 1;
      map[name].total_secs += secs;
      if (secs < map[name].min_secs) map[name].min_secs = secs;
      if (secs > map[name].max_secs) map[name].max_secs = secs;
    }

    return Object.values(map)
      .map(i => ({
        name:      i.name,
        station:   i.station,
        count:     i.count,
        avg_secs:  Math.round(i.total_secs / i.count),
        min_secs:  Math.round(i.min_secs),
        max_secs:  Math.round(i.max_secs),
        avg_fmt:   fmtSecs(i.total_secs / i.count),
        min_fmt:   fmtSecs(i.min_secs),
        max_fmt:   fmtSecs(i.max_secs),
      }))
      .sort((a, b) => b.avg_secs - a.avg_secs);
  } catch (err) {
    logger.error('getItemStats failed', { error: err.message });
    throw err;
  }
}

/* ─── 3. SLA Compliance ───────────────────────────────────── */

/**
 * % of KOTs completed within SLA (default 15 min per station).
 */
const SLA_TARGETS_SECS = {
  KITCHEN: 15 * 60,
  BAR:      5 * 60,
  DESSERT: 10 * 60,
  PACKING:  8 * 60,
  DEFAULT: 15 * 60,
};

async function getSLACompliance(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const where = {
      outlet_id: outletId,
      is_deleted: false,
      status: 'completed',
      completed_at: { not: null },
      ...(from || to ? { created_at: dateRange(from, to) } : {}),
    };

    const kots = await prisma.kOT.findMany({
      where,
      select: { station: true, created_at: true, completed_at: true },
    });

    const map = {};
    for (const kot of kots) {
      const st  = kot.station || 'KITCHEN';
      const sla = SLA_TARGETS_SECS[st] || SLA_TARGETS_SECS.DEFAULT;
      const dur = (kot.completed_at - kot.created_at) / 1000;

      if (!map[st]) map[st] = { station: st, total: 0, within_sla: 0, sla_target_secs: sla };
      map[st].total     += 1;
      if (dur <= sla) map[st].within_sla += 1;
    }

    return Object.values(map).map(s => ({
      station:          s.station,
      sla_target_secs:  s.sla_target_secs,
      sla_target_fmt:   fmtSecs(s.sla_target_secs),
      total:            s.total,
      within_sla:       s.within_sla,
      breached:         s.total - s.within_sla,
      compliance_pct:   s.total ? Math.round((s.within_sla / s.total) * 100) : 100,
    }));
  } catch (err) {
    logger.error('getSLACompliance failed', { error: err.message });
    throw err;
  }
}

/* ─── 4. Hourly heatmap ───────────────────────────────────── */

/**
 * Average prep time bucketed by hour-of-day (0–23) and day-of-week (0 Sun … 6 Sat).
 */
async function getHourlyHeatmap(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const where = {
      outlet_id: outletId,
      is_deleted: false,
      status: 'completed',
      completed_at: { not: null },
      ...(from || to ? { created_at: dateRange(from, to) } : {}),
    };

    const kots = await prisma.kOT.findMany({
      where,
      select: { created_at: true, completed_at: true },
    });

    // keyed by "dow-hour"
    const map = {};
    for (const kot of kots) {
      const dt   = new Date(kot.created_at);
      const hour = dt.getHours();
      const dow  = dt.getDay(); // 0 Sun
      const dur  = (kot.completed_at - kot.created_at) / 1000;
      const key  = `${dow}-${hour}`;
      if (!map[key]) map[key] = { dow, hour, count: 0, total_secs: 0 };
      map[key].count      += 1;
      map[key].total_secs += dur;
    }

    return Object.values(map).map(b => ({
      dow:      b.dow,
      hour:     b.hour,
      count:    b.count,
      avg_secs: Math.round(b.total_secs / b.count),
    }));
  } catch (err) {
    logger.error('getHourlyHeatmap failed', { error: err.message });
    throw err;
  }
}

/* ─── 5. Daily trend ─────────────────────────────────────── */

/**
 * Average KOT prep time per calendar day (for a sparkline chart).
 */
async function getDailyTrend(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const where = {
      outlet_id: outletId,
      is_deleted: false,
      status: 'completed',
      completed_at: { not: null },
      ...(from || to ? { created_at: dateRange(from, to) } : {}),
    };

    const kots = await prisma.kOT.findMany({
      where,
      select: { created_at: true, completed_at: true, station: true },
    });

    const map = {};
    for (const kot of kots) {
      const day = new Date(kot.created_at).toISOString().slice(0, 10);
      const dur = (kot.completed_at - kot.created_at) / 1000;
      if (!map[day]) map[day] = { date: day, count: 0, total_secs: 0 };
      map[day].count      += 1;
      map[day].total_secs += dur;
    }

    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date:     d.date,
        count:    d.count,
        avg_secs: Math.round(d.total_secs / d.count),
        avg_fmt:  fmtSecs(d.total_secs / d.count),
      }));
  } catch (err) {
    logger.error('getDailyTrend failed', { error: err.message });
    throw err;
  }
}

/* ─── 6. Summary KPIs ────────────────────────────────────── */

async function getSummary(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const where = {
      outlet_id: outletId,
      is_deleted: false,
      status: 'completed',
      completed_at: { not: null },
      ...(from || to ? { created_at: dateRange(from, to) } : {}),
    };

    const kots = await prisma.kOT.findMany({
      where,
      select: { created_at: true, completed_at: true, station: true },
    });

    if (kots.length === 0) {
      return { total_kots: 0, avg_secs: 0, avg_fmt: '—', fastest_secs: 0, slowest_secs: 0, fastest_fmt: '—', slowest_fmt: '—' };
    }

    let totalSecs = 0, minSecs = Infinity, maxSecs = 0;
    for (const kot of kots) {
      const dur = (kot.completed_at - kot.created_at) / 1000;
      totalSecs += dur;
      if (dur < minSecs) minSecs = dur;
      if (dur > maxSecs) maxSecs = dur;
    }
    const avgSecs = totalSecs / kots.length;

    return {
      total_kots:    kots.length,
      avg_secs:      Math.round(avgSecs),
      avg_fmt:       fmtSecs(avgSecs),
      fastest_secs:  Math.round(minSecs),
      slowest_secs:  Math.round(maxSecs),
      fastest_fmt:   fmtSecs(minSecs),
      slowest_fmt:   fmtSecs(maxSecs),
    };
  } catch (err) {
    logger.error('getSummary failed', { error: err.message });
    throw err;
  }
}

module.exports = {
  getStationStats,
  getItemStats,
  getSLACompliance,
  getHourlyHeatmap,
  getDailyTrend,
  getSummary,
  SLA_TARGETS_SECS,
  fmtSecs,
};
