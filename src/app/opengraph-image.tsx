import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #eaf1f7 0%, #dfeaf4 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              width: 140,
              height: 140,
              borderRadius: 32,
              background: '#f5f8fd',
              border: '6px solid #114ea9',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 78,
                height: 78,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #e8705f, #c8493a)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4 10-11" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: '-3px' }}>
            <div style={{ display: 'flex', color: '#114ea9' }}>Submit</div>
            <div style={{ display: 'flex', color: '#d95c4c' }}>Check</div>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 32, color: '#55657a' }}>
          Get submission-ready. Get closer to acceptance.
        </div>
      </div>
    ),
    { ...size }
  );
}
