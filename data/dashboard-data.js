// MOCK DATA — replace with Supabase query to `user_skill_progress` when ready.
// Score formula: Math.min(100, Math.round(minutes / 1200 * 100))
// 20 hours = 1,200 minutes = 100%
var SKILL_MAP_DATA = [
  { skill: 'Sequencing',      minutes: 420, score: 35 },
  { skill: 'Cueing',          minutes: 240, score: 20 },
  { skill: 'Class Structure', minutes: 180, score: 15 },
  { skill: 'Storytelling',    minutes:  90, score:  8 },
];

// Tool-to-skill mapping — attributes session time to skill categories.
// Future: store in Supabase table `tool_skill_mappings`.
var TOOL_SKILL_MAP = {
  'arbitrary-rules.html':      ['Sequencing'],
  'movement-experiments.html': ['Sequencing'],
  'pose-library.html':                  ['Sequencing', 'Class Structure'],
  'verb-your-body-part-direction.html': ['Cueing'],
  'breath-pace.html':           ['Cueing'],
  'playlist-builder.html':              ['Class Structure'],
  'story-starters.html':                ['Storytelling'],
  'your-classes.html':                  ['Sequencing', 'Class Structure'],
};

// Suggested next action per weakest skill — includes link to the relevant tool
var SKILL_SUGGESTIONS = {
  'Sequencing':      { pre: 'Try 10 minutes with ', tool: 'Arbitrary Rules', post: ' to grow Sequencing.',     href: 'arbitrary-rules.html' },
  'Cueing':          { pre: 'Try 10 minutes in ',   tool: 'Verb / Your Body Part / Direction', post: ' to build cueing skills.', href: 'verb-your-body-part-direction.html' },
  'Class Structure': { pre: 'Try 10 minutes in ',   tool: 'the Playlist Builder',     post: ' to grow Class Structure.', href: 'playlist-builder.html'          },
  'Storytelling':    { pre: 'Shape a class arc in the ', tool: 'Playlist Builder', post: ' — controlling energy over time is the foundation of storytelling.', href: 'playlist-builder.html' },
};

var NEXT_STEPS = [
  {
    trigger: 'movement-experiments.html',
    title:   'Add creative structure',
    desc:    "You've been exploring movement. Now give it a rule. Arbitrary Rules adds a creative constraint to your next class so the movement has direction.",
    href:    'arbitrary-rules.html',
    label:   'Generate a Rule',
  },
  {
    trigger: 'arbitrary-rules.html',
    title:   'Build the soundscape',
    desc:    "You set the constraint. Now build the playlist to match. Use the Playlist Builder to shape the energy arc of your class.",
    href:    'playlist-builder.html',
    label:   'Build a Playlist',
  },
  {
    trigger: 'playlist-builder.html',
    title:   'Write your cues',
    desc:    "You have the music. Now sharpen the language. Use Verb / Your Body Part / Direction to map out your verb, body part, and direction cues for each section of your class.",
    href:    'verb-your-body-part-direction.html',
    label:   'Open Verb / Your Body Part / Direction',
  },
  {
    trigger: 'verb-your-body-part-direction.html',
    title:   'Put it into shorthand',
    desc:    "You've been writing your cues. Now encode your sequences using Flow School shorthand so you can track and recall them over time.",
    href:    'pose-library.html',
    label:   'Open Pose Library',
  },
  {
    trigger: 'pose-library.html',
    title:   'Take your notes into movement',
    desc:    "You've been documenting sequences. Take one into a movement experiment and see what changes when you add a creative constraint.",
    href:    'movement-experiments.html',
    label:   'Start a Movement Experiment',
  },
  {
    trigger: 'breath-pace.html',
    title:   'Build the playlist around the breath',
    desc:    "You've been working on breath pacing. Now build a playlist whose energy arc mirrors the breath pattern you want to teach.",
    href:    'playlist-builder.html',
    label:   'Build a Playlist',
  },
  {
    trigger: 'elements-of-flow.html',
    title:   'Take it into movement',
    desc:    "You've been reviewing your flow. Take one of the sequences into a movement experiment and see what changes when you add a creative constraint.",
    href:    'movement-experiments.html',
    label:   'Start a Movement Experiment',
  },
  {
    trigger: 'default',
    title:   'Start with movement',
    desc:    "The fastest way to develop your teaching voice is to get in your body. Begin with a movement experiment and let the physical practice lead.",
    href:    'movement-experiments.html',
    label:   'Start a Movement Experiment',
  },
];
