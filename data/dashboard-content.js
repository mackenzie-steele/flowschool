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
  { date: '2026-08-31', title: 'Share your beta feedback', time: 'by August 31', url: 'https://docs.google.com/forms/d/e/1FAIpQLSfvfINkopQMhmT4qkZ6Pg6si5-k0ROeAM057MRIpeB2MhASsA/viewform', linkLabel: 'Open the form' },
  { date: '2026-11-09', title: 'In-Person Flow School', time: 'Nov 9–13 · Portland, Oregon', url: 'https://www.bonnieweeks.com/pages/flow-school-in-person', linkLabel: 'Sign up' },
];

// ── TRY THIS CLASS COMBO ─────────────────────────────────────────
// The featured class combo, one entry per month, keyed 'YYYY-MM'.
// The current month shows; if a month hasn't been written yet, the
// most recent earlier entry stays up (never blank, never stale-
// silently). Add a month: copy an entry, change the key, drop the
// image in img/. Set the whole object to null to hide the card.
var CLASS_COMBOS = {
  '2026-07': {
    title: 'Spinning Lotus with a Bird',
    description: "Weave these flows together to create an experience where each part builds to create a whole class experience. This can be taught as a Slo Mo Flow, things strong but only doing each pose one time (maybe two). This can also be taught to breath pace, but start slow and then build familiarity through repetition.",
    image: 'img/spinning-lotus-with-a-bird-class.jpeg',
    url: 'https://flowschool.uscreen.io/programs/spinning-lotus-with-a-bird-class',
  },
  '2026-08': {
    title: 'May I Have This Dance',
    description: "Weave these flows together to create an experience where each part builds to create a whole class experience. This can be taught as a Slo Mo Flow, things strong but only doing each pose one time (maybe two). This can also be taught to breath pace, but start slow and then build familiarity through repetition.",
    image: 'img/may-i-have-this-dance-class.jpeg',
    url: 'https://flowschool.uscreen.io/programs/may-i-have-this-dance-class',
  },
  '2026-09': {
    title: 'Side to Side Rainbow',
    description: "Weave these flows together to create an experience where each part builds to create a whole class experience. This can be taught as a Slo Mo Flow, things strong but only doing each pose one time (maybe two). This can also be taught to breath pace, but start slow and then build familiarity through repetition.",
    image: 'img/side-to-side-rainbow-class.jpeg',
    url: 'https://flowschool.uscreen.io/programs/side-to-side-rainbow-class',
  },
  '2026-10': {
    title: 'Step Up & Serve the Room',
    description: "Weave these flows together to create an experience where each part builds to create a whole class experience. This can be taught as a Slo Mo Flow, things strong but only doing each pose one time (maybe two). This can also be taught to breath pace, but start slow and then build familiarity through repetition.",
    image: 'img/step-up-and-serve-the-room-class.jpeg',
    url: 'https://flowschool.uscreen.io/programs/step-up-and-serve-the-room-class',
  },
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
