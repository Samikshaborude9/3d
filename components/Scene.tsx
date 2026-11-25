"use client";

import { useEffect, useRef, useState } from "react";
import type { Engine } from "@/lib/engine";

export default function Scene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLButtonElement>(null);
  const engine = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [bp, setBp] = useState(false);
  const [err, setErr] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    let dead = false;
    let eng: Engine | null = null;
    (async () => {
      try {
        const { Engine } = await import("@/lib/engine");
        if (dead) return;
        eng = new Engine({ canvas: canvasRef.current!, labelsEl: labelsRef.current!, holdEl: holdRef.current! });
        await eng.init();
        if (dead) {
          eng.dispose();
          return;
        }
        engine.current = eng;
        eng.start();
        setReady(true);
      } catch (e) {
        console.error(e);
        if (!dead) setErr(true);
      }
    })();

    // Scroll-driven reveals (observers skip beats on heavy GPU frames)
    const rv = () => {
      const h = innerHeight;
      document.querySelectorAll<HTMLElement>(".rv").forEach((el) => {
        const r = el.getBoundingClientRect();
        el.classList.toggle("in", r.top < h * 0.88 && r.bottom > h * 0.05);
      });
    };
    rv();
    addEventListener("scroll", rv, { passive: true });
    addEventListener("resize", rv);
    return () => {
      dead = true;
      removeEventListener("scroll", rv);
      removeEventListener("resize", rv);
      eng?.dispose();
      engine.current = null;
    };
  }, []);

  const press = () => {
    engine.current?.hold(true);
    if (!armed) {
      setArmed(true);
      void engine.current?.enableSensors();
    }
  };
  const release = () => engine.current?.hold(false);

  return (
    <>
      <canvas ref={canvasRef} className="stage" aria-label="Live 3D camera lens" role="img" />
      <div ref={labelsRef} className="labels" aria-hidden="true" />

      <header className="bar">
        <span className="brand">
          <i /> LUMEN 85
        </span>
        <button
          className="toggle"
          aria-pressed={bp}
          onClick={() => {
            const n = !bp;
            setBp(n);
            engine.current?.setBlueprint(n);
          }}
        >
          Blueprint {bp ? "on" : "off"}
        </button>
      </header>

      <button
        ref={holdRef}
        className="hold"
        aria-label="Hold to focus. Also enables sound and phone tilt."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            press();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") release();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="44" className="track" />
          <circle cx="50" cy="50" r="44" className="prog" />
        </svg>
        <span>
          {armed ? "HOLD" : "HOLD TO"}
          <br />
          FOCUS
        </span>
      </button>
      {!armed && ready && <p className="tap">Hold also switches on sound &amp; phone tilt</p>}

      <div className={`loader ${ready || err ? "gone" : ""}`} aria-live="polite">
        <span>{err ? "WebGL is not available on this device." : "COMPILING SHADERS"}</span>
      </div>
    </>
  );
}
