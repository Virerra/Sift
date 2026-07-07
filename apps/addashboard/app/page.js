import { getAggregateStats } from "@/lib/db";
import DashboardCharts from "./dashboard-charts";
import styles from "./page.module.css";

// Without this, Next.js has no signal that this page's data changes over
// time (getAggregateStats() is a direct function call, not a fetch(), so
// Next's automatic static/dynamic detection can't see it) — it would get
// prerendered once at build time and serve stale numbers forever after.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await getAggregateStats();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.wordmarkRow}>
          <span className={styles.wordmark}>SIFT</span>
          <svg className={styles.mark} viewBox="0 0 100 70" aria-hidden="true">
            <rect x="4" y="4" width="60" height="42" fill="none" stroke="#0b1f3a" strokeWidth="4" />
            <rect x="20" y="16" width="60" height="42" fill="none" stroke="#0b1f3a" strokeWidth="4" />
            <rect x="36" y="28" width="60" height="42" fill="none" stroke="#111111" strokeWidth="4" />
          </svg>
        </div>
        <p className={styles.tagline}>AdDashboard — what AdSentinel is finding, aggregated.</p>
      </header>

      {!stats.usingDatabase && (
        <div className={styles.devNotice}>
          Running against the local dev store (a JSON file, not a real
          database) — no POSTGRES_URL or DATABASE_URL is set. See the
          README to connect a real Postgres database before deploying.
        </div>
      )}

      <section className={styles.summaryRow}>
        <div className={styles.summaryStat}>
          <span className={styles.summaryNumber}>{stats.reportCount}</span>
          <span className={styles.summaryLabel}>reports submitted</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryNumber}>{stats.flagCount}</span>
          <span className={styles.summaryLabel}>flags recorded</span>
        </div>
      </section>

      {stats.flagCount === 0 ? (
        <p className={styles.emptyState}>
          No submissions yet. Numbers here only reflect what real
          AdSentinel users have chosen to share — this dashboard has no
          data of its own until people opt in.
        </p>
      ) : (
        <DashboardCharts stats={stats} />
      )}

      <footer className={styles.footer}>
        <p>
          Every number here came from someone clicking &quot;Share to
          AdDashboard&quot; in AdSentinel. No accounts, no tracking —
          this is aggregate counts only, not a feed of the ads
          themselves. See the project README for what is and isn&apos;t
          collected.
        </p>
      </footer>
    </main>
  );
}
