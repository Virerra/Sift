"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./admin.module.css";

const TOKEN_KEY = "sift-admin-token";

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  const fetchReports = useCallback(async (activeToken) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/reports", {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.status === 401) {
        setError("That token was rejected. Check ADMIN_TOKEN in Vercel's environment variables.");
        setToken("");
        sessionStorage.removeItem(TOKEN_KEY);
        return;
      }
      if (!res.ok) {
        setError(`Unexpected error (${res.status}).`);
        return;
      }
      const data = await res.json();
      setReports(data.reports);
    } catch {
      setError("Couldn't reach the admin API — check your connection.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchReports(token);
  }, [token, fetchReports]);

  function handleUnlock(e) {
    e.preventDefault();
    sessionStorage.setItem(TOKEN_KEY, tokenInput);
    setToken(tokenInput);
  }

  async function handleDelete(payload, confirmMessage) {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/reports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Delete failed (${res.status}).`);
        return;
      }
      await fetchReports(token);
    } catch {
      setError("Couldn't reach the admin API — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className={styles.gate}>
        <h1 className={styles.wordmark}>SIFT admin</h1>
        <p className={styles.sub}>
          This is the moderation panel for AdDashboard — not linked from
          anywhere public. Enter the admin token (set as{" "}
          <code>ADMIN_TOKEN</code> in this project&apos;s Vercel
          environment variables).
        </p>
        <form onSubmit={handleUnlock} className={styles.form}>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin token"
            className={styles.input}
          />
          <button type="submit" className={styles.btnPrimary}>Unlock</button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
      </main>
    );
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.headerRow}>
        <h1 className={styles.wordmark}>SIFT admin</h1>
        <button
          className={styles.btnSecondary}
          onClick={() => {
            sessionStorage.removeItem(TOKEN_KEY);
            setToken("");
          }}
        >
          Lock
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.bulkRow}>
        <button
          className={styles.btnSecondary}
          disabled={busy}
          onClick={() => handleDelete({ platform: "other" }, 'Delete every report with platform "other"? This usually means test/localhost data. This cannot be undone.')}
        >
          Delete all &quot;other&quot; platform reports
        </button>
        <button
          className={styles.btnDanger}
          disabled={busy}
          onClick={() => handleDelete({ all: true }, "Delete EVERY report in the dataset? This cannot be undone.")}
        >
          Delete everything
        </button>
      </div>

      {busy && !reports && <p>Loading…</p>}

      {reports && reports.length === 0 && <p className={styles.empty}>No reports in the dataset.</p>}

      {reports && reports.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Platform</th>
              <th>Child-directed</th>
              <th>Flags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.reportId}>
                <td>{new Date(r.submittedAt).toLocaleString()}</td>
                <td>{r.platform}</td>
                <td>{r.childDirected ? "yes" : "no"}</td>
                <td>{r.flagTypes.join(", ")}</td>
                <td>
                  <button
                    className={styles.btnDangerSmall}
                    disabled={busy}
                    onClick={() => handleDelete({ reportId: r.reportId }, "Delete this one report? This cannot be undone.")}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
