export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#1a1a1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '16px',
      fontFamily: 'system-ui, sans-serif', color: 'white',
      padding: '20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '64px' }}>📡</div>
      <div style={{ fontSize: '22px', fontWeight: 'bold' }}>You are offline</div>
      <div style={{ fontSize: '14px', color: '#9ca3af', maxWidth: '280px' }}>
        No internet connection. Connect to internet to sync latest data.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#3ECF8E', color: '#0f0f0f', border: 'none',
          borderRadius: '10px', padding: '12px 28px', fontWeight: 'bold',
          fontSize: '14px', cursor: 'pointer', marginTop: '8px',
        }}
      >
        Try Again
      </button>
    </div>
  )
}
