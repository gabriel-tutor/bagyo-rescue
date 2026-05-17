import { Link, createFileRoute } from '@tanstack/react-router';
import { CrmNavigation } from '@/features/crm/crm-crud-page';
import { crmRoutes } from '@/features/crm/crm-routes';

export const Route = createFileRoute('/records/')({
  component: RecordsIndexPage,
});

function RecordsIndexPage() {
  return (
    <main className="page page--wide">
      <section className="toolbar toolbar--records">
        <div>
          <p className="eyebrow">Supabase data access</p>
          <h1>CRM workspace</h1>
          <p className="toolbar-copy">
            Choose a dedicated data page to browse, create, update, and delete operational records.
          </p>
        </div>
      </section>

      <section className="crm-layout" aria-label="Data access routes">
        <CrmNavigation />
        <section className="crm-main">
          <div className="crm-heading">
            <div>
              <p className="eyebrow">Data modules</p>
              <h2>Operational CRM tables</h2>
              <p>Select a module to open its searchable table and record editor.</p>
            </div>
          </div>

          <ul className="crm-route-list">
            {crmRoutes.map(route => (
              <li key={route.datasetId}>
                <Link to={route.to} className="crm-route-link">
                  <span>
                    <strong>{route.label}</strong>
                    <small>{route.description}</small>
                  </span>
                  <span className="crm-route-action">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
