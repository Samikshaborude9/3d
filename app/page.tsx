import Scene from "@/components/Scene";

export default function Page() {
  return (
    <main>
      <Scene />
      <div className="story">
        <section id="hero" className="sec hero">
          <p className="eyebrow rv">LUMEN 85 · f/1.8 · live</p>
          <h1 className="rv">
            A lens built
            <br />
            <em>entirely from code.</em>
          </h1>
          <p className="lede rv">
            No video. No downloaded models. Every barrel, ring and blade is geometry generated in your browser, lit like a
            photo studio and directed by your scroll.
          </p>
          <p className="hint rv">Scroll ↓ &nbsp;·&nbsp; move your cursor to rotate the studio</p>
        </section>

        <section id="close" className="sec side">
          <p className="eyebrow rv">02 · close-up</p>
          <h2 className="rv">
            Hold to <em>focus.</em>
          </h2>
          <p className="lede rv">
            The knurled ring, the nine-blade iris and every click share one clock. Hold the button below and watch the
            ring spin up in slow motion. It&apos;s real simulation, no footage.
          </p>
        </section>

        <section id="apart" className="sec apart">
          <p className="eyebrow rv">03 · apart</p>
          <h2 className="rv">
            Eight parts. <em>One lens.</em>
          </h2>
        </section>

        <section id="around" className="sec apart">
          <p className="eyebrow rv">04 · around</p>
          <h2 className="rv">
            Every angle is <em>live.</em>
          </h2>
          <p className="lede rv">Metal reflects only what the studio gives it. Edges are where the light lives.</p>
        </section>

        <section id="rebuild" className="sec side">
          <p className="eyebrow rv">05 · back together</p>
          <h2 className="rv">
            0.05 mm bevels.
            <br />
            <em>That&apos;s the luxury.</em>
          </h2>
          <p className="lede rv">Satin faces, polished edges, anisotropic brushing generated as textures at boot.</p>
        </section>

        <section id="outro" className="sec outro">
          <div className="stats rv">
            <div>
              <strong>
                ~320<small>kB</small>
              </strong>
              <span>whole site</span>
            </div>
            <div>
              <strong>0</strong>
              <span>video files</span>
            </div>
            <div>
              <strong>1</strong>
              <span>canvas</span>
            </div>
          </div>
          <p className="lede rv">
            Toggle <b>Blueprint</b> in the corner. Instant proof it&apos;s geometry, not a video.
          </p>
        </section>
      </div>
    </main>
  );
}
