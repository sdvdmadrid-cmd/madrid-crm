export default function GoogleConnectButton() {
  const handleConnect = () => {
    window.location.href = "/api/integrations/google/connect";
  };
  return (
    <button
      type="button"
      onClick={handleConnect}
      style={{
        background: "#fff",
        color: "#4285F4",
        border: "1.5px solid #4285F4",
        borderRadius: 6,
        padding: "10px 18px",
        fontWeight: 600,
        fontSize: 15,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <g>
          <path
            fill="#4285F4"
            d="M24 9.5c3.54 0 6.7 1.22 9.19 3.23l6.86-6.86C35.64 2.7 30.13 0 24 0 14.82 0 6.73 5.82 2.69 14.09l7.99 6.21C12.13 13.7 17.57 9.5 24 9.5z"
          />
          <path
            fill="#34A853"
            d="M46.1 24.55c0-1.64-.15-3.22-.42-4.74H24v9.01h12.42c-.54 2.9-2.18 5.36-4.65 7.04l7.19 5.6C43.98 37.13 46.1 31.3 46.1 24.55z"
          />
          <path
            fill="#FBBC05"
            d="M9.68 28.3c-1.13-3.36-1.13-6.94 0-10.3l-7.99-6.21C-1.13 17.18-1.13 30.82 1.69 37.91l7.99-6.21z"
          />
          <path
            fill="#EA4335"
            d="M24 46c6.13 0 11.64-2.02 15.98-5.49l-7.19-5.6c-2.01 1.35-4.6 2.14-8.79 2.14-6.43 0-11.87-4.2-13.32-10.01l-7.99 6.21C6.73 42.18 14.82 48 24 48z"
          />
          <path fill="none" d="M0 0h48v48H0z" />
        </g>
      </svg>
      Connect Google Calendar
    </button>
  );
}
