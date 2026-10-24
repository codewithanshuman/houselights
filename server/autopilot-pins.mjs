// Independently pinned manifest digests for published Autopilot records. A record
// that was edited and had every internal digest recomputed still fails against
// these pins; changing a pin is a visible, reviewable code change.
export const PINNED_MANIFESTS = Object.freeze({
  'public/autopilot-recorded.json': 'sha256:e049476c25c280b4403a0091593798908d1a3afc4c9f8d37ceb5885a97069b99',
  // 2.0 affinity record whose fits used min-max scaling; replays under that scale.
  'results/autopilot-recorded-affinity-minmax.json': 'sha256:6fc210099402fd98ae6d2873b33aba3e066dde9b94f3ca69ee675118a635175c',
  // 2.0 record captured before affinity fits; replays on ordinal ranks.
  'results/autopilot-recorded-v2-ordinal.json': 'sha256:06ca905464d63eb7166f96f545ef417b5b253e9a8e59b056f554b9889401fe65',
  'results/autopilot-recorded-v1.json': 'sha256:0267d9074222131b297b6d65b32bbc1353f532b9512c3d855f1a72a96a2fb70d',
});
