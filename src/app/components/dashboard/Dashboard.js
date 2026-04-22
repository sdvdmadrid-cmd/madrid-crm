import Link from 'next/link';

function Dashboard() {
  return (
    <nav>
      <Link href="/dashboard" className="dashboardLink">
        Dashboard
      </Link>
      <Link href="/bill-payments" className="billPaymentsLink">
        Bill Payments
      </Link>
    </nav>
  );
}

export default Dashboard;