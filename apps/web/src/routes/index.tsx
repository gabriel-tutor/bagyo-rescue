import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useRescueReports } from '../data/use-rescue-reports';

export const Route = createFileRoute('/')({
  component: DashboardPage,
});

function DashboardPage() {
  const reportsQuery = useRescueReports();
  const reports = reportsQuery.data ?? [];

  const summary = useMemo(() => {
    return reports.reduce(
      (totals, report) => {
        totals.people += report.people;
        totals[report.priority] += 1;
        totals[report.status] += 1;
        return totals;
      },
      {
        people: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        new: 0,
        triaged: 0,
        responding: 0,
        resolved: 0,
      }
    );
  }, [reports]);

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Offline-ready coordination</p>
          <h1>Track rescue reports even when connectivity drops.</h1>
          <p>
            Families can view their own roster and nearby evacuation centers, while contact admins
            manage operational contact records.
          </p>
        </div>
        <div className="hero-actions">
          <Link to="/resident" className="button">
            Resident portal
          </Link>
          <Link to="/admin" className="button button--secondary">
            Contact admin
          </Link>
        </div>
      </section>

      <section className="metrics" aria-label="Rescue report summary">
        <article>
          <span>{reports.length}</span>
          <p>Total reports</p>
        </article>
        <article>
          <span>{summary.critical + summary.high}</span>
          <p>Urgent cases</p>
        </article>
        <article>
          <span>{summary.people}</span>
          <p>People affected</p>
        </article>
        <article>
          <span>{summary.responding}</span>
          <p>Active responses</p>
        </article>
      </section>
    </main>
  );
}
