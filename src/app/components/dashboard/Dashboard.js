import Link from 'next/link';

function Dashboard() {
  return (
    <nav>
      <Link href="/dashboard" className="dashboardLink">
        Dashboard
      </Link>
      <Link href="/invoices" className="invoicesLink">
        Invoices
      </Link>
    </nav>
  );
}

export default Dashboard;