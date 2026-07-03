// Records tool visits to localStorage so the dashboard can show "Continue Where You Left Off."
// Include this script on every tool page.
(function () {
  const META = {
    'movement-experiments.html': { name: 'Movement Experiments', icon: 'gesture' },
    'arbitrary-rules.html':      { name: 'Arbitrary Rules',      icon: 'casino' },
    'playlist-builder.html':              { name: 'Playlist Builder',     icon: 'queue_music' },
    'shorthand-library.html':             { name: 'Shorthand Library',    icon: 'book' },
    'breath-pace.html':           { name: 'Breath Pace',         icon: 'air' },
    'verb-your-body-part-direction.html':                 { name: 'Verb / Your Body Part / Direction', icon: 'edit_note' },
    'elements-of-flow.html':                  { name: 'Elements of Flow',         icon: 'checklist' },
    'pose-popcorn.html':                  { name: 'Pose Popcorn',         icon: 'conversion_path' },
    'story-starters.html':                { name: 'Story Starters',       icon: 'auto_stories' },
    'your-classes.html':                  { name: 'Your Classes',         icon: 'edit_document' },
    'your-flows.html':                    { name: 'Your Flows',           icon: 'airline_stops' },
  };

  const page = window.location.pathname.split('/').pop();
  const tool = META[page];
  if (!tool) return;

  const KEY = 'flowschool_recent';
  const entry = { ...tool, href: page, time: Date.now() };

  try {
    const recent = JSON.parse(localStorage.getItem(KEY) || '[]');
    const filtered = recent.filter(function (r) { return r.href !== entry.href; });
    localStorage.setItem(KEY, JSON.stringify([entry].concat(filtered).slice(0, 6)));
  } catch (_) {}
})();
