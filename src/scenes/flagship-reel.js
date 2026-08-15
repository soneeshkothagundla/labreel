/**
 * Capsule Space Labs - Flagship Experiment.
 *
 * Three minutes, one camera move. The first cut of this reel was eleven
 * separate posters, and it failed for a reason that had nothing to do with the
 * art: each scene invented its own composition, so a viewer with no background
 * re-learned where to look every eight seconds and nothing accumulated.
 *
 * This version is a single continuous shot. It opens on a vaccine vial that
 * every person in the room already recognises, pushes through the glass down to
 * one lipid nanoparticle, breaks it, and then reverses the exact same path back
 * out through the tube, the rack, the rocket, to the station. The audience is
 * never told what scale they are at. They watched the camera get there, and the
 * scale rail confirms it.
 *
 * The payoff is `merge`: the tube the camera flew through at 80 nm is sitting on
 * the ISS at 408 km, both on screen at once. That shot only reads because the
 * journey between those two numbers happened in front of them.
 *
 * The science, stated once so the scenes stay honest:
 *   Lipid nanoparticles carry mRNA. Encapsulation efficiency (EE) is
 *   (Total - Free) / Total, measured by fluorescence with and without a
 *   detergent lysis step. Freeze/thaw is the stress that makes LNPs leak.
 *   The open question is whether microgravity changes leakage, because on
 *   the ground a thawing sample convects and in orbit it does not.
 *   Nothing has flown. Every projected number carries a predicted flag.
 */

import { DEPTH } from '../core/layout.js';

export const FLAGSHIP_BEATS = [
  {
    id: 'vial',
    at: 0,
    duration: 15,
    fade: 1.2,
    title: 'An mRNA vaccine',
    subtitle: 'Billions of doses shipped in four years',
    data: { readout: 'mRNA VACCINE', depth: DEPTH.vial },
  },
  {
    id: 'chain',
    at: 14,
    duration: 17,
    fade: 1.2,
    title: 'The cold chain',
    subtitle: 'Held below −80 °C, or the dose quietly dies',
    data: { readout: '−80 °C', depth: DEPTH.vial },
  },
  {
    id: 'descend',
    at: 30,
    duration: 11,
    fade: 1.4,
    title: 'Inside the vial',
    subtitle: 'Through the glass, into the liquid',
    data: { readout: 'DESCENDING', depth: DEPTH.droplet },
  },
  {
    id: 'lnp',
    at: 40,
    duration: 19,
    fade: 1.4,
    title: 'The carrier',
    subtitle: 'A lipid nanoparticle, 80 nanometres across, holding mRNA',
    data: { readout: 'Ø 80 nm', depth: DEPTH.particle },
  },
  {
    id: 'leak',
    at: 58,
    duration: 15,
    fade: 1.2,
    title: 'The failure mode',
    subtitle: 'Freeze it, thaw it, and the shell cracks',
    data: { readout: 'EE ↓', depth: DEPTH.particle },
  },
  {
    id: 'ee',
    at: 72,
    duration: 15,
    fade: 1.2,
    title: 'Encapsulation efficiency',
    subtitle: 'How much medicine is still inside the shell',
    data: { readout: 'EE = (TOTAL − FREE) / TOTAL', depth: DEPTH.particle },
  },
  {
    id: 'ascend',
    at: 86,
    duration: 13,
    fade: 1.4,
    title: 'Back out',
    subtitle: 'One particle, one tube, sixteen tubes',
    data: { readout: '16 × 25 µL', depth: DEPTH.rack },
  },
  {
    id: 'microgravity',
    at: 98,
    duration: 19,
    fade: 1.2,
    title: 'Why orbit',
    subtitle: 'On the ground a thawing sample stirs itself. In orbit it does not.',
    data: { readout: 'g ≈ 10⁻⁶ g₀', depth: DEPTH.tube },
  },
  {
    id: 'orbit',
    at: 116,
    duration: 11,
    fade: 1.4,
    title: 'The clean room',
    subtitle: 'Orbit is not the destination',
    data: { readout: '408 km', depth: DEPTH.orbit },
  },
  {
    id: 'merge',
    at: 126,
    duration: 19,
    fade: 1.4,
    title: 'The experiment',
    subtitle: 'Sixteen tubes, two shell formulations, matched ground twins',
    data: { readout: 'n = 8 PER ARM', depth: DEPTH.orbit },
  },
  {
    id: 'readout',
    at: 144,
    duration: 17,
    fade: 1.2,
    title: 'The readout',
    subtitle: 'Blue light in, green light out, about an hour by hand',
    data: { readout: 'λ 470 → 510 nm', depth: DEPTH.tube },
  },
  {
    id: 'finalist',
    at: 160,
    duration: 11,
    fade: 1.2,
    title: 'Nothing has flown yet',
    subtitle: 'Genes in Space national finalist, top 5 of 980 submissions',
    data: { readout: 'PREDICTED', depth: DEPTH.tube },
  },
  {
    id: 'globe',
    at: 170,
    duration: 7,
    fade: 1.2,
    title: 'Why it matters',
    subtitle: 'Every mRNA therapy inherits this same fragile shell',
    data: { readout: 'COLD CHAIN', depth: DEPTH.earth },
  },
  {
    id: 'close',
    at: 176,
    duration: 4,
    fade: 1.4,
    title: 'Capsule Space Labs',
    subtitle: 'Medicine has to survive the trip',
    data: { readout: 'capsulelabs.space', depth: DEPTH.earth },
  },
];

/**
 * Global tracks.
 *
 * `depth` is the spine. It is the camera's position on the macro/nano axis,
 * 0 at one particle and 1 at the whole Earth, and it is the only thing a scene
 * needs in order to know where it sits in the journey. The renderer draws the
 * scale rail from it; scenes read `frame.values.depth` for parallax and for
 * handing off to each other without a cut.
 *
 * The cue list below *is* the camera move, written once:
 *   hold at the vial, push all the way in, hold on the particle, pull back to
 *   the bench, climb to orbit, drop to the tube for the readout, pull out to
 *   the planet.
 */
export const FLAGSHIP_TRACKS = [
  {
    key: 'depth',
    initial: DEPTH.vial,
    cues: [
      { at: 30, duration: 11, to: DEPTH.particle, ease: 'cubicInOut' }, // through the glass
      { at: 86, duration: 12, to: DEPTH.rack, ease: 'cubicInOut' }, // back out to the bench
      { at: 100, duration: 3, to: DEPTH.tube, ease: 'sineInOut' },
      { at: 116, duration: 10, to: DEPTH.orbit, ease: 'cubicInOut' }, // climb to orbit
      { at: 145, duration: 6, to: DEPTH.tube, ease: 'cubicInOut' }, // down to the tube
      { at: 168, duration: 8, to: DEPTH.earth, ease: 'cubicInOut' }, // out to the planet
    ],
  },
  {
    key: 'railFade',
    initial: 0,
    cues: [
      { at: 2, duration: 2, to: 1, ease: 'sineInOut' },
      { at: 176, duration: 2.5, to: 0, ease: 'sineInOut' },
    ],
  },
  {
    key: 'chill',
    initial: 0,
    cues: [
      { at: 14, duration: 6, to: 1, ease: 'sineInOut' },
      { at: 40, duration: 6, to: 0.2, ease: 'sineInOut' },
      { at: 58, duration: 5, to: 1, ease: 'sineInOut' },
      { at: 98, duration: 8, to: 0.35, ease: 'sineInOut' },
    ],
  },
  {
    key: 'bloom',
    initial: 0.15,
    cues: [
      { at: 72, duration: 8, to: 0.75, ease: 'cubicOut' },
      { at: 144, duration: 8, to: 0.95, ease: 'cubicOut' },
      { at: 170, duration: 6, to: 0.5, ease: 'sineInOut' },
    ],
  },
  {
    key: 'drift',
    initial: 0,
    cues: [{ at: 0, duration: 180, to: 1, ease: 'linear' }],
  },
];

export const FLAGSHIP_REEL = {
  id: 'flagship',
  title: 'Flagship Experiment',
  loop: true,
  duration: 180,
  beats: FLAGSHIP_BEATS,
  tracks: FLAGSHIP_TRACKS,
};
