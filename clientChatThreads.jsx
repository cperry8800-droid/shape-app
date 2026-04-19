// Shared chat data for logged-in client pages.
// Tabs: Circle (your coaches), Clients (training partners), Trainers (other trainers),
//       Nutritionists (other nutritionists), Community (channels).
const clientChatTabs = [
  {
    id: "circle",
    label: "Your circle",
    eyebrow: "DIRECT CHAT",
    title: "Your coaches",
    threads: [
      { who: "Maya Okafor", role: "Head trainer · Tempo + hybrid", last: "Stick with 185 for top set. Drop backoffs to 165.", time: "2m", unread: 0, messages: [
        { who: "Maya", t: "How'd the warmups feel this morning?", time: "8:48 AM", me: false },
        { who: "You", t: "Squat 185 felt heavy — knee a bit grumpy.", time: "8:54 AM", me: true },
        { who: "Maya", t: "Stick with 185 for top set. Drop backoffs to 165 — protect the knee.", time: "9:02 AM", me: false },
        { who: "Maya", t: "Ice tonight and log sleep before Friday's call.", time: "9:02 AM", me: false },
      ]},
      { who: "Rae Lindqvist", role: "Nutritionist", last: "30g whey + 60g carbs within 45 min.", time: "14m", unread: 1, messages: [
        { who: "Rae", t: "Post-run fueling template is live in your Nutri tab.", time: "Tue 6:14 PM", me: false },
        { who: "You", t: "Saw it — trying the rice bowl tomorrow.", time: "Tue 7:02 PM", me: true },
        { who: "Rae", t: "30g whey + 60g carbs within 45 min. Recovery window matters.", time: "14m", me: false },
      ]},
    ],
  },
  {
    id: "clients",
    label: "Clients",
    eyebrow: "TRAINING PARTNERS",
    title: "Fellow clients",
    threads: [
      { who: "Marcus J.", role: "Strength block 3 · NYC", last: "Still on for 6am tomorrow? Bringing coffee.", time: "31m", unread: 2, messages: [
        { who: "Marcus", t: "Hey — how's block 3 treating you?", time: "Yesterday 9:12 PM", me: false },
        { who: "You", t: "Brutal but I'm loving it. You?", time: "Yesterday 9:40 PM", me: true },
        { who: "Marcus", t: "Still on for 6am tomorrow?", time: "31m", me: false },
        { who: "Marcus", t: "Bringing coffee.", time: "31m", me: false },
      ]},
      { who: "Priya S.", role: "Hybrid · Austin", last: "That rice bowl recipe is elite.", time: "2h", unread: 0, messages: [
        { who: "Priya", t: "Did you try Rae's rice bowl?", time: "Mon 7:40 PM", me: false },
        { who: "You", t: "Yeah last night — macros were spot on.", time: "Mon 8:02 PM", me: true },
        { who: "Priya", t: "That rice bowl recipe is elite.", time: "2h", me: false },
      ]},
      { who: "Tomás R.", role: "Powerlifting · Chicago", last: "Form check on my squat?", time: "Yesterday", unread: 1, messages: [
        { who: "Tomás", t: "Form check on my squat?", time: "Yesterday 4:18 PM", me: false },
      ]},
    ],
  },
  {
    id: "trainers",
    label: "Trainers",
    eyebrow: "OTHER TRAINERS",
    title: "Trainers on Shape",
    threads: [
      { who: "Jordan Reyes", role: "Olympic lifting specialist", last: "Happy to do a consult on your clean technique.", time: "3h", unread: 0, messages: [
        { who: "You", t: "Hi — Maya suggested I reach out. Working on clean form.", time: "Tue 11:02 AM", me: true },
        { who: "Jordan", t: "Happy to do a consult on your clean technique. 30 min, no charge.", time: "3h", me: false },
      ]},
      { who: "Alex Chen", role: "Mobility + recovery", last: "Here's a hip flow for before squat days.", time: "Yesterday", unread: 1, messages: [
        { who: "Alex", t: "Here's a hip flow for before squat days. 8 min.", time: "Yesterday 10:14 AM", me: false },
      ]},
    ],
  },
  {
    id: "nutritionists",
    label: "Nutritionists",
    eyebrow: "OTHER NUTRITIONISTS",
    title: "Nutritionists on Shape",
    threads: [
      { who: "Dr. Sam Huang", role: "Endurance fueling", last: "Pre-long-run intake should be ~80g carbs.", time: "5h", unread: 0, messages: [
        { who: "You", t: "Question on long run fueling — Rae suggested I ask you.", time: "Tue 2:40 PM", me: true },
        { who: "Sam", t: "Pre-long-run intake should be ~80g carbs, 90 min out.", time: "5h", me: false },
      ]},
      { who: "Lena Torres", role: "Plant-based performance", last: "Happy to share a template if useful.", time: "2d", unread: 0, messages: [
        { who: "Lena", t: "Happy to share a template if useful. Ping me.", time: "Sun 6:10 PM", me: false },
      ]},
    ],
  },
  {
    id: "community",
    label: "Community",
    eyebrow: "SHAPE COMMUNITY",
    title: "Channels",
    threads: [
      { who: "# strength-block-3", role: "412 members · 34 online", last: "Marcus J: First time hitting 225 on bench after 8 months.", time: "18m", unread: 3, group: true, messages: [
        { who: "Marcus J.", t: "First time hitting 225 on bench after 8 months. Maya's programming is unreal.", time: "18m", me: false },
        { who: "Priya S.", t: "HUGE. Anyone else in block 3 right now?", time: "16m", me: false },
        { who: "Tomás R.", t: "Week 4 here. Squats are destroying me in the best way.", time: "14m", me: false },
        { who: "You", t: "Starting tomorrow. Any tips on recovery?", time: "12m", me: true },
        { who: "Priya S.", t: "Double your protein target and sleep 8+. Seriously.", time: "10m", me: false },
      ]},
      { who: "# running-club", role: "1,204 members · 89 online", last: "Ava K: Long run Saturday 6am — Prospect Park loop.", time: "31m", unread: 1, group: true, messages: [
        { who: "Ava K.", t: "Long run Saturday 6am — Prospect Park loop. Who's in?", time: "31m", me: false },
        { who: "Jin-ho P.", t: "Pace?", time: "28m", me: false },
        { who: "Ava K.", t: "8:30ish, easy conversation pace.", time: "27m", me: false },
      ]},
      { who: "# nutrition-wins", role: "892 members · 41 online", last: "Rae: New macro calculator is live.", time: "1h", unread: 0, group: true, messages: [
        { who: "Rae Lindqvist", t: "New macro calculator is live — pinned in resources.", time: "1h", me: false, coach: true },
        { who: "Devon W.", t: "Been using the template for 3 weeks. Down 4lbs and energy through the roof.", time: "42m", me: false },
      ]},
      { who: "# general", role: "8,117 members · 312 online", last: "Maya: Free live Q&A Thursday 7pm EST.", time: "2h", unread: 0, group: true, messages: [
        { who: "Maya Okafor", t: "Free live Q&A Thursday 7pm EST — submit questions in #ask-a-coach.", time: "2h", me: false, coach: true },
      ]},
    ],
  },
];
Object.assign(window, { clientChatTabs });
