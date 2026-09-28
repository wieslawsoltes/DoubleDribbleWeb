# Fidelity and reference notes

## Status

This is a playable independent implementation, not an exact clone, not an emulator, and not a verified substitute for the original game's rules or assets. No original cartridge image was used for runtime execution or frame comparison. Original pixel art and audio were authored for this project.

The request's strongest requirements—pixel-perfect artwork and gameplay-perfect behavior across every difficulty—**have not been met or certified**. This file distinguishes implemented features from original-game fidelity.

## What the reference establishes

The Konami NES instruction manual establishes four selectable cities, three CPU difficulty settings, four period-length choices, one- or two-player five-on-five play, the broad button functions, a four-period match and several violations. In one-player play the opponent is Boston. The original selection interface is itself animated; the browser setup panel is not a reproduction of that interface.

The reference is the NES version, rather than the 1986 arcade game. Common release documentation dates the NES version to 1987. These versions should not be treated as the same executable or visual specification.

## Implemented versus exact behavior

| Area | This implementation | Fidelity boundary |
|---|---|---|
| Match setup | Four cities; 1P/2P; 5/10/20/30-minute periods; levels 1–3; Boston CPU in 1P | HTML setup interface replaces the original animated selection screen |
| Movement | Eight directions, ten players, scrolling court, controlled-player marker | Speeds, acceleration, collision separation, perspective and scrolling are newly tuned |
| Shooting | Hold/release B; timing, range and coverage affect probability | The original timing windows, shot tables, RNG and exact trajectories are not known or reproduced |
| Passing and defense | Aim with direction; A passes/steals; B selects nearest defender; interceptions and blocks | Receiver ranking, success probabilities, reach distance and AI logic are independent |
| Court and players | 256 × 240 logical display; original bitmap sprites, colors, wood, crowd and scoreboard | No original sprite sheets, precise NES palette matching, PPU behavior or pixel comparison |
| Dunks | Three close-up styles with hold/release timing and possible misses | Original frames, camera sequences and trigger geometry are not replicated |
| AI difficulty | Three distinct speed/reaction/shooting/steal parameter sets | Not equivalent to the original ROM's three CPU routines; no original-level win-rate calibration |
| Possession rules | 24-second shot clock, 10-second halfcourt, 5-second stationary/inbound limits, traveling and out-of-bounds | Timing origins, stoppages and edge cases are reconstructed; backcourt logic is an implementation choice |
| Fouls/free throws | Reaching/shooting fouls, a team-foul threshold, timed free throws | Original blocking/pushing detection, exact penalty conditions and foul tables are not reproduced; fifth team foul granting two shots is an implementation choice |
| Match ending | Four periods, halftime, results and tie-breaking one-minute overtime | Original intermission timing, overtime policy and victory logic are not verified |
| Audio | Synthesized basketball-like effects and an original simple menu melody | No original music, announcer recording, digitized speech or APU emulation |
| Trophy/halftime | Original simple trophy and animated halftime presentation | Not the original cinematics, halftime sprites or trophy progression |
| Saves | Full state and deterministic RNG snapshots | Browser addition, not original hardware save behavior |

## Additions rather than original features

Practice removes defenders and expiration timers. Championship chains wins through difficulties 1, 2 and 3, and records local medals. Quick clock, the timing guide, CRT overlay, live box-score panel, focus-loss pause, local recovery, keyboard mappings, gamepad support and touch interface are browser additions. Local two-player means two players sharing this browser session; there is no online multiplayer.

The three requested "levels" are represented as three CPU difficulties. This delivery does not assert that the original was a three-level tournament campaign.

## What would establish exactness

A meaningful exactness claim would require a specified original platform/region/revision, an authorized reference executable and assets, reproducible input recordings, synchronized frame/audio comparisons and state-level comparisons of physics, AI, RNG and rule transitions. Palette, overscan, clock behavior, input polling and edge-case bugs would also need to match. None of those original-ROM differential checks were performed here.

The included tests verify the new implementation's own rules and stability. Passing those tests does not demonstrate equivalence to Konami's game.

## References

1. **Konami, Double Dribble NES instruction manual.** Printed pages 4–5: match setup and jump ball; pages 6–7: controls, periods, fouls and violations; pages 8–9: dunk close-ups, inbounds and scoring. Primary source, consulted as a reference; not included in this package.
   https://www.gamesdatabase.org/Media/SYSTEM/Nintendo_NES/Manual/formated/Double_Dribble_-_1987_-_Konami.pdf
2. **Double Dribble (video game), release/version overview.** Secondary release-date context only; the manual is the reference for the broad controls and rules.
   https://en.wikipedia.org/wiki/Double_Dribble_(video_game)
3. **W3C/GPU for the Web, WebGPU specification.** Graphics API reference, not an original-game reference.
   https://www.w3.org/TR/webgpu/
4. **GPU for the Web, WebGPU Shading Language.** WGSL reference.
   https://gpuweb.github.io/gpuweb/wgsl/

Double Dribble, Konami and Nintendo names remain the property of their respective owners. Reference consultation and naming do not imply sponsorship, permission to redistribute original game assets, or trademark rights.
