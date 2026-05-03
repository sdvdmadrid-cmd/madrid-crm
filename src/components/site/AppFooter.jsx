import Link from "next/link";

export default function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
        <span>© {year} FieldBase. All rights reserved.</span>
        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1"
          aria-label="Footer legal links"
        >
          <Link
            href="/legal#terms"
            className="hover:text-gray-700 transition-colors hover:underline"
          >
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}
