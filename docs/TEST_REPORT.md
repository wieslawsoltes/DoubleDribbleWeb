# Delivery verification report

**Build:** 0.1.0, 28 September 2026.

## Results

| Verification | Result | Scope |
|---|---|---|
| Node test suite | **59 passed, 0 failed** | 47 simulation tests, 4 fixed-tick input tests, 8 storage tests |
| Standalone build | **Passed** | Ten source modules; embedded CSS and JavaScript; syntax checked; approximately 140 KiB per HTML entry point |
| Chromium integration suite | **32 passed, 0 failed** | Application startup, setup, controls, dialogs, saves, special scenes, responsive layout and emulated devices |
| Uncaught browser JavaScript errors | **0** | Across the completed desktop and mobile integration run |
| WebGPU runtime / WGSL compilation | **Not tested** | Browser context did not expose `navigator.gpu` |
| Canvas 2D rendering | **Passed** | The actual backend used in the integration run |
| Native browser persistence | **Not tested** | Integration tests explicitly used an in-memory storage substitute |
| Original-ROM differential comparison | **Not performed** | No claim of frame, pixel, sound or gameplay equivalence |

The machine-readable browser results are in [browser-test-results.json](browser-test-results.json). The included test suites reproduce the implementation checks; screenshots show this implementation, not comparison captures from the original game.

## Simulation coverage

The headless suite exercises the four teams and period choices, three difficulty settings, deterministic RNG, movement normalization, timed tip-offs, shot release, traveling, aimed passing, interceptions, two/three-point scoring, assists, blocks, rebounds, inbounds, possession violations, fouls and free throws. It covers all three dunk presentation styles, misses, buzzer-beaters, halftime basket changes, overtime, pause/final immutability, practice mode, quick clock, and state/RNG restoration.

Three accelerated CPU-versus-CPU matches and randomized mixed inputs across the five internal modes are checked for finite positions, valid ownership and consistent scoring totals. These tests use deliberately short test periods and controlled fixtures; they are not a full battery of 30-minute-period human playthroughs.

High-refresh input tests retain presses and releases between 120/144 Hz render samples and a 60 Hz simulation tick, and check that catch-up ticks do not repeat edges. Storage tests cover missing APIs, malformed/oversized JSON, invalid snapshots, quota failure, paused-copy semantics and preserving preferences independently from match data.

Fixtures sometimes freeze off-ball AI or force a shot outcome to isolate a specific rule. This is intentional unit testing, not evidence of an exact original-game probability model.

## Browser coverage

The tested standalone HTML was executed in Chromium with `page.set_content` in an opaque `about:blank` context. The environment's browser navigation policy disallowed ordinary page navigation; no policy was changed or bypassed. The storage substitute and the opt-in debug hook were injected only into the test copy, not shipped as part of the playable HTML.

The suite verifies setup selection, two-player initialization, pause/resume, help-dialog suspension, keyboard movement, hold/release shooting, passing, independent player-two controls, save/resume application logic, reset confirmation, CRT/mute preferences, halftime/final/dunk rendering, championship advancement, and standard gamepad mapping.

Responsive checks ran at 1440 × 1040, 390 × 844 and 320 × 740 CSS pixels with no horizontal document overflow. Emulated two-contact touch input exercised independent pointer capture for movement plus shoot, including release. This does not replace testing on physical touchscreens. Gamepad mappings were tested with a simulated standard Gamepad API object, not physical hardware.

Observed screenshots and integration checks used **Canvas 2D**. WebGPU initialization, shader compilation, validation scopes, buffer submission, device-loss handling and GPU/Canvas image equivalence require a separate run on a supported secure-origin browser. The included WebGPU implementation is real code, but it was not exercised by these passing browser checks.

## Not certified

No native GPU performance, cross-browser compatibility, accessibility certification, physical gamepad/touch behavior, native local-storage reload survival, long-duration endurance, or original-hardware fidelity claim is made. The built-in FPS value measures observed requestAnimationFrame cadence; it is not a GPU timestamp or a performance guarantee. Audio synthesis was initialized through interaction, but its sound quality was not independently listening-tested.

The complete source was uploaded to [wieslawsoltes/DoubleDribbleWeb](https://github.com/wieslawsoltes/DoubleDribbleWeb) on 28 September 2026. The source checksum, 59 Node tests, standalone build and 32 Chromium checks passed again in the [remote import run](https://github.com/wieslawsoltes/DoubleDribbleWeb/actions/runs/36417301649). All five preview images were regenerated by that run.

The permanent [build, test and deployment workflow](../.github/workflows/ci.yml) repeats verification for pushes and pull requests, then publishes successful `main` builds to [GitHub Pages](https://wieslawsoltes.github.io/DoubleDribbleWeb/). Its post-deployment check requests the public page over HTTPS and verifies the source commit and HTML SHA-256 against `build-info.json`. The standalone game, browser report/previews, and deployment verification record are retained as workflow artifacts. See [Actions](https://github.com/wieslawsoltes/DoubleDribbleWeb/actions) for the current deployment result.

## Reproduce

```sh
npm run check
python tests/browser_smoke.py
```

Python Playwright is an optional test-only dependency. For a supported local browser with a real origin, run `npm start`, then:

```sh
python tests/browser_smoke.py --url 'http://localhost:8080/?test=1'
```

That second mode uses the served app's actual local storage and available renderer. Review its reported backend before drawing any conclusion about WebGPU testing.
