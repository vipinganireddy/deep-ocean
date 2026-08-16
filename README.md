# Deep Ocean — Interactive Clownfish Reef

A meditative, interactive 2D canvas game showcasing graphics programming, physics simulation, and creative coding in vanilla JavaScript.

**[▶ Play it live](https://deep-ocean-iota.vercel.app/)**

## What It Is

Guide an Ocellaris clownfish through a sunlit reef. Tap to drop food. Watch it eat, swim with realistic physics, and nestle into its sea anemone home. A complete interactive world rendered entirely from code.

## Technical Highlights

### Graphics
- **Procedural rendering** — fish, anemone, reef, and food drawn with canvas 2D API (no images)
- **Volumetric shading** — radial gradients simulate 3D form on a 2D fish
- **Real-time effects** — caustic light, god rays, depth fog, particle shadows
- **Animation** — eyelid blinks, mouth opens when eating, fins flap realistically

### Physics & Interaction
- **Boid-inspired steering** — companion fish school and avoid the player
- **Momentum-based movement** — fish has inertia; speed affects turn radius (realistic swim)
- **Procedural animation** — sine-wave tail beat drives swimming motion
- **Tap-to-feed** — interactive food drops follow cursor position

### Engineering
- **Zero build step** — no bundler, transpiler, or framework; open `index.html` and it runs
- **Separated concerns** — markup, styles, and ~1,700 lines of game logic in their own files
- **No dependencies** — pure vanilla JS + HTML Canvas
- **60 FPS stable** — frame-rate independent timing, tab-switch resilience
- **Responsive** — works on desktop and mobile browsers

## How to Play

1. Click **Play**
2. Move cursor to steer the fish
3. Tap the water to drop gold food
4. Watch it eat, explore, and sleep in its anemone

## Code Stats

- **Lines:** ~1,700 JS · ~600 CSS
- **Language:** Vanilla JavaScript (ES6+)
- **Rendering:** HTML Canvas 2D API
- **Dependencies:** None
- **Build step:** None (static files)

## Project Layout

```
index.html    markup and metadata
game.js       game engine — rendering, physics, animation
styles.css    UI and landing-screen styling
logo.png      clownfish logo (rendered from the game's own draw code)
favicon.png   tab icon
preview.png   Open Graph image for link previews
```

## Why This Project

Built as a portfolio demonstration of:
- Graphics programming without WebGL
- Game loop design and state management
- Physics and procedural animation
- Attention to visual polish and user experience

This is not a "game" in the competitive sense — it's an interactive experience that shows technical depth and creative problem-solving.

## Deploy It Yourself

**Vercel** (recommended):
1. Push to GitHub
2. Go to vercel.com → New Project → select repo → Deploy
3. Live in 1 minute

**Anywhere static files work:**
- GitHub Pages
- Netlify
- Cloudflare Pages

## License

Public domain. Use as inspiration, reference, or starting point for your own work.

---

Made for the portfolio. Enjoy the reef.
