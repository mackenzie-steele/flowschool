// ─── FLOW SCHOOL — DASHBOARD CONTENT ─────────────────────────────────────────
//
// Everything on the dashboard that changes over time lives here, so it can
// be updated without touching any HTML. Edit the text, save the file, done.
//
// ─────────────────────────────────────────────────────────────────────────────

// ── UPCOMING EVENTS ──────────────────────────────────────────────
// Date format: 'YYYY-MM-DD'. Past events hide themselves automatically.
// 'url' is optional — when present, a link renders; 'linkLabel' sets its
// text (defaults to 'Sign up').
var EVENTS = [
  { date: '2026-07-08', title: 'New Course Drop: Circle Flows', time: '', url: '' },
  { date: '2026-07-31', title: 'Beta feedback due', time: '', url: 'https://docs.google.com/forms/d/e/1FAIpQLSfvfINkopQMhmT4qkZ6Pg6si5-k0ROeAM057MRIpeB2MhASsA/viewform', linkLabel: 'Share feedback' },
];

// ── NEW DROP ─────────────────────────────────────────────────────
// The featured release card. Set to null to hide the card entirely.
var NEW_DROP = {
  tag: 'Slo Mo Flow',
  title: 'Pigeon Kick Through & Tree Lean',
  description: "A full class plan for a slow & strong flow. Can be taught once per side or repeated depending on time. Works well for all-levels vinyasa that doesn't lean on repetition or sun salutations.",
  image: 'img/slo-mo-flow-cover.jpg',
  url: 'https://flowschool.uscreen.io/programs/slo-mo-pigeon-kick-through-tree-lean',
};

// ── THIS MONTH ───────────────────────────────────────────────────
// One entry per month, keyed 'YYYY-MM'. The current month shows; if a
// month hasn't been written yet, the most recent earlier entry stays up
// (so the card never goes blank or stale-silently).
var THIS_MONTH = {
  '2026-07': {
    title: 'Everything is an experiment.',
    body: "July is for your own mat. Once a week, pick a Movement Experiment, press play on a song you love, and move without a plan. No audience. No getting it right. What you find when nobody's watching is what your students will remember. Play before you plan — it isn't a warm-up for the real work. It is the real work.",
    ctaLabel: 'Start a Movement Experiment',
    ctaHref: 'movement-experiments.html',
  },
};
