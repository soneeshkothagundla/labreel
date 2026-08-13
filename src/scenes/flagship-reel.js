/**
 * Capsule Space Labs - Flagship Experiment.
 *
 * One continuous 96-second film. No steps, no next button. Beats overlap by
 * their fade so the picture never cuts, and the reel loops cleanly because
 * beat 0 starts at t=0 and the last beat lands exactly on `duration`.
 *
 * The science, stated once so the scenes stay honest:
 *   Lipid nanoparticles carry mRNA. Encapsulation efficiency (EE) is
 *   (Total - Free) / Total, measured by fluorescence with and without a
 *   detergent lysis step. Freeze/thaw is the stress that makes LNPs leak.
 *   The open question is whether microgravity changes leakage, because on
 *   the ground a thawing sample convects and in orbit it does not.
 */

export const FLAGSHIP_BEATS = [
  {
    id: 'cold-open',
    at: 0,
    duration: 9,
    fade: 1.2,
    title: 'Flagship Experiment',
    subtitle: 'Does microgravity change how much mRNA leaks out of its carrier?',
    data: { readout: 'CAPSULE SPACE LABS' },
  },
  {
    id: 'lnp',
    at: 8,
    duration: 10,
    fade: 1.2,
    title: 'The carrier',
    subtitle: 'A lipid nanoparticle, roughly 80 nanometres across, holding mRNA',
    data: { readout: 'Ø 80 nm' },
  },
  {
    id: 'leak',
    at: 17,
    duration: 9,
    fade: 1.2,
    title: 'The failure mode',
    subtitle: 'Freezing and thawing cracks the shell, and mRNA escapes',
    data: { readout: 'EE ↓' },
  },
  {
    id: 'assay',
    at: 25,
    duration: 10,
    fade: 1.2,
    title: 'How we measure it',
    subtitle: 'Fluorescence before and after lysis gives encapsulation efficiency',
    data: { readout: 'EE = (TOTAL − FREE) / TOTAL' },
  },
  {
    id: 'formulations',
    at: 34,
    duration: 9,
    fade: 1.2,
    title: 'Sixteen tubes',
    subtitle: 'Two formulations, sealed and stressed, with matched ground controls',
    data: { readout: '16 × 25 µL' },
  },
  {
    id: 'freeze',
    at: 42,
    duration: 8,
    fade: 1.2,
    title: 'Cold chain',
    subtitle: 'Held at −80 °C from the bench to the pad',
    data: { readout: '−80 °C' },
  },
  {
    id: 'launch',
    at: 49,
    duration: 8,
    fade: 1.2,
    title: 'Ascent',
    subtitle: 'Cold stowage to the International Space Station',
    data: { readout: '408 km' },
  },
  {
    id: 'microgravity',
    at: 56,
    duration: 11,
    fade: 1.2,
    title: 'What changes up there',
    subtitle: 'No buoyancy, so a thawing sample never convects',
    data: { readout: 'g ≈ 10⁻⁶ g₀' },
  },
  {
    id: 'readout',
    at: 66,
    duration: 10,
    fade: 1.2,
    title: 'The measurement',
    subtitle: 'Fluorescence read on orbit, then again on return',
    data: { readout: 'λ 470 → 510 nm' },
  },
  {
    id: 'compare',
    at: 75,
    duration: 11,
    fade: 1.2,
    title: 'Ground against flight',
    subtitle: 'The same formulation, the same freeze, one variable removed',
    data: { readout: 'Δ EE' },
  },
  {
    id: 'why',
    at: 85,
    duration: 11,
    fade: 1.2,
    title: 'Why it matters',
    subtitle: 'Every mRNA therapy on Earth depends on surviving the cold chain',
    data: { readout: 'capsulelabs.space' },
  },
];

/**
 * Global tracks. Scenes may read `frame.values.*` for reel-wide continuity,
 * which is how the accent colour drifts from cold blue to GFP green across
 * the whole film rather than resetting per scene.
 */
export const FLAGSHIP_TRACKS = [
  {
    key: 'chill',
    initial: 0,
    cues: [
      { at: 40, duration: 6, to: 1, ease: 'sineInOut' },
      { at: 64, duration: 8, to: 0, ease: 'sineInOut' },
    ],
  },
  {
    key: 'bloom',
    initial: 0.15,
    cues: [
      { at: 56, duration: 8, to: 0.9, ease: 'cubicOut' },
      { at: 84, duration: 6, to: 0.5, ease: 'sineInOut' },
    ],
  },
  {
    key: 'drift',
    initial: 0,
    cues: [{ at: 0, duration: 96, to: 1, ease: 'linear' }],
  },
];

export const FLAGSHIP_REEL = {
  id: 'flagship',
  title: 'Flagship Experiment',
  loop: true,
  duration: 96,
  beats: FLAGSHIP_BEATS,
  tracks: FLAGSHIP_TRACKS,
};
