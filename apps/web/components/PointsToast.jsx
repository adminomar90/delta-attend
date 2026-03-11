'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

/* ─── event bus ─── */
const listeners = new Set();
export const emitPoints = (points) => {
  if (points > 0) listeners.forEach((fn) => fn(points));
};

/* ─── coin sound generator using Web Audio API ─── */
function playCoinSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // First ping — high metallic
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1800, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.08);
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.25);

    // Second ping — harmony
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2200, ctx.currentTime + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.18);
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.4);

    // Third ping — bright finish
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(2800, ctx.currentTime + 0.2);
    osc3.frequency.exponentialRampToValueAtTime(3400, ctx.currentTime + 0.28);
    gain3.gain.setValueAtTime(0.15, ctx.currentTime + 0.2);
    gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(ctx.currentTime + 0.2);
    osc3.stop(ctx.currentTime + 0.55);

    // Close context after everything finishes
    setTimeout(() => ctx.close(), 800);
  } catch {
    // Audio not available — silently ignore
  }
}

/* ─── Floating coin particles ─── */
function CoinParticles({ count }) {
  const particles = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 40 + Math.random() * 40,
      delay: Math.random() * 0.4,
      size: 10 + Math.random() * 10,
      drift: (Math.random() - 0.5) * 60,
    })),
  ).current;

  return particles.map((p) => (
    <span
      key={p.id}
      style={{
        position: 'absolute',
        left: `${p.x}%`,
        bottom: '20%',
        fontSize: p.size,
        opacity: 0,
        animation: `coinRise 1.2s ease-out ${p.delay}s forwards`,
        pointerEvents: 'none',
        '--drift': `${p.drift}px`,
      }}
    >
      🪙
    </span>
  ));
}

/* ─── Main Toast Component ─── */
export default function PointsToast() {
  const [queue, setQueue] = useState([]);

  const addToast = useCallback((points) => {
    const id = Date.now() + Math.random();
    setQueue((prev) => [...prev, { id, points }]);
    playCoinSound();
    setTimeout(() => setQueue((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    return () => listeners.delete(addToast);
  }, [addToast]);

  if (!queue.length) return null;

  return (
    <>
      {/* keyframes injected once */}
      <style>{`
        @keyframes toastSlideIn {
          0% { transform: translateX(120%) scale(0.7); opacity: 0; }
          60% { transform: translateX(-6%) scale(1.04); opacity: 1; }
          100% { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes toastFadeOut {
          0% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(80px); }
        }
        @keyframes coinSpin {
          0% { transform: rotateY(0deg) scale(1); }
          50% { transform: rotateY(180deg) scale(1.15); }
          100% { transform: rotateY(360deg) scale(1); }
        }
        @keyframes coinGlow {
          0%, 100% { box-shadow: 0 0 15px rgba(255,193,7,.4); }
          50% { box-shadow: 0 0 30px rgba(255,193,7,.8), 0 0 60px rgba(255,152,0,.3); }
        }
        @keyframes pointsPop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes coinRise {
          0% { opacity: 1; transform: translateY(0) translateX(0); }
          100% { opacity: 0; transform: translateY(-80px) translateX(var(--drift, 0px)); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          top: 24,
          left: 24,
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          pointerEvents: 'none',
          direction: 'rtl',
        }}
      >
        {queue.map((toast, idx) => (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 24px 14px 18px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              border: '1.5px solid rgba(255,193,7,.35)',
              boxShadow: '0 8px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05)',
              minWidth: 260,
              position: 'relative',
              overflow: 'hidden',
              animation: `toastSlideIn 0.5s cubic-bezier(.34,1.56,.64,1) forwards${idx > 0 ? `, toastFadeOut 0.4s ease-in 3s forwards` : ''}`,
              animationFillMode: 'forwards',
              animationDelay: `0s${idx === 0 ? ', 3s' : ''}`,
            }}
          >
            {/* shimmer overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,193,7,.06) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s linear infinite',
                pointerEvents: 'none',
              }}
            />

            {/* Gold coin */}
            <div
              style={{
                position: 'relative',
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #ffd54f, #f9a825 50%, #e65100 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                animation: 'coinSpin 1s ease-in-out, coinGlow 1.5s ease-in-out infinite',
                boxShadow: '0 0 20px rgba(255,193,7,.5), inset 0 -2px 4px rgba(0,0,0,.3), inset 0 2px 4px rgba(255,255,255,.4)',
                border: '2px solid #ffc107',
                flexShrink: 0,
              }}
            >
              <span style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.3))' }}>🪙</span>
            </div>

            {/* Floating particles */}
            <CoinParticles count={6} />

            {/* Text */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, zIndex: 1 }}>
              <span
                style={{
                  fontSize: 13,
                  color: '#ffd54f',
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textShadow: '0 1px 4px rgba(255,193,7,.3)',
                }}
              >
                🎉 تم منح نقاط!
              </span>
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #ffd54f 0%, #ffb300 50%, #ff8f00 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'pointsPop 0.6s cubic-bezier(.34,1.56,.64,1) 0.3s both',
                  lineHeight: 1.1,
                }}
              >
                +{toast.points}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>نقطة مكتسبة</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
