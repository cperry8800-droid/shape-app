// ===== Data =====
const trainers = [
  {
    id: 1, name: "Marcus Johnson", specialty: "Strength & Powerlifting",
    category: "strength", price: 49.99, rating: null, subscribers: 1240, experience: "12 yrs",
    credential: "CSCS", credentialFull: "Certified Strength & Conditioning Specialist",
    specialtyType: "Strength & Conditioning Coach",
    bio: "CSCS-certified former competitive powerlifter turned coach. Specializes in progressive overload programs for all levels.",
    color: "#6C3AED", trainerOfMonth: true,
    totmQuote: "Consistency beats intensity. Show up every day and the results will follow.",
    workouts: [
      { name: "5x5 Foundation", type: "Strength", duration: "55 min", difficulty: "Intermediate", location: "Gym", price: 29.99, description: "The classic 5x5 program adapted for progressive overload. Perfect for building raw strength.", sampleDays: [
        { day: "Day 1 — Squat & Press", exercises: ["Barbell Back Squat — 5x5", "Bench Press — 5x5", "Barbell Row — 5x5", "Face Pulls — 3x15", "Plank Hold — 3x45s"] },
        { day: "Day 2 — Deadlift & Pull", exercises: ["Conventional Deadlift — 5x5", "Overhead Press — 5x5", "Weighted Pull-Ups — 3x8", "Barbell Curls — 3x10", "Hanging Leg Raises — 3x12"] },
        { day: "Day 3 — Volume Day", exercises: ["Front Squat — 3x8", "Incline Bench Press — 3x8", "Pendlay Row — 3x8", "Dumbbell Lateral Raises — 3x12", "Cable Crunches — 3x15"] }
      ] },
      { name: "Deadlift Domination", type: "Powerlifting", duration: "60 min", difficulty: "Advanced", location: "Gym", price: 34.99, description: "A 6-week deadlift specialization program to break through plateaus.", sampleDays: [
        { day: "Day 1 — Heavy Pulls", exercises: ["Conventional Deadlift — 5x3", "Deficit Deadlifts — 3x5", "Barbell Hip Thrusts — 4x8", "Farmer Carries — 3x40m", "Ab Wheel Rollouts — 3x10"] },
        { day: "Day 2 — Accessory Work", exercises: ["Romanian Deadlift — 4x8", "Leg Curls — 3x12", "Glute-Ham Raises — 3x10", "Single-Leg RDL — 3x10/side", "Back Extensions — 3x15"] },
        { day: "Day 3 — Variation Day", exercises: ["Sumo Deadlift — 4x5", "Pause Deadlifts — 3x3", "Barbell Good Mornings — 3x10", "Lat Pulldowns — 3x12", "Pallof Press — 3x10/side"] }
      ] },
      { name: "Upper Body Blast", type: "Hypertrophy", duration: "45 min", difficulty: "Beginner", location: "Gym", price: 27.99, description: "High-volume upper body routine focused on chest, back, and shoulders.", sampleDays: [
        { day: "Day 1 — Chest & Triceps", exercises: ["Dumbbell Bench Press — 4x10", "Incline Dumbbell Flyes — 3x12", "Cable Crossovers — 3x15", "Tricep Rope Pushdowns — 3x12", "Overhead Tricep Extension — 3x10"] },
        { day: "Day 2 — Back & Biceps", exercises: ["Lat Pulldown — 3x12", "Seated Cable Row — 3x12", "Dumbbell Rows — 3x10/side", "EZ-Bar Curls — 3x12", "Hammer Curls — 3x10"] },
        { day: "Day 3 — Shoulders & Arms", exercises: ["Overhead Press — 3x10", "Lateral Raises — 3x15", "Rear Delt Flyes — 3x12", "Close-Grip Bench Press — 3x10", "Concentration Curls — 3x10/side"] }
      ] },
      { name: "Leg Day Legends", type: "Strength", duration: "50 min", difficulty: "Intermediate", location: "At Home", price: 29.99, description: "Squat-focused leg day with accessory work for complete lower body development.", sampleDays: [
        { day: "Day 1 — Quad Focus", exercises: ["Goblet Squats — 4x12", "Bulgarian Split Squats — 3x10/side", "Wall Sit Hold — 3x45s", "Step-Ups — 3x12/side", "Bodyweight Calf Raises — 3x20"] },
        { day: "Day 2 — Posterior Chain", exercises: ["Romanian Deadlift (dumbbell) — 3x10", "Glute Bridges — 4x15", "Single-Leg Glute Bridge — 3x12/side", "Nordic Curl Negatives — 3x6", "Banded Good Mornings — 3x15"] },
        { day: "Day 3 — Full Legs", exercises: ["Jump Squats — 4x10", "Lateral Lunges — 3x10/side", "Pistol Squat Progressions — 3x6/side", "Sumo Squat Hold — 3x30s", "Standing Calf Raises — 4x15"] }
      ] },
    ],
    tags: ["Powerlifting", "Hypertrophy", "Strength"]
  },
  {
    id: 2, name: "Aisha Patel", specialty: "HIIT & Fat Loss",
    category: "hiit", price: 39.99, rating: null, subscribers: 2100, experience: "8 yrs",
    credential: "NASM-CPT", credentialFull: "NASM Certified Personal Trainer",
    specialtyType: "Weight Loss Coach",
    bio: "NASM-certified high-energy coach known for efficient, no-equipment HIIT sessions that burn maximum calories in minimum time.",
    color: "#EC4899",
    workouts: [
      { name: "20-Min Torch", type: "HIIT", duration: "20 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Quick full-body HIIT session perfect for busy mornings.", sampleDays: [
        { day: "Day 1 — Total Body Blitz", exercises: ["Burpees — 40s on / 20s off x4", "Jump Squats — 3x15", "Mountain Climbers — 45s x3", "High Knees — 30s on / 15s off x4", "Plank Hold — 45s"] },
        { day: "Day 2 — Lower Body Torch", exercises: ["Squat Jumps — 40s on / 20s off x4", "Alternating Lunges — 3x12/side", "Skater Hops — 30s x4", "Wall Sit — 3x30s", "Glute Bridges — 3x15"] },
        { day: "Day 3 — Upper Body Fire", exercises: ["Push-Up Burpees — 30s on / 20s off x4", "Plank Shoulder Taps — 3x12/side", "Tricep Dips (chair) — 3x12", "Inchworms — 3x8", "Superman Hold — 3x20s"] }
      ] },
      { name: "Tabata Inferno", type: "HIIT", duration: "30 min", difficulty: "Advanced", location: "Gym", price: 29.99, description: "Intense Tabata protocol with 8 rounds of 20/10 intervals.", sampleDays: [
        { day: "Day 1 — Explosive Power", exercises: ["Box Jumps — 20s on / 10s off x8", "Battle Rope Slams — 20s on / 10s off x8", "Kettlebell Swings — 20s on / 10s off x8", "Med Ball Slams — 20s on / 10s off x8", "Assault Bike Sprint — 20s on / 10s off x8"] },
        { day: "Day 2 — Strength Tabata", exercises: ["Dumbbell Thrusters — 20s on / 10s off x8", "Renegade Rows — 20s on / 10s off x8", "Goblet Squats — 20s on / 10s off x8", "Push Press — 20s on / 10s off x8", "Plank Rows — 20s on / 10s off x8"] },
        { day: "Day 3 — Cardio Tabata", exercises: ["Rowing Sprints — 20s on / 10s off x8", "Burpee Box Jumps — 20s on / 10s off x8", "Ski Erg Sprints — 20s on / 10s off x8", "Lateral Hops — 20s on / 10s off x8", "Mountain Climbers — 20s on / 10s off x8"] }
      ] },
      { name: "Full Body Burn", type: "Cardio", duration: "40 min", difficulty: "Intermediate", location: "At Home", price: 27.99, description: "No-equipment cardio workout that torches calories head to toe.", sampleDays: [
        { day: "Day 1 — Cardio Circuit", exercises: ["High Knees — 60s intervals x4", "Jumping Lunges — 3x12/side", "Burpee Broad Jumps — 3x10", "Star Jumps — 3x15", "Plank Jacks — 3x20"] },
        { day: "Day 2 — Endurance Builder", exercises: ["Squat to Tuck Jump — 4x10", "Speed Skaters — 45s x4", "Bear Crawl — 3x30s", "Pop Squats — 3x15", "Flutter Kicks — 3x30s"] },
        { day: "Day 3 — Power Cardio", exercises: ["Tuck Jumps — 3x10", "Lateral Shuffle — 45s x4", "Burpees — 4x12", "High Knees to Sprawl — 3x8", "Mountain Climber Twists — 3x12/side"] }
      ] },
      { name: "Core Crusher", type: "HIIT", duration: "15 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Targeted ab routine with HIIT-style pacing for maximum burn.", sampleDays: [
        { day: "Day 1 — Upper Abs", exercises: ["Bicycle Crunches — 40s on / 20s off x3", "V-Ups — 3x12", "Plank Hold — 45s x2", "Toe Touches — 3x15", "Dead Bug — 3x10/side"] },
        { day: "Day 2 — Lower Abs", exercises: ["Flutter Kicks — 30s on / 15s off x4", "Reverse Crunches — 3x15", "Leg Raises — 3x12", "Scissor Kicks — 30s x3", "Hollow Body Hold — 3x20s"] },
        { day: "Day 3 — Obliques & Core", exercises: ["Russian Twists — 3x20", "Side Plank — 30s/side x3", "Woodchoppers — 3x12/side", "Standing Oblique Crunches — 3x12/side", "Plank Hip Dips — 3x10/side"] }
      ] },
    ],
    tags: ["HIIT", "Fat Loss", "No Equipment"]
  },
  {
    id: 3, name: "Nina Brooks", specialty: "At Home & Functional Fitness",
    category: "fullbody", price: 29.99, rating: null, subscribers: 2100, experience: "8 yrs",
    credential: "ACE-CPT", credentialFull: "ACE Certified Personal Trainer",
    specialtyType: "Functional Fitness Trainer",
    bio: "ACE-certified trainer designing effective bodyweight and minimal-equipment workouts you can do anywhere in your home.",
    color: "#10B981",
    workouts: [
      { name: "Living Room HIIT", type: "HIIT", duration: "25 min", difficulty: "Beginner", location: "At Home", price: 22.99, description: "High-energy bodyweight HIIT you can do in your living room — no equipment needed.", sampleDays: [
        { day: "Day 1 — Sweat Starter", exercises: ["Squat Jumps — 30s on / 15s off x4", "High Knees — 45s x3", "Burpees — 3x8", "Jumping Jacks — 60s x2", "Mountain Climbers — 30s x3"] },
        { day: "Day 2 — Core & Cardio", exercises: ["Plank Jacks — 3x15", "Bicycle Crunches — 3x20", "Star Jumps — 3x10", "Flutter Kicks — 30s x3", "Bodyweight Squats — 3x15"] },
        { day: "Day 3 — Total Body Blast", exercises: ["Burpee to Tuck Jump — 3x8", "Lateral Lunges — 3x10/side", "Push-Ups — 3x10", "Skater Hops — 30s x4", "Plank Hold — 3x30s"] }
      ] },
      { name: "Apartment-Friendly Strength", type: "Strength", duration: "35 min", difficulty: "Intermediate", location: "At Home", price: 27.99, description: "Low-impact strength training designed for small spaces and shared floors.", sampleDays: [
        { day: "Day 1 — Lower Body (No Jumping)", exercises: ["Slow-Tempo Squats — 4x12", "Glute Bridges — 3x15", "Single-Leg RDL — 3x10/side", "Wall Sit — 3x45s", "Calf Raises — 3x20"] },
        { day: "Day 2 — Upper Body (No Impact)", exercises: ["Push-Up Variations — 3x10", "Tricep Dips (chair) — 3x12", "Plank Shoulder Taps — 3x10/side", "Superman Hold — 3x20s", "Isometric Towel Curls — 3x10"] },
        { day: "Day 3 — Full Body (Quiet Mode)", exercises: ["Slow Lunges — 3x10/side", "Pike Push-Ups — 3x8", "Glute-Ham Bridge — 3x12", "Dead Bug — 3x10/side", "Plank to Downward Dog — 3x8"] }
      ] },
      { name: "Band & Bodyweight Burn", type: "Resistance", duration: "30 min", difficulty: "Intermediate", location: "At Home", price: 25.99, description: "Full-body burn using just resistance bands and your own bodyweight.", sampleDays: [
        { day: "Day 1 — Push & Legs", exercises: ["Banded Squats — 3x15", "Banded Push-Ups — 3x12", "Banded Lateral Walks — 3x12/side", "Banded Overhead Press — 3x12", "Banded Glute Kickbacks — 3x12/side"] },
        { day: "Day 2 — Pull & Core", exercises: ["Band Pull-Aparts — 3x20", "Banded Rows — 3x12", "Banded Deadlifts — 3x15", "Banded Pallof Press — 3x10/side", "Plank with Band Row — 3x8/side"] },
        { day: "Day 3 — Full Body Circuit", exercises: ["Banded Squat to Press — 3x12", "Banded Bicep Curls — 3x15", "Banded Tricep Extensions — 3x12", "Banded Hip Thrusts — 3x15", "Band-Assisted Crunches — 3x15"] }
      ] },
      { name: "No Excuses Full Body", type: "Bodyweight", duration: "40 min", difficulty: "Advanced", location: "At Home", price: 29.99, description: "Intense full-body session with zero equipment — just you and the floor.", sampleDays: [
        { day: "Day 1 — Strength Mastery", exercises: ["Pistol Squats — 3x6/side", "Handstand Push-Up Progressions — 3x8", "L-Sit Hold — 4x20s", "Archer Push-Ups — 3x6/side", "Single-Leg Calf Raises — 3x15/side"] },
        { day: "Day 2 — Power & Plyo", exercises: ["Clap Push-Ups — 4x6", "Jump Squats — 4x12", "Explosive Lunges — 3x8/side", "Tuck Jumps — 3x10", "Burpee to Tuck Jump — 3x8"] },
        { day: "Day 3 — Endurance Grind", exercises: ["Push-Up Ladder (1-10-1) — 1 set", "Squat Holds — 4x45s", "Bear Crawl — 3x40s", "Hollow Body Hold — 4x30s", "Plank to Push-Up — 4x10"] }
      ] },
    ],
    tags: ["At Home", "Bodyweight", "No Equipment"]
  },
  {
    id: 4, name: "Damon Clarke", specialty: "Cardio & Endurance",
    category: "cardio", price: 44.99, rating: null, subscribers: 890, experience: "10 yrs",
    credential: "CSCS", credentialFull: "Certified Strength & Conditioning Specialist",
    specialtyType: "Strength & Conditioning Coach",
    bio: "CSCS-certified endurance specialist who builds heart-pounding cardio programs. Improve stamina, burn fat, and boost your cardiovascular health.",
    color: "#F59E0B",
    workouts: [
      { name: "HIIT Burn", type: "Cardio", duration: "25 min", difficulty: "Beginner", location: "At Home", price: 26.99, description: "High-intensity intervals designed to torch calories and build endurance.", sampleDays: [
        { day: "Day 1 — Cardio Foundations", exercises: ["Jumping Jacks — 60s x4", "High Knees — 45s x3", "Skater Hops — 3x12/side", "Marching in Place — 60s x3", "Bodyweight Squats — 3x15"] },
        { day: "Day 2 — Step It Up", exercises: ["Step-Touch Side Slides — 3x60s", "Butt Kicks — 45s x4", "Standing Knee Raises — 3x12/side", "Arm Circles — 2x60s", "Modified Burpees — 3x8"] },
        { day: "Day 3 — Endurance Push", exercises: ["Jump Rope (or mimics) — 60s x5", "Lateral Shuffles — 30s x4", "High Knees to Squat — 3x10", "Standing Oblique Crunches — 3x12/side", "Cool-Down Walk — 3min"] }
      ] },
      { name: "Endurance Builder", type: "Cardio", duration: "40 min", difficulty: "Advanced", location: "Gym", price: 32.99, description: "Long-form cardio circuits that push your aerobic and anaerobic limits.", sampleDays: [
        { day: "Day 1 — Machine Intervals", exercises: ["Rowing Machine — 2000m intervals x3", "Assault Bike — 5x2min sprints", "Stairclimber — 10min steady-state", "Jump Rope — 3x2min", "Cool-Down Row — 5min easy"] },
        { day: "Day 2 — Circuit Endurance", exercises: ["Treadmill Incline Run — 8min", "Bike Sprint — 4x90s", "Rowing 500m Repeats — 4 sets", "Battle Ropes — 4x30s", "Farmer Carries — 3x40m"] },
        { day: "Day 3 — Threshold Training", exercises: ["Treadmill Tempo Run — 12min", "Assault Bike Tabata — 20s on / 10s off x8", "Ski Erg — 3x500m", "Stairclimber Intervals — 5x1min hard", "Cool-Down Walk — 5min"] }
      ] },
      { name: "Metabolic Blast", type: "Cardio", duration: "45 min", difficulty: "Intermediate", location: "Gym", price: 29.99, description: "Fast-paced metabolic conditioning to rev up your metabolism all day.", sampleDays: [
        { day: "Day 1 — Kettlebell Conditioning", exercises: ["Kettlebell Swings — 4x20", "Goblet Squats — 3x15", "KB Clean & Press — 3x10/side", "KB Farmers Walk — 3x40m", "KB Sumo Deadlift — 3x12"] },
        { day: "Day 2 — Sled & Steps", exercises: ["Box Step-Ups — 3x15/side", "Sled Push — 5x30m", "Box Jumps — 3x12", "Medicine Ball Slams — 3x15", "Bear Crawl — 3x30s"] },
        { day: "Day 3 — Full Circuit", exercises: ["Dumbbell Thrusters — 4x12", "Battle Rope Waves — 4x30s", "Rowing Sprint — 4x250m", "Burpee to Box Jump — 3x8", "Plank Pull-Throughs — 3x10/side"] }
      ] },
      { name: "Sprint Intervals", type: "Cardio", duration: "30 min", difficulty: "Intermediate", location: "At Home", price: 27.99, description: "Run-based interval training to build speed and cardiovascular power.", sampleDays: [
        { day: "Day 1 — Sprint & Recover", exercises: ["Sprint 30s / Walk 60s — x10", "Hill Sprints — 8x20s", "Lateral Shuffles — 4x30s", "Walking Lunges — 2x20 steps", "Cool-Down Jog — 3min"] },
        { day: "Day 2 — Fartlek Run", exercises: ["Easy Jog — 3min warm-up", "Fast Run 60s / Jog 90s — x8", "Sprint Finish — 4x15s", "Backward Jog — 2x30s", "Walking Cool-Down — 3min"] },
        { day: "Day 3 — Speed Ladder", exercises: ["Sprint 10s / Walk 30s — x5", "Sprint 20s / Walk 40s — x5", "Sprint 30s / Walk 60s — x5", "Sprint 15s / Walk 30s — x5", "Easy Jog Cool-Down — 3min"] }
      ] },
    ],
    tags: ["Cardio", "HIIT", "Endurance"]
  },
  {
    id: 5, name: "Sophie Turner", specialty: "Mobility & Recovery",
    category: "mobility", price: 54.99, rating: null, subscribers: 1560, experience: "9 yrs",
    credential: "NASM-CES", credentialFull: "NASM Corrective Exercise Specialist",
    specialtyType: "Mobility/Flexibility Coach",
    bio: "Corrective exercise specialist who builds programs that keep you moving well — fewer injuries, better range, more years training.",
    color: "#EF4444",
    workouts: [
      { name: "Full Body Mobility Flow", type: "Mobility", duration: "35 min", difficulty: "All Levels", location: "At Home", price: 31.99, description: "Head-to-toe mobility routine that opens up everything. No equipment needed.", sampleDays: [
        { day: "Day 1 — Hips & Lower Body", exercises: ["90/90 Hip Stretch — 2min/side", "Deep Squat Hold — 3x45s", "Pigeon Pose — 90s/side", "Ankle Circles — 2min/side", "Standing Quad Stretch — 60s/side"] },
        { day: "Day 2 — Spine & Shoulders", exercises: ["Thoracic Spine Rotation — 3x8/side", "Cat-Cow — 3x10 breaths", "Thread the Needle — 60s/side", "Shoulder Pass-Throughs — 2x15", "Neck Circles — 2min"] },
        { day: "Day 3 — Full Body Flow", exercises: ["World's Greatest Stretch — 5 reps/side", "Downward Dog to Cobra — 3x8", "Hip Flexor Lunge — 60s/side", "Wrist Circles & Stretches — 2min", "Child's Pose — 90s"] }
      ] },
      { name: "Mobility Foundations", type: "Mobility", duration: "40 min", difficulty: "Beginner", location: "At Home", price: 27.99, description: "Learn the basics of joint health and movement quality before loading up.", sampleDays: [
        { day: "Day 1 — Joint Awareness", exercises: ["Cat-Cow — 3x10 breaths", "Hip Circles — 2min/side", "Ankle Dorsiflexion Stretch — 3x30s", "Arm Circles — 2x60s", "Neck Rolls — 2min"] },
        { day: "Day 2 — Flexibility Basics", exercises: ["Standing Hamstring Stretch — 60s/side", "Doorway Chest Stretch — 60s/side", "Seated Butterfly Stretch — 90s", "Supine Spinal Twist — 60s/side", "Calf Stretch — 45s/side"] },
        { day: "Day 3 — Movement Quality", exercises: ["Bodyweight Squat (slow tempo) — 3x10", "Wall Slides — 3x10", "Single-Leg Balance — 3x30s/side", "Bear Crawl — 3x20s", "Deep Breathing — 3min"] }
      ] },
      { name: "Pre-Workout Warm-Up", type: "Mobility", duration: "15 min", difficulty: "All Levels", location: "Gym", price: 19.99, description: "Quick activation routine to prime your joints and muscles before lifting.", sampleDays: [
        { day: "Day 1 — Upper Body Prep", exercises: ["Banded Shoulder Dislocates — 2x15", "Scapular Push-Ups — 2x10", "Arm Circles — 60s each direction", "Band Pull-Aparts — 2x15", "Thoracic Extensions — 2x8"] },
        { day: "Day 2 — Lower Body Prep", exercises: ["Leg Swings — 15/side", "Deep Squat Hold — 3x30s", "Walking Lunges — 2x8/side", "Glute Bridges — 2x12", "Ankle Rockers — 2x10/side"] },
        { day: "Day 3 — Full Body Activation", exercises: ["Inchworms — 2x6", "World's Greatest Stretch — 3/side", "High Knees — 30s", "Arm Circles to Overhead Reach — 2x10", "Bodyweight Squats — 2x10"] }
      ] },
      { name: "Recovery Day Protocol", type: "Mobility", duration: "30 min", difficulty: "All Levels", location: "At Home", price: 24.99, description: "Active recovery session combining stretching, foam rolling cues, and breathwork.", sampleDays: [
        { day: "Day 1 — Lower Body Recovery", exercises: ["Foam Roll Quads & IT Band — 2min/side", "Couch Stretch — 2min/side", "Pigeon Pose — 90s/side", "Calf Foam Roll — 60s/side", "Box Breathing — 3min"] },
        { day: "Day 2 — Upper Body Recovery", exercises: ["Foam Roll Lats & Upper Back — 2min/side", "Doorway Pec Stretch — 90s/side", "Child's Pose — 2min", "Neck Stretches — 60s/side", "4-7-8 Breathing — 3min"] },
        { day: "Day 3 — Total Body Reset", exercises: ["Full Body Foam Roll — 8min", "Supine Spinal Twist — 60s/side", "Happy Baby Pose — 90s", "Legs Up the Wall — 3min", "Deep Belly Breathing — 3min"] }
      ] },
    ],
    tags: ["Mobility", "Recovery", "Flexibility"]
  },
  {
    id: 6, name: "Jordan Blake", specialty: "Weight Loss & Lifestyle",
    category: "weightloss", price: 44.99, rating: null, subscribers: 2180, experience: "7 yrs",
    credential: "NASM-CPT", credentialFull: "NASM Certified Personal Trainer",
    specialtyType: "Weight Loss Coach",
    bio: "NASM-certified trainer with straight-up fat loss programs that work. No gimmicks, no crash diets — just structured training and accountability.",
    color: "#F59E0B",
    workouts: [
      { name: "Lean Out — Phase 1", type: "Weight Loss", duration: "40 min", difficulty: "Beginner", location: "Gym", price: 29.99, description: "Entry-level fat loss program combining resistance training with steady-state cardio.", sampleDays: [
        { day: "Day 1 — Lower Body + Cardio", exercises: ["Goblet Squats — 3x12", "Dumbbell Lunges — 3x10/side", "Leg Press — 3x12", "Treadmill Incline Walk — 15min", "Calf Raises — 3x15"] },
        { day: "Day 2 — Upper Body + Cardio", exercises: ["Dumbbell Bench Press — 3x12", "Lat Pulldown — 3x12", "Dumbbell Shoulder Press — 3x10", "Cable Rows — 3x12", "Stationary Bike — 10min"] },
        { day: "Day 3 — Full Body Circuit", exercises: ["Dumbbell Deadlifts — 3x10", "Push-Ups — 3x12", "Bodyweight Squats — 3x15", "Plank Hold — 3x30s", "Treadmill Walk — 10min"] }
      ] },
      { name: "Lean Out — Phase 2", type: "Weight Loss", duration: "45 min", difficulty: "Intermediate", location: "Gym", price: 34.99, description: "Progressive overload meets metabolic conditioning. For when Phase 1 gets easy.", sampleDays: [
        { day: "Day 1 — Strength & Conditioning", exercises: ["Barbell Front Squats — 4x8", "Dumbbell Thrusters — 3x12", "Rowing Machine — 5x500m intervals", "Kettlebell Swings — 3x15", "Hanging Leg Raises — 3x10"] },
        { day: "Day 2 — Push & Metabolic", exercises: ["Bench Press — 4x8", "Incline Dumbbell Press — 3x10", "Dumbbell Lateral Raises — 3x12", "Battle Ropes — 4x30s", "Box Jumps — 3x10"] },
        { day: "Day 3 — Pull & Burn", exercises: ["Barbell Rows — 4x8", "Pull-Ups (assisted if needed) — 3x8", "Face Pulls — 3x15", "Assault Bike Sprints — 5x30s", "Sled Push — 4x20m"] }
      ] },
      { name: "At Home Burn", type: "Weight Loss", duration: "30 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Bodyweight circuits designed to keep your heart rate up and burn calories at home.", sampleDays: [
        { day: "Day 1 — Calorie Torcher", exercises: ["Bodyweight Squats — 4x20", "Push-Ups — 3x15", "Mountain Climbers — 4x30s", "Jumping Jacks — 3x45s", "Plank Hold — 3x30s"] },
        { day: "Day 2 — Low Impact Burn", exercises: ["Marching in Place — 3x60s", "Wall Push-Ups — 3x15", "Step-Ups (stairs) — 3x12/side", "Standing Knee Raises — 3x15/side", "Glute Bridges — 3x15"] },
        { day: "Day 3 — Circuit Finisher", exercises: ["Burpees — 3x8", "Alternating Lunges — 3x10/side", "Plank Jacks — 3x15", "High Knees — 3x30s", "Superman Hold — 3x20s"] }
      ] },
      { name: "Accountability Check-In", type: "Weight Loss", duration: "20 min", difficulty: "All Levels", location: "At Home", price: 19.99, description: "Weekly check-in session with progress tracking, weigh-in protocol, and adjustments.", sampleDays: [
        { day: "Day 1 — Weigh-In & Photos", exercises: ["Morning Weigh-In Protocol", "Progress Photo (front, side, back)", "Body Measurement Log (waist, hips, arms)", "Hydration Check — 64oz goal review", "Weekly Reflection Journal"] },
        { day: "Day 2 — Nutrition Review", exercises: ["Calorie Log Review — 7-day average", "Macro Balance Check", "Meal Timing Assessment", "Identify 2 Wins This Week", "Set 1 Nutrition Goal for Next Week"] },
        { day: "Day 3 — Training Review", exercises: ["Workout Completion Rate Check", "Energy Level Assessment (1-10)", "Sleep Quality Review", "Set 1 Training Goal for Next Week", "Plan Next Week's Schedule"] }
      ] },
    ],
    tags: ["Weight Loss", "Fat Loss", "Cardio"]
  },
  {
    id: 7, name: "Reese Calloway", specialty: "Strength & Hypertrophy",
    category: "bodybuilding", price: 42.99, rating: null, subscribers: 1890, experience: "6 yrs",
    credential: "ISSA-CPT", credentialFull: "ISSA Certified Personal Trainer",
    specialtyType: "Bodybuilding/Physique Coach",
    bio: "ISSA-certified trainer with programs built around progressive overload and time under tension. If you want to get bigger and stronger — this is the playbook.",
    color: "#8B5CF6",
    workouts: [
      { name: "Push Pull Legs — Week A", type: "Hypertrophy", duration: "50 min", difficulty: "Intermediate", location: "Gym", price: 32.99, description: "Classic PPL split designed for maximum muscle growth over 6 days.", sampleDays: [
        { day: "Day 1 — Push", exercises: ["Incline Dumbbell Press — 4x10", "Flat Bench Press — 4x8", "Cable Flyes — 3x12", "Dumbbell Lateral Raises — 3x15", "Tricep Rope Pushdowns — 3x12"] },
        { day: "Day 2 — Pull", exercises: ["Cable Rows — 4x12", "Weighted Pull-Ups — 3x8", "Face Pulls — 3x15", "Barbell Curls — 3x10", "Rear Delt Flyes — 3x12"] },
        { day: "Day 3 — Legs", exercises: ["Leg Press — 4x12", "Romanian Deadlift — 3x10", "Leg Curls — 3x12", "Leg Extensions — 3x12", "Standing Calf Raises — 4x15"] }
      ] },
      { name: "Upper Lower Split", type: "Strength", duration: "55 min", difficulty: "Intermediate", location: "Gym", price: 34.99, description: "4-day upper/lower program focused on compound lifts and accessory work.", sampleDays: [
        { day: "Day 1 — Upper Strength", exercises: ["Bench Press — 4x6", "Barbell Rows — 4x6", "Overhead Press — 3x8", "Weighted Pull-Ups — 3x8", "Dumbbell Curls — 3x10"] },
        { day: "Day 2 — Lower Strength", exercises: ["Barbell Back Squat — 4x6", "Romanian Deadlift — 4x8", "Leg Press — 3x10", "Walking Lunges — 3x10/side", "Calf Raises — 4x12"] },
        { day: "Day 3 — Upper Volume", exercises: ["Incline Dumbbell Press — 3x10", "Lat Pulldowns — 3x12", "Cable Lateral Raises — 3x15", "Tricep Dips — 3x12", "Hammer Curls — 3x12"] }
      ] },
      { name: "Arm Day Special", type: "Hypertrophy", duration: "35 min", difficulty: "Beginner", location: "Gym", price: 24.99, description: "Dedicated arm session hitting biceps, triceps, and forearms from every angle.", sampleDays: [
        { day: "Day 1 — Biceps Focus", exercises: ["EZ-Bar Curls — 4x12", "Incline Dumbbell Curls — 3x10", "Concentration Curls — 3x10/side", "Cable Curls — 3x12", "Reverse Curls — 3x12"] },
        { day: "Day 2 — Triceps Focus", exercises: ["Tricep Rope Pushdowns — 4x15", "Overhead Tricep Extension — 3x12", "Close-Grip Bench Press — 3x10", "Skull Crushers — 3x10", "Diamond Push-Ups — 3x12"] },
        { day: "Day 3 — Arms Superset", exercises: ["Barbell Curls / Tricep Dips — 4x10 each", "Hammer Curls / Rope Pushdowns — 3x12 each", "Preacher Curls / Overhead Extension — 3x10 each", "Wrist Curls — 3x15", "Reverse Wrist Curls — 3x15"] }
      ] },
      { name: "Back & Biceps", type: "Hypertrophy", duration: "45 min", difficulty: "Intermediate", location: "Gym", price: 29.99, description: "Heavy pulling session with rows, pull-ups, and curls for a thick, wide back.", sampleDays: [
        { day: "Day 1 — Width Focus", exercises: ["Pull-Ups — 3xAMRAP", "Wide-Grip Lat Pulldowns — 4x12", "Straight-Arm Pulldowns — 3x12", "Dumbbell Curls — 3x12", "Preacher Curls — 3x10"] },
        { day: "Day 2 — Thickness Focus", exercises: ["Barbell Rows — 4x8", "T-Bar Rows — 3x10", "Seated Cable Row — 3x12", "Hammer Curls — 3x10", "EZ-Bar Curls — 3x12"] },
        { day: "Day 3 — Complete Back & Arms", exercises: ["Deadlifts — 3x5", "Dumbbell Rows — 3x10/side", "Face Pulls — 3x15", "Cable Curls — 3x12", "Chin-Ups — 3xAMRAP"] }
      ] },
    ],
    tags: ["Strength", "Hypertrophy", "Muscle"]
  },
  {
    id: 8, name: "Leah Kim", specialty: "HIIT & Weight Loss",
    category: "hiit", price: 34.99, rating: null, subscribers: 3200, experience: "5 yrs", featured: true,
    credential: "ACE-CPT", credentialFull: "ACE Certified Personal Trainer",
    specialtyType: "Weight Loss Coach",
    bio: "ACE-certified trainer. Short sessions. Big results. Leah's HIIT programs are designed for people who don't have time to waste.",
    color: "#EC4899",
    workouts: [
      { name: "15-Min Express", type: "HIIT", duration: "15 min", difficulty: "Beginner", location: "At Home", price: 19.99, description: "No-excuses HIIT that fits into any schedule. Done in 15 minutes flat.", sampleDays: [
        { day: "Day 1 — Quick Burn", exercises: ["Star Jumps — 30s on / 15s off x4", "Push-Up to Plank — 3x8", "Speed Skaters — 3x12/side", "High Knees — 30s x3", "Plank Hold — 30s"] },
        { day: "Day 2 — Core Express", exercises: ["Mountain Climbers — 30s x4", "Bicycle Crunches — 3x15", "Squat Pulses — 3x20", "Plank Shoulder Taps — 3x10/side", "Jumping Jacks — 45s x2"] },
        { day: "Day 3 — Total Body Quickie", exercises: ["Burpees — 3x6", "Alternating Lunges — 3x8/side", "Push-Ups — 3x8", "Flutter Kicks — 30s x3", "Squat Jumps — 3x8"] }
      ] },
      { name: "Sweat & Shred", type: "HIIT", duration: "30 min", difficulty: "Intermediate", location: "At Home", price: 27.99, description: "Full-body HIIT combining plyometrics, core work, and cardio bursts.", sampleDays: [
        { day: "Day 1 — Plyo Power", exercises: ["Plyo Lunge Jumps — 4x10/side", "Tuck Jumps — 3x10", "Broad Jumps — 3x8", "Box Jumps (step) — 3x12", "Burpee to Star Jump — 3x6"] },
        { day: "Day 2 — Core Shred", exercises: ["V-Ups — 3x15", "Russian Twists — 3x20", "Plank Hip Dips — 3x10/side", "Leg Raises — 3x12", "Mountain Climber Twists — 3x12/side"] },
        { day: "Day 3 — Cardio Blast", exercises: ["High Knees — 45s x4", "Speed Skaters — 3x12/side", "Pop Squats — 3x15", "Lateral Shuffle Taps — 30s x4", "Burpees — 4x8"] }
      ] },
      { name: "Lunch Break Burn", type: "HIIT", duration: "20 min", difficulty: "Beginner", location: "At Home", price: 22.99, description: "Quick midday session to break up your workday and burn calories.", sampleDays: [
        { day: "Day 1 — Desk Break", exercises: ["March in Place — 60s x3", "Chair Squats — 3x15", "Standing Oblique Crunches — 3x12/side", "Calf Raises — 3x20", "Arm Circles — 2x30s"] },
        { day: "Day 2 — Energy Boost", exercises: ["Jumping Jacks — 45s x3", "Wall Push-Ups — 3x12", "Standing Knee Raises — 3x12/side", "Lateral Lunges — 3x8/side", "Torso Twists — 3x12/side"] },
        { day: "Day 3 — Midday Sweat", exercises: ["Step-Ups (stairs) — 3x12/side", "Tricep Dips (chair) — 3x10", "Bodyweight Squats — 3x15", "Standing Crunches — 3x12/side", "Marching High Knees — 60s x3"] }
      ] },
      { name: "HIIT & Strength Combo", type: "HIIT", duration: "40 min", difficulty: "Advanced", location: "Gym", price: 32.99, description: "Alternating HIIT intervals with strength sets for the best of both worlds.", sampleDays: [
        { day: "Day 1 — Upper + HIIT", exercises: ["Dumbbell Thrusters — 4x10", "Box Jumps — 3x15", "Renegade Rows — 3x10/side", "Battle Ropes — 4x30s", "Dumbbell Bench Press — 3x10"] },
        { day: "Day 2 — Lower + HIIT", exercises: ["Barbell Squats — 4x8", "Jump Lunges — 3x10/side", "Kettlebell Swings — 4x15", "Assault Bike Sprint — 4x30s", "Leg Press — 3x12"] },
        { day: "Day 3 — Full Body + HIIT", exercises: ["Deadlifts — 4x6", "Burpee to Box Jump — 3x8", "Dumbbell Clean & Press — 3x10", "Rowing Sprint — 4x250m", "Pull-Ups — 3xAMRAP"] }
      ] },
    ],
    tags: ["HIIT", "Weight Loss", "Quick Sessions"]
  },
  {
    id: 9, name: "Carlos Mendez", specialty: "Cardio & Endurance",
    credential: "NSCA-CPT", credentialFull: "NSCA Certified Personal Trainer",
    specialtyType: "Strength & Conditioning Coach",
    category: "cardio", price: 39.99, rating: null, subscribers: 760, experience: "11 yrs",
    bio: "Marathon runner and endurance coach. Whether you're training for a 5K or an ultramarathon — Carlos has a plan for it.",
    color: "#0EA5E9",
    workouts: [
      { name: "Couch to 5K", type: "Cardio", duration: "30 min", difficulty: "Beginner", location: "At Home", price: 22.99, description: "8-week run/walk program that takes you from zero to your first 5K.", sampleDays: [
        { day: "Day 1 — Walk/Jog Intro", exercises: ["Warm-Up Walk — 5min", "Walk 4min / Jog 1min — x5 cycles", "Cool-Down Walk — 5min", "Standing Quad Stretch — 30s/side", "Calf Stretch — 30s/side"] },
        { day: "Day 2 — Building Stamina", exercises: ["Warm-Up Walk — 5min", "Walk 3min / Jog 2min — x5 cycles", "Light Jog — 3min steady", "Cool-Down Walk — 4min", "Hamstring Stretch — 30s/side"] },
        { day: "Day 3 — Endurance Push", exercises: ["Warm-Up Walk — 3min", "Light Jog — 10min steady", "Walk Recovery — 2min", "Jog — 5min steady", "Cool-Down Walk — 5min"] }
      ] },
      { name: "Half Marathon Prep", type: "Cardio", duration: "60 min", difficulty: "Intermediate", location: "Gym", price: 39.99, description: "12-week structured plan with tempo runs, long runs, and recovery days.", sampleDays: [
        { day: "Day 1 — Tempo Run", exercises: ["Warm-Up Jog — 10min easy", "Tempo Run — 20min at threshold pace", "Recovery Jog — 5min easy", "Strides — 4x100m", "Cool-Down Walk & Stretch — 5min"] },
        { day: "Day 2 — Hill Repeats", exercises: ["Warm-Up Jog — 10min", "Hill Repeats — 6x90s hard uphill", "Recovery Jog Down — after each repeat", "Flat Cool-Down Jog — 8min", "Dynamic Stretching — 5min"] },
        { day: "Day 3 — Long Run", exercises: ["Easy Pace Run — 45min", "Mid-Run Fueling Practice — gel or chews", "Negative Split Last 10min — slightly faster", "Cool-Down Walk — 5min", "Full Body Stretch — 5min"] }
      ] },
      { name: "Speed Work Sessions", type: "Cardio", duration: "35 min", difficulty: "Advanced", location: "At Home", price: 29.99, description: "Interval-based speed training to shave minutes off your personal best.", sampleDays: [
        { day: "Day 1 — Track Repeats", exercises: ["Warm-Up Jog — 8min", "400m Repeats at Race Pace — x8", "90s Walk Recovery Between Sets", "Cool-Down Jog — 5min", "Leg Stretches — 3min"] },
        { day: "Day 2 — Fartlek Session", exercises: ["Easy Jog — 5min", "Fartlek Intervals — 20min (random speed bursts)", "Sprint 30s / Easy 60s — x5 finisher", "Cool-Down Jog — 5min", "Hip Flexor Stretch — 60s/side"] },
        { day: "Day 3 — Sprint Finishers", exercises: ["Warm-Up Jog — 8min", "200m Sprints — x4 at 95% effort", "Walk Recovery 90s Between Sprints", "800m at Tempo Pace — x2", "Cool-Down Walk & Stretch — 5min"] }
      ] },
      { name: "Low Impact Cardio", type: "Cardio", duration: "40 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Joint-friendly cardio for anyone who wants to build endurance without the pounding.", sampleDays: [
        { day: "Day 1 — Gentle Movement", exercises: ["Marching in Place — 5min intervals x3", "Step-Touch Side Slides — 3x2min", "Seated Punches — 4x60s", "Standing Leg Swings — 2x10/side", "Gentle Arm Circles — 2x60s"] },
        { day: "Day 2 — Chair Cardio", exercises: ["Seated Marching — 3x2min", "Seated Knee Lifts — 3x12/side", "Chair Stand-Ups — 3x10", "Seated Torso Twists — 3x12/side", "Arm Raises with Light Cans — 3x12"] },
        { day: "Day 3 — Standing Flow", exercises: ["Slow Step-Ups — 3x10/side", "Side Steps with Arm Reach — 3x12/side", "Wall Push-Ups — 3x10", "Standing Hip Circles — 2x10/side", "Gentle Walking in Place — 5min cool-down"] }
      ] },
    ],
    tags: ["Cardio", "Running", "Endurance"]
  },
  {
    id: 10, name: "Tanya West", specialty: "At Home & Bodyweight",
    credential: "ACE-CPT", credentialFull: "ACE Certified Personal Trainer",
    specialtyType: "Functional Fitness Trainer",
    category: "athome", price: 27.99, rating: null, subscribers: 2850, experience: "6 yrs", featured: true,
    bio: "You don't need a gym. Tanya's programs use nothing but your bodyweight and prove that simplicity works.",
    color: "#14B8A6",
    workouts: [
      { name: "Zero Equipment Full Body", type: "Bodyweight", duration: "35 min", difficulty: "Beginner", location: "At Home", price: 22.99, description: "Head-to-toe bodyweight session. All you need is a floor and some space.", sampleDays: [
        { day: "Day 1 — Upper & Core", exercises: ["Push-Ups — 3x10", "Plank Hold — 3x30s", "Superman Hold — 3x15s", "Tricep Dips (floor) — 3x10", "Dead Bug — 3x8/side"] },
        { day: "Day 2 — Lower Body", exercises: ["Air Squats — 4x15", "Glute Bridges — 3x15", "Alternating Lunges — 3x10/side", "Calf Raises — 3x20", "Wall Sit — 3x30s"] },
        { day: "Day 3 — Full Body Flow", exercises: ["Inchworms — 3x6", "Bodyweight Squats — 3x12", "Push-Ups — 3x8", "Reverse Lunges — 3x8/side", "Plank Hold — 2x45s"] }
      ] },
      { name: "Pilates Strength", type: "Bodyweight", duration: "40 min", difficulty: "Intermediate", location: "At Home", price: 27.99, description: "Pilates-inspired strength work that builds core stability and lean muscle.", sampleDays: [
        { day: "Day 1 — Core Foundation", exercises: ["The Hundred — 3x100 count", "Roll-Ups — 3x10", "Single-Leg Circles — 10/side", "Criss-Cross — 3x12/side", "Plank — 3x45s"] },
        { day: "Day 2 — Lower Body Sculpt", exercises: ["Side-Lying Leg Lifts — 3x15/side", "Clam Shells — 3x15/side", "Bridge with March — 3x10/side", "Inner Thigh Lifts — 3x15/side", "Standing Leg Press — 3x12/side"] },
        { day: "Day 3 — Full Pilates Flow", exercises: ["Swimming — 3x20 count", "Teaser — 3x8", "Spine Stretch Forward — 3x8", "Saw — 3x8/side", "Side Plank — 30s/side x3"] }
      ] },
      { name: "Morning Wake-Up", type: "Bodyweight", duration: "15 min", difficulty: "Beginner", location: "At Home", price: 17.99, description: "Quick morning routine to wake up your body and set the tone for the day.", sampleDays: [
        { day: "Day 1 — Energize", exercises: ["Sun Salutation Flow — x5", "Bodyweight Squats — 2x10", "Arm Circles — 2min", "Cat-Cow Stretch — 10 breaths", "Gentle Twist — 30s/side"] },
        { day: "Day 2 — Activate", exercises: ["March in Place — 2min", "Standing Side Bends — 2x8/side", "Glute Bridges — 2x10", "Wall Push-Ups — 2x8", "Forward Fold — 60s"] },
        { day: "Day 3 — Mobilize", exercises: ["Hip Circles — 10/side", "Shoulder Rolls — 2x10 each direction", "Standing Quad Stretch — 30s/side", "Downward Dog — 45s", "Deep Breathing — 2min"] }
      ] },
      { name: "Bodyweight Strength", type: "Bodyweight", duration: "45 min", difficulty: "Advanced", location: "At Home", price: 29.99, description: "Advanced calisthenics session — push-ups, pistol squats, and more.", sampleDays: [
        { day: "Day 1 — Push Mastery", exercises: ["Diamond Push-Ups — 4x12", "Pike Push-Ups — 3x10", "Archer Push-Ups — 3x6/side", "Pseudo-Planche Push-Ups — 3x8", "Handstand Hold (wall) — 3x20s"] },
        { day: "Day 2 — Legs & Balance", exercises: ["Pistol Squats — 3x6/side", "Shrimp Squats — 3x6/side", "Nordic Curl Negatives — 3x5", "Single-Leg Glute Bridge — 3x12/side", "Jumping Lunges — 3x10/side"] },
        { day: "Day 3 — Pull & Core", exercises: ["Chin-Ups (door bar) — 4x8", "Inverted Rows — 3x12", "L-Sit Hold — 4x20s", "Dragon Flags (negative) — 3x5", "Hollow Body Hold — 3x30s"] }
      ] },
    ],
    tags: ["At Home", "Bodyweight", "No Equipment"]
  },
  {
    id: 11, name: "Derek Osei", specialty: "Weight Loss & Strength",
    credential: "CSCS", credentialFull: "Certified Strength & Conditioning Specialist",
    specialtyType: "Weight Loss Coach",
    category: "weightloss", price: 49.99, rating: null, subscribers: 1650, experience: "9 yrs",
    bio: "Fat loss through strength training. Derek's approach is simple — build muscle, burn more at rest, lose weight for good.",
    color: "#D97706",
    workouts: [
      { name: "Strength-Based Fat Loss", type: "Weight Loss", duration: "50 min", difficulty: "Intermediate", location: "Gym", price: 34.99, description: "Compound lifts with short rest periods. Build muscle and burn fat simultaneously.", sampleDays: [
        { day: "Day 1 — Lower Compound", exercises: ["Barbell Back Squat — 4x8", "Romanian Deadlift — 3x10", "Leg Press — 3x12", "Walking Lunges — 3x10/side", "Calf Raises — 3x15"] },
        { day: "Day 2 — Upper Compound", exercises: ["Bench Press — 4x8", "Bent-Over Row — 4x10", "Overhead Press — 3x8", "Pull-Ups — 3xAMRAP", "Face Pulls — 3x15"] },
        { day: "Day 3 — Full Body Burn", exercises: ["Trap Bar Deadlift — 4x6", "Dumbbell Thrusters — 3x10", "Cable Rows — 3x12", "Kettlebell Swings — 3x15", "Plank Hold — 3x45s"] }
      ] },
      { name: "Metabolic Resistance", type: "Weight Loss", duration: "40 min", difficulty: "Intermediate", location: "Gym", price: 29.99, description: "Resistance circuits that keep your heart rate elevated the entire session.", sampleDays: [
        { day: "Day 1 — Circuit A", exercises: ["Kettlebell Goblet Squats — 3x15", "Dumbbell Clean & Press — 3x10", "Cable Woodchops — 3x12/side", "Box Step-Ups — 3x12/side", "Renegade Rows — 3x8/side"] },
        { day: "Day 2 — Circuit B", exercises: ["Dumbbell Lunges — 3x12/side", "Push Press — 3x10", "Cable Face Pulls — 3x15", "Medicine Ball Slams — 3x12", "Farmer Carries — 3x30m"] },
        { day: "Day 3 — Circuit C", exercises: ["Sumo Deadlifts — 3x10", "Dumbbell Bench Press — 3x12", "TRX Rows — 3x12", "Kettlebell Swings — 3x20", "Battle Rope Waves — 3x30s"] }
      ] },
      { name: "Beginner Fat Loss", type: "Weight Loss", duration: "35 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Entry-level program for anyone starting their weight loss process. Low impact, high results.", sampleDays: [
        { day: "Day 1 — Easy Start", exercises: ["Bodyweight Lunges — 3x10/side", "Wall Push-Ups — 3x12", "Standing Knee Raises — 3x15/side", "Glute Bridges — 3x12", "Marching in Place — 3x60s"] },
        { day: "Day 2 — Build Confidence", exercises: ["Bodyweight Squats — 3x12", "Incline Push-Ups (counter) — 3x10", "Side Steps — 3x12/side", "Seated Leg Extensions — 3x12", "Arm Raises — 3x10"] },
        { day: "Day 3 — Move More", exercises: ["Step-Ups (stairs) — 3x10/side", "Chair-Assisted Squats — 3x12", "Standing Calf Raises — 3x15", "Wall Plank — 3x20s", "Walking in Place — 5min"] }
      ] },
      { name: "Weekend Warrior", type: "Weight Loss", duration: "60 min", difficulty: "Advanced", location: "Gym", price: 37.99, description: "Intense full-body session for the days when you have extra time and energy.", sampleDays: [
        { day: "Day 1 — Heavy Hitters", exercises: ["Trap Bar Deadlifts — 5x5", "Barbell Squats — 4x6", "Bench Press — 4x6", "Weighted Pull-Ups — 3x8", "Barbell Rows — 4x8"] },
        { day: "Day 2 — Metabolic Mayhem", exercises: ["Dumbbell Walking Lunges — 4x12/side", "Battle Rope Finisher — 5x30s", "Box Jumps — 4x10", "Sled Push — 5x20m", "Medicine Ball Slams — 4x12"] },
        { day: "Day 3 — Endurance Challenge", exercises: ["Kettlebell Complex (swing, clean, press) — 5 rounds", "Rowing Machine — 3x500m", "Burpees — 4x10", "Farmer Carries — 4x40m", "Assault Bike — 5x30s sprints"] }
      ] },
    ],
    tags: ["Weight Loss", "Strength", "Fat Loss"]
  },
  {
    id: 12, name: "Mia Vasquez", specialty: "Yoga & Strength Fusion",
    category: "fullbody", price: 34.99, rating: null, subscribers: 1870, experience: "8 yrs",
    credential: "NASM-CPT", credentialFull: "NASM Certified Personal Trainer",
    specialtyType: "Functional Fitness Trainer",
    bio: "NASM-certified yoga strength coach blending vinyasa flow with resistance training. Build flexibility and power in every session.",
    color: "#EC4899",
    workouts: [
      { name: "Yoga Strength Flow", type: "Strength", duration: "45 min", difficulty: "Intermediate", location: "At Home", price: 29.99, description: "Power yoga meets bodyweight strength. Build lean muscle while improving flexibility.", sampleDays: [
        { day: "Day 1 — Upper Body Flow", exercises: ["Sun Salutation A — 5 rounds", "Chaturanga Push-Up Hold — 4x8", "Crow Pose Practice — 3x20s", "Warrior III to Half Moon — 3x5/side", "Dolphin Push-Ups — 3x10"] },
        { day: "Day 2 — Lower Body Flow", exercises: ["Chair Pose Pulses — 3x20", "Warrior II Squat Hold — 3x45s/side", "Single-Leg Deadlift to Warrior III — 3x8/side", "Bridge Pose Lifts — 3x15", "Tree Pose Balance — 60s/side"] },
        { day: "Day 3 — Full Body Power", exercises: ["Sun Salutation B — 5 rounds", "Plank to Side Plank Flow — 3x6/side", "Yogi Squat to Stand — 3x12", "Boat Pose Hold — 4x30s", "Pigeon Pose — 90s/side"] }
      ] },
      { name: "Flexibility & Power", type: "Mobility", duration: "35 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Improve range of motion while building foundational strength through yoga-based movements.", sampleDays: [
        { day: "Day 1 — Hip Openers", exercises: ["Low Lunge Hold — 60s/side", "Lizard Pose — 60s/side", "Happy Baby — 90s", "Frog Pose — 2min", "Seated Forward Fold — 90s"] },
        { day: "Day 2 — Spine & Shoulders", exercises: ["Cat-Cow Flow — 3x10", "Thread the Needle — 60s/side", "Eagle Arms — 45s/side", "Puppy Pose — 90s", "Supine Twist — 60s/side"] },
        { day: "Day 3 — Full Flexibility", exercises: ["World's Greatest Stretch — 5/side", "Standing Forward Fold — 90s", "Pigeon to Mermaid — 60s/side", "Camel Pose — 3x20s", "Savasana — 3min"] }
      ] },
      { name: "Warrior Sculpt", type: "HIIT", duration: "40 min", difficulty: "Advanced", location: "At Home", price: 32.99, description: "High-intensity yoga sculpt combining warrior sequences with plyometric bursts.", sampleDays: [
        { day: "Day 1 — Fire Flow", exercises: ["Sun Salutation A Jumps — 8 rounds", "Chair Pose Jump Squats — 4x12", "Chaturanga Burpees — 3x8", "Warrior I to Lunge Jump — 3x8/side", "Plank Hold — 60s"] },
        { day: "Day 2 — Power Sculpt", exercises: ["Crescent Lunge Pulses — 3x15/side", "Side Plank Crunches — 3x10/side", "Goddess Squat Pulses — 4x20", "Handstand Kick-Ups — 3x5", "Boat Pose Bicycle — 3x20"] },
        { day: "Day 3 — Endurance Burn", exercises: ["Flow Sequence — 10min continuous", "Warrior III Hold — 45s/side", "Crow to Chaturanga — 3x5", "Standing Split Squats — 3x10/side", "Corpse Pose Recovery — 3min"] }
      ] },
      { name: "Morning Vinyasa", type: "Bodyweight", duration: "20 min", difficulty: "All Levels", location: "At Home", price: 19.99, description: "Gentle morning vinyasa to wake up your body and set intention for the day.", sampleDays: [
        { day: "Day 1 — Energize", exercises: ["Seated Meditation — 2min", "Sun Salutation A — 5 rounds", "Warrior I & II Flow — 3 rounds/side", "Tree Pose — 60s/side", "Savasana — 2min"] },
        { day: "Day 2 — Open", exercises: ["Cat-Cow — 10 breaths", "Low Lunge Twist — 45s/side", "Half Splits — 60s/side", "Cobra to Down Dog — 5 rounds", "Child's Pose — 90s"] },
        { day: "Day 3 — Balance", exercises: ["Standing Forward Fold — 60s", "Warrior III — 30s/side", "Half Moon — 30s/side", "Camel Pose — 3x15s", "Legs Up Wall — 3min"] }
      ] },
    ],
    tags: ["Yoga", "Flexibility", "Strength"]
  },
  {
    id: 13, name: "Tyrone Mitchell", specialty: "Boxing & Combat Fitness",
    category: "hiit", price: 44.99, rating: null, subscribers: 1340, experience: "14 yrs",
    credential: "ISSA-CPT", credentialFull: "ISSA Certified Personal Trainer",
    specialtyType: "Combat Fitness Coach",
    bio: "Former amateur boxer turned fitness coach. ISSA-certified with 14 years building knockout conditioning programs.",
    color: "#EF4444",
    workouts: [
      { name: "Boxing Fundamentals", type: "HIIT", duration: "35 min", difficulty: "Beginner", location: "At Home", price: 27.99, description: "Learn proper boxing form while getting an incredible cardio workout.", sampleDays: [
        { day: "Day 1 — Jab & Cross", exercises: ["Shadow Boxing Warm-Up — 3min", "Jab Drill — 3x2min rounds", "Cross Drill — 3x2min rounds", "Jab-Cross Combo — 4x2min rounds", "Jump Rope — 3x1min"] },
        { day: "Day 2 — Defense & Footwork", exercises: ["Footwork Drill — 3x2min", "Slip & Roll Practice — 3x1min", "Defensive Shadow Boxing — 4x2min", "Speed Bag Simulation — 3x1min", "Core Finisher — 3x30s planks"] },
        { day: "Day 3 — Combinations", exercises: ["Jab-Cross-Hook — 4x2min rounds", "Body Shot Practice — 3x2min", "Uppercut Drill — 3x1min", "3-Punch Combo Shadow Boxing — 4x2min", "Burpees — 3x10"] }
      ] },
      { name: "Fight Night Conditioning", type: "HIIT", duration: "45 min", difficulty: "Advanced", location: "Gym", price: 34.99, description: "Pro-level conditioning combining heavy bag work, plyometrics, and strength circuits.", sampleDays: [
        { day: "Day 1 — Bag Work", exercises: ["Heavy Bag Rounds — 6x3min", "Speed Bag — 3x2min", "Double-End Bag — 3x2min", "Battle Ropes — 4x30s", "Medicine Ball Slams — 3x15"] },
        { day: "Day 2 — Power & Speed", exercises: ["Explosive Push-Ups — 4x8", "Box Jumps — 4x10", "Kettlebell Swings — 4x15", "Sprint Intervals — 6x30s", "Shadow Boxing Finisher — 3x2min"] },
        { day: "Day 3 — Endurance Round", exercises: ["Heavy Bag — 8x3min rounds", "Jump Rope — 5x2min", "Burpee to Sprawl — 4x10", "Mountain Climbers — 4x30s", "Plank Hold — 3x60s"] }
      ] },
      { name: "Shadowbox Shred", type: "Cardio", duration: "25 min", difficulty: "Intermediate", location: "At Home", price: 24.99, description: "No equipment shadow boxing workout that burns fat and builds coordination.", sampleDays: [
        { day: "Day 1 — Speed Rounds", exercises: ["Speed Jab Drill — 4x1min", "Combo Flurries — 3x2min", "Defensive Slip Drill — 3x1min", "High Knees — 3x30s", "Cool-Down Shadow Box — 2min"] },
        { day: "Day 2 — Power Rounds", exercises: ["Power Cross Drill — 4x1min", "Hook & Uppercut Combos — 4x2min", "Body Hook Practice — 3x1min", "Squat to Uppercut — 3x12", "Plank Shoulder Taps — 3x12"] },
        { day: "Day 3 — Mixed Rounds", exercises: ["Full Combo Shadow Boxing — 6x2min", "Sprawl to Jab — 3x10", "Lateral Movement Drill — 3x1min", "Jumping Jacks — 3x45s", "Deep Breathing — 2min"] }
      ] },
      { name: "Heavy Bag HIIT", type: "HIIT", duration: "30 min", difficulty: "Intermediate", location: "Gym", price: 29.99, description: "Tabata-style heavy bag intervals for explosive power and cardio endurance.", sampleDays: [
        { day: "Day 1 — Tabata Bag", exercises: ["Jab-Cross — 20s on/10s off x8", "Hook Combos — 20s on/10s off x8", "Uppercut Flurry — 20s on/10s off x8", "Rest 60s between sets", "Core Finisher — 3x30s"] },
        { day: "Day 2 — Power Intervals", exercises: ["Power Cross — 30s on/15s off x6", "Body Shots — 30s on/15s off x6", "Full Combo — 30s on/15s off x6", "Jump Rope — 3x2min", "Stretch — 3min"] },
        { day: "Day 3 — Championship Round", exercises: ["3-Min Rounds on Bag — x8", "30s Sprint Between Rounds", "Push-Ups — 10 between each round", "Final Burnout Round — 2min all out", "Cool-Down Stretch — 3min"] }
      ] },
    ],
    tags: ["Boxing", "Combat", "HIIT"]
  },
  {
    id: 14, name: "Hannah Price", specialty: "Pre & Postnatal Fitness",
    category: "fullbody", price: 37.99, rating: null, subscribers: 2240, experience: "10 yrs",
    credential: "ACE-CPT", credentialFull: "ACE Certified Personal Trainer",
    specialtyType: "Pre/Postnatal Fitness Specialist",
    bio: "ACE-certified pre/postnatal specialist. Safe, effective workouts for every trimester and postpartum recovery.",
    color: "#F472B6",
    workouts: [
      { name: "First Trimester Fit", type: "Bodyweight", duration: "30 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Safe, energizing workouts for the first trimester with modifications for nausea and fatigue.", sampleDays: [
        { day: "Day 1 — Gentle Strength", exercises: ["Modified Squats — 3x12", "Wall Push-Ups — 3x10", "Seated Knee Lifts — 3x10/side", "Cat-Cow — 3x10", "Deep Breathing — 3min"] },
        { day: "Day 2 — Light Cardio", exercises: ["Walking in Place — 5min", "Step-Touches — 3x2min", "Arm Circles — 2x1min", "Standing Marches — 3x1min", "Gentle Stretch — 5min"] },
        { day: "Day 3 — Core & Pelvic Floor", exercises: ["Pelvic Tilts — 3x12", "Kegels — 3x10 (5s hold)", "Bird-Dog — 3x8/side", "Glute Bridges — 3x12", "Side-Lying Stretch — 60s/side"] }
      ] },
      { name: "Postpartum Recovery", type: "Bodyweight", duration: "25 min", difficulty: "Beginner", location: "At Home", price: 27.99, description: "Gentle recovery program rebuilding core and pelvic floor strength after delivery.", sampleDays: [
        { day: "Day 1 — Core Reconnect", exercises: ["Diaphragmatic Breathing — 3min", "Pelvic Floor Activation — 3x10", "Gentle Pelvic Tilts — 3x10", "Heel Slides — 3x8/side", "Glute Squeeze — 3x12"] },
        { day: "Day 2 — Rebuild", exercises: ["Modified Glute Bridge — 3x10", "Wall Sit — 3x15s", "Seated Arm Raises — 3x10", "Bird-Dog — 3x6/side", "Kegels — 3x10 (hold 5s)"] },
        { day: "Day 3 — Strengthen", exercises: ["Bodyweight Squat — 3x10", "Incline Push-Up — 3x8", "Standing Calf Raises — 3x15", "Side-Lying Leg Lift — 3x10/side", "Child's Pose — 90s"] }
      ] },
      { name: "Bump & Burn", type: "Cardio", duration: "35 min", difficulty: "Intermediate", location: "At Home", price: 29.99, description: "Second trimester-safe cardio and strength to maintain fitness during pregnancy.", sampleDays: [
        { day: "Day 1 — Cardio Light", exercises: ["Marching in Place — 5min", "Modified Jumping Jacks — 3x20", "Step-Ups — 3x10/side", "Standing Knee Raises — 3x12/side", "Cool-Down Walk — 3min"] },
        { day: "Day 2 — Strength", exercises: ["Sumo Squats — 3x12", "Wall Push-Ups — 3x12", "Banded Side Steps — 3x12/side", "Seated Rows (band) — 3x12", "Cat-Cow — 10 breaths"] },
        { day: "Day 3 — Balance & Core", exercises: ["Bird-Dog — 3x8/side", "Modified Plank — 3x20s", "Single-Leg Stand — 30s/side", "Glute Bridge — 3x15", "Deep Breathing — 3min"] }
      ] },
      { name: "Mom Strong", type: "Strength", duration: "40 min", difficulty: "Intermediate", location: "At Home", price: 32.99, description: "Postnatal strength program for moms ready to progress beyond recovery basics.", sampleDays: [
        { day: "Day 1 — Lower Body", exercises: ["Goblet Squats — 3x12", "Romanian Deadlift (light) — 3x10", "Lateral Band Walks — 3x12/side", "Step-Ups — 3x10/side", "Calf Raises — 3x15"] },
        { day: "Day 2 — Upper Body", exercises: ["Dumbbell Press — 3x10", "Bent-Over Row — 3x12", "Shoulder Press — 3x10", "Tricep Dips — 3x10", "Bicep Curls — 3x12"] },
        { day: "Day 3 — Full Body", exercises: ["Deadbug — 3x10/side", "Push-Ups — 3x10", "Squat to Press — 3x10", "Plank Hold — 3x30s", "Stretching — 5min"] }
      ] },
    ],
    tags: ["Prenatal", "Postnatal", "Recovery"]
  },
  {
    id: 15, name: "Kai Nakamura", specialty: "Calisthenics & Street Workout",
    category: "strength", price: 39.99, rating: null, subscribers: 1580, experience: "7 yrs",
    credential: "NSCA-CPT", credentialFull: "NSCA Certified Personal Trainer",
    specialtyType: "Calisthenics Coach",
    bio: "NSCA-certified calisthenics athlete. Mastered the muscle-up, front lever, and planche — now teaching you how to do the same.",
    color: "#0EA5E9",
    workouts: [
      { name: "Calisthenics Foundations", type: "Bodyweight", duration: "45 min", difficulty: "Beginner", location: "At Home", price: 27.99, description: "Build the base strength needed for advanced calisthenics skills.", sampleDays: [
        { day: "Day 1 — Push", exercises: ["Push-Ups — 4x15", "Diamond Push-Ups — 3x10", "Pike Push-Ups — 3x8", "Dips (chair) — 3x10", "Plank — 3x45s"] },
        { day: "Day 2 — Pull", exercises: ["Australian Rows — 4x12", "Dead Hangs — 3x30s", "Negative Pull-Ups — 3x5", "Scapular Pull-Ups — 3x10", "Chin-Up Hold — 3x15s"] },
        { day: "Day 3 — Legs & Core", exercises: ["Pistol Squat Progressions — 3x8/side", "Jump Squats — 3x12", "L-Sit Tucks — 4x15s", "Hollow Body Hold — 3x20s", "Hanging Knee Raises — 3x10"] }
      ] },
      { name: "Muscle-Up Mastery", type: "Strength", duration: "50 min", difficulty: "Advanced", location: "Gym", price: 34.99, description: "Progressive program to achieve your first muscle-up and beyond.", sampleDays: [
        { day: "Day 1 — Explosive Pull", exercises: ["High Pull-Ups — 4x5", "Kipping Practice — 3x8", "Chest-to-Bar Pull-Ups — 3x5", "Muscle-Up Negatives — 3x3", "Band-Assisted Muscle-Ups — 3x5"] },
        { day: "Day 2 — Transition Work", exercises: ["Straight Bar Dips — 4x8", "Russian Dips — 3x6", "Transition Drill (low bar) — 3x5", "False Grip Hangs — 3x20s", "Ring Support Hold — 3x20s"] },
        { day: "Day 3 — Full Attempts", exercises: ["Warm-Up Pull-Ups — 2x5", "Muscle-Up Attempts — 10 singles", "High Pull-Up to Dip — 3x3", "Weighted Pull-Ups — 3x5", "Ring Rows — 3x12"] }
      ] },
      { name: "Front Lever Program", type: "Strength", duration: "40 min", difficulty: "Advanced", location: "Gym", price: 32.99, description: "Step-by-step front lever progression from tuck to full hold.", sampleDays: [
        { day: "Day 1 — Tuck Progressions", exercises: ["Tuck Front Lever Hold — 5x10s", "Advanced Tuck FL — 3x8s", "Ice Cream Makers — 3x6", "Front Lever Raises (tuck) — 3x5", "Dragon Flags — 3x5"] },
        { day: "Day 2 — Pulling Strength", exercises: ["Weighted Pull-Ups — 4x5", "Front Lever Rows (tuck) — 3x8", "Archer Rows — 3x5/side", "Inverted Rows — 3x12", "Hanging L-Sit — 3x15s"] },
        { day: "Day 3 — Isometric Work", exercises: ["Single-Leg FL Hold — 4x8s/side", "Full FL Negatives — 3x5s", "Skin the Cat — 3x5", "Back Lever Hold — 3x10s", "Core Compression — 3x15"] }
      ] },
      { name: "Park Workout", type: "Bodyweight", duration: "35 min", difficulty: "Intermediate", location: "At Home", price: 24.99, description: "Complete pull bar and parallel bar workout you can do at any outdoor park.", sampleDays: [
        { day: "Day 1 — Upper Push/Pull", exercises: ["Pull-Ups — 4x8", "Bar Dips — 4x10", "Chin-Ups — 3x8", "Push-Ups — 3x15", "L-Sit on Bars — 3x15s"] },
        { day: "Day 2 — Skills & Play", exercises: ["Muscle-Up Practice — 5x2", "Handstand Against Wall — 3x30s", "Bar Swings — 3x8", "Frog Stand — 3x15s", "Pistol Squats — 3x6/side"] },
        { day: "Day 3 — Conditioning", exercises: ["Burpee Pull-Ups — 4x6", "Sprint to Bar — 5 sets", "Dip to L-Sit — 3x8", "Hanging Windshield Wipers — 3x6", "Dead Hang — max hold x3"] }
      ] },
    ],
    tags: ["Calisthenics", "Bodyweight", "Skills"]
  },
  {
    id: 16, name: "Aaliyah Robinson", specialty: "Dance & Cardio Fitness",
    category: "cardio", price: 32.99, rating: null, subscribers: 3100, experience: "6 yrs",
    credential: "ACE-CPT", credentialFull: "ACE Certified Personal Trainer",
    specialtyType: "Dance Fitness Coach",
    bio: "ACE-certified dance fitness instructor who makes cardio fun. High-energy choreography that burns calories without feeling like exercise.",
    color: "#D946EF",
    workouts: [
      { name: "Dance Cardio Party", type: "Cardio", duration: "35 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Fun dance-based cardio set to upbeat music. No dance experience needed.", sampleDays: [
        { day: "Day 1 — Warm-Up Grooves", exercises: ["Step-Touch Rhythm — 3min", "Grapevine Steps — 3x1min", "Body Roll Warm-Up — 2min", "Mambo Steps — 3x1min", "Hip Sway Cool-Down — 2min"] },
        { day: "Day 2 — Latin Vibes", exercises: ["Salsa Steps — 4x1min", "Merengue March — 3x1min", "Cumbia Side Steps — 3x1min", "Bachata Sway — 3x1min", "Stretch & Breathe — 3min"] },
        { day: "Day 3 — Full Routine", exercises: ["Warm-Up Choreography — 3min", "Verse 1 Routine — 4min", "Chorus Routine — 3min", "Bridge Freestyle — 2min", "Cool-Down & Stretch — 5min"] }
      ] },
      { name: "Hip Hop Burn", type: "HIIT", duration: "30 min", difficulty: "Intermediate", location: "At Home", price: 27.99, description: "Hip hop inspired moves combined with HIIT intervals for maximum calorie burn.", sampleDays: [
        { day: "Day 1 — Bounce", exercises: ["Bounce Step Combos — 4x1min", "Pop & Lock Intervals — 3x45s", "Running Man — 3x1min", "Drop Squats — 3x12", "Freestyle Burnout — 2min"] },
        { day: "Day 2 — Sweat", exercises: ["Isolation Warm-Up — 3min", "High-Energy Combo — 5min", "Twerk Squats — 3x15", "Body Roll Plank — 3x30s", "Dance Battle Freestyle — 3min"] },
        { day: "Day 3 — Fire", exercises: ["Full Choreography — 8min", "Speed Drill — 4x30s", "Floor Work Core — 3min", "Standing Combo Finisher — 3min", "Stretch — 4min"] }
      ] },
      { name: "Barre Sculpt", type: "Bodyweight", duration: "40 min", difficulty: "Intermediate", location: "At Home", price: 29.99, description: "Ballet-inspired barre workout using a chair for balance. Sculpt and tone every muscle.", sampleDays: [
        { day: "Day 1 — Lower Body", exercises: ["Plié Squats — 4x20", "Relevé Calf Raises — 3x20", "Arabesque Leg Lifts — 3x15/side", "Inner Thigh Pulses — 3x20/side", "Grand Plié Hold — 3x30s"] },
        { day: "Day 2 — Upper & Core", exercises: ["Arm Circles (light weights) — 4x1min", "Barre Push-Ups — 3x12", "Standing Ab Curl — 3x15", "Plank Relevé — 3x20s", "Tricep Presses — 3x15"] },
        { day: "Day 3 — Full Barre", exercises: ["Tendu & Degagé — 3x12/side", "Chair Pose Pulse — 3x20", "Attitude Lifts — 3x12/side", "Plié to Relevé — 3x15", "Standing Splits — 30s/side"] }
      ] },
      { name: "Afrobeats Sweat", type: "Cardio", duration: "30 min", difficulty: "All Levels", location: "At Home", price: 24.99, description: "High-energy Afrobeats dance workout celebrating movement and rhythm.", sampleDays: [
        { day: "Day 1 — Groove", exercises: ["Afro Step Warm-Up — 3min", "Azonto Steps — 3x1min", "Shaku Shaku — 3x1min", "Leg Work Combo — 4min", "Cool-Down Sway — 3min"] },
        { day: "Day 2 — Energy", exercises: ["Gwara Gwara — 3x1min", "Zanku Legwork — 3x1min", "Full Combo — 5min", "Freestyle Circle — 3min", "Stretch & Breathe — 3min"] },
        { day: "Day 3 — Celebration", exercises: ["Warm-Up Flow — 3min", "Full Choreography — 10min", "Partner Mirror Drill — 3min", "Freestyle Finisher — 3min", "Recovery Stretch — 4min"] }
      ] },
    ],
    tags: ["Dance", "Cardio", "Fun Fitness"]
  },
  {
    id: 17, name: "Ryan Foster", specialty: "Olympic Lifting",
    category: "strength", price: 54.99, rating: null, subscribers: 720, experience: "13 yrs",
    credential: "CSCS", credentialFull: "Certified Strength & Conditioning Specialist",
    specialtyType: "Olympic Lifting Coach",
    bio: "CSCS-certified Olympic weightlifting coach. National-level competitor teaching clean, jerk, and snatch technique to all levels.",
    color: "#DC2626",
    workouts: [
      { name: "Oly Lifting Basics", type: "Strength", duration: "50 min", difficulty: "Beginner", location: "Gym", price: 34.99, description: "Learn proper Olympic lifting technique with progressive drills and light weight.", sampleDays: [
        { day: "Day 1 — Clean Progression", exercises: ["Clean Pull Drill — 5x3", "Hang Power Clean — 5x3", "Front Squat — 4x5", "Clean Deadlift — 3x5", "Core Stability — 3x30s"] },
        { day: "Day 2 — Snatch Progression", exercises: ["Snatch Grip Deadlift — 4x5", "Hang Power Snatch — 5x3", "Overhead Squat — 4x5", "Snatch Pull — 3x3", "Pressing Snatch Balance — 3x5"] },
        { day: "Day 3 — Jerk & Accessory", exercises: ["Push Press — 4x5", "Split Jerk Practice — 5x2", "Behind Neck Jerk — 3x3", "Back Squat — 4x5", "Good Mornings — 3x8"] }
      ] },
      { name: "Clean & Jerk Program", type: "Powerlifting", duration: "60 min", difficulty: "Intermediate", location: "Gym", price: 39.99, description: "6-week specialization program to increase your clean & jerk PR.", sampleDays: [
        { day: "Day 1 — Heavy Cleans", exercises: ["Power Clean — 5x2 at 80%", "Clean Pulls — 3x3 at 90%", "Front Squat — 4x3 at 85%", "RDL — 3x8", "Plank Hold — 3x45s"] },
        { day: "Day 2 — Jerk Focus", exercises: ["Push Jerk — 5x2", "Split Jerk — 5x1 at 85%", "Push Press — 4x3", "Overhead Holds — 3x10s", "Ab Wheel — 3x8"] },
        { day: "Day 3 — Full Lift", exercises: ["Clean & Jerk — 6x1 at 80-90%", "Clean Pull — 3x2", "Back Squat — 3x5", "Bulgarian Split Squat — 3x8/side", "Band Pull-Aparts — 3x15"] }
      ] },
      { name: "Snatch Development", type: "Powerlifting", duration: "55 min", difficulty: "Advanced", location: "Gym", price: 42.99, description: "Advanced snatch training for competitive lifters chasing PRs.", sampleDays: [
        { day: "Day 1 — Speed Work", exercises: ["Power Snatch — 6x2 at 75%", "Hang Snatch — 4x2", "Snatch Pulls — 3x3 at 90%", "Overhead Squat — 3x3", "Hip Thrusts — 3x10"] },
        { day: "Day 2 — Heavy Singles", exercises: ["Full Snatch — work to 90% single", "Snatch Deadlift — 3x3 at 95%", "Back Squat — 4x2 at 85%", "Snatch Grip RDL — 3x6", "Hanging Leg Raise — 3x10"] },
        { day: "Day 3 — Complexes", exercises: ["Snatch Pull + Hang Snatch + OHS — 5 complexes", "Snatch Balance — 4x2", "Front Squat — 3x3", "Clean Grip Deadlift — 3x5", "Plank — 3x60s"] }
      ] },
      { name: "Barbell Conditioning", type: "HIIT", duration: "35 min", difficulty: "Intermediate", location: "Gym", price: 29.99, description: "Olympic lift-based conditioning circuits for explosive power and cardio.", sampleDays: [
        { day: "Day 1 — Power Circuit", exercises: ["Hang Clean — 5x3 EMOM", "Push Press — 5x5 EMOM", "Front Squat — 5x3 EMOM", "Deadlift — 5x5 EMOM", "Rest 2min, repeat"] },
        { day: "Day 2 — Barbell Complex", exercises: ["6 Deadlifts + 6 Hang Cleans + 6 Front Squats + 6 Push Press — 5 rounds", "2min rest between rounds", "Finisher: Max Burpees in 2min", "Cool-Down Stretch — 3min", "Foam Roll — 3min"] },
        { day: "Day 3 — Tabata Barbell", exercises: ["Clean & Press — 20s on/10s off x8", "Deadlift — 20s on/10s off x8", "Front Squat — 20s on/10s off x8", "Row (barbell) — 20s on/10s off x8", "Rest & Stretch — 5min"] }
      ] },
    ],
    tags: ["Olympic Lifting", "Weightlifting", "Strength"]
  },
  {
    id: 18, name: "Zara Williams", specialty: "Senior Fitness & Active Aging",
    category: "mobility", price: 29.99, rating: null, subscribers: 1920, experience: "11 yrs",
    credential: "ACE-CPT", credentialFull: "ACE Certified Personal Trainer",
    specialtyType: "Senior Fitness Specialist",
    bio: "ACE-certified senior fitness specialist. Keeping adults 55+ strong, balanced, and independent through safe, effective exercise.",
    color: "#059669",
    workouts: [
      { name: "Balance & Stability", type: "Mobility", duration: "25 min", difficulty: "Beginner", location: "At Home", price: 19.99, description: "Improve balance and reduce fall risk with gentle, progressive exercises.", sampleDays: [
        { day: "Day 1 — Static Balance", exercises: ["Single-Leg Stand (chair support) — 3x15s/side", "Heel-Toe Walk — 3x20 steps", "Tandem Stand — 3x20s", "Weight Shifts — 3x10/side", "Seated Marches — 3x1min"] },
        { day: "Day 2 — Dynamic Balance", exercises: ["Side Steps (chair nearby) — 3x10/side", "Backwards Walking — 3x10 steps", "Clock Reach — 3x6/side", "Step-Overs (low object) — 3x8", "Seated Leg Extensions — 3x10"] },
        { day: "Day 3 — Coordination", exercises: ["Arm & Leg Opposite Raise — 3x8/side", "Marching with Arm Swings — 3x1min", "Heel-Toe Rocking — 3x12", "Standing Figure 8 — 3x6/side", "Deep Breathing — 3min"] }
      ] },
      { name: "Gentle Strength", type: "Strength", duration: "30 min", difficulty: "Beginner", location: "At Home", price: 22.99, description: "Low-impact strength training to maintain muscle mass, bone density, and daily function.", sampleDays: [
        { day: "Day 1 — Upper Body", exercises: ["Seated Dumbbell Press — 3x10", "Seated Row (band) — 3x12", "Bicep Curls — 3x10", "Tricep Extensions — 3x10", "Wall Push-Ups — 3x8"] },
        { day: "Day 2 — Lower Body", exercises: ["Chair Squats — 3x10", "Seated Leg Press (band) — 3x12", "Standing Calf Raises (chair support) — 3x12", "Seated Knee Extensions — 3x10", "Ankle Circles — 2x10/side"] },
        { day: "Day 3 — Full Body", exercises: ["Seated Overhead Press — 3x10", "Chair Stand-Ups — 3x8", "Seated Chest Press (band) — 3x10", "Standing Hip Abduction — 3x10/side", "Gentle Stretching — 5min"] }
      ] },
      { name: "Chair Yoga", type: "Mobility", duration: "20 min", difficulty: "All Levels", location: "At Home", price: 17.99, description: "Accessible yoga practice done entirely from a chair. Perfect for limited mobility.", sampleDays: [
        { day: "Day 1 — Breathing & Stretch", exercises: ["Seated Deep Breathing — 3min", "Seated Cat-Cow — 3x8", "Seated Side Bend — 3x6/side", "Seated Twist — 30s/side", "Seated Forward Fold — 60s"] },
        { day: "Day 2 — Strength Poses", exercises: ["Seated Warrior (modified) — 30s/side", "Seated Eagle Arms — 30s/side", "Chair Pose (hover) — 3x10s", "Seated Tree Pose — 30s/side", "Gentle Neck Rolls — 1min"] },
        { day: "Day 3 — Flow", exercises: ["Seated Sun Salutation — 5 rounds", "Seated Figure 4 Stretch — 45s/side", "Seated Pigeon — 45s/side", "Seated Meditation — 3min", "Gratitude Breathing — 2min"] }
      ] },
      { name: "Walk & Tone", type: "Cardio", duration: "30 min", difficulty: "Beginner", location: "At Home", price: 19.99, description: "Indoor walking workout with light toning intervals for cardiovascular health.", sampleDays: [
        { day: "Day 1 — Easy Walk", exercises: ["March in Place — 5min", "Side Steps — 3x1min", "March with Arm Raises — 3x1min", "Step-Touch — 3x1min", "Cool-Down March — 3min"] },
        { day: "Day 2 — Walk & Tone", exercises: ["Power March — 4min", "Bicep Curls while Marching — 3x12", "Side Steps with Overhead Press — 3x10", "Standing Leg Curls — 3x10/side", "Gentle March — 3min"] },
        { day: "Day 3 — Endurance Walk", exercises: ["Warm-Up March — 3min", "Fast March — 5min", "Moderate March — 3min", "Fast March — 5min", "Cool-Down & Stretch — 5min"] }
      ] },
    ],
    tags: ["Senior Fitness", "Balance", "Low Impact"]
  },
  {
    id: 19, name: "Jake Morrison", specialty: "Obstacle Course & Functional",
    category: "fullbody", price: 44.99, rating: null, subscribers: 980, experience: "8 yrs",
    credential: "CSCS", credentialFull: "Certified Strength & Conditioning Specialist",
    specialtyType: "Obstacle Course Coach",
    bio: "CSCS-certified Spartan Race champion. Training athletes to conquer obstacle courses and build real-world functional strength.",
    color: "#B45309",
    workouts: [
      { name: "Spartan Prep", type: "HIIT", duration: "50 min", difficulty: "Advanced", location: "Gym", price: 37.99, description: "Complete obstacle course race preparation combining running, climbing, and functional strength.", sampleDays: [
        { day: "Day 1 — Grip & Climb", exercises: ["Dead Hangs — 4x30s", "Farmer Carries — 4x40m", "Rope Climb Practice — 3 ascents", "Pull-Ups — 4x8", "Plate Pinch Hold — 3x30s"] },
        { day: "Day 2 — Run & Carry", exercises: ["800m Run — 3 sets", "Sandbag Carry — 4x50m", "Bear Crawl — 3x30m", "Wall Ball — 3x15", "Sled Push — 4x30m"] },
        { day: "Day 3 — Race Simulation", exercises: ["1-Mile Run Start", "Burpees — 30", "Rope Climb — 1 ascent", "Farmer Carry — 100m", "Sprint Finish — 400m"] }
      ] },
      { name: "Functional Athlete", type: "Strength", duration: "45 min", difficulty: "Intermediate", location: "Gym", price: 32.99, description: "Build real-world strength that transfers to sports, work, and daily life.", sampleDays: [
        { day: "Day 1 — Push & Carry", exercises: ["Sled Push — 4x30m", "Overhead Press — 4x8", "Farmer Carries — 3x40m", "Push-Ups — 3x15", "Plank to Push-Up — 3x10"] },
        { day: "Day 2 — Pull & Climb", exercises: ["Deadlifts — 4x6", "Pull-Ups — 4x8", "Rope Pulls (seated) — 3x5", "Cable Rows — 3x12", "Grip Crushers — 3x15"] },
        { day: "Day 3 — Move & Crawl", exercises: ["Bear Crawl — 4x20m", "Lateral Shuffle — 3x30s", "Box Jumps — 3x10", "Turkish Get-Ups — 3x3/side", "Burpee Broad Jumps — 3x8"] }
      ] },
      { name: "Grip Strength Special", type: "Strength", duration: "30 min", difficulty: "Intermediate", location: "Gym", price: 24.99, description: "Dedicated grip and forearm training for obstacle course success.", sampleDays: [
        { day: "Day 1 — Hang & Hold", exercises: ["Dead Hangs — 5x max hold", "Towel Pull-Ups — 3x5", "Plate Pinch — 3x30s", "Wrist Curls — 3x15", "Finger Extensions (band) — 3x20"] },
        { day: "Day 2 — Carry & Crush", exercises: ["Farmer Carries — 4x40m", "Suitcase Carry — 3x30m/side", "Hand Gripper — 3x10/hand", "Barbell Hold — 3x20s", "Towel Hang — 3x15s"] },
        { day: "Day 3 — Dynamic Grip", exercises: ["Rope Climb — 3 ascents", "Kettlebell Bottoms-Up Press — 3x6/side", "Fat Grip Pull-Ups — 3x5", "Ball Squeeze — 3x20", "Finger Curls — 3x15"] }
      ] },
      { name: "Mud Run Ready", type: "Cardio", duration: "40 min", difficulty: "Beginner", location: "At Home", price: 27.99, description: "Prepare for your first mud run or obstacle race with this 6-week plan.", sampleDays: [
        { day: "Day 1 — Cardio Base", exercises: ["Jog/Walk Intervals — 20min", "Burpees — 3x8", "Bear Crawl — 3x15m", "Mountain Climbers — 3x20", "Stretch — 5min"] },
        { day: "Day 2 — Strength Prep", exercises: ["Bodyweight Squats — 4x15", "Push-Ups — 3x12", "Pull-Up Practice — 3x max", "Plank Hold — 3x45s", "Lunges — 3x10/side"] },
        { day: "Day 3 — Simulation", exercises: ["Run 400m", "10 Burpees", "Run 400m", "20 Squats", "Run 400m + Sprint Finish"] }
      ] },
    ],
    tags: ["Obstacle Course", "Functional", "Spartan"]
  },
  {
    id: 20, name: "Sasha Petrov", specialty: "Kettlebell Training",
    category: "strength", price: 39.99, rating: null, subscribers: 1450, experience: "9 yrs",
    credential: "NASM-CPT", credentialFull: "NASM Certified Personal Trainer",
    specialtyType: "Kettlebell Specialist",
    bio: "NASM-certified kettlebell specialist trained in Russian hardstyle technique. One bell is all you need to transform your body.",
    color: "#7C3AED",
    workouts: [
      { name: "Kettlebell Fundamentals", type: "Strength", duration: "35 min", difficulty: "Beginner", location: "At Home", price: 24.99, description: "Master the six foundational kettlebell movements with proper form.", sampleDays: [
        { day: "Day 1 — Swing & Squat", exercises: ["Kettlebell Deadlift — 3x10", "Two-Hand Swing — 5x10", "Goblet Squat — 3x12", "Swing to Park — 3x5", "Halo — 3x6/direction"] },
        { day: "Day 2 — Press & Row", exercises: ["KB Floor Press — 3x10/side", "KB Row — 3x10/side", "KB Overhead Press — 3x8/side", "KB Windmill — 3x5/side", "KB Carry — 3x30m/side"] },
        { day: "Day 3 — Full Body Flow", exercises: ["Swing — 5x10", "Clean — 3x5/side", "Goblet Squat — 3x10", "Push Press — 3x6/side", "Turkish Get-Up — 3x2/side"] }
      ] },
      { name: "Simple & Sinister", type: "Strength", duration: "30 min", difficulty: "Intermediate", location: "At Home", price: 29.99, description: "Minimalist kettlebell program: swings and Turkish get-ups. Simple but brutally effective.", sampleDays: [
        { day: "Day 1", exercises: ["One-Hand Swing — 10x10 (alternate every 10)", "Turkish Get-Up — 5x1/side", "Light Stretch — 3min", "Focus: Power on each swing", "Total time: ~25min"] },
        { day: "Day 2", exercises: ["One-Hand Swing — 10x10 (alternate every 10)", "Turkish Get-Up — 5x1/side", "Goblet Squat — 3x5 (cooldown)", "Focus: Hinge timing", "Total time: ~25min"] },
        { day: "Day 3", exercises: ["One-Hand Swing — 10x10 (alternate every 10)", "Turkish Get-Up — 5x1/side", "Halo — 3x5/direction (cooldown)", "Focus: Breathing rhythm", "Total time: ~25min"] }
      ] },
      { name: "KB Complex Conditioning", type: "HIIT", duration: "25 min", difficulty: "Advanced", location: "At Home", price: 29.99, description: "Brutal kettlebell complexes that build strength and cardio simultaneously.", sampleDays: [
        { day: "Day 1 — The Armor", exercises: ["Double Clean — 2 reps", "Double Press — 1 rep", "Double Front Squat — 3 reps", "Repeat for 30min EMOM", "Rest as needed"] },
        { day: "Day 2 — Chain Complex", exercises: ["Swing x5 + Clean x5 + Press x5 + Squat x5 — per side", "4 rounds", "2min rest between rounds", "Finisher: 50 Swings for time", "Stretch — 3min"] },
        { day: "Day 3 — Snatch Test", exercises: ["KB Snatch — 100 reps in 5min goal", "Alternate hands every 10 reps", "Rest as needed within 5min", "Cool-Down Swings — 3x10", "Full Body Stretch — 5min"] }
      ] },
      { name: "KB Flow", type: "Bodyweight", duration: "30 min", difficulty: "Intermediate", location: "At Home", price: 24.99, description: "Fluid kettlebell flows linking movements together for coordination and conditioning.", sampleDays: [
        { day: "Day 1 — Basic Flow", exercises: ["Clean to Press to Squat — 3x5/side", "Swing to Catch to Squat — 3x8", "Halo to Squat — 3x6", "Deadlift to Row — 3x8", "Cool-Down — 3min"] },
        { day: "Day 2 — Intermediate Flow", exercises: ["Clean to Squat to Press to Windmill — 3x3/side", "Snatch to Overhead Squat — 3x5/side", "Swing to High Pull — 3x8/side", "Turkish Get-Up Flow — 3x1/side", "Stretch — 3min"] },
        { day: "Day 3 — Challenge Flow", exercises: ["10-Min Continuous Flow (your choice)", "Swing Ladder — 2,4,6,8,10,8,6,4,2", "Double KB Complex — 5 rounds", "Single-Arm Flow — 3x3/side", "Deep Stretch — 5min"] }
      ] },
    ],
    tags: ["Kettlebell", "Strength", "Conditioning"]
  },
  {
    id: 21, name: "Camille Dupont", specialty: "Pilates & Core Training",
    category: "mobility", price: 36.99, rating: null, subscribers: 2100, experience: "10 yrs",
    credential: "NASM-CES", credentialFull: "NASM Corrective Exercise Specialist",
    specialtyType: "Pilates & Core Specialist",
    bio: "NASM corrective exercise specialist with classical Pilates training. Strengthen your core, fix your posture, move with control.",
    color: "#06B6D4",
    workouts: [
      { name: "Classical Pilates", type: "Bodyweight", duration: "40 min", difficulty: "Intermediate", location: "At Home", price: 27.99, description: "Traditional Joseph Pilates mat sequence for core strength and spinal mobility.", sampleDays: [
        { day: "Day 1 — Mat Fundamentals", exercises: ["The Hundred — 100 counts", "Roll-Up — 10 reps", "Single-Leg Circle — 8/side", "Rolling Like a Ball — 8 reps", "Single-Leg Stretch — 10/side"] },
        { day: "Day 2 — Intermediate Series", exercises: ["Double-Leg Stretch — 10 reps", "Criss-Cross — 10/side", "Spine Stretch Forward — 8 reps", "Open-Leg Rocker — 8 reps", "Saw — 6/side"] },
        { day: "Day 3 — Full Mat", exercises: ["Teaser — 3x5", "Swimming — 30s x3", "Leg Pull Front — 3x8", "Side Kick Series — 8/side", "Seal — 8 reps"] }
      ] },
      { name: "Core Rehab", type: "Mobility", duration: "25 min", difficulty: "Beginner", location: "At Home", price: 22.99, description: "Therapeutic core program for back pain relief and postural correction.", sampleDays: [
        { day: "Day 1 — Activation", exercises: ["Pelvic Floor Engagement — 3x10", "Dead Bug — 3x8/side", "Pelvic Tilts — 3x12", "Glute Bridge — 3x12", "Diaphragmatic Breathing — 3min"] },
        { day: "Day 2 — Stability", exercises: ["Bird-Dog — 3x8/side", "Modified Side Plank — 3x15s/side", "Supine March — 3x10/side", "Prone Back Extension — 3x8", "Child's Pose — 90s"] },
        { day: "Day 3 — Integration", exercises: ["Plank on Forearms — 3x20s", "Side-Lying Leg Lift — 3x12/side", "Bridge March — 3x8/side", "Cat-Cow — 3x10", "Spine Stretch — 60s/side"] }
      ] },
      { name: "Posture Fix", type: "Mobility", duration: "20 min", difficulty: "All Levels", location: "At Home", price: 19.99, description: "Daily posture correction routine targeting desk workers and tech neck.", sampleDays: [
        { day: "Day 1 — Upper Back", exercises: ["Chin Tucks — 3x12", "Wall Angels — 3x10", "Doorway Chest Stretch — 60s/side", "Thoracic Extension — 3x8", "Shoulder Blade Squeezes — 3x15"] },
        { day: "Day 2 — Lower Back & Hips", exercises: ["Hip Flexor Stretch — 60s/side", "Cat-Cow — 3x10", "Glute Bridge — 3x12", "Pelvic Tilts — 3x10", "Hamstring Stretch — 60s/side"] },
        { day: "Day 3 — Full Posture Reset", exercises: ["Full Body Foam Roll — 5min", "Wall Slide — 3x10", "Supine Spinal Twist — 60s/side", "Standing Posture Check — 2min", "Deep Breathing — 3min"] }
      ] },
      { name: "Power Pilates", type: "HIIT", duration: "35 min", difficulty: "Advanced", location: "At Home", price: 29.99, description: "High-intensity Pilates-inspired workout combining core endurance with athletic movements.", sampleDays: [
        { day: "Day 1 — Core Fire", exercises: ["Hundred Sprint — 200 counts", "Teaser V-Up — 3x10", "Plank Pike Jump — 3x10", "Jackknife — 3x8", "Mountain Climber Twist — 3x12/side"] },
        { day: "Day 2 — Athletic Pilates", exercises: ["Burpee to Pilates Roll — 3x8", "Single-Leg Teaser — 3x6/side", "Push-Up to Pike — 3x10", "Leg Pull Back — 3x8", "Standing Roll-Down to Plank — 3x6"] },
        { day: "Day 3 — Endurance Mat", exercises: ["Full Classical Sequence — 20min non-stop", "Plank Series — 5min", "Side Series — 3min/side", "Stretch & Release — 5min", "Seated Meditation — 2min"] }
      ] },
    ],
    tags: ["Pilates", "Core", "Posture"]
  },
];

const nutritionists = [
  {
    id: 101, name: "Dr. Sarah Mitchell", specialty: "Sports & Performance Nutrition",
    category: "sports", price: 59.99, rating: null, subscribers: 980, experience: "14 yrs",
    credential: "RDN", credentialFull: "Registered Dietitian Nutritionist",
    specialtyType: "Sports/Performance Nutritionist",
    bio: "PhD in Nutritional Science. Registered Dietitian specializing in performance nutrition for athletes — from amateur to Olympic level.",
    color: "#10B981", nutritionistOfMonth: true,
    notmQuote: "Food is fuel, but the right food is a superpower. Let's unlock yours.",
    services: ["Custom meal plans", "Macro coaching", "Supplement guidance", "Competition prep"],
    plans: [
      { name: "High Protein Performance", type: "High Protein", duration: "8 weeks", difficulty: "Intermediate", price: 34.99, description: "Optimized macro split for muscle growth and recovery. 40/30/30 protein-forward approach.", sampleDays: [
        { day: "Day 1", calories: "2,180 cal", protein: "172g protein", breakfast: "6 egg whites with spinach, whole grain toast, and turkey sausage", lunch: "Grilled chicken breast with quinoa and roasted vegetables", dinner: "Pan-seared salmon with sweet potato and steamed broccoli" },
        { day: "Day 2", calories: "2,240 cal", protein: "185g protein", breakfast: "Protein overnight oats with whey, blueberries, and almond butter", lunch: "Lean ground turkey bowl with brown rice and black beans", dinner: "Grilled sirloin steak with asparagus and baked potato" },
        { day: "Day 3", calories: "2,050 cal", protein: "168g protein", breakfast: "Greek yogurt with granola, honey, and mixed berries", lunch: "Tuna salad wrap with avocado and mixed greens", dinner: "Chicken stir-fry with bell peppers and jasmine rice" }
      ] },
      { name: "Competition Prep Plan", type: "Low Carb", duration: "12 weeks", difficulty: "Advanced", price: 44.99, description: "Periodized nutrition plan for athletes peaking for competition. Precise carb cycling included.", sampleDays: [
        { day: "Day 1 — Low Carb", calories: "1,620 cal", protein: "165g protein", breakfast: "Egg white frittata with spinach, mushrooms, and feta", lunch: "Herb-crusted tilapia with asparagus and cauliflower rice", dinner: "Turkey lettuce wraps with avocado and salsa" },
        { day: "Day 2 — Moderate Carb", calories: "1,750 cal", protein: "158g protein", breakfast: "Oatmeal with protein powder, walnuts, and cinnamon", lunch: "Chicken breast with sweet potato and green beans", dinner: "Lean ground beef with zucchini noodles and marinara" },
        { day: "Day 3 — High Carb (Refeed)", calories: "1,780 cal", protein: "152g protein", breakfast: "Pancakes with banana, maple syrup, and egg whites on the side", lunch: "Chicken and rice bowl with teriyaki sauce and edamame", dinner: "Pasta with grilled shrimp, garlic, and olive oil" }
      ] },
      { name: "Clean Bulk Blueprint", type: "High Calorie", duration: "10 weeks", difficulty: "Intermediate", price: 39.99, description: "Structured surplus plan to gain lean mass without excess fat. Includes supplement timing.", sampleDays: [
        { day: "Day 1", calories: "3,050 cal", protein: "185g protein", breakfast: "Peanut butter banana protein smoothie with oats and whole milk", lunch: "Double chicken burrito bowl with rice, black beans, and cheese", dinner: "Beef stir-fry with noodles, mixed vegetables, and sesame oil" },
        { day: "Day 2", calories: "2,920 cal", protein: "178g protein", breakfast: "4 whole eggs scrambled with cheese, toast, and avocado", lunch: "Turkey and avocado sandwich with sweet potato fries", dinner: "Salmon with wild rice, roasted broccoli, and olive oil drizzle" },
        { day: "Day 3", calories: "3,180 cal", protein: "192g protein", breakfast: "Mass gainer shake with oats, banana, peanut butter, and whey", lunch: "Grilled chicken thighs with pasta and pesto sauce", dinner: "Lean ground beef tacos with rice, beans, and guacamole" }
      ] },
      { name: "Race Day Fuel Guide", type: "Performance", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Pre, during, and post-race nutrition strategy for endurance athletes.", sampleDays: [
        { day: "Day 1 — Pre-Race", calories: "2,350 cal", protein: "155g protein", breakfast: "Oatmeal with banana, honey, and almond butter", lunch: "Pasta with lean turkey bolognese and side salad", dinner: "Grilled chicken with white rice and steamed vegetables" },
        { day: "Day 2 — Race Day", calories: "2,480 cal", protein: "148g protein", breakfast: "Toast with peanut butter and jam, plus a banana", lunch: "Mid-race energy gels, electrolyte drink, and orange slices", dinner: "Recovery shake with whey, berries, and a turkey sandwich" },
        { day: "Day 3 — Recovery Day", calories: "2,280 cal", protein: "162g protein", breakfast: "Smoothie with tart cherry juice, protein, and oats", lunch: "Salmon with sweet potato and sauteed spinach", dinner: "Energy date balls with coconut, chia seeds, and a casein shake" }
      ] },
    ],
    tags: ["Performance", "Athletes", "Macro Coaching"]
  },
  {
    id: 102, name: "James Okafor", specialty: "Weight Management",
    category: "weightloss", price: 44.99, rating: null, subscribers: 1650, experience: "9 yrs",
    credential: "RD", credentialFull: "Registered Dietitian",
    specialtyType: "Clinical Nutritionist",
    bio: "Registered Dietitian focused on sustainable weight loss. No fad diets — just science-backed strategies that stick.",
    color: "#6C3AED",
    services: ["Calorie-deficit plans", "Habit coaching", "Weekly check-ins", "Grocery guides"],
    plans: [
      { name: "Sustainable Deficit Plan", type: "Low Calorie", duration: "12 weeks", difficulty: "Beginner", price: 29.99, description: "Gradual calorie reduction with flexible food choices. No crash dieting — just steady results.", sampleDays: [
        { day: "Day 1", calories: "1,480 cal", protein: "125g protein", breakfast: "Greek yogurt parfait with mixed berries and a drizzle of honey", lunch: "Grilled chicken salad with cucumbers, tomatoes, and light vinaigrette", dinner: "Zucchini noodles with shrimp, garlic, and cherry tomatoes" },
        { day: "Day 2", calories: "1,520 cal", protein: "118g protein", breakfast: "Two scrambled eggs with spinach and whole grain toast", lunch: "Turkey and veggie lettuce wraps with hummus", dinner: "Baked cod with roasted broccoli and a small baked potato" },
        { day: "Day 3", calories: "1,450 cal", protein: "132g protein", breakfast: "Smoothie with banana, spinach, protein powder, and almond milk", lunch: "Lentil soup with a side of mixed green salad", dinner: "Grilled chicken breast with steamed green beans and quinoa" }
      ] },
      { name: "Macro Counting Mastery", type: "Balanced", duration: "8 weeks", difficulty: "Intermediate", price: 34.99, description: "Learn to track and balance macros while hitting your weight loss goals.", sampleDays: [
        { day: "Day 1", calories: "1,650 cal", protein: "128g protein", breakfast: "Overnight oats with chia seeds, almond butter, and banana", lunch: "Turkey and avocado whole wheat wrap with side salad", dinner: "Salmon with brown rice and steamed broccoli" },
        { day: "Day 2", calories: "1,580 cal", protein: "135g protein", breakfast: "Egg white omelette with peppers, onions, and feta cheese", lunch: "Chicken and quinoa bowl with roasted sweet potato", dinner: "Lean ground turkey tacos with lettuce, salsa, and cheese" },
        { day: "Day 3", calories: "1,620 cal", protein: "122g protein", breakfast: "Cottage cheese bowl with fruit, granola, and a drizzle of honey", lunch: "Grilled shrimp salad with avocado and balsamic dressing", dinner: "Baked chicken thigh with roasted vegetables and wild rice" }
      ] },
      { name: "Metabolic Reset", type: "High Protein", duration: "6 weeks", difficulty: "Intermediate", price: 32.99, description: "Reverse diet protocol to restore metabolism after prolonged restriction.", sampleDays: [
        { day: "Day 1", calories: "1,780 cal", protein: "148g protein", breakfast: "Protein pancakes with blueberries and a side of turkey bacon", lunch: "Steak salad with mixed greens, avocado, and balsamic glaze", dinner: "Grilled salmon with roasted sweet potato and green beans" },
        { day: "Day 2", calories: "1,820 cal", protein: "155g protein", breakfast: "Scrambled eggs with cheese, whole wheat toast, and fruit", lunch: "Tuna poke bowl with edamame, brown rice, and pickled ginger", dinner: "Chicken breast with mashed potatoes and sauteed spinach" },
        { day: "Day 3", calories: "1,750 cal", protein: "142g protein", breakfast: "Greek yogurt with granola, walnuts, and sliced banana", lunch: "Turkey burger (no bun) with sweet potato fries and coleslaw", dinner: "Lean beef stir-fry with bell peppers and jasmine rice" }
      ] },
      { name: "Weekend-Proof Plan", type: "Flexible", duration: "8 weeks", difficulty: "Beginner", price: 27.99, description: "A practical plan that accounts for social eating and weekends without derailing progress.", sampleDays: [
        { day: "Day 1 — Weekday", calories: "1,580 cal", protein: "115g protein", breakfast: "Veggie omelette with whole wheat toast and fruit", lunch: "Build-your-own grain bowl with lean protein and veggies", dinner: "Grilled chicken stir-fry with flexible carb options" },
        { day: "Day 2 — Weekday", calories: "1,550 cal", protein: "120g protein", breakfast: "Overnight oats with peanut butter and banana", lunch: "Chicken Caesar salad (light dressing) with a breadstick", dinner: "Baked fish with roasted vegetables and a small portion of rice" },
        { day: "Day 3 — Weekend", calories: "1,700 cal", protein: "112g protein", breakfast: "Brunch-style eggs benedict (lighter portion) with fruit", lunch: "Grilled chicken sandwich with side salad instead of fries", dinner: "Portion-controlled pizza night (2 slices) with a large salad" }
      ] },
    ],
    tags: ["Weight Loss", "Sustainable", "Habit Coaching"]
  },
  {
    id: 103, name: "Maria Santos", specialty: "Plant-Based Nutrition",
    category: "plantbased", price: 39.99, rating: null, subscribers: 1120, experience: "7 yrs",
    credential: "CN", credentialFull: "Certified Nutritionist",
    specialtyType: "Functional/Integrative Nutritionist",
    bio: "Certified Nutritionist helping people thrive on vegan and vegetarian diets without missing nutrients.",
    color: "#EC4899",
    services: ["Vegan meal plans", "Nutrient optimization", "Recipe library", "Transition coaching"],
    plans: [
      { name: "Plant-Powered Starter", type: "Vegan", duration: "4 weeks", difficulty: "Beginner", price: 24.99, description: "Ease into plant-based eating with simple swaps and complete nutrition guidance.", sampleDays: [
        { day: "Day 1", calories: "1,720 cal", protein: "85g protein", breakfast: "Avocado toast with hemp seeds, cherry tomatoes, and lemon", lunch: "Chickpea and vegetable curry with basmati rice", dinner: "Black bean tacos with mango salsa and cashew crema" },
        { day: "Day 2", calories: "1,680 cal", protein: "82g protein", breakfast: "Smoothie bowl with acai, banana, granola, and coconut flakes", lunch: "Mediterranean hummus wrap with cucumber, tomato, and olives", dinner: "Veggie stir-fry with tofu, broccoli, and soy-ginger sauce" },
        { day: "Day 3", calories: "1,750 cal", protein: "88g protein", breakfast: "Overnight oats with almond milk, chia seeds, and mixed berries", lunch: "Roasted vegetable and quinoa salad with tahini dressing", dinner: "Lentil and sweet potato coconut curry with naan bread" }
      ] },
      { name: "High Protein Vegan", type: "High Protein", duration: "8 weeks", difficulty: "Intermediate", price: 34.99, description: "Hit your protein goals without animal products. Includes 60+ recipes.", sampleDays: [
        { day: "Day 1", calories: "2,050 cal", protein: "125g protein", breakfast: "Tofu scramble with black beans, sweet potato, and nutritional yeast", lunch: "Tempeh stir-fry with broccoli, edamame, and peanut sauce", dinner: "Lentil bolognese with whole wheat pasta and side salad" },
        { day: "Day 2", calories: "2,120 cal", protein: "128g protein", breakfast: "Protein smoothie with pea protein, banana, spinach, and almond butter", lunch: "Chickpea and quinoa power bowl with tahini and roasted veggies", dinner: "Black bean burgers with avocado and sweet potato wedges" },
        { day: "Day 3", calories: "1,980 cal", protein: "122g protein", breakfast: "Peanut butter and banana oatmeal with hemp seeds and soy milk", lunch: "Seitan wrap with hummus, arugula, and pickled onions", dinner: "Thai red curry with tofu, chickpeas, and jasmine rice" }
      ] },
      { name: "Whole Foods Reset", type: "Whole Foods", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Eliminate processed foods and reset your palate with nutrient-dense whole foods.", sampleDays: [
        { day: "Day 1", calories: "1,620 cal", protein: "82g protein", breakfast: "Fresh fruit bowl with raw almonds and coconut flakes", lunch: "Quinoa Buddha bowl with roasted vegetables and lemon-tahini dressing", dinner: "Sweet potato and lentil soup with crusty sourdough bread" },
        { day: "Day 2", calories: "1,580 cal", protein: "78g protein", breakfast: "Steel-cut oats with cinnamon, walnuts, and fresh apple slices", lunch: "Fresh spring rolls with vegetables and almond dipping sauce", dinner: "Stuffed bell peppers with brown rice, black beans, and corn" },
        { day: "Day 3", calories: "1,650 cal", protein: "85g protein", breakfast: "Green smoothie with kale, mango, banana, and coconut water", lunch: "Mixed bean salad with cucumber, tomato, and olive oil dressing", dinner: "Roasted cauliflower steaks with chimichurri and wild rice" }
      ] },
      { name: "Vegan Athlete Fuel", type: "Performance", duration: "10 weeks", difficulty: "Advanced", price: 39.99, description: "High-performance plant-based plan for serious athletes and active lifestyles.", sampleDays: [
        { day: "Day 1", calories: "2,180 cal", protein: "118g protein", breakfast: "Power smoothie with banana, spirulina, oat milk, and pea protein", lunch: "Loaded veggie burrito with brown rice, black beans, and guacamole", dinner: "Chickpea pasta with roasted red pepper sauce and nutritional yeast" },
        { day: "Day 2", calories: "2,250 cal", protein: "122g protein", breakfast: "Tofu breakfast scramble with sweet potato hash and avocado", lunch: "Lentil and quinoa bowl with roasted beets and hemp seed dressing", dinner: "Tempeh teriyaki with stir-fried vegetables and brown rice" },
        { day: "Day 3", calories: "2,080 cal", protein: "115g protein", breakfast: "Pre-workout energy bites with oats, dates, and peanut butter", lunch: "Giant salad with edamame, chickpeas, avocado, and seeds", dinner: "Plant-based protein bowl with soba noodles and miso broth" }
      ] },
    ],
    tags: ["Vegan", "Plant-Based", "Whole Foods"]
  },
  {
    id: 104, name: "Dr. Kevin Park", specialty: "Gut Health & Wellness",
    category: "guthealth", price: 54.99, rating: null, subscribers: 760, experience: "16 yrs",
    credential: "CNS", credentialFull: "Certified Nutrition Specialist",
    specialtyType: "Functional/Integrative Nutritionist",
    bio: "Certified Nutrition Specialist in functional medicine specializing in gut health, food sensitivities, and anti-inflammatory protocols.",
    color: "#F59E0B",
    services: ["Elimination protocols", "Gut healing plans", "Food sensitivity guidance", "Anti-inflammatory diets"],
    plans: [
      { name: "Gut Restore Protocol", type: "Anti-Inflammatory", duration: "8 weeks", difficulty: "Intermediate", price: 39.99, description: "Step-by-step gut healing plan with probiotics, bone broth, and targeted elimination.", sampleDays: [
        { day: "Day 1", calories: "1,680 cal", protein: "115g protein", breakfast: "Bone broth with ginger, turmeric, and collagen peptides", lunch: "Baked salmon with sauerkraut and steamed leafy greens", dinner: "Slow-cooked chicken with roasted root vegetables and herbs" },
        { day: "Day 2", calories: "1,720 cal", protein: "108g protein", breakfast: "Probiotic yogurt bowl with flaxseed, walnuts, and blueberries", lunch: "Turkey and avocado lettuce wraps with fermented pickles", dinner: "Herb-baked cod with steamed zucchini and bone broth soup" },
        { day: "Day 3", calories: "1,650 cal", protein: "120g protein", breakfast: "Warm lemon water followed by oatmeal with slippery elm and banana", lunch: "Chicken and vegetable soup with fresh ginger and turmeric", dinner: "Grilled salmon with kimchi, brown rice, and steamed broccoli" }
      ] },
      { name: "Anti-Inflammatory Reset", type: "Low Carb", duration: "6 weeks", difficulty: "Beginner", price: 34.99, description: "Remove inflammatory triggers and rebuild with healing whole foods.", sampleDays: [
        { day: "Day 1", calories: "1,580 cal", protein: "112g protein", breakfast: "Berry smoothie with collagen, almond butter, and coconut milk", lunch: "Turmeric-spiced chicken with roasted cauliflower and olive oil", dinner: "Wild-caught cod with sauteed leafy greens and lemon" },
        { day: "Day 2", calories: "1,620 cal", protein: "105g protein", breakfast: "Chia pudding with coconut milk, walnuts, and cinnamon", lunch: "Grilled chicken salad with avocado, cucumber, and olive oil dressing", dinner: "Baked turkey meatballs with zucchini noodles and basil" },
        { day: "Day 3", calories: "1,550 cal", protein: "118g protein", breakfast: "Scrambled eggs with turmeric, spinach, and avocado", lunch: "Salmon and avocado bowl with mixed greens and seeds", dinner: "Slow-cooked beef stew with anti-inflammatory spices and root vegetables" }
      ] },
      { name: "Food Sensitivity Blueprint", type: "Elimination", duration: "10 weeks", difficulty: "Advanced", price: 44.99, description: "Structured elimination and reintroduction protocol to identify your triggers.", sampleDays: [
        { day: "Day 1 — Elimination Phase", calories: "1,650 cal", protein: "108g protein", breakfast: "Pear and oat porridge with cinnamon and coconut oil", lunch: "Simple rice bowl with steamed vegetables and olive oil", dinner: "Baked chicken breast with zucchini, carrots, and herbs" },
        { day: "Day 2 — Elimination Phase", calories: "1,600 cal", protein: "102g protein", breakfast: "Rice cereal with coconut milk and sliced banana", lunch: "Turkey patties with sweet potato and steamed green beans", dinner: "Baked white fish with roasted squash and fresh dill" },
        { day: "Day 3 — Reintroduction Phase", calories: "1,720 cal", protein: "115g protein", breakfast: "Oatmeal with one test food introduced (e.g., dairy or eggs)", lunch: "Chicken and rice with the test food included", dinner: "Simple protein with vegetables — monitor and log symptoms" }
      ] },
      { name: "Digestive Wellness Plan", type: "Balanced", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Daily meal plans designed to support healthy digestion and reduce bloating.", sampleDays: [
        { day: "Day 1", calories: "1,750 cal", protein: "118g protein", breakfast: "Banana oat pancakes with a drizzle of honey and cinnamon", lunch: "Miso soup with tofu, seaweed, and steamed rice", dinner: "Grilled chicken with roasted fennel, quinoa, and lemon" },
        { day: "Day 2", calories: "1,680 cal", protein: "112g protein", breakfast: "Warm ginger tea with yogurt, papaya, and pumpkin seeds", lunch: "Poached chicken salad with cucumber, mint, and light dressing", dinner: "Baked salmon with steamed asparagus and mashed sweet potato" },
        { day: "Day 3", calories: "1,800 cal", protein: "125g protein", breakfast: "Smoothie with kefir, banana, ginger, and a pinch of turmeric", lunch: "Lentil soup with cumin, coriander, and a slice of sourdough", dinner: "Herb-baked chicken thigh with roasted carrots and brown rice" }
      ] },
    ],
    tags: ["Gut Health", "Functional", "Anti-Inflammatory"]
  },
  {
    id: 105, name: "Rachel Kim", specialty: "Prenatal & Postnatal",
    category: "prenatal", price: 49.99, rating: null, subscribers: 540, experience: "10 yrs",
    credential: "RDN", credentialFull: "Registered Dietitian Nutritionist",
    specialtyType: "Prenatal/Maternal Nutritionist",
    bio: "Registered Dietitian specializing in nutrition for expecting and new mothers. Ensures optimal nutrition for both mom and baby.",
    color: "#8B5CF6",
    services: ["Trimester-specific plans", "Postnatal recovery nutrition", "Lactation support", "Iron & folate optimization"],
    plans: [
      { name: "First Trimester Foundations", type: "Prenatal", duration: "12 weeks", difficulty: "Beginner", price: 34.99, description: "Nausea-friendly meals packed with folate, iron, and essential nutrients for early pregnancy.", sampleDays: [
        { day: "Day 1", calories: "1,820 cal", protein: "95g protein", breakfast: "Ginger tea with plain toast and a small banana", lunch: "Spinach and cheese quesadilla with sliced fruit", dinner: "Mild lentil soup with whole grain crackers and a side salad" },
        { day: "Day 2", calories: "1,780 cal", protein: "92g protein", breakfast: "Small portions of scrambled eggs with dry toast", lunch: "Ginger lemon chicken with brown rice and steamed carrots", dinner: "Baked sweet potato with cottage cheese and steamed broccoli" },
        { day: "Day 3", calories: "1,880 cal", protein: "98g protein", breakfast: "Smoothie with mango, yogurt, and a prenatal-friendly greens blend", lunch: "Turkey and avocado wrap with a cup of chicken broth", dinner: "Pasta with mild tomato sauce, ground turkey, and spinach" }
      ] },
      { name: "Third Trimester Power Plan", type: "High Calorie", duration: "12 weeks", difficulty: "Intermediate", price: 37.99, description: "Calorie-dense nutrition to support baby's growth and prepare your body for delivery.", sampleDays: [
        { day: "Day 1", calories: "2,150 cal", protein: "115g protein", breakfast: "Nut butter smoothie with oats, banana, and whole milk", lunch: "Salmon with mashed sweet potato and sauteed kale", dinner: "Chicken thighs with roasted root vegetables and quinoa" },
        { day: "Day 2", calories: "2,080 cal", protein: "110g protein", breakfast: "Eggs with whole grain toast, avocado, and a glass of orange juice", lunch: "Turkey and cheese sandwich with fruit and yogurt", dinner: "Beef stew with potatoes, carrots, and a slice of bread" },
        { day: "Day 3", calories: "2,200 cal", protein: "108g protein", breakfast: "Oatmeal with dried fruit, walnuts, and a drizzle of maple syrup", lunch: "Chicken Caesar salad with extra protein and a breadstick", dinner: "Baked cod with brown rice, roasted broccoli, and butter" }
      ] },
      { name: "Postnatal Recovery Plan", type: "Recovery", duration: "8 weeks", difficulty: "Beginner", price: 34.99, description: "Healing foods and balanced meals to support recovery and energy after birth.", sampleDays: [
        { day: "Day 1", calories: "1,920 cal", protein: "105g protein", breakfast: "Overnight oats with dates, pumpkin seeds, and cinnamon", lunch: "Iron-rich beef stew with dark leafy greens and bread", dinner: "Warm salmon and avocado rice bowl with sesame seeds" },
        { day: "Day 2", calories: "1,850 cal", protein: "112g protein", breakfast: "Eggs with spinach, whole wheat toast, and fresh fruit", lunch: "Chicken and vegetable soup with a side of crackers", dinner: "Baked chicken breast with sweet potato and steamed green beans" },
        { day: "Day 3", calories: "1,980 cal", protein: "98g protein", breakfast: "Greek yogurt with iron-rich granola and mixed berries", lunch: "Turkey wrap with hummus, spinach, and bell peppers", dinner: "Slow-cooked pork with mashed potatoes and roasted carrots" }
      ] },
      { name: "Lactation Boost Plan", type: "High Protein", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Nutrient-rich meals to support milk production and postpartum energy levels.", sampleDays: [
        { day: "Day 1", calories: "2,050 cal", protein: "118g protein", breakfast: "Oatmeal lactation cookies with brewer's yeast and a glass of milk", lunch: "Chicken and vegetable stir-fry with sesame and brown rice", dinner: "Salmon with roasted asparagus and quinoa" },
        { day: "Day 2", calories: "1,980 cal", protein: "115g protein", breakfast: "Greek yogurt with granola, flaxseed, and berries", lunch: "Turkey and avocado sandwich with a side of fruit", dinner: "Lean beef tacos with cheese, tomato, and a lactation smoothie" },
        { day: "Day 3", calories: "2,120 cal", protein: "120g protein", breakfast: "Whole grain waffles with almond butter, banana, and fenugreek tea", lunch: "Lentil soup with a slice of buttered sourdough bread", dinner: "Chicken breast with sweet potato mash and steamed broccoli" }
      ] },
    ],
    tags: ["Prenatal", "Postnatal", "Maternal Health"]
  },
  {
    id: 106, name: "Alex Rivera", specialty: "Meal Prep & Budget",
    category: "mealprep", price: 32.99, rating: null, subscribers: 2200, experience: "6 yrs",
    credential: "Health Coach", credentialFull: "Certified Health & Nutrition Coach",
    specialtyType: "Health Coach/Nutrition Coach",
    bio: "Certified Nutrition Coach making healthy eating affordable and easy. Weekly meal prep plans that save time, money, and taste amazing.",
    color: "#EF4444",
    services: ["Budget meal plans", "Batch cooking guides", "Shopping lists", "Quick recipes under 20 min"],
    plans: [
      { name: "$50/Week Meal Plan", type: "Budget", duration: "4 weeks", difficulty: "Beginner", price: 22.99, description: "Complete weekly meal plan for one person on a tight budget. Includes shopping lists.", sampleDays: [
        { day: "Day 1", calories: "1,720 cal", protein: "105g protein", breakfast: "Scrambled eggs with toast and a banana", lunch: "Rice and beans with roasted frozen vegetables", dinner: "Pasta with canned tomatoes, garlic, and chickpeas" },
        { day: "Day 2", calories: "1,680 cal", protein: "112g protein", breakfast: "Oatmeal with peanut butter and a drizzle of honey", lunch: "Egg fried rice with cabbage and soy sauce", dinner: "Baked chicken drumsticks with roasted potatoes and frozen peas" },
        { day: "Day 3", calories: "1,750 cal", protein: "108g protein", breakfast: "Toast with peanut butter and sliced banana", lunch: "Black bean quesadilla with salsa and sour cream", dinner: "Spaghetti with meat sauce (ground beef) and a side of bread" }
      ] },
      { name: "Sunday Prep Master", type: "Meal Prep", duration: "6 weeks", difficulty: "Beginner", price: 27.99, description: "Prep all your weekday meals in under 2 hours every Sunday. Step-by-step guide.", sampleDays: [
        { day: "Day 1", calories: "1,850 cal", protein: "128g protein", breakfast: "Pre-made egg muffins with veggies and cheese", lunch: "Chicken thigh meal prep with rice and broccoli", dinner: "Turkey taco bowls with black beans, corn, and salsa" },
        { day: "Day 2", calories: "1,780 cal", protein: "122g protein", breakfast: "Overnight oats (prepped Sunday) with fruit and nuts", lunch: "Sheet pan sausage with peppers and sweet potato", dinner: "Pre-portioned pasta with turkey meatballs and marinara" },
        { day: "Day 3", calories: "1,920 cal", protein: "135g protein", breakfast: "Grab-and-go smoothie packs (frozen, blend in AM)", lunch: "Mason jar salad with chicken and ranch dressing", dinner: "Slow cooker pulled chicken with coleslaw and rolls" }
      ] },
      { name: "Family of Four Plan", type: "Budget", duration: "8 weeks", difficulty: "Intermediate", price: 34.99, description: "Healthy, kid-friendly meals for the whole family without breaking the bank.", sampleDays: [
        { day: "Day 1", calories: "1,880 cal", protein: "95g protein", breakfast: "Pancakes with syrup and scrambled eggs", lunch: "PB&J sandwiches with carrot sticks and apple slices", dinner: "One-pot chicken pasta with hidden veggies" },
        { day: "Day 2", calories: "1,820 cal", protein: "92g protein", breakfast: "Cereal with milk and a piece of fruit", lunch: "Quesadillas with cheese, chicken, and a side of grapes", dinner: "Homemade fish sticks with oven fries and ketchup" },
        { day: "Day 3", calories: "1,950 cal", protein: "98g protein", breakfast: "Toast with butter, eggs, and orange juice", lunch: "Turkey and cheese wraps with cucumber slices", dinner: "Slow cooker chili with cornbread and shredded cheese" }
      ] },
      { name: "15-Minute Meals", type: "Quick Recipes", duration: "4 weeks", difficulty: "Beginner", price: 24.99, description: "30 quick and healthy recipes that go from fridge to plate in 15 minutes or less.", sampleDays: [
        { day: "Day 1", calories: "1,680 cal", protein: "115g protein", breakfast: "Avocado toast with a fried egg and everything seasoning", lunch: "Caprese chicken with balsamic glaze and mixed greens", dinner: "Shrimp and garlic butter with couscous and lemon" },
        { day: "Day 2", calories: "1,620 cal", protein: "108g protein", breakfast: "Greek yogurt with honey, granola, and berries", lunch: "Turkey and hummus wrap with cucumber and tomato", dinner: "Black bean quesadillas with quick guacamole and salsa" },
        { day: "Day 3", calories: "1,750 cal", protein: "120g protein", breakfast: "Smoothie with frozen fruit, yogurt, and a handful of spinach", lunch: "Tuna salad on crackers with a side of fruit", dinner: "One-pan lemon herb chicken with cherry tomatoes and orzo" }
      ] },
    ],
    tags: ["Budget-Friendly", "Meal Prep", "Quick Recipes"]
  },
  {
    id: 107, name: "Tanya Brooks", specialty: "Sports & Performance Nutrition",
    category: "sports", price: 54.99, rating: null, subscribers: 1340, experience: "11 yrs",
    credential: "RD", credentialFull: "Registered Dietitian",
    specialtyType: "Sports/Performance Nutritionist",
    bio: "Former collegiate athlete turned Registered Dietitian. Builds fuel strategies for strength, endurance, and recovery.",
    color: "#0EA5E9", featured: true,
    services: ["Periodized nutrition", "Hydration protocols", "Recovery plans", "Race-day fueling"],
    plans: [
      { name: "Strength Fuel Plan", type: "High Protein", duration: "8 weeks", difficulty: "Intermediate", price: 36.99, description: "Calorie and macro targets built around your training splits for max strength gains.", sampleDays: [
        { day: "Day 1 — Training Day", calories: "2,320 cal", protein: "188g protein", breakfast: "4 whole eggs with turkey sausage, oats, and a banana", lunch: "Grilled steak with baked potato and asparagus", dinner: "Protein-packed chicken and rice meal prep with broccoli" },
        { day: "Day 2 — Training Day", calories: "2,280 cal", protein: "192g protein", breakfast: "Post-workout whey shake with oats, banana, and peanut butter", lunch: "Salmon with sweet potato and steamed green beans", dinner: "Lean ground beef with jasmine rice and mixed vegetables" },
        { day: "Day 3 — Rest Day", calories: "2,050 cal", protein: "165g protein", breakfast: "Greek yogurt with granola, honey, and mixed berries", lunch: "Turkey and avocado wrap with a side salad", dinner: "Grilled chicken breast with quinoa and roasted vegetables" }
      ] },
      { name: "Endurance Nutrition System", type: "Performance", duration: "10 weeks", difficulty: "Advanced", price: 42.99, description: "Carb loading, mid-race fueling, and recovery nutrition for distance athletes.", sampleDays: [
        { day: "Day 1 — Carb Loading", calories: "2,650 cal", protein: "158g protein", breakfast: "Whole wheat pasta with chicken and marinara sauce", lunch: "Large rice bowl with grilled chicken, beans, and corn", dinner: "Bagel with peanut butter, banana, and a glass of juice" },
        { day: "Day 2 — Race Day", calories: "2,480 cal", protein: "152g protein", breakfast: "Pre-run oatmeal with honey and a banana", lunch: "Mid-race energy gels, sports drink, and rice cakes", dinner: "Recovery smoothie with tart cherry, protein, and oats" },
        { day: "Day 3 — Recovery", calories: "2,550 cal", protein: "168g protein", breakfast: "Eggs with toast, avocado, and orange juice", lunch: "Salmon with sweet potato and sauteed spinach", dinner: "Chicken stir-fry with brown rice and anti-inflammatory spices" }
      ] },
      { name: "Recovery Rebuild", type: "Anti-Inflammatory", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Post-training recovery meals rich in antioxidants and anti-inflammatory compounds.", sampleDays: [
        { day: "Day 1", calories: "1,780 cal", protein: "125g protein", breakfast: "Blueberry almond overnight oats with chia seeds", lunch: "Turmeric salmon with wild rice and mixed greens", dinner: "Tart cherry and beet recovery smoothie bowl with granola" },
        { day: "Day 2", calories: "1,720 cal", protein: "118g protein", breakfast: "Acai bowl with mixed berries, coconut, and hemp seeds", lunch: "Grilled chicken salad with walnuts, berries, and olive oil", dinner: "Baked cod with roasted sweet potato and steamed broccoli" },
        { day: "Day 3", calories: "1,850 cal", protein: "132g protein", breakfast: "Green smoothie with spinach, pineapple, ginger, and turmeric", lunch: "Turkey and avocado lettuce wraps with a side of fruit", dinner: "Herb-crusted salmon with quinoa and sauteed kale" }
      ] },
      { name: "Game Day Protocol", type: "Performance", duration: "4 weeks", difficulty: "Intermediate", price: 27.99, description: "Pre-game, halftime, and post-game nutrition timing for competitive athletes.", sampleDays: [
        { day: "Day 1 — Pre-Game", calories: "2,380 cal", protein: "162g protein", breakfast: "Pre-game oatmeal with banana, honey, and almond butter", lunch: "Chicken and rice with steamed vegetables (3 hours before)", dinner: "Light pasta with olive oil and lean protein (evening game)" },
        { day: "Day 2 — Game Day", calories: "2,450 cal", protein: "155g protein", breakfast: "Toast with peanut butter and banana (morning game)", lunch: "Halftime rice cakes with peanut butter and sports drink", dinner: "Post-game chicken wrap with sweet potato fries and juice" },
        { day: "Day 3 — Recovery Day", calories: "2,520 cal", protein: "175g protein", breakfast: "Protein pancakes with berries and a recovery shake", lunch: "Grilled salmon with brown rice and steamed asparagus", dinner: "Lean beef with mashed potatoes and a large salad" }
      ] },
    ],
    tags: ["Sports", "Performance", "Recovery"]
  },
  {
    id: 108, name: "Omar Hassan", specialty: "Weight Management",
    category: "weightloss", price: 42.99, rating: null, subscribers: 1890, experience: "8 yrs",
    credential: "CNS", credentialFull: "Certified Nutrition Specialist",
    specialtyType: "Clinical Nutritionist",
    bio: "Certified Nutrition Specialist with an evidence-based approach to body composition. Combines flexible dieting with behavioral strategies that last.",
    color: "#D946EF", featured: true,
    services: ["Body recomposition", "Reverse dieting", "Flexible dieting", "Progress tracking"],
    plans: [
      { name: "Flexible Cut", type: "Low Calorie", duration: "10 weeks", difficulty: "Intermediate", price: 32.99, description: "Calorie deficit with no food restrictions. Hit your targets your way.", sampleDays: [
        { day: "Day 1", calories: "1,520 cal", protein: "128g protein", breakfast: "Greek yogurt with honey, mixed nuts, and a piece of fruit", lunch: "Choose-your-protein bowl with mixed greens and light dressing", dinner: "Light chicken Caesar wrap with a side of veggies" },
        { day: "Day 2", calories: "1,450 cal", protein: "122g protein", breakfast: "Two eggs any style with a slice of toast and fruit", lunch: "Turkey lettuce wraps with hummus and cucumber", dinner: "Grilled shrimp with cauliflower rice and steamed asparagus" },
        { day: "Day 3", calories: "1,480 cal", protein: "135g protein", breakfast: "Protein smoothie with spinach, banana, and almond milk", lunch: "Chicken and veggie soup with a small roll", dinner: "Baked salmon with a large mixed green salad and vinaigrette" }
      ] },
      { name: "Body Recomp Blueprint", type: "High Protein", duration: "12 weeks", difficulty: "Advanced", price: 44.99, description: "Simultaneous fat loss and muscle gain through precise nutrition cycling.", sampleDays: [
        { day: "Day 1 — Training Day (High Carb)", calories: "2,150 cal", protein: "178g protein", breakfast: "Egg and cheese breakfast burrito with salsa and fruit", lunch: "Lean ground turkey with jasmine rice and mixed veggies", dinner: "Grilled chicken with quinoa, roasted peppers, and sweet potato" },
        { day: "Day 2 — Training Day (Moderate)", calories: "2,080 cal", protein: "172g protein", breakfast: "Protein oats with whey, banana, and almond butter", lunch: "Salmon with brown rice and steamed broccoli", dinner: "Lean steak with baked potato and a side salad" },
        { day: "Day 3 — Rest Day (Low Carb)", calories: "1,820 cal", protein: "168g protein", breakfast: "Scrambled eggs with avocado and turkey bacon", lunch: "Grilled chicken salad with olive oil, feta, and walnuts", dinner: "Baked cod with roasted vegetables and a small portion of rice" }
      ] },
      { name: "Reverse Diet Recovery", type: "Balanced", duration: "8 weeks", difficulty: "Intermediate", price: 34.99, description: "Gradually increase calories post-diet to maintain results and restore metabolism.", sampleDays: [
        { day: "Day 1", calories: "1,850 cal", protein: "132g protein", breakfast: "Whole grain toast with avocado and poached eggs", lunch: "Balanced plate with salmon, rice, and steamed veggies", dinner: "Chicken stir-fry with mixed vegetables and noodles" },
        { day: "Day 2", calories: "1,780 cal", protein: "128g protein", breakfast: "Oatmeal with berries, nuts, and a drizzle of honey", lunch: "Turkey sandwich on whole wheat with a side of fruit", dinner: "Grilled chicken thigh with sweet potato and green beans" },
        { day: "Day 3", calories: "1,920 cal", protein: "138g protein", breakfast: "Smoothie bowl with protein, granola, and sliced banana", lunch: "Quinoa bowl with black beans, corn, avocado, and salsa", dinner: "Lean beef with roasted potatoes and a mixed salad" }
      ] },
      { name: "No-Track Intuitive Plan", type: "Flexible", duration: "6 weeks", difficulty: "Beginner", price: 26.99, description: "Learn to eat intuitively with portion guides and hunger cue training.", sampleDays: [
        { day: "Day 1", calories: "1,680 cal", protein: "115g protein", breakfast: "Mindful breakfast: eggs, toast, and fruit — eat until satisfied", lunch: "Portion-guided pasta with pesto and grilled chicken", dinner: "Simple fish tacos with slaw and lime" },
        { day: "Day 2", calories: "1,620 cal", protein: "108g protein", breakfast: "Oatmeal with toppings of choice — practice hunger awareness", lunch: "Mindful snack plate with cheese, fruit, nuts, and crackers", dinner: "Grilled chicken with roasted vegetables and a roll" },
        { day: "Day 3", calories: "1,750 cal", protein: "120g protein", breakfast: "Yogurt parfait — stop when comfortably full", lunch: "Soup and sandwich combo — listen to satiety cues", dinner: "Salmon with rice and salad — practice portion awareness" }
      ] },
    ],
    tags: ["Flexible Dieting", "Recomp", "Sustainable"]
  },
  {
    id: 109, name: "Lisa Chen", specialty: "Gut Health & Wellness",
    category: "guthealth", price: 49.99, rating: null, subscribers: 920, experience: "12 yrs",
    credential: "CN", credentialFull: "Certified Nutritionist",
    specialtyType: "Functional/Integrative Nutritionist",
    bio: "Certified Nutritionist combining Eastern and Western dietary science for whole-body gut wellness.",
    color: "#F97316",
    services: ["Microbiome support", "Fermentation guides", "Elimination diets", "Stress-gut protocols"],
    plans: [
      { name: "Microbiome Reset", type: "Gut Health", duration: "8 weeks", difficulty: "Intermediate", price: 37.99, description: "Rebuild your gut flora with prebiotic and probiotic-rich meal plans.", sampleDays: [
        { day: "Day 1", calories: "1,720 cal", protein: "108g protein", breakfast: "Kefir smoothie with banana, prebiotic fiber, and flaxseed", lunch: "Kimchi rice bowl with soft-boiled egg and sesame seeds", dinner: "Jerusalem artichoke soup with sourdough bread and olive oil" },
        { day: "Day 2", calories: "1,680 cal", protein: "112g protein", breakfast: "Yogurt bowl with prebiotic granola, chicory root, and berries", lunch: "Fermented vegetable wrap with hummus and sprouts", dinner: "Miso-glazed chicken with sauteed leeks and brown rice" },
        { day: "Day 3", calories: "1,750 cal", protein: "118g protein", breakfast: "Overnight oats with kefir, chia seeds, and sliced banana", lunch: "Lentil soup with garlic, onions, and a side of sauerkraut", dinner: "Baked salmon with asparagus and fermented beet salad" }
      ] },
      { name: "Fermented Foods Journey", type: "Whole Foods", duration: "6 weeks", difficulty: "Beginner", price: 28.99, description: "Introduce fermented foods into your daily routine for better digestion and immunity.", sampleDays: [
        { day: "Day 1", calories: "1,650 cal", protein: "105g protein", breakfast: "Kombucha overnight oats with sauerkraut on toast", lunch: "Miso-glazed salmon with pickled vegetables and rice", dinner: "Tempeh bowl with fermented hot sauce, greens, and quinoa" },
        { day: "Day 2", calories: "1,620 cal", protein: "102g protein", breakfast: "Kefir smoothie with mango, ginger, and turmeric", lunch: "Kimchi fried rice with a fried egg and scallions", dinner: "Grilled chicken with fermented salsa and sweet potato" },
        { day: "Day 3", calories: "1,700 cal", protein: "110g protein", breakfast: "Sourdough toast with avocado and a side of yogurt", lunch: "Miso soup with tofu, seaweed, and pickled radish", dinner: "Tempeh stir-fry with fermented black bean sauce and noodles" }
      ] },
      { name: "Stress-Gut Connection", type: "Anti-Inflammatory", duration: "8 weeks", difficulty: "Intermediate", price: 39.99, description: "Address the gut-brain axis with calming foods and stress-reducing meal patterns.", sampleDays: [
        { day: "Day 1", calories: "1,780 cal", protein: "115g protein", breakfast: "Warm turmeric oatmeal with walnuts and a cup of chamomile tea", lunch: "Chamomile-poached chicken with steamed greens and brown rice", dinner: "Warm turmeric lentil soup with calming herbs and sourdough" },
        { day: "Day 2", calories: "1,720 cal", protein: "122g protein", breakfast: "Magnesium-rich smoothie with banana, cacao, and almond butter", lunch: "Salmon salad with leafy greens, avocado, and pumpkin seeds", dinner: "Slow-cooked chicken with sweet potato and lavender-infused broth" },
        { day: "Day 3", calories: "1,680 cal", protein: "108g protein", breakfast: "Yogurt with dark chocolate shavings, nuts, and berries", lunch: "Turkey and vegetable soup with ginger and lemongrass", dinner: "Baked cod with roasted root vegetables and fresh herbs" }
      ] },
      { name: "Seasonal Cleanse", type: "Elimination", duration: "4 weeks", difficulty: "Beginner", price: 24.99, description: "Quarterly reset plan using seasonal whole foods to support digestive health.", sampleDays: [
        { day: "Day 1", calories: "1,580 cal", protein: "95g protein", breakfast: "Fresh fruit and seed breakfast bowl with coconut flakes", lunch: "Seasonal roasted vegetable and grain bowl with tahini", dinner: "Simple poached fish with steamed squash and fresh herbs" },
        { day: "Day 2", calories: "1,620 cal", protein: "88g protein", breakfast: "Warm porridge with seasonal fruit, cinnamon, and honey", lunch: "Mixed green salad with roasted beets, walnuts, and lemon", dinner: "Herb-baked chicken with seasonal root vegetables" },
        { day: "Day 3", calories: "1,550 cal", protein: "92g protein", breakfast: "Green juice with cucumber, celery, apple, and ginger", lunch: "Butternut squash soup with a slice of whole grain bread", dinner: "Steamed white fish with sauteed seasonal greens and rice" }
      ] },
    ],
    tags: ["Gut Health", "Integrative", "Fermentation"]
  },
  {
    id: 110, name: "Derek Williams", specialty: "Meal Prep & Budget",
    category: "mealprep", price: 29.99, rating: null, subscribers: 2450, experience: "5 yrs",
    credential: "Health Coach", credentialFull: "Certified Health & Nutrition Coach",
    specialtyType: "Health Coach/Nutrition Coach",
    bio: "College athlete who learned to eat well on nothing. Now teaches thousands to meal prep like a pro on any budget.",
    color: "#14B8A6",
    services: ["Student meal plans", "Bulk cooking", "Freezer prep", "Dorm-friendly recipes"],
    plans: [
      { name: "College Kitchen Plan", type: "Budget", duration: "4 weeks", difficulty: "Beginner", price: 19.99, description: "Healthy meals you can make in a dorm or small kitchen with basic equipment.", sampleDays: [
        { day: "Day 1", calories: "1,650 cal", protein: "88g protein", breakfast: "Microwave scrambled eggs with cheese and toast", lunch: "Instant ramen upgrade with a soft-boiled egg and frozen veggies", dinner: "Peanut butter banana wrap with honey and a glass of milk" },
        { day: "Day 2", calories: "1,580 cal", protein: "82g protein", breakfast: "Overnight oats with peanut butter (no cooking needed)", lunch: "Canned tuna on crackers with an apple", dinner: "Microwave baked potato with cheese, broccoli, and butter" },
        { day: "Day 3", calories: "1,620 cal", protein: "85g protein", breakfast: "Cereal with milk and a banana", lunch: "Turkey and cheese sandwich with mustard and chips", dinner: "Quesadilla with canned beans, cheese, and salsa" }
      ] },
      { name: "Freezer Meal Mastery", type: "Meal Prep", duration: "6 weeks", difficulty: "Beginner", price: 24.99, description: "Batch cook and freeze 20+ meals in one session. Reheat and eat all week.", sampleDays: [
        { day: "Day 1", calories: "1,850 cal", protein: "118g protein", breakfast: "Frozen breakfast burritos with sausage, eggs, and peppers", lunch: "Pre-portioned beef and vegetable stew (thawed overnight)", dinner: "Freezer-friendly chicken enchilada bake with rice" },
        { day: "Day 2", calories: "1,780 cal", protein: "112g protein", breakfast: "Frozen egg muffin cups with cheese and spinach", lunch: "Frozen chili portioned out with shredded cheese and crackers", dinner: "Frozen meatball marinara with pasta (boil fresh)" },
        { day: "Day 3", calories: "1,920 cal", protein: "125g protein", breakfast: "Frozen smoothie packs — just add milk and blend", lunch: "Frozen chicken and rice casserole (reheat)", dinner: "Frozen teriyaki chicken with stir-fry vegetables and rice" }
      ] },
      { name: "Bulk on a Budget", type: "High Calorie", duration: "8 weeks", difficulty: "Intermediate", price: 29.99, description: "High-calorie meal plan for muscle building without expensive supplements.", sampleDays: [
        { day: "Day 1", calories: "3,050 cal", protein: "178g protein", breakfast: "Peanut butter and oat mass gainer shake with whole milk and banana", lunch: "Chicken and rice with olive oil, mixed nuts, and avocado", dinner: "Ground beef pasta with cheese and a glass of whole milk" },
        { day: "Day 2", calories: "3,180 cal", protein: "185g protein", breakfast: "6 eggs scrambled with cheese, toast with butter, and juice", lunch: "Double portion tuna salad sandwich with chips and fruit", dinner: "Chicken thighs with mashed potatoes, gravy, and bread" },
        { day: "Day 3", calories: "2,920 cal", protein: "172g protein", breakfast: "Whole milk yogurt with granola, dried fruit, and honey", lunch: "Large burrito with rice, beans, cheese, and sour cream", dinner: "Pork chops with sweet potato, butter, and a protein shake" }
      ] },
      { name: "5-Ingredient Meals", type: "Quick Recipes", duration: "4 weeks", difficulty: "Beginner", price: 19.99, description: "Simple, nutritious meals using just 5 ingredients each. Perfect for beginners.", sampleDays: [
        { day: "Day 1", calories: "1,720 cal", protein: "108g protein", breakfast: "Banana pancakes with eggs, oats, cinnamon, and maple syrup", lunch: "Baked chicken with lemon, garlic, olive oil, and herbs", dinner: "Pasta with butter, parmesan, frozen peas, and black pepper" },
        { day: "Day 2", calories: "1,680 cal", protein: "102g protein", breakfast: "Toast, peanut butter, banana, honey, and milk", lunch: "Canned soup upgraded with rotisserie chicken and frozen veggies", dinner: "Rice, canned black beans, salsa, cheese, and sour cream" },
        { day: "Day 3", calories: "1,750 cal", protein: "115g protein", breakfast: "Yogurt, granola, honey, banana, and a handful of nuts", lunch: "Tortilla, deli turkey, cheese, mustard, and lettuce", dinner: "Salmon fillet, soy sauce, honey, garlic, and steamed rice" }
      ] },
    ],
    tags: ["Budget", "Students", "Freezer Prep"]
  },
  {
    id: 111, name: "Priya Sharma", specialty: "Ayurvedic & Plant-Based Nutrition",
    category: "plantbased", price: 44.99, rating: null, subscribers: 1050, experience: "9 yrs",
    credential: "CN", credentialFull: "Certified Nutritionist",
    specialtyType: "Ayurvedic Nutritionist",
    bio: "Certified Ayurvedic practitioner and plant-based nutritionist. Blends traditional Ayurvedic wisdom with modern nutrition science.",
    color: "#84CC16",
    services: ["Ayurvedic meal plans", "Plant protein optimization", "Spice therapy", "Seasonal eating"],
    plans: [
      { name: "Ayurvedic Balance", type: "Whole Foods", duration: "8 weeks", difficulty: "Intermediate", price: 36.99, description: "Eat according to your dosha with balanced plant-based meals rooted in Ayurveda.", sampleDays: [
        { day: "Day 1", calories: "1,750 cal", protein: "82g protein", breakfast: "Warm spiced porridge with ghee, cardamom, and stewed fruit", lunch: "Kitchari with cumin, fresh cilantro, and a squeeze of lime", dinner: "Warming dal with turmeric rice and freshly baked naan" },
        { day: "Day 2", calories: "1,680 cal", protein: "78g protein", breakfast: "Stewed apples with cinnamon, cloves, and a drizzle of honey", lunch: "Spiced coconut vegetable stew with basmati rice", dinner: "Mung bean soup with ginger, cumin, and fresh coriander" },
        { day: "Day 3", calories: "1,720 cal", protein: "85g protein", breakfast: "Golden milk latte with dates and soaked almonds", lunch: "Vegetable biryani with raita and pickled onions", dinner: "Stuffed chapati with spiced potato and a side of sauteed greens" }
      ] },
      { name: "Plant Protein Power", type: "High Protein", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Complete protein combinations from plant sources to fuel your training.", sampleDays: [
        { day: "Day 1", calories: "2,080 cal", protein: "125g protein", breakfast: "Peanut butter oatmeal with hemp seeds and soy milk", lunch: "Red lentil and chickpea power bowl with tahini dressing", dinner: "Tofu tikka masala with brown rice and steamed spinach" },
        { day: "Day 2", calories: "2,020 cal", protein: "128g protein", breakfast: "Protein smoothie with pea protein, banana, and almond butter", lunch: "Edamame and quinoa salad with sesame dressing and avocado", dinner: "Black bean and tempeh chili with cornbread" },
        { day: "Day 3", calories: "2,150 cal", protein: "130g protein", breakfast: "Chickpea flour omelette with mushrooms and fresh herbs", lunch: "Lentil and walnut tacos with cashew crema and slaw", dinner: "Seitan stir-fry with broccoli, peanut sauce, and rice noodles" }
      ] },
      { name: "Anti-Inflammatory Spice Plan", type: "Anti-Inflammatory", duration: "6 weeks", difficulty: "Beginner", price: 27.99, description: "Harness turmeric, ginger, and healing spices in daily anti-inflammatory meals.", sampleDays: [
        { day: "Day 1", calories: "1,680 cal", protein: "88g protein", breakfast: "Golden milk turmeric smoothie bowl with walnuts and berries", lunch: "Ginger-spiced lentil soup with fresh herbs and sourdough", dinner: "Cinnamon roasted sweet potato and chickpea bowl with tahini" },
        { day: "Day 2", calories: "1,620 cal", protein: "85g protein", breakfast: "Warm ginger-turmeric tea with overnight oats and cardamom", lunch: "Cumin-roasted cauliflower wrap with anti-inflammatory slaw", dinner: "Coconut curry with turmeric, ginger, tofu, and vegetables" },
        { day: "Day 3", calories: "1,720 cal", protein: "92g protein", breakfast: "Spiced chia pudding with cinnamon, nutmeg, and fresh mango", lunch: "Black pepper and turmeric chickpea salad with lemon", dinner: "Ginger-garlic stir-fry with tempeh, greens, and brown rice" }
      ] },
      { name: "Seasonal Harvest Plan", type: "Whole Foods", duration: "12 weeks", difficulty: "Intermediate", price: 39.99, description: "Eat in sync with the seasons using local, plant-based whole foods.", sampleDays: [
        { day: "Day 1", calories: "1,780 cal", protein: "82g protein", breakfast: "Seasonal fruit and nut morning porridge with maple syrup", lunch: "Farm-fresh vegetable and herb grain bowl with lemon dressing", dinner: "Root vegetable tagine with couscous and fresh mint" },
        { day: "Day 2", calories: "1,720 cal", protein: "78g protein", breakfast: "Buckwheat pancakes with seasonal berries and coconut cream", lunch: "Roasted squash soup with toasted pumpkin seeds and bread", dinner: "Stuffed acorn squash with wild rice, cranberries, and pecans" },
        { day: "Day 3", calories: "1,850 cal", protein: "85g protein", breakfast: "Smoothie with seasonal greens, pear, ginger, and hemp seeds", lunch: "Warm lentil salad with roasted seasonal vegetables", dinner: "Mushroom and barley risotto with fresh herbs and olive oil" }
      ] },
    ],
    tags: ["Ayurvedic", "Plant-Based", "Holistic"]
  },
  {
    id: 112, name: "Marcus Johnson", specialty: "Sports & Performance Nutrition",
    category: "sports", price: 59.99, rating: null, subscribers: 1580, experience: "13 yrs",
    credential: "RDN", credentialFull: "Registered Dietitian Nutritionist",
    specialtyType: "Sports/Performance Nutritionist",
    bio: "Registered Dietitian and NFL nutritionist for 8 seasons. Now bringing pro-level fuel strategies to everyday athletes on Shape.",
    color: "#7C3AED",
    services: ["Pro athlete protocols", "Weight class management", "Supplement stacks", "In-season nutrition"],
    plans: [
      { name: "Pro Athlete Fuel", type: "Performance", duration: "12 weeks", difficulty: "Advanced", price: 49.99, description: "The same periodized nutrition framework used by professional athletes.", sampleDays: [
        { day: "Day 1 — Game Day", calories: "2,680 cal", protein: "185g protein", breakfast: "Competition-day oatmeal with banana, honey, and electrolyte drink", lunch: "Chicken and white rice with steamed vegetables (3 hours pre-game)", dinner: "Post-game recovery shake with casein, berries, oats, and a full meal" },
        { day: "Day 2 — Training Day", calories: "2,750 cal", protein: "190g protein", breakfast: "6 egg whites with whole grain toast, avocado, and orange juice", lunch: "High-carb pasta with lean ground beef and mixed veggies", dinner: "Grilled salmon with sweet potato, broccoli, and olive oil" },
        { day: "Day 3 — Recovery Day", calories: "2,520 cal", protein: "178g protein", breakfast: "Protein pancakes with blueberries and turkey sausage", lunch: "Chicken breast with brown rice and a large mixed salad", dinner: "Lean beef with mashed potatoes, green beans, and a casein shake" }
      ] },
      { name: "Weight Class Manager", type: "Low Calorie", duration: "8 weeks", difficulty: "Advanced", price: 42.99, description: "Safe, effective weight manipulation for combat sports and weight-class athletes.", sampleDays: [
        { day: "Day 1 — Maintenance Phase", calories: "1,620 cal", protein: "155g protein", breakfast: "Egg white omelette with spinach, tomato, and a slice of toast", lunch: "Measured portion grilled fish with steamed greens and lemon", dinner: "Light turkey meatballs with zucchini noodles and marinara" },
        { day: "Day 2 — Cutting Phase", calories: "1,480 cal", protein: "162g protein", breakfast: "Small portion of oatmeal with protein powder and water", lunch: "Grilled chicken breast with cucumber and a small sweet potato", dinner: "White fish with steamed broccoli and a tablespoon of olive oil" },
        { day: "Day 3 — Refeed Day", calories: "2,050 cal", protein: "148g protein", breakfast: "Scrambled eggs with rice, avocado, and fruit", lunch: "Chicken and pasta with tomato sauce and a side salad", dinner: "Steak with baked potato, butter, and steamed vegetables" }
      ] },
      { name: "Off-Season Builder", type: "High Calorie", duration: "10 weeks", difficulty: "Intermediate", price: 39.99, description: "Structured surplus plan to build size and strength during the off-season.", sampleDays: [
        { day: "Day 1", calories: "3,150 cal", protein: "195g protein", breakfast: "Mass-building shake with oats, peanut butter, whole milk, and banana", lunch: "Double burger patties with rice, avocado, and cheese", dinner: "Loaded baked potato with pulled chicken, cheese, and sour cream" },
        { day: "Day 2", calories: "3,280 cal", protein: "188g protein", breakfast: "5 whole eggs with bacon, hash browns, and toast with butter", lunch: "Chicken thighs with pasta, alfredo sauce, and breadsticks", dinner: "Ribeye steak with mashed potatoes, corn, and a roll" },
        { day: "Day 3", calories: "3,080 cal", protein: "192g protein", breakfast: "French toast with syrup, scrambled eggs, and sausage links", lunch: "Large burrito bowl with double rice, double meat, and guacamole", dinner: "Salmon with wild rice, roasted vegetables, and a protein shake" }
      ] },
      { name: "Travel Nutrition Guide", type: "Flexible", duration: "4 weeks", difficulty: "Beginner", price: 24.99, description: "Stay on track while traveling for games, tournaments, or work.", sampleDays: [
        { day: "Day 1 — Travel Day", calories: "2,150 cal", protein: "145g protein", breakfast: "Hotel-room overnight oats with protein powder and fruit", lunch: "Airport-friendly chicken and veggie wrap with a protein bar", dinner: "Grilled chicken salad from a restaurant (dressing on the side)" },
        { day: "Day 2 — On the Road", calories: "2,080 cal", protein: "138g protein", breakfast: "Portable protein box with nuts, jerky, fruit, and cheese", lunch: "Subway or deli sandwich with lean protein and vegetables", dinner: "Room service grilled fish with rice and steamed vegetables" },
        { day: "Day 3 — Tournament Day", calories: "2,250 cal", protein: "152g protein", breakfast: "Pre-packed oatmeal cups with banana and almond butter", lunch: "Packed PB&J sandwich, trail mix, and sports drink", dinner: "Post-competition meal: pasta with grilled chicken and a recovery shake" }
      ] },
    ],
    tags: ["Pro Sports", "Elite", "Performance"]
  },
  {
    id: 113, name: "Olivia Tran", specialty: "Vegan & Plant-Based Nutrition",
    category: "plantbased", price: 42.99, rating: null, subscribers: 1820, experience: "8 yrs",
    credential: "RDN", credentialFull: "Registered Dietitian Nutritionist",
    specialtyType: "Plant-Based Nutritionist",
    bio: "Registered Dietitian proving that plant-based eating fuels elite performance. No compromises on protein, no compromises on taste.",
    color: "#22C55E",
    services: ["Vegan meal plans", "Plant protein optimization", "B12 & micronutrient guidance", "Athlete vegan transitions"],
    plans: [
      { name: "High-Performance Vegan", type: "High Protein", duration: "8 weeks", difficulty: "Intermediate", price: 36.99, description: "130g+ protein daily from plant sources to fuel muscle growth and recovery.", sampleDays: [
        { day: "Day 1", calories: "2,280 cal", protein: "135g protein", breakfast: "Tofu scramble with spinach, nutritional yeast, and whole grain toast", lunch: "Tempeh and black bean power bowl with quinoa, avocado, and tahini", dinner: "Seitan stir-fry with broccoli, edamame, peanut sauce, and brown rice" },
        { day: "Day 2", calories: "2,320 cal", protein: "138g protein", breakfast: "Protein smoothie with pea protein, banana, oats, and almond butter", lunch: "Lentil and chickpea curry with coconut rice and naan", dinner: "BBQ jackfruit tacos with black beans, slaw, and cashew crema" },
        { day: "Day 3", calories: "2,250 cal", protein: "132g protein", breakfast: "Chickpea flour omelette with mushrooms, peppers, and vegan cheese", lunch: "Massive grain bowl with falafel, hummus, and roasted vegetables", dinner: "Red lentil pasta with marinara, beyond meat crumbles, and side salad" }
      ] },
      { name: "Vegan Transition Guide", type: "Whole Foods", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Gradual plant-based transition with familiar comfort foods made vegan.", sampleDays: [
        { day: "Day 1", calories: "1,850 cal", protein: "95g protein", breakfast: "Overnight oats with almond milk, chia seeds, and mixed berries", lunch: "Veggie burger with sweet potato fries and a side salad", dinner: "Spaghetti with lentil bolognese and garlic bread" },
        { day: "Day 2", calories: "1,780 cal", protein: "92g protein", breakfast: "Banana pancakes with maple syrup and fresh fruit", lunch: "Loaded burrito with rice, beans, guacamole, and salsa", dinner: "Coconut chickpea curry with jasmine rice" },
        { day: "Day 3", calories: "1,900 cal", protein: "98g protein", breakfast: "Smoothie bowl with acai, granola, banana, and coconut flakes", lunch: "Asian noodle bowl with tofu, vegetables, and sesame dressing", dinner: "Stuffed bell peppers with quinoa, black beans, and vegan cheese" }
      ] },
      { name: "Budget Plant-Based", type: "Budget", duration: "4 weeks", difficulty: "Beginner", price: 22.99, description: "Healthy vegan eating for under $50/week using staples like beans, rice, and seasonal produce.", sampleDays: [
        { day: "Day 1", calories: "1,720 cal", protein: "85g protein", breakfast: "Oatmeal with peanut butter, banana, and cinnamon", lunch: "Rice and beans with salsa and frozen corn", dinner: "Pasta with canned tomato sauce, white beans, and frozen spinach" },
        { day: "Day 2", calories: "1,680 cal", protein: "82g protein", breakfast: "Toast with peanut butter and sliced banana", lunch: "Lentil soup with bread and a side of carrot sticks", dinner: "Stir-fried tofu with frozen mixed vegetables and soy sauce over rice" },
        { day: "Day 3", calories: "1,750 cal", protein: "88g protein", breakfast: "Smoothie with frozen fruit, oats, and soy milk", lunch: "Hummus wrap with shredded carrots, cucumber, and lettuce", dinner: "Black bean tacos with cabbage slaw and hot sauce" }
      ] },
      { name: "Vegan Athlete Fuel", type: "Performance", duration: "10 weeks", difficulty: "Advanced", price: 44.99, description: "Periodized plant-based nutrition for competitive athletes with training-day cycling.", sampleDays: [
        { day: "Day 1 — Training Day", calories: "2,850 cal", protein: "155g protein", breakfast: "Mass smoothie with pea protein, oats, banana, and almond butter", lunch: "Double tofu rice bowl with edamame, avocado, and teriyaki", dinner: "Seitan and pasta with cashew cream sauce and roasted vegetables" },
        { day: "Day 2 — Rest Day", calories: "2,200 cal", protein: "125g protein", breakfast: "Protein pancakes with blueberries and maple syrup", lunch: "Large lentil salad with tahini dressing and seed mix", dinner: "Coconut curry with chickpeas, sweet potato, and brown rice" },
        { day: "Day 3 — Competition", calories: "2,600 cal", protein: "140g protein", breakfast: "Oatmeal with protein powder, banana, and peanut butter", lunch: "Simple rice and tofu with vegetables (3 hours pre-event)", dinner: "Post-event recovery shake and a large vegan burrito bowl" }
      ] },
    ],
    tags: ["Vegan", "Plant-Based", "Performance"]
  },
  {
    id: 114, name: "James Rivera", specialty: "Keto & Low-Carb Nutrition",
    category: "weightloss", price: 47.99, rating: null, subscribers: 1340, experience: "7 yrs",
    credential: "CNS", credentialFull: "Certified Nutrition Specialist",
    specialtyType: "Low-Carb Specialist",
    bio: "Certified Nutrition Specialist and former type 2 diabetic. Reversed his own condition through keto and now helps others do the same.",
    color: "#F59E0B",
    services: ["Ketogenic meal plans", "Blood sugar management", "Cyclical keto", "Metabolic health coaching"],
    plans: [
      { name: "Classic Keto Reset", type: "Low Carb", duration: "8 weeks", difficulty: "Intermediate", price: 36.99, description: "Standard ketogenic diet plan keeping carbs under 30g/day for fat adaptation.", sampleDays: [
        { day: "Day 1", calories: "1,820 cal", protein: "120g protein", breakfast: "3-egg omelette with cheese, spinach, and avocado", lunch: "Grilled chicken thighs with caesar salad (no croutons)", dinner: "Ribeye steak with garlic butter, asparagus, and cauliflower mash" },
        { day: "Day 2", calories: "1,780 cal", protein: "125g protein", breakfast: "Bulletproof coffee with bacon and scrambled eggs", lunch: "Tuna salad lettuce wraps with cheese and olives", dinner: "Salmon with creamed spinach and a side of roasted broccoli" },
        { day: "Day 3", calories: "1,850 cal", protein: "118g protein", breakfast: "Keto smoothie with MCT oil, cocoa, and almond butter", lunch: "Burger patties with cheese, tomato, and side salad", dinner: "Pork chops with green beans sauteed in butter and garlic" }
      ] },
      { name: "Cyclical Keto", type: "Flexible", duration: "10 weeks", difficulty: "Advanced", price: 42.99, description: "Strategic carb cycling — 5 days keto, 2 days high-carb refeed for athletes.", sampleDays: [
        { day: "Day 1 — Keto Day", calories: "1,750 cal", protein: "130g protein", breakfast: "Eggs with avocado and smoked salmon", lunch: "Chicken and vegetable stir-fry with coconut oil", dinner: "Grilled steak with roasted vegetables and olive oil" },
        { day: "Day 2 — Keto Day", calories: "1,780 cal", protein: "128g protein", breakfast: "Greek yogurt (full fat) with nuts and seeds", lunch: "Cobb salad with bacon, egg, cheese, and ranch", dinner: "Baked cod with lemon butter, asparagus, and a side salad" },
        { day: "Day 3 — Refeed Day", calories: "2,400 cal", protein: "140g protein", breakfast: "Oatmeal with banana, honey, and berries", lunch: "Chicken and sweet potato bowl with rice and vegetables", dinner: "Pasta with lean ground turkey, marinara, and garlic bread" }
      ] },
      { name: "Lazy Keto Starter", type: "Low Carb", duration: "4 weeks", difficulty: "Beginner", price: 24.99, description: "Simple keto approach — just track carbs, not calories. Perfect for beginners.", sampleDays: [
        { day: "Day 1", calories: "~1,800 cal", protein: "~115g protein", breakfast: "Bacon and eggs with butter", lunch: "Deli meat and cheese roll-ups with mustard", dinner: "Rotisserie chicken with steamed broccoli and butter" },
        { day: "Day 2", calories: "~1,750 cal", protein: "~110g protein", breakfast: "Cream cheese pancakes with sugar-free syrup", lunch: "Chicken caesar salad (skip the croutons)", dinner: "Bunless burger with cheese, pickles, and a side salad" },
        { day: "Day 3", calories: "~1,850 cal", protein: "~120g protein", breakfast: "Sausage and egg muffin (no bread)", lunch: "Tuna salad stuffed avocado", dinner: "Grilled pork chops with cauliflower mac and cheese" }
      ] },
      { name: "Keto for Athletes", type: "Performance", duration: "8 weeks", difficulty: "Advanced", price: 44.99, description: "Targeted keto for active individuals with pre/post workout carb timing.", sampleDays: [
        { day: "Day 1 — Training Day", calories: "2,200 cal", protein: "155g protein", breakfast: "Egg and sausage bowl with avocado and cheese", lunch: "Pre-workout: small portion of berries with whey protein", dinner: "Post-workout: chicken thighs with sweet potato and steamed greens" },
        { day: "Day 2 — Rest Day", calories: "1,750 cal", protein: "135g protein", breakfast: "Bulletproof coffee and a 3-egg omelette", lunch: "Steak salad with blue cheese and olive oil dressing", dinner: "Baked salmon with creamy garlic spinach" },
        { day: "Day 3 — Training Day", calories: "2,150 cal", protein: "150g protein", breakfast: "Protein shake with MCT oil and almond butter", lunch: "Pre-workout: handful of berries with nuts", dinner: "Post-workout: grilled chicken with rice and roasted vegetables" }
      ] },
    ],
    tags: ["Keto", "Low-Carb", "Weight Loss"]
  },
  {
    id: 115, name: "Dr. Angela Foster", specialty: "Clinical & Medical Nutrition",
    category: "clinical", price: 64.99, rating: null, subscribers: 680, experience: "16 yrs",
    credential: "RD", credentialFull: "Registered Dietitian",
    specialtyType: "Clinical Nutritionist",
    bio: "Board-certified Registered Dietitian with a doctorate in clinical nutrition. Specializes in medical nutrition therapy for chronic conditions.",
    color: "#0891B2",
    services: ["Diabetes nutrition", "Heart health plans", "IBS/IBD protocols", "Post-surgery nutrition"],
    plans: [
      { name: "Heart-Healthy Plan", type: "Anti-Inflammatory", duration: "12 weeks", difficulty: "Beginner", price: 39.99, description: "Mediterranean-inspired plan to lower cholesterol and support cardiovascular health.", sampleDays: [
        { day: "Day 1", calories: "1,750 cal", protein: "95g protein", breakfast: "Steel-cut oats with walnuts, flaxseed, and fresh berries", lunch: "Grilled salmon salad with olive oil, lemon, and mixed greens", dinner: "Baked chicken breast with roasted vegetables and quinoa" },
        { day: "Day 2", calories: "1,720 cal", protein: "92g protein", breakfast: "Whole grain toast with avocado, tomato, and a poached egg", lunch: "Lentil and vegetable soup with a side of whole grain bread", dinner: "Grilled fish with steamed broccoli, brown rice, and olive oil" },
        { day: "Day 3", calories: "1,780 cal", protein: "98g protein", breakfast: "Greek yogurt parfait with granola, almonds, and honey", lunch: "Tuna and white bean salad with olive oil and fresh herbs", dinner: "Turkey meatballs with whole wheat pasta and marinara sauce" }
      ] },
      { name: "Blood Sugar Balance", type: "Low Carb", duration: "8 weeks", difficulty: "Intermediate", price: 42.99, description: "Glycemic-controlled meal plan for pre-diabetes and type 2 diabetes management.", sampleDays: [
        { day: "Day 1", calories: "1,620 cal", protein: "110g protein", breakfast: "Veggie egg muffins with a small portion of berries", lunch: "Grilled chicken with non-starchy vegetables and olive oil", dinner: "Baked fish with cauliflower rice and steamed green beans" },
        { day: "Day 2", calories: "1,580 cal", protein: "108g protein", breakfast: "Cottage cheese with seeds, cinnamon, and a few walnuts", lunch: "Turkey lettuce wraps with cucumber and a side of lentils", dinner: "Lean pork tenderloin with roasted Brussels sprouts and quinoa" },
        { day: "Day 3", calories: "1,650 cal", protein: "115g protein", breakfast: "Protein smoothie with greens, almond butter, and low-sugar fruit", lunch: "Salmon with a large mixed salad and vinaigrette", dinner: "Chicken stir-fry with mixed vegetables over a small portion of rice" }
      ] },
      { name: "Gut Restoration Protocol", type: "Elimination", duration: "10 weeks", difficulty: "Intermediate", price: 49.99, description: "Structured elimination and reintroduction protocol for IBS and food sensitivities.", sampleDays: [
        { day: "Day 1 — Elimination Phase", calories: "1,680 cal", protein: "105g protein", breakfast: "Rice porridge with cooked pear and a pinch of cinnamon", lunch: "Baked chicken with steamed zucchini and white rice", dinner: "Poached salmon with steamed carrots and mashed sweet potato" },
        { day: "Day 2 — Elimination Phase", calories: "1,650 cal", protein: "102g protein", breakfast: "Smoothie with banana, rice milk, and sunflower seed butter", lunch: "Turkey patty with lettuce, cucumber, and olive oil", dinner: "Slow-cooked lamb with butternut squash and steamed spinach" },
        { day: "Day 3 — Reintroduction Phase", calories: "1,720 cal", protein: "108g protein", breakfast: "Test food: small portion of dairy (e.g., plain yogurt)", lunch: "Simple grilled fish with rice and steamed vegetables", dinner: "Chicken soup with root vegetables and fresh herbs" }
      ] },
      { name: "Post-Surgery Recovery", type: "High Protein", duration: "6 weeks", difficulty: "Beginner", price: 34.99, description: "High-protein, nutrient-dense meals to support healing after surgery.", sampleDays: [
        { day: "Day 1", calories: "1,850 cal", protein: "128g protein", breakfast: "Protein-enriched oatmeal with collagen peptides and berries", lunch: "Bone broth soup with soft-cooked chicken and vegetables", dinner: "Baked fish with mashed potatoes and steamed carrots" },
        { day: "Day 2", calories: "1,780 cal", protein: "125g protein", breakfast: "Scrambled eggs with cheese and a protein shake", lunch: "Cottage cheese with soft fruit and a drizzle of honey", dinner: "Slow-cooked beef stew with root vegetables and bread" },
        { day: "Day 3", calories: "1,900 cal", protein: "132g protein", breakfast: "Greek yogurt smoothie with banana, protein powder, and oats", lunch: "Chicken salad with soft bread and a cup of bone broth", dinner: "Salmon with creamed spinach and sweet potato mash" }
      ] },
    ],
    tags: ["Clinical", "Medical Nutrition", "Chronic Disease"]
  },
  {
    id: 116, name: "Tyler Washington", specialty: "Bodybuilding Nutrition",
    category: "sports", price: 52.99, rating: null, subscribers: 1560, experience: "10 yrs",
    credential: "CNS", credentialFull: "Certified Nutrition Specialist",
    specialtyType: "Bodybuilding Nutritionist",
    bio: "Certified Nutrition Specialist and NPC competitor. 10 years prepping athletes for the stage with precise macro programming.",
    color: "#8B5CF6",
    services: ["Contest prep", "Reverse dieting", "Bulking protocols", "Peak week manipulation"],
    plans: [
      { name: "Contest Prep 12-Week", type: "Low Calorie", duration: "12 weeks", difficulty: "Advanced", price: 54.99, description: "Competition-grade cutting plan with progressive calorie reduction and refeed days.", sampleDays: [
        { day: "Day 1 — Cutting", calories: "1,680 cal", protein: "200g protein", breakfast: "6 egg whites with 1 whole egg, oats, and blueberries", lunch: "Tilapia with jasmine rice and steamed asparagus", dinner: "Chicken breast with sweet potato and green beans" },
        { day: "Day 2 — Cutting", calories: "1,650 cal", protein: "195g protein", breakfast: "Protein oatmeal with a scoop of whey and cinnamon", lunch: "93% lean ground turkey with brown rice and broccoli", dinner: "White fish with rice cakes and mixed green salad" },
        { day: "Day 3 — Refeed", calories: "2,200 cal", protein: "180g protein", breakfast: "Pancakes with protein powder, syrup, and turkey sausage", lunch: "Chicken and pasta with low-fat marinara sauce", dinner: "Lean steak with baked potato and grilled vegetables" }
      ] },
      { name: "Clean Bulk Plan", type: "High Calorie", duration: "16 weeks", difficulty: "Intermediate", price: 44.99, description: "Structured caloric surplus for lean mass gain with minimal fat accumulation.", sampleDays: [
        { day: "Day 1", calories: "3,200 cal", protein: "210g protein", breakfast: "5 whole eggs with oats, banana, and peanut butter", lunch: "Chicken thighs with white rice, olive oil, and steamed vegetables", dinner: "Ground beef pasta with cheese and a protein shake before bed" },
        { day: "Day 2", calories: "3,150 cal", protein: "205g protein", breakfast: "Mass gainer shake with oats, banana, and whole milk", lunch: "Double chicken breast with sweet potato and avocado", dinner: "Salmon with rice, butter, and roasted broccoli" },
        { day: "Day 3", calories: "3,300 cal", protein: "215g protein", breakfast: "French toast with eggs, syrup, and turkey bacon", lunch: "Steak and rice bowl with cheese, guacamole, and beans", dinner: "Chicken stir-fry with noodles and sesame oil + casein shake" }
      ] },
      { name: "Reverse Diet Protocol", type: "Flexible", duration: "8 weeks", difficulty: "Intermediate", price: 36.99, description: "Strategically increase calories after a cut to restore metabolism without regaining fat.", sampleDays: [
        { day: "Day 1 — Week 1", calories: "1,800 cal", protein: "175g protein", breakfast: "Egg whites with oats and a small banana", lunch: "Chicken breast with rice and vegetables", dinner: "White fish with sweet potato and a side salad" },
        { day: "Day 2 — Week 4", calories: "2,100 cal", protein: "178g protein", breakfast: "Whole eggs with oats, peanut butter, and fruit", lunch: "Chicken and rice with slightly larger portions", dinner: "Lean beef with pasta and marinara" },
        { day: "Day 3 — Week 8", calories: "2,400 cal", protein: "182g protein", breakfast: "Full breakfast with eggs, toast, fruit, and yogurt", lunch: "Double protein rice bowl with avocado", dinner: "Steak dinner with potatoes, vegetables, and dessert" }
      ] },
      { name: "Peak Week Guide", type: "Performance", duration: "1 week", difficulty: "Advanced", price: 29.99, description: "The final 7 days before a show — water, sodium, and carb manipulation for stage-ready conditioning.", sampleDays: [
        { day: "Day 1 — Water Load", calories: "1,500 cal", protein: "200g protein", breakfast: "Egg whites with plain rice cakes (high water intake: 2 gallons)", lunch: "Plain chicken breast with white rice (no seasoning)", dinner: "Tilapia with asparagus (continue high water)" },
        { day: "Day 2 — Carb Deplete", calories: "1,200 cal", protein: "210g protein", breakfast: "Egg whites only (minimal carbs begin)", lunch: "Chicken breast with green vegetables only", dinner: "White fish with cucumber and a small salad" },
        { day: "Day 3 — Carb Load", calories: "2,800 cal", protein: "160g protein", breakfast: "Pancakes, rice cakes with jam (carb loading begins)", lunch: "Chicken with large portion of white rice and honey", dinner: "Sweet potato, rice, lean meat, and a rice crispy treat" }
      ] },
    ],
    tags: ["Bodybuilding", "Contest Prep", "Macros"]
  },
  {
    id: 117, name: "Nadia Kowalski", specialty: "Family & Kids Nutrition",
    category: "general", price: 34.99, rating: null, subscribers: 2100, experience: "9 yrs",
    credential: "RDN", credentialFull: "Registered Dietitian Nutritionist",
    specialtyType: "Family Nutritionist",
    bio: "Registered Dietitian and mom of 3. Creates meal plans the whole family will actually eat — nutritious, quick, and kid-approved.",
    color: "#F472B6",
    services: ["Family meal plans", "Picky eater solutions", "School lunch ideas", "Batch cooking guides"],
    plans: [
      { name: "Family Meal Plan", type: "Whole Foods", duration: "8 weeks", difficulty: "Beginner", price: 29.99, description: "One meal plan that works for the whole family — adults and kids. No separate cooking.", sampleDays: [
        { day: "Day 1", calories: "Adult: 1,850 cal", protein: "105g protein", breakfast: "Whole grain waffles with fresh fruit and yogurt dip", lunch: "Turkey and cheese pinwheels with carrot sticks and hummus", dinner: "Sheet pan chicken fajitas with rice and shredded cheese" },
        { day: "Day 2", calories: "Adult: 1,780 cal", protein: "98g protein", breakfast: "Banana oat pancakes with a drizzle of maple syrup", lunch: "Mini meatball subs with a side of fruit salad", dinner: "One-pot pasta with hidden veggie marinara and parmesan" },
        { day: "Day 3", calories: "Adult: 1,900 cal", protein: "110g protein", breakfast: "Smoothie cups with frozen fruit, yogurt, and honey", lunch: "Chicken and veggie quesadillas with guacamole and salsa", dinner: "Homemade pizza night with whole wheat crust and veggie toppings" }
      ] },
      { name: "Picky Eater Solutions", type: "Whole Foods", duration: "6 weeks", difficulty: "Beginner", price: 24.99, description: "Strategies and recipes to gradually expand your child's palate without battles.", sampleDays: [
        { day: "Day 1", calories: "Age-adjusted", protein: "Age-adjusted", breakfast: "Dinosaur-shaped toast with peanut butter and banana slices", lunch: "Mac and cheese with hidden cauliflower puree", dinner: "Chicken nuggets (homemade, baked) with sweet potato fries" },
        { day: "Day 2", calories: "Age-adjusted", protein: "Age-adjusted", breakfast: "Fruit and yogurt parfait with colorful layers", lunch: "Mini pizza bagels with a tiny side of raw veggies and ranch", dinner: "Spaghetti with meat sauce (blended veggies in sauce)" },
        { day: "Day 3", calories: "Age-adjusted", protein: "Age-adjusted", breakfast: "Green monster smoothie (spinach hidden by banana and berries)", lunch: "Grilled cheese with tomato soup (pureed vegetables inside)", dinner: "Build-your-own taco bar with mild seasoning" }
      ] },
      { name: "30-Minute Family Dinners", type: "Quick Recipes", duration: "4 weeks", difficulty: "Beginner", price: 22.99, description: "28 family dinner recipes — all ready in 30 minutes or less with common ingredients.", sampleDays: [
        { day: "Day 1", calories: "Adult: 1,800 cal", protein: "102g protein", breakfast: "Overnight oats with fruit (prep night before)", lunch: "Leftover dinner repurposed as lunch wraps", dinner: "One-pan lemon herb chicken with roasted potatoes (25 min)" },
        { day: "Day 2", calories: "Adult: 1,750 cal", protein: "98g protein", breakfast: "Eggs and toast with fruit (10 min)", lunch: "Sandwich bar with deli meat, cheese, and veggie sides", dinner: "15-minute shrimp stir-fry with rice and frozen vegetables" },
        { day: "Day 3", calories: "Adult: 1,820 cal", protein: "105g protein", breakfast: "Smoothie with banana, peanut butter, and milk", lunch: "Chicken salad with crackers and cut fruit", dinner: "Turkey taco skillet with beans, cheese, and tortillas (20 min)" }
      ] },
      { name: "School Lunch Blueprint", type: "Meal Prep", duration: "4 weeks", difficulty: "Beginner", price: 19.99, description: "20 school lunch ideas that are nutritious, nut-free friendly, and won't come back uneaten.", sampleDays: [
        { day: "Day 1", calories: "Kid: ~500 cal", protein: "~20g protein", breakfast: "Quick oatmeal with fruit at home", lunch: "Bento box: turkey roll-ups, cheese cubes, grapes, crackers, yogurt tube", dinner: "Family dinner (see Family Meal Plan)" },
        { day: "Day 2", calories: "Kid: ~480 cal", protein: "~18g protein", breakfast: "Toast with sunflower seed butter", lunch: "Thermos: chicken noodle soup + apple slices + cheese stick + cookie", dinner: "Family dinner (see Family Meal Plan)" },
        { day: "Day 3", calories: "Kid: ~520 cal", protein: "~22g protein", breakfast: "Yogurt with granola", lunch: "Mini bagel sandwiches + veggie sticks with ranch + berries + granola bar", dinner: "Family dinner (see Family Meal Plan)" }
      ] },
    ],
    tags: ["Family", "Kids", "Quick Meals"]
  },
  {
    id: 118, name: "Chris Andersen", specialty: "Intermittent Fasting & Metabolic Health",
    category: "weightloss", price: 44.99, rating: null, subscribers: 1680, experience: "8 yrs",
    credential: "CN", credentialFull: "Certified Nutritionist",
    specialtyType: "Metabolic Health Coach",
    bio: "Certified Nutritionist specializing in intermittent fasting protocols. Science-backed approaches to metabolic health and body composition.",
    color: "#D97706",
    services: ["IF protocols", "Metabolic testing", "Autophagy optimization", "Circadian nutrition"],
    plans: [
      { name: "16:8 Starter Plan", type: "Flexible", duration: "6 weeks", difficulty: "Beginner", price: 27.99, description: "Beginner-friendly 16:8 intermittent fasting with structured eating windows.", sampleDays: [
        { day: "Day 1", calories: "1,850 cal", protein: "120g protein", breakfast: "Fasting (black coffee or tea allowed)", lunch: "12pm: Large chicken and avocado salad with olive oil dressing", dinner: "6pm: Grilled salmon with sweet potato and steamed broccoli. 8pm: Greek yogurt with berries" },
        { day: "Day 2", calories: "1,820 cal", protein: "118g protein", breakfast: "Fasting (water, black coffee)", lunch: "12pm: Turkey and cheese wrap with a side of fruit and nuts", dinner: "7pm: Steak with roasted vegetables and quinoa. Snack: protein shake" },
        { day: "Day 3", calories: "1,880 cal", protein: "125g protein", breakfast: "Fasting", lunch: "1pm: Tuna poke bowl with rice, avocado, and edamame", dinner: "6:30pm: Chicken stir-fry with noodles and vegetables. 8pm: cottage cheese with almonds" }
      ] },
      { name: "OMAD Protocol", type: "Low Calorie", duration: "4 weeks", difficulty: "Advanced", price: 34.99, description: "One Meal A Day approach for experienced fasters seeking maximum autophagy benefits.", sampleDays: [
        { day: "Day 1", calories: "1,800 cal", protein: "130g protein", breakfast: "Fasting (water, electrolytes, black coffee)", lunch: "Fasting", dinner: "6pm: Large meal — steak, baked potato with butter, big salad, roasted vegetables, fruit, and a protein dessert" },
        { day: "Day 2", calories: "1,850 cal", protein: "135g protein", breakfast: "Fasting", lunch: "Fasting", dinner: "5:30pm: Grilled chicken, rice, avocado, soup, bread, steamed vegetables, and Greek yogurt with berries" },
        { day: "Day 3", calories: "1,780 cal", protein: "128g protein", breakfast: "Fasting", lunch: "Fasting", dinner: "6pm: Salmon, pasta, large salad with olive oil, roasted sweet potato, and a protein shake" }
      ] },
      { name: "5:2 Fasting Plan", type: "Flexible", duration: "8 weeks", difficulty: "Intermediate", price: 32.99, description: "Eat normally 5 days, restrict calories to 500-600 on 2 non-consecutive days.", sampleDays: [
        { day: "Day 1 — Normal Day", calories: "2,000 cal", protein: "130g protein", breakfast: "Scrambled eggs with toast and fruit", lunch: "Chicken and rice bowl with vegetables", dinner: "Pasta with meat sauce, salad, and garlic bread" },
        { day: "Day 2 — Fast Day", calories: "550 cal", protein: "45g protein", breakfast: "Black coffee", lunch: "Small salad with grilled chicken (200 cal)", dinner: "Steamed fish with vegetables (350 cal)" },
        { day: "Day 3 — Normal Day", calories: "2,050 cal", protein: "135g protein", breakfast: "Protein smoothie with oats and banana", lunch: "Large burrito bowl with all the fixings", dinner: "Grilled steak with mashed potatoes and green beans" }
      ] },
      { name: "Circadian Rhythm Eating", type: "Whole Foods", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Align your eating schedule with your circadian rhythm for optimal metabolic health.", sampleDays: [
        { day: "Day 1", calories: "1,900 cal", protein: "115g protein", breakfast: "7am: Large breakfast — eggs, oats, fruit, and nuts (biggest meal)", lunch: "12pm: Moderate lunch — chicken salad with whole grain bread", dinner: "5:30pm: Light dinner — soup with a small piece of fish and vegetables" },
        { day: "Day 2", calories: "1,850 cal", protein: "112g protein", breakfast: "7am: Protein pancakes with berries and yogurt", lunch: "12pm: Turkey and veggie stir-fry with rice", dinner: "5pm: Small salmon fillet with a side salad and light dressing" },
        { day: "Day 3", calories: "1,920 cal", protein: "118g protein", breakfast: "7:30am: Smoothie bowl with granola, eggs on the side", lunch: "12:30pm: Grilled chicken wrap with fruit", dinner: "5:30pm: Simple vegetable soup with a piece of bread and cheese" }
      ] },
    ],
    tags: ["Intermittent Fasting", "Metabolic Health", "Weight Loss"]
  },
  {
    id: 119, name: "Maria Santos", specialty: "Latin & Mediterranean Nutrition",
    category: "general", price: 39.99, rating: null, subscribers: 1450, experience: "11 yrs",
    credential: "RD", credentialFull: "Registered Dietitian",
    specialtyType: "Cultural Nutrition Specialist",
    bio: "Registered Dietitian celebrating cultural food traditions. Healthy eating shouldn't mean giving up the flavors you grew up with.",
    color: "#EF4444",
    services: ["Cultural meal plans", "Mediterranean diet", "Latin cooking health swaps", "Anti-inflammatory cuisine"],
    plans: [
      { name: "Mediterranean Lifestyle", type: "Anti-Inflammatory", duration: "8 weeks", difficulty: "Beginner", price: 32.99, description: "The gold standard of healthy eating — Mediterranean diet with fresh, flavorful meals.", sampleDays: [
        { day: "Day 1", calories: "1,820 cal", protein: "95g protein", breakfast: "Greek yogurt with honey, walnuts, and fresh figs", lunch: "Grilled halloumi salad with olives, tomatoes, and olive oil", dinner: "Herb-crusted salmon with roasted vegetables and couscous" },
        { day: "Day 2", calories: "1,780 cal", protein: "92g protein", breakfast: "Shakshuka with whole grain bread and fresh herbs", lunch: "Falafel bowl with hummus, tabbouleh, and pickled vegetables", dinner: "Lemon chicken with orzo, sun-dried tomatoes, and spinach" },
        { day: "Day 3", calories: "1,850 cal", protein: "98g protein", breakfast: "Avocado toast with za'atar, tomato, and a poached egg", lunch: "Greek lentil soup with crusty bread and feta", dinner: "Grilled lamb chops with roasted eggplant and tzatziki" }
      ] },
      { name: "Healthy Latin Kitchen", type: "Whole Foods", duration: "6 weeks", difficulty: "Beginner", price: 29.99, description: "Traditional Latin flavors with health-conscious swaps — no sacrificing sabor.", sampleDays: [
        { day: "Day 1", calories: "1,900 cal", protein: "110g protein", breakfast: "Huevos rancheros with black beans, salsa verde, and avocado", lunch: "Chicken and brown rice burrito bowl with pico de gallo", dinner: "Grilled fish tacos with cabbage slaw and lime crema" },
        { day: "Day 2", calories: "1,850 cal", protein: "105g protein", breakfast: "Plantain and egg scramble with fresh salsa", lunch: "Caldo de pollo with vegetables and a corn tortilla", dinner: "Carne asada with grilled vegetables, beans, and cauliflower rice" },
        { day: "Day 3", calories: "1,920 cal", protein: "108g protein", breakfast: "Chilaquiles with egg whites, green salsa, and queso fresco", lunch: "Cuban black bean soup with brown rice and lime", dinner: "Pollo a la plancha with tostones and a fresh salad" }
      ] },
      { name: "Anti-Inflammatory Fusion", type: "Anti-Inflammatory", duration: "8 weeks", difficulty: "Intermediate", price: 36.99, description: "Combining Mediterranean and Latin anti-inflammatory ingredients for whole-body wellness.", sampleDays: [
        { day: "Day 1", calories: "1,780 cal", protein: "100g protein", breakfast: "Turmeric smoothie with mango, ginger, and coconut milk", lunch: "Quinoa bowl with roasted chickpeas, avocado, and chimichurri", dinner: "Baked cod with olive oil, capers, tomatoes, and fresh herbs" },
        { day: "Day 2", calories: "1,750 cal", protein: "98g protein", breakfast: "Chia pudding with passion fruit, coconut, and granola", lunch: "Mediterranean wrap with grilled vegetables and tahini", dinner: "Slow-cooked chicken with sofrito, beans, and brown rice" },
        { day: "Day 3", calories: "1,800 cal", protein: "102g protein", breakfast: "Acai bowl with fresh fruit, hemp seeds, and honey", lunch: "Lentil soup with cumin, lime, and fresh cilantro", dinner: "Grilled shrimp with garlic, olive oil, and roasted sweet potatoes" }
      ] },
      { name: "Meal Prep Latino Style", type: "Meal Prep", duration: "4 weeks", difficulty: "Beginner", price: 24.99, description: "Sunday meal prep with Latin-inspired dishes that reheat perfectly all week.", sampleDays: [
        { day: "Day 1", calories: "1,850 cal", protein: "108g protein", breakfast: "Prep: breakfast burritos (freeze for the week)", lunch: "Prep: chicken tinga with rice (portion into containers)", dinner: "Prep: turkey picadillo with cauliflower rice" },
        { day: "Day 2", calories: "1,820 cal", protein: "105g protein", breakfast: "Frozen breakfast burrito (reheat)", lunch: "Chicken tinga bowl with fresh avocado", dinner: "Picadillo with a side of black beans" },
        { day: "Day 3", calories: "1,880 cal", protein: "110g protein", breakfast: "Breakfast burrito with fresh salsa", lunch: "Leftover picadillo in lettuce wraps", dinner: "Fresh: quick shrimp and vegetable stir-fry with lime" }
      ] },
    ],
    tags: ["Mediterranean", "Latin", "Cultural"]
  },
  {
    id: 120, name: "Brandon Lee", specialty: "Sports Supplements & Optimization",
    category: "sports", price: 49.99, rating: null, subscribers: 1280, experience: "7 yrs",
    credential: "CNS", credentialFull: "Certified Nutrition Specialist",
    specialtyType: "Sports Supplement Specialist",
    bio: "Certified Nutrition Specialist with a biochemistry background. Evidence-based supplement protocols — no bro science, just what works.",
    color: "#7C3AED",
    services: ["Supplement stacks", "Pre/post workout nutrition", "Recovery protocols", "Blood work analysis"],
    plans: [
      { name: "Evidence-Based Stack", type: "Performance", duration: "8 weeks", difficulty: "Intermediate", price: 39.99, description: "Research-backed supplement and nutrition plan for athletic performance.", sampleDays: [
        { day: "Day 1 — Training Day", calories: "2,400 cal", protein: "165g protein", breakfast: "Oats with whey protein, banana, and creatine (5g) in water", lunch: "Chicken and rice with vegetables and fish oil (2g EPA/DHA)", dinner: "Post-workout: whey shake + steak with sweet potato and greens. Before bed: casein shake + magnesium" },
        { day: "Day 2 — Training Day", calories: "2,350 cal", protein: "160g protein", breakfast: "Eggs with toast, fruit, and vitamin D + K2", lunch: "Pre-workout: caffeine + citrulline + beta-alanine. Then salmon and quinoa bowl", dinner: "Post-workout: whey + dextrose. Then chicken stir-fry with rice and vegetables" },
        { day: "Day 3 — Rest Day", calories: "2,100 cal", protein: "145g protein", breakfast: "Greek yogurt with granola + creatine (5g) + multivitamin", lunch: "Turkey and avocado sandwich with fruit and fish oil", dinner: "Light chicken salad with olive oil. Before bed: ZMA + casein" }
      ] },
      { name: "Natural Muscle Builder", type: "High Calorie", duration: "12 weeks", difficulty: "Intermediate", price: 44.99, description: "Supplement-enhanced bulking plan maximizing natural muscle growth potential.", sampleDays: [
        { day: "Day 1", calories: "3,000 cal", protein: "185g protein", breakfast: "Mass shake: whey, oats, banana, peanut butter, creatine", lunch: "Large chicken and rice bowl with olive oil, plus HMB", dinner: "Steak with potatoes and vegetables. Before bed: casein + ashwagandha" },
        { day: "Day 2", calories: "2,950 cal", protein: "180g protein", breakfast: "Eggs, toast, fruit + vitamin D + omega-3", lunch: "Pre: caffeine + citrulline. Post: whey + dextrose. Salmon pasta bowl", dinner: "Ground beef tacos with cheese and rice. Evening: ZMA" },
        { day: "Day 3", calories: "3,100 cal", protein: "190g protein", breakfast: "Protein pancakes with syrup + creatine in coffee", lunch: "Double chicken burrito bowl with all the fixings", dinner: "Pork chops with mashed potatoes and gravy. Before bed: casein shake" }
      ] },
      { name: "Recovery & Longevity", type: "Anti-Inflammatory", duration: "8 weeks", difficulty: "Beginner", price: 34.99, description: "Anti-inflammatory nutrition plus recovery supplements for active adults.", sampleDays: [
        { day: "Day 1", calories: "1,900 cal", protein: "120g protein", breakfast: "Smoothie with collagen, tart cherry, turmeric, and berries", lunch: "Grilled salmon with quinoa and mixed greens + omega-3", dinner: "Chicken and vegetable soup with bone broth base. Evening: magnesium glycinate" },
        { day: "Day 2", calories: "1,850 cal", protein: "118g protein", breakfast: "Greek yogurt with walnuts, flax, and vitamin D drops", lunch: "Turkey salad with olive oil and anti-inflammatory spices", dinner: "Baked cod with roasted vegetables and sweet potato. Evening: tart cherry juice" },
        { day: "Day 3", calories: "1,920 cal", protein: "122g protein", breakfast: "Oatmeal with collagen peptides, berries, and cinnamon", lunch: "Lentil soup with turmeric and a side of whole grain bread", dinner: "Grass-fed beef with roasted root vegetables. Before bed: glycine + magnesium" }
      ] },
      { name: "Pre-Workout Nutrition Guide", type: "Performance", duration: "4 weeks", difficulty: "Beginner", price: 24.99, description: "Optimize your pre, intra, and post-workout nutrition for maximum performance.", sampleDays: [
        { day: "Day 1 — Morning Training", calories: "2,200 cal", protein: "150g protein", breakfast: "2hrs pre: oats with banana and honey. 30min pre: caffeine + citrulline", lunch: "Post-workout: whey shake with dextrose. Then chicken rice bowl", dinner: "Salmon with sweet potato and steamed broccoli. Night: casein" },
        { day: "Day 2 — Afternoon Training", calories: "2,250 cal", protein: "155g protein", breakfast: "Eggs with toast and fruit", lunch: "90min pre: chicken wrap with rice. 30min pre: caffeine + beta-alanine", dinner: "Post-workout: whey + banana. Then steak with potatoes and vegetables" },
        { day: "Day 3 — Rest Day", calories: "2,000 cal", protein: "140g protein", breakfast: "Protein smoothie with oats and berries + creatine", lunch: "Turkey and avocado salad with olive oil dressing", dinner: "Light pasta with chicken and vegetables. No pre-workout needed" }
      ] },
    ],
    tags: ["Supplements", "Performance", "Recovery"]
  },
  {
    id: 121, name: "Emma Richardson", specialty: "Eating Disorder Recovery Nutrition",
    category: "clinical", price: 59.99, rating: null, subscribers: 580, experience: "12 yrs",
    credential: "RDN", credentialFull: "Registered Dietitian Nutritionist",
    specialtyType: "ED Recovery Nutritionist",
    bio: "Registered Dietitian specializing in eating disorder recovery. Gentle, compassionate approach to rebuilding a healthy relationship with food.",
    color: "#14B8A6",
    services: ["Recovery meal support", "Intuitive eating", "Body image coaching", "Family-based treatment nutrition"],
    plans: [
      { name: "Gentle Nourishment", type: "Whole Foods", duration: "12 weeks", difficulty: "Beginner", price: 39.99, description: "Recovery-focused plan emphasizing adequacy, variety, and food neutrality.", sampleDays: [
        { day: "Day 1", calories: "Adequate (not counted)", protein: "Adequate", breakfast: "Toast with peanut butter and banana — eat at a comfortable pace", lunch: "Sandwich with your choice of protein, a side of chips, and fruit", dinner: "Pasta with sauce, a side salad, and bread. Dessert if desired." },
        { day: "Day 2", calories: "Adequate (not counted)", protein: "Adequate", breakfast: "Cereal with milk and berries — focus on satisfaction", lunch: "Soup and a half sandwich — practice listening to hunger cues", dinner: "Rice bowl with chicken and vegetables. Add what sounds good." },
        { day: "Day 3", calories: "Adequate (not counted)", protein: "Adequate", breakfast: "Yogurt with granola and honey — no measuring required", lunch: "Leftovers from dinner — practice flexible eating", dinner: "Family-style meal — serve yourself what looks appealing" }
      ] },
      { name: "Intuitive Eating Journey", type: "Flexible", duration: "10 weeks", difficulty: "Beginner", price: 34.99, description: "Learn to trust your body's hunger and fullness signals through structured guidance.", sampleDays: [
        { day: "Day 1", calories: "Body-guided", protein: "Adequate", breakfast: "Check in: How hungry am I? Choose what sounds satisfying", lunch: "Practice: eat without distractions, notice taste and texture", dinner: "Challenge: include a previously avoided food in a comforting setting" },
        { day: "Day 2", calories: "Body-guided", protein: "Adequate", breakfast: "Morning check-in with hunger scale (1-10)", lunch: "Mindful eating exercise — eat slowly, savor each bite", dinner: "Flexibility practice: order something new at a restaurant or try a new recipe" },
        { day: "Day 3", calories: "Body-guided", protein: "Adequate", breakfast: "Gentle morning — eat what your body is asking for", lunch: "Social eating practice — enjoy a meal with a friend", dinner: "Satisfaction check: did the meal feel satisfying? Journaling exercise" }
      ] },
      { name: "Mechanical Eating Plan", type: "Whole Foods", duration: "8 weeks", difficulty: "Beginner", price: 36.99, description: "Structured eating times and portions for those who've lost hunger/fullness cues.", sampleDays: [
        { day: "Day 1", calories: "Structured adequacy", protein: "Included at each meal", breakfast: "8am: grain + protein + fruit (e.g., oatmeal with eggs and berries)", lunch: "12pm: protein + starch + vegetable + fat (e.g., chicken rice bowl)", dinner: "6pm: protein + starch + vegetable + dessert (e.g., pasta with salad and ice cream)" },
        { day: "Day 2", calories: "Structured adequacy", protein: "Included at each meal", breakfast: "8am: toast with peanut butter, yogurt, and juice", lunch: "12pm: turkey sandwich, chips, apple, and a cookie", dinner: "6pm: stir-fry with rice, a roll, and fruit for dessert" },
        { day: "Day 3", calories: "Structured adequacy", protein: "Included at each meal", breakfast: "8am: smoothie with protein + a muffin", lunch: "12pm: soup, bread, cheese, and crackers", dinner: "6pm: grilled chicken, mashed potatoes, green beans, and pudding" }
      ] },
      { name: "Food Freedom Guide", type: "Flexible", duration: "16 weeks", difficulty: "Intermediate", price: 44.99, description: "Long-term guide to making peace with food, ditching diet culture, and eating joyfully.", sampleDays: [
        { day: "Day 1", calories: "Not tracked", protein: "Not tracked", breakfast: "Eat what you want for breakfast — journal how it felt", lunch: "Food challenge: eat a fear food in a safe environment", dinner: "Cook something that brings you joy — focus on the experience" },
        { day: "Day 2", calories: "Not tracked", protein: "Not tracked", breakfast: "Morning affirmation + nourishing breakfast of choice", lunch: "Social meal with no food rules — practice presence", dinner: "Try a new recipe — focus on creativity, not nutrition labels" },
        { day: "Day 3", calories: "Not tracked", protein: "Not tracked", breakfast: "Body scan meditation + breakfast that sounds good", lunch: "Gratitude meal — eat something you're grateful to enjoy", dinner: "Family or social dinner — practice being present with others" }
      ] },
    ],
    tags: ["ED Recovery", "Intuitive Eating", "Compassionate"]
  },
  {
    id: 122, name: "Daniel Park", specialty: "Asian-Inspired Nutrition",
    category: "general", price: 37.99, rating: null, subscribers: 1180, experience: "6 yrs",
    credential: "CN", credentialFull: "Certified Nutritionist",
    specialtyType: "Cultural Nutrition Coach",
    bio: "Certified Nutritionist blending traditional Asian dietary wisdom with modern sports nutrition. Rice is not the enemy.",
    color: "#F97316",
    services: ["Asian meal plans", "Rice-based diets", "Fermented food guidance", "Traditional food medicine"],
    plans: [
      { name: "Japanese Longevity Diet", type: "Whole Foods", duration: "8 weeks", difficulty: "Beginner", price: 32.99, description: "Inspired by Okinawan centenarians — balanced, plant-forward, and portion-conscious.", sampleDays: [
        { day: "Day 1", calories: "1,750 cal", protein: "88g protein", breakfast: "Miso soup with tofu, steamed rice, and pickled vegetables", lunch: "Grilled mackerel with soba noodles and steamed edamame", dinner: "Vegetable tempura with rice, miso soup, and ginger tea" },
        { day: "Day 2", calories: "1,720 cal", protein: "92g protein", breakfast: "Tamago (rolled omelette) with rice and natto", lunch: "Ramen with pork chashu, soft egg, and vegetables", dinner: "Grilled salmon with daikon, steamed rice, and seaweed salad" },
        { day: "Day 3", calories: "1,780 cal", protein: "95g protein", breakfast: "Rice porridge with ginger, scallions, and a soft egg", lunch: "Chirashi bowl with mixed sashimi and pickled ginger", dinner: "Sukiyaki-style beef and vegetables with udon noodles" }
      ] },
      { name: "Korean Power Meals", type: "High Protein", duration: "6 weeks", difficulty: "Intermediate", price: 29.99, description: "Korean-inspired high-protein meals with fermented foods for gut health.", sampleDays: [
        { day: "Day 1", calories: "2,050 cal", protein: "135g protein", breakfast: "Bibimbap with beef, egg, and assorted vegetables", lunch: "Korean fried chicken (air-fried) with pickled radish and rice", dinner: "Doenjang jjigae (soybean paste stew) with tofu and rice" },
        { day: "Day 2", calories: "2,100 cal", protein: "138g protein", breakfast: "Protein congee with chicken and scallions", lunch: "Japchae with beef, vegetables, and a side of kimchi", dinner: "Grilled galbi with lettuce wraps, ssamjang, and rice" },
        { day: "Day 3", calories: "2,000 cal", protein: "130g protein", breakfast: "Korean egg roll with rice and kimchi", lunch: "Tuna kimbap rolls with miso soup and pickled vegetables", dinner: "Spicy tofu stew with pork, vegetables, and steamed rice" }
      ] },
      { name: "Chinese Wellness Meals", type: "Anti-Inflammatory", duration: "6 weeks", difficulty: "Beginner", price: 27.99, description: "Traditional Chinese dietary therapy principles adapted for modern wellness.", sampleDays: [
        { day: "Day 1", calories: "1,780 cal", protein: "98g protein", breakfast: "Congee with goji berries, dates, and a soft-boiled egg", lunch: "Steamed fish with ginger and scallions over jasmine rice", dinner: "Stir-fried bok choy with tofu in garlic sauce and rice" },
        { day: "Day 2", calories: "1,750 cal", protein: "95g protein", breakfast: "Soy milk with steamed buns and pickled vegetables", lunch: "Wonton soup with bok choy and a side of brown rice", dinner: "Red-braised chicken with lotus root and steamed vegetables" },
        { day: "Day 3", calories: "1,800 cal", protein: "100g protein", breakfast: "Scallion pancake with egg and black vinegar dipping sauce", lunch: "Mapo tofu with ground pork and steamed rice", dinner: "Herbal chicken soup with Chinese yam and wolfberries" }
      ] },
      { name: "Asian Meal Prep", type: "Meal Prep", duration: "4 weeks", difficulty: "Beginner", price: 24.99, description: "Batch-cook Asian staples on Sunday for delicious meals all week.", sampleDays: [
        { day: "Day 1", calories: "1,850 cal", protein: "105g protein", breakfast: "Prep: rice cooker batch + marinated proteins + sauce jars", lunch: "Teriyaki chicken rice bowl with steamed vegetables", dinner: "Stir-fry with pre-cut vegetables and pre-marinated beef" },
        { day: "Day 2", calories: "1,820 cal", protein: "102g protein", breakfast: "Quick miso soup with leftover rice and an egg", lunch: "Korean-style beef and rice with kimchi from the fridge", dinner: "Fried rice with leftover proteins and vegetables" },
        { day: "Day 3", calories: "1,880 cal", protein: "108g protein", breakfast: "Congee from batch (reheat and top with scallions)", lunch: "Curry from batch with fresh rice", dinner: "Fresh: quick ramen with prepped toppings from the week" }
      ] },
    ],
    tags: ["Asian", "Cultural", "Whole Foods"]
  },
];

// ===== Gyms =====
const gyms = [
  {
    id: 201, name: "Iron House Fitness", type: "Full-Service Gym",
    category: "gym", location: "Austin, TX", rating: null, members: 2400,
    trainers: 18, price: 49.99, featured: true, gymOfMonth: true,
    gotmQuote: "We built Iron House to be the gym people never want to leave.",
    bio: "A 25,000 sq ft full-service facility with free weights, machines, turf area, and group fitness studios. Open 24/7 with personal training included in every membership.",
    color: "#EF4444",
    amenities: ["Free Weights", "Machines", "Turf Area", "Group Classes", "Sauna", "Locker Rooms", "24/7 Access"],
    classes: ["Strength Training", "HIIT", "Yoga", "Spin"],
    tags: ["Full-Service", "24/7", "Personal Training"]
  },
  {
    id: 202, name: "Flow Studio", type: "Boutique Studio",
    category: "studio", location: "Brooklyn, NY", rating: null, members: 860,
    trainers: 8, price: 89.99, featured: true,
    bio: "A premium yoga and pilates studio in the heart of Williamsburg. Heated rooms, infrared saunas, and small class sizes for a personalized experience.",
    color: "#8B5CF6",
    amenities: ["Heated Studios", "Infrared Sauna", "Mat Rentals", "Showers", "Retail Shop"],
    classes: ["Vinyasa Yoga", "Hot Yoga", "Pilates", "Barre"],
    tags: ["Yoga", "Pilates", "Boutique"]
  },
  {
    id: 203, name: "Grit Athletics", type: "CrossFit Box",
    category: "crossfit", location: "Denver, CO", rating: null, members: 520,
    trainers: 6, price: 159.99,
    bio: "A no-frills CrossFit affiliate focused on community, competition, and results. Programming updated daily with scalable options for every fitness level.",
    color: "#F59E0B",
    amenities: ["Olympic Lifting Platforms", "Rigs & Pull-Up Bars", "Rowers & Bikes", "Open Gym Hours", "Competition Team"],
    classes: ["CrossFit WOD", "Olympic Lifting", "Endurance", "Gymnastics"],
    tags: ["CrossFit", "Competition", "Community"]
  },
  {
    id: 204, name: "Elevate Performance", type: "Full-Service Gym",
    category: "gym", location: "Miami, FL", rating: null, members: 3100,
    trainers: 24, price: 59.99,
    bio: "Miami's premier training facility with ocean views, rooftop recovery suites, and a team of nationally certified coaches. Two floors of equipment and dedicated functional training zones.",
    color: "#0EA5E9",
    amenities: ["Rooftop Recovery", "Pool", "Two Training Floors", "Juice Bar", "Childcare", "Parking"],
    classes: ["Strength", "Boxing", "Spin", "Recovery Yoga"],
    tags: ["Premium", "Full-Service", "Recovery"]
  },
  {
    id: 205, name: "The Sweat Lab", type: "Boutique Studio",
    category: "studio", location: "Nashville, TN", rating: null, members: 640,
    trainers: 5, price: 79.99,
    bio: "A high-energy boutique studio specializing in HIIT, cycling, and strength circuits. Music-driven classes capped at 20 people for maximum coaching attention.",
    color: "#EC4899",
    amenities: ["Sound System", "Heart Rate Tracking", "Showers", "Towel Service", "Water Station"],
    classes: ["HIIT", "Spin", "Strength Circuits", "Stretch & Recover"],
    tags: ["HIIT", "Cycling", "Small Classes"]
  },
  {
    id: 206, name: "Forge Barbell Club", type: "Specialty Gym",
    category: "specialty", location: "Portland, OR", rating: null, members: 280,
    trainers: 4, price: 99.99,
    bio: "A powerlifting and Olympic weightlifting gym built for serious lifters. Calibrated plates, competition benches, and a coaching staff with national-level experience.",
    color: "#10B981",
    amenities: ["Calibrated Plates", "Competition Platforms", "Chalk Stations", "Video Review Area", "Meet Prep"],
    classes: ["Powerlifting", "Olympic Lifting", "Strongman", "Accessory Work"],
    tags: ["Powerlifting", "Olympic Lifting", "Serious Lifters"]
  },
  {
    id: 207, name: "Basecamp Fitness", type: "Full-Service Gym",
    category: "gym", location: "Chicago, IL", rating: null, members: 4200,
    trainers: 32, price: 39.99,
    bio: "Affordable, no-contract fitness for everyone. Three locations across Chicago with clean facilities, modern equipment, and free group classes for all members.",
    color: "#6C3AED",
    amenities: ["3 Locations", "Modern Equipment", "Free Group Classes", "No Contract", "App Check-In", "Locker Rooms"],
    classes: ["Group Strength", "Cardio Blast", "Yoga", "Core & Abs"],
    tags: ["Affordable", "No Contract", "Multi-Location"]
  },
  {
    id: 208, name: "Apex MMA & Fitness", type: "Specialty Gym",
    category: "specialty", location: "Las Vegas, NV", rating: null, members: 750,
    trainers: 12, price: 129.99,
    bio: "A combat sports training center with world-class coaches in boxing, Muay Thai, Brazilian Jiu-Jitsu, and MMA. Open to all levels from beginners to fighters.",
    color: "#DC2626",
    amenities: ["Boxing Ring", "MMA Cage", "Mat Space", "Heavy Bags", "Strength Area", "Pro Shop"],
    classes: ["Boxing", "Muay Thai", "Brazilian Jiu-Jitsu", "MMA", "Kickboxing"],
    tags: ["MMA", "Boxing", "Combat Sports"]
  },
  {
    id: 209, name: "Solstice Wellness", type: "Boutique Studio",
    category: "studio", location: "San Diego, CA", rating: null, members: 480,
    trainers: 7, price: 69.99,
    bio: "A holistic wellness studio combining yoga, meditation, and breathwork. Focused on mind-body connection with certified instructors and intimate class settings.",
    color: "#14B8A6",
    amenities: ["Meditation Room", "Essential Oils", "Sound Healing", "Private Sessions", "Workshop Space"],
    classes: ["Yin Yoga", "Power Yoga", "Meditation", "Breathwork", "Sound Bath"],
    tags: ["Wellness", "Meditation", "Mind-Body"]
  },
  {
    id: 210, name: "Titan Strength Co.", type: "Full-Service Gym",
    category: "gym", location: "Atlanta, GA", rating: null, members: 1800,
    trainers: 15, price: 54.99,
    bio: "A strength-focused gym with dedicated zones for powerlifting, bodybuilding, and functional training. Known for its community and coaching culture.",
    color: "#F97316",
    amenities: ["Powerlifting Zone", "Bodybuilding Area", "Functional Zone", "Recovery Room", "Supplement Bar"],
    classes: ["Strength Basics", "Hypertrophy", "Functional Fitness", "Mobility"],
    tags: ["Strength", "Community", "Coaching"]
  },
  {
    id: 211, name: "Northeast Barbell", type: "Specialty Gym",
    category: "specialty", location: "Boston, MA", rating: null, members: 420,
    trainers: 5, price: 89.99,
    bio: "A no-nonsense barbell gym in South Boston built for lifters who want to get strong. Calibrated equipment, experienced coaching, and a tight-knit community of dedicated athletes.",
    color: "#1D4ED8",
    amenities: ["Eleiko Equipment", "Competition Platforms", "Chalk Friendly", "Open Gym Hours", "Meet Prep Program"],
    classes: ["Powerlifting", "Olympic Lifting", "Strongman Saturday", "Beginner Barbell"],
    tags: ["Powerlifting", "Barbell", "Coaching"]
  },
  {
    id: 212, name: "Harbor Fitness Club", type: "Full-Service Gym",
    category: "gym", location: "Portland, ME", rating: null, members: 1600,
    trainers: 12, price: 44.99,
    bio: "Portland's largest full-service gym overlooking the harbor. Two floors of cardio and strength equipment, a lap pool, and over 40 group classes per week.",
    color: "#0891B2",
    amenities: ["Lap Pool", "Steam Room", "Free Weights", "Cardio Deck", "Group Studios", "Childcare", "Free Parking"],
    classes: ["Spin", "Yoga", "Aqua Fitness", "Strength", "Zumba", "Boxing"],
    tags: ["Full-Service", "Pool", "Family-Friendly"]
  },
  {
    id: 213, name: "Elm City CrossFit", type: "CrossFit Box",
    category: "crossfit", location: "New Haven, CT", rating: null, members: 340,
    trainers: 4, price: 175.99,
    bio: "A welcoming CrossFit affiliate in the heart of New Haven. Scalable programming for all levels, a strong competition team, and a community that shows up for each other every day.",
    color: "#059669",
    amenities: ["Rigs & Bars", "Rowers & Ski Ergs", "Outdoor Training Area", "Mobility Corner", "Community Events"],
    classes: ["CrossFit WOD", "Olympic Lifting", "Engine Builder", "Competitors Class"],
    tags: ["CrossFit", "Community", "All Levels"]
  },
  {
    id: 214, name: "Summit Studio", type: "Boutique Studio",
    category: "studio", location: "Burlington, VT", rating: null, members: 380,
    trainers: 6, price: 74.99,
    bio: "A mountain-inspired boutique studio offering cycling, barre, and strength classes. Small class sizes, locally sourced smoothie bar, and a rooftop stretch deck with views of the Green Mountains.",
    color: "#7C3AED",
    amenities: ["Cycling Room", "Barre Studio", "Rooftop Deck", "Smoothie Bar", "Showers", "Towel Service"],
    classes: ["Rhythm Ride", "Barre Sculpt", "Strength & Flow", "Stretch & Recover"],
    tags: ["Boutique", "Cycling", "Barre"]
  },
  {
    id: 215, name: "Granite State Athletics", type: "Full-Service Gym",
    category: "gym", location: "Manchester, NH", rating: null, members: 2100,
    trainers: 14, price: 34.99,
    bio: "New Hampshire's most affordable full-service gym. Clean, well-maintained, and open early to late. No frills, no gimmicks — just solid equipment and a welcoming atmosphere.",
    color: "#64748B",
    amenities: ["Free Weights", "Machines", "Cardio Floor", "Turf Area", "Locker Rooms", "24/7 Key Fob Access"],
    classes: ["Group Strength", "Cardio Kickboxing", "Yoga", "Ab Lab"],
    tags: ["Affordable", "24/7", "No Contract"]
  },
  {
    id: 216, name: "Coastline Yoga", type: "Boutique Studio",
    category: "studio", location: "Newport, RI", rating: null, members: 290,
    trainers: 5, price: 79.99,
    bio: "A serene oceanside yoga studio offering heated and unheated classes in a restored seaside building. Specializing in Vinyasa, Yin, and meditation with views of Narragansett Bay.",
    color: "#2DD4BF",
    amenities: ["Ocean Views", "Heated Studio", "Mat Rentals", "Tea Lounge", "Private Sessions", "Weekend Retreats"],
    classes: ["Vinyasa Flow", "Yin Yoga", "Hot Power Yoga", "Meditation", "Sunrise Stretch"],
    tags: ["Yoga", "Wellness", "Oceanside"]
  },
];

// ===== Render Functions =====
function createTrainerCard(trainer) {
  const initials = trainer.name.split(' ').map(n => n[0]).join('');
  return `
    <div class="card" onclick="openTrainerModal(${trainer.id})" data-category="${trainer.category}">
      <div class="card-body">
        <div class="card-header-row">
          ${trainer.avatar
            ? `<img class="card-avatar-inline" src="${trainer.avatar}" alt="${trainer.name}">`
            : `<div class="card-avatar-inline" style="background: ${trainer.color};">${initials}</div>`
          }
          <div class="card-header-info">
            <h3>${trainer.name}</h3>
            <div class="card-specialty">${trainer.specialty}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          ${trainer.credential ? `<span class="cred-tip" data-tip="${trainer.credentialFull || trainer.credential}" style="padding:3px 8px;font-size:0.62rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border:1px solid var(--accent);color:var(--accent-dark);border-radius:3px;">${trainer.credential}</span>` : ''}
          ${trainer.specialtyType ? `<span style="padding:3px 8px;font-size:0.62rem;font-weight:500;color:var(--text-muted);border:1px solid var(--border);border-radius:3px;">${trainer.specialtyType}</span>` : ''}
        </div>
        <p class="card-desc">${trainer.bio}</p>
        <div class="card-meta">
          <span class="card-rating">${trainer.rating}</span>
          <span>${trainer.subscribers.toLocaleString()} subscribers</span>
          <span>${trainer.experience}</span>
        </div>
        <div class="card-footer">
          <div class="card-price">$${trainer.price}<span>/mo</span></div>
          <div style="display:flex;gap:8px;align-items:center;">
            <a href="trainer-profile.html?id=${trainer.id}" class="btn btn-sm btn-outline" onclick="event.stopPropagation()">Profile</a>
            <button class="btn btn-sm btn-primary">View Workouts</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function createNutritionistCard(nutritionist) {
  const initials = nutritionist.name.split(' ').map(n => n[0]).join('');
  return `
    <div class="card" onclick="openNutritionistModal(${nutritionist.id})">
      <div class="card-body">
        <div class="card-header-row">
          ${nutritionist.avatar
            ? `<img class="card-avatar-inline" src="${nutritionist.avatar}" alt="${nutritionist.name}">`
            : `<div class="card-avatar-inline" style="background: ${nutritionist.color};">${initials}</div>`
          }
          <div class="card-header-info">
            <h3>${nutritionist.name}</h3>
            <div class="card-specialty">${nutritionist.specialty}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          ${nutritionist.credential ? `<span class="cred-tip" data-tip="${nutritionist.credentialFull || nutritionist.credential}" style="padding:3px 8px;font-size:0.62rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border:1px solid var(--accent);color:var(--accent-dark);border-radius:3px;">${nutritionist.credential}</span>` : ''}
          ${nutritionist.specialtyType ? `<span style="padding:3px 8px;font-size:0.62rem;font-weight:500;color:var(--text-muted);border:1px solid var(--border);border-radius:3px;">${nutritionist.specialtyType}</span>` : ''}
        </div>
        <p class="card-desc">${nutritionist.bio}</p>
        <div class="card-meta">
          <span class="card-rating">${nutritionist.rating}</span>
          <span>${nutritionist.subscribers.toLocaleString()} subscribers</span>
          <span>${nutritionist.experience}</span>
        </div>
        <div class="card-footer">
          <div class="card-price">$${nutritionist.price}<span>/mo</span></div>
          <div style="display:flex;gap:8px;align-items:center;">
            <a href="nutritionist-profile.html?id=${nutritionist.id}" class="btn btn-sm btn-outline" onclick="event.stopPropagation()">Profile</a>
            <button class="btn btn-sm btn-accent">View Plans</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function createGymCard(gym) {
  const initials = gym.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  return `
    <div class="card" onclick="openGymModal(${gym.id})" data-category="${gym.category}">
      <div class="card-body">
        <div class="card-header-row">
          <div class="card-avatar-inline" style="background: ${gym.color};">${initials}</div>
          <div class="card-header-info">
            <h3>${gym.name}</h3>
            <div class="card-specialty">${gym.type} — ${gym.location}</div>
          </div>
        </div>
        <p class="card-desc">${gym.bio}</p>
        <div class="card-meta">
          <span class="card-rating">${gym.rating}</span>
          <span>${gym.members.toLocaleString()} members</span>
          <span>${gym.trainers} trainers</span>
        </div>
        <div class="card-footer">
          <div class="card-price">$${gym.price}<span>/mo</span></div>
          <button class="btn btn-sm btn-primary">View Details</button>
        </div>
      </div>
    </div>
  `;
}

function openGymModal(id) {
  const gym = gyms.find(g => g.id === id);
  if (!gym) return;
  const initials = gym.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  const modal = document.getElementById('gymModal');
  const content = document.getElementById('gymModalContent');
  if (!modal || !content) return;
  content.innerHTML = `
    <div class="trainer-detail">
      <div class="trainer-detail-header">
        <div class="trainer-detail-avatar" style="background: ${gym.color};">${initials}</div>
        <div>
          <h2>${gym.name}</h2>
          <div class="card-specialty">${gym.type} — ${gym.location}</div>
          <div class="trainer-detail-stats">
            <span>${gym.rating} rating</span>
            <span>${gym.members.toLocaleString()} members</span>
            <span>${gym.trainers} trainers on staff</span>
          </div>
        </div>
      </div>
      <p style="color:var(--text-muted);font-size:0.95rem;line-height:1.8;margin-bottom:24px;">${gym.bio}</p>
      <div style="margin-bottom:24px;">
        <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:12px;">Amenities</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${gym.amenities.map(a => `<span style="padding:6px 14px;border:1px solid var(--border);border-radius:20px;font-size:0.82rem;color:var(--text-muted);">${a}</span>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:24px;">
        <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:12px;">Classes Offered</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${gym.classes.map(c => `<span style="padding:6px 14px;border:1px solid var(--border);border-radius:20px;font-size:0.82rem;color:var(--text-muted);">${c}</span>`).join('')}
        </div>
      </div>
      <div class="card-footer" style="border-top:1px solid var(--border);padding-top:20px;margin-top:8px;">
        <div class="card-price" style="font-size:1.4rem;">$${gym.price}<span>/mo</span></div>
        <button class="btn btn-sm btn-primary" onclick="showToast('Membership request sent!')">Join This Gym</button>
      </div>
    </div>
  `;
  modal.classList.add('active');
}

// ===== Trainer of the Month =====
const totmCard = document.getElementById('totmCard');
if (totmCard) {
  const totm = trainers.find(t => t.trainerOfMonth);
  if (totm) {
    const initials = totm.name.split(' ').map(n => n[0]).join('');
    totmCard.style.cursor = 'pointer';
    totmCard.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      openTrainerModal(totm.id);
    });
    totmCard.innerHTML = `
      <div class="totm-layout">
        <div class="totm-avatar-area">
          <div class="totm-avatar" style="background: ${totm.color};">${initials}</div>
          <div class="totm-badge">Trainer of the Month</div>
        </div>
        <div class="totm-info">
          <h2>${totm.name}</h2>
          <div class="card-specialty">${totm.specialty}</div>
          <p class="totm-quote">"${totm.totmQuote}"</p>
          <p class="card-desc">${totm.bio}</p>
          <div class="trainer-detail-stats">
            <span>${totm.rating} rating</span>
            <span>${totm.subscribers.toLocaleString()} subscribers</span>
            <span>${totm.experience} experience</span>
          </div>
          <div style="margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="event.stopPropagation();openTrainerModal(${totm.id})">View Workouts</button>
            <a class="btn btn-outline" href="trainer-profile.html?id=${totm.id}" onclick="event.stopPropagation()">Profile</a>
            <button class="btn btn-outline" onclick="event.stopPropagation();shapeSubscribe('trainer', ${totm.id})">Subscribe — $${totm.price}/mo</button>
          </div>
        </div>
      </div>
    `;
  }
}

// ===== Init Cards =====
const trainerGrid = document.getElementById('trainerGrid');
const nutritionistGrid = document.getElementById('nutritionistGrid');
if (trainerGrid) trainerGrid.innerHTML = trainers.map(createTrainerCard).join('');
if (nutritionistGrid) nutritionistGrid.innerHTML = nutritionists.map(createNutritionistCard).join('');

// Nutritionist of the Month
const notmCard = document.getElementById('notmCard');
if (notmCard) {
  const notm = nutritionists.find(n => n.nutritionistOfMonth);
  if (notm) {
    const initials = notm.name.split(' ').map(n => n[0]).join('');
    notmCard.style.cursor = 'pointer';
    notmCard.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      openNutritionistModal(notm.id);
    });
    notmCard.innerHTML = `
      <div class="totm-layout">
        <div class="totm-avatar-area">
          <div class="totm-avatar" style="background: ${notm.color};">${initials}</div>
          <div class="totm-badge">Nutritionist of the Month</div>
        </div>
        <div class="totm-info">
          <h2>${notm.name}</h2>
          <div class="card-specialty">${notm.specialty}</div>
          <p class="totm-quote">"${notm.notmQuote}"</p>
          <p class="card-desc">${notm.bio}</p>
          <div class="card-meta">
            <span>${notm.rating} rating</span>
            <span>${notm.subscribers.toLocaleString()} subscribers</span>
            <span>${notm.experience} experience</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary" onclick="event.stopPropagation();openNutritionistModal(${notm.id})">View Plans</button>
            <a class="btn btn-outline" href="nutritionist-profile.html?id=${notm.id}" onclick="event.stopPropagation()">Profile</a>
            <button class="btn btn-outline" onclick="event.stopPropagation();shapeSubscribe('nutritionist', ${notm.id})">Subscribe — $${notm.price}/mo</button>
          </div>
        </div>
      </div>
    `;
  }
}

// ===== Filter & Sort =====
let activeTrainerFilter = 'all';
let activeTrainerCredentialFilter = 'all';
let activeNutritionistFilter = 'all';
let activeGymFilter = 'all';

function setTrainerFilter(btn) {
  document.querySelectorAll('.filter-bar-buttons .filter-btn:not(.credential-filter):not(.trainer-credential-filter)').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeTrainerFilter = btn.dataset.filter;
  filterTrainers();
}

function setTrainerCredentialFilter(btn) {
  document.querySelectorAll('.trainer-credential-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeTrainerCredentialFilter = btn.dataset.credential;
  filterTrainers();
}

let activeCredentialFilter = 'all';

function setNutritionistFilter(btn) {
  document.querySelectorAll('.filter-bar-buttons .filter-btn:not(.credential-filter)').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeNutritionistFilter = btn.dataset.filter;
  filterNutritionists();
}

function setCredentialFilter(btn) {
  document.querySelectorAll('.credential-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeCredentialFilter = btn.dataset.credential;
  filterNutritionists();
}

function setGymFilter(btn) {
  document.querySelectorAll('#gymFilterButtons .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeGymFilter = btn.dataset.filter;
  filterGyms();
}

function sortData(data, sortBy) {
  const sorted = [...data];
  switch (sortBy) {
    case 'subscribers': sorted.sort((a, b) => b.subscribers - a.subscribers); break;
    case 'members': sorted.sort((a, b) => b.members - a.members); break;
    case 'rating': sorted.sort((a, b) => b.rating - a.rating); break;
    case 'price': sorted.sort((a, b) => a.price - b.price); break;
    case 'experience': sorted.sort((a, b) => parseInt(b.experience) - parseInt(a.experience)); break;
    case 'trainers': sorted.sort((a, b) => b.trainers - a.trainers); break;
  }
  return sorted;
}

function filterTrainers() {
  const searchEl = document.getElementById('trainerSearch');
  const sortEl = document.getElementById('trainerSort');
  const grid = document.getElementById('trainerGrid');
  if (!grid) return;
  const search = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const sortBy = sortEl ? sortEl.value : 'subscribers';
  let filtered = trainers.filter(t => {
    const matchesSearch = !search || t.name.toLowerCase().includes(search);
    const matchesCategory = activeTrainerFilter === 'all' || t.category === activeTrainerFilter;
    const matchesCredential = activeTrainerCredentialFilter === 'all' || (t.credential && t.credential === activeTrainerCredentialFilter) || (activeTrainerCredentialFilter === 'NASM' && t.credential && t.credential.startsWith('NASM'));
    return matchesSearch && matchesCategory && matchesCredential;
  });
  filtered = sortData(filtered, sortBy);
  grid.innerHTML = filtered.map(createTrainerCard).join('');
}

function filterNutritionists() {
  const searchEl = document.getElementById('nutritionistSearch');
  const sortEl = document.getElementById('nutritionistSort');
  const grid = document.getElementById('nutritionistGrid');
  if (!grid) return;
  const search = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const sortBy = sortEl ? sortEl.value : 'subscribers';
  let filtered = nutritionists.filter(n => {
    const matchesSearch = !search || n.name.toLowerCase().includes(search) || (n.specialtyType && n.specialtyType.toLowerCase().includes(search)) || (n.credential && n.credential.toLowerCase().includes(search));
    const matchesCategory = activeNutritionistFilter === 'all' || n.category === activeNutritionistFilter;
    const matchesCredential = activeCredentialFilter === 'all' || n.credential === activeCredentialFilter || (activeCredentialFilter === 'RDN' && (n.credential === 'RDN' || n.credential === 'RD'));
    return matchesSearch && matchesCategory && matchesCredential;
  });
  filtered = sortData(filtered, sortBy);
  grid.innerHTML = filtered.map(createNutritionistCard).join('');
}

function filterGyms() {
  const searchEl = document.getElementById('gymSearch');
  const sortEl = document.getElementById('gymSort');
  const grid = document.getElementById('gymGrid');
  if (!grid) return;
  const search = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const sortBy = sortEl ? sortEl.value : 'members';
  let filtered = gyms.filter(g => {
    const matchesSearch = !search || g.name.toLowerCase().includes(search) || g.location.toLowerCase().includes(search);
    const matchesCategory = activeGymFilter === 'all' || g.category === activeGymFilter;
    return matchesSearch && matchesCategory;
  });
  filtered = sortData(filtered, sortBy);
  grid.innerHTML = filtered.map(createGymCard).join('');
}

// ===== Navbar Scroll =====
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// ===== Mobile Nav: move action buttons into slide-out menu =====
function handleMobileNav() {
  const navLinks = document.getElementById('navLinks');
  const navActions = document.querySelector('.nav-actions');
  if (!navLinks || !navActions) return;
  if (window.innerWidth <= 768) {
    // Move action buttons into nav-links if not already there
    if (!navLinks.contains(navActions)) {
      navLinks.appendChild(navActions);
      navActions.style.display = 'flex';
      navActions.style.flexDirection = 'column';
      navActions.style.alignItems = 'center';
      navActions.style.gap = '16px';
      navActions.style.marginTop = '20px';
      navActions.style.paddingTop = '20px';
      navActions.style.borderTop = '1px solid var(--border)';
      navActions.style.width = '100%';
    }
  } else {
    // Move back to nav-container on desktop
    const navContainer = document.querySelector('.nav-container');
    const navToggleBtn = document.getElementById('navToggle');
    if (navActions.parentElement === navLinks && navContainer) {
      navContainer.insertBefore(navActions, navToggleBtn);
      navActions.style.display = '';
      navActions.style.flexDirection = '';
      navActions.style.alignItems = '';
      navActions.style.gap = '';
      navActions.style.marginTop = '';
      navActions.style.paddingTop = '';
      navActions.style.borderTop = '';
      navActions.style.width = '';
    }
  }
}
handleMobileNav();
window.addEventListener('resize', handleMobileNav);

const navToggle = document.getElementById('navToggle');
if (navToggle) {
  navToggle.addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
    navToggle.classList.toggle('active');
  });
}

// Close mobile nav when tapping outside
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768) {
    const navLinks = document.getElementById('navLinks');
    if (navLinks && navLinks.classList.contains('open') &&
        !navLinks.contains(e.target) && !navToggle.contains(e.target)) {
      navLinks.classList.remove('open');
      navToggle.classList.remove('active');
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
    }
  }
});

// ===== Mobile Nav Dropdown =====
document.querySelectorAll('.nav-dropdown > a').forEach(link => {
  link.addEventListener('click', function(e) {
    if (window.innerWidth <= 768) {
      e.preventDefault();
      e.stopPropagation();
      const parent = this.parentElement;
      // Close other dropdowns (accordion)
      document.querySelectorAll('.nav-dropdown').forEach(dd => {
        if (dd !== parent) dd.classList.remove('open');
      });
      parent.classList.toggle('open');
      return false;
    }
  });
});

// ===== Modals =====
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
}

function openTrainerModal(id) {
  const t = trainers.find(tr => tr.id === id);
  if (!t) return;
  const initials = t.name.split(' ').map(n => n[0]).join('');
  document.getElementById('trainerModalContent').innerHTML = `
    <div class="trainer-detail-header">
      <div class="trainer-detail-avatar" style="background: ${t.color};">${initials}</div>
      <div class="trainer-detail-info">
        <h2>${t.name}</h2>
        <div class="card-specialty">${t.specialty}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
          ${t.credential ? `<span class="cred-tip" data-tip="${t.credentialFull || t.credential}" style="padding:3px 8px;font-size:0.62rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border:1px solid var(--accent);color:var(--accent-dark);border-radius:3px;">${t.credential}</span>` : ''}
          ${t.credentialFull ? `<span style="padding:3px 8px;font-size:0.62rem;font-weight:500;color:var(--text-muted);border:1px solid var(--border);border-radius:3px;">${t.credentialFull}</span>` : ''}
          ${t.specialtyType ? `<span style="padding:3px 8px;font-size:0.62rem;font-weight:500;color:var(--text-muted);border:1px solid var(--border);border-radius:3px;">${t.specialtyType}</span>` : ''}
        </div>
        <p class="card-desc">${t.bio}</p>
        <div class="trainer-detail-stats">
          <span>${t.rating} rating</span>
          <span>${t.subscribers.toLocaleString()} subscribers</span>
          <span>${t.experience} experience</span>
        </div>
      </div>
    </div>
    <div class="workout-list">
      <h3>Workout Plans — Buy Individually</h3>
      ${t.workouts.map(w => `
        <div class="workout-item-purchase">
          <div class="workout-item-info">
            <h4>${w.name}</h4>
            <p>${w.description || w.type}</p>
            <div class="workout-item-tags">
              <span class="workout-tag">${w.type}</span>
              <span class="workout-tag">${w.duration}</span>
              <span class="workout-tag">${w.difficulty}</span>
              ${w.location ? `<span class="workout-tag">${w.location}</span>` : ''}
            </div>
            ${w.sampleDays ? `<div class="exercise-preview" style="margin-top:8px;padding-left:2px;">
              <div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Sample Program</div>
              ${w.sampleDays.map(d => `
                <div style="margin-bottom:6px;">
                  <div style="font-size:0.78rem;font-weight:500;color:var(--text);margin-bottom:2px;">${d.day}${d.calories ? ` <span style="font-weight:300;color:var(--text-muted);font-size:0.72rem;margin-left:6px;">${d.calories} \u00b7 ${d.protein}</span>` : ''}</div>
                  ${d.exercises.map(e => `<div style="font-size:0.78rem;color:var(--text-muted);padding:1px 0 1px 8px;font-weight:300;">&middot; ${e}</div>`).join('')}
                </div>
              `).join('')}
            </div>` : ''}
          </div>
          <div class="workout-item-buy">
            <div class="workout-item-price">$${w.price.toFixed(2)}</div>
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();shapeBookOneTime('trainer', ${t.id}, 'booking')">Buy Plan</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="consult-section">
      <h3>Not sure yet?</h3>
      <p style="font-size:0.88rem;color:var(--text-muted);font-weight:300;margin-bottom:16px;">Book a free 15-minute 1-on-1 consultation with ${t.name} before subscribing.</p>
      <button class="btn btn-sm btn-accent" onclick="bookConsultation('${t.name}', 'trainer')">Book Free Consultation</button>
    </div>
    <div class="subscribe-bar">
      <div>
        <div class="card-price">$${t.price}<span>/mo</span></div>
        <div style="font-size:0.82rem;color:var(--text-muted);">Subscribe for all workouts + new plans monthly</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="shapeBookOneTime('trainer', ${t.id}, 'booking')">Book a session</button>
        <button class="btn btn-primary" onclick="shapeSubscribe('trainer', ${t.id})">Subscribe Now</button>
      </div>
    </div>
  `;
  document.getElementById('trainerModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function openNutritionistModal(id) {
  const n = nutritionists.find(nu => nu.id === id);
  if (!n) return;
  const initials = n.name.split(' ').map(w => w[0]).join('');
  document.getElementById('trainerModalContent').innerHTML = `
    <div class="trainer-detail-header">
      <div class="trainer-detail-avatar" style="background: ${n.color};">${initials}</div>
      <div class="trainer-detail-info">
        <h2>${n.name}</h2>
        <div class="card-specialty">${n.specialty}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
          ${n.credential ? `<span class="cred-tip" data-tip="${n.credentialFull || n.credential}" style="padding:3px 10px;font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border:1px solid var(--accent);color:var(--accent-dark);border-radius:3px;">${n.credential}</span>` : ''}
          ${n.credentialFull ? `<span style="padding:3px 10px;font-size:0.68rem;font-weight:400;color:var(--text-muted);border:1px solid var(--border);border-radius:3px;">${n.credentialFull}</span>` : ''}
          ${n.specialtyType ? `<span style="padding:3px 10px;font-size:0.68rem;font-weight:400;color:var(--text-muted);border:1px solid var(--border);border-radius:3px;">${n.specialtyType}</span>` : ''}
        </div>
        <p class="card-desc">${n.bio}</p>
        <div class="trainer-detail-stats">
          <span>${n.rating} rating</span>
          <span>${n.subscribers.toLocaleString()} subscribers</span>
          <span>${n.experience} experience</span>
        </div>
      </div>
    </div>
    <div class="workout-list">
      <h3>Meal Plans — Buy Individually</h3>
      ${n.plans.map(p => `
        <div class="workout-item-purchase">
          <div class="workout-item-info">
            <h4>${p.name}</h4>
            <p>${p.description}</p>
            <div class="workout-item-tags">
              <span class="workout-tag">${p.type}</span>
              <span class="workout-tag">${p.duration}</span>
              <span class="workout-tag">${p.difficulty}</span>
            </div>
            ${p.sampleDays ? `<div class="meal-preview" style="margin-top:8px;padding-left:2px;">
              <div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Sample Meal Plan</div>
              ${p.sampleDays.map(d => `
                <div style="margin-bottom:6px;">
                  <div style="font-size:0.78rem;font-weight:500;color:var(--text);margin-bottom:2px;">${d.day}</div>
                  <div style="font-size:0.78rem;color:var(--text-muted);padding:1px 0 1px 8px;font-weight:300;"><span style="color:var(--accent-light);font-weight:400;">Breakfast</span> &middot; ${d.breakfast}</div>
                  <div style="font-size:0.78rem;color:var(--text-muted);padding:1px 0 1px 8px;font-weight:300;"><span style="color:var(--accent-light);font-weight:400;">Lunch</span> &middot; ${d.lunch}</div>
                  <div style="font-size:0.78rem;color:var(--text-muted);padding:1px 0 1px 8px;font-weight:300;"><span style="color:var(--accent-light);font-weight:400;">Dinner</span> &middot; ${d.dinner}</div>
                </div>
              `).join('')}
            </div>` : ''}
          </div>
          <div class="workout-item-buy">
            <div class="workout-item-price">$${p.price.toFixed(2)}</div>
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();shapeBookOneTime('nutritionist', ${n.id}, 'meal_plan')">Buy Plan</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="workout-list" style="margin-top:24px;">
      <h3>What's Included with Subscription</h3>
      ${n.services.map(s => `
        <div class="workout-item">
          <div class="workout-item-info">
            <h4>${s}</h4>
          </div>
          <div class="workout-item-meta">
            <strong>Included</strong>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="consult-section">
      <h3>Not sure yet?</h3>
      <p style="font-size:0.88rem;color:var(--text-muted);font-weight:300;margin-bottom:16px;">Book a free 15-minute 1-on-1 consultation with ${n.name} before subscribing.</p>
      <button class="btn btn-sm btn-accent" onclick="bookConsultation('${n.name}', 'nutritionist')">Book Free Consultation</button>
    </div>
    <div class="subscribe-bar">
      <div>
        <div class="card-price">$${n.price}<span>/mo</span></div>
        <div style="font-size:0.82rem;color:var(--text-muted);">Subscribe for all plans + new ones monthly</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="shapeBookOneTime('nutritionist', ${n.id}, 'meal_plan')">Buy meal plan</button>
        <button class="btn btn-accent" onclick="shapeSubscribe('nutritionist', ${n.id})">Subscribe Now</button>
      </div>
    </div>
  `;
  document.getElementById('trainerModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function subscribe(name, price) {
  closeAllModals();
  showToast(`Subscribed to ${name} — $${price}/mo`);
}

// Real Stripe flow — redirect to the Next.js /subscribe or /purchase landing,
// which spawns a Checkout Session bound to the provider's connected account.
function shapeSubscribe(role, id) {
  window.location.href = '/subscribe?role=' + encodeURIComponent(role) + '&id=' + encodeURIComponent(id);
}
function shapeBookOneTime(role, id, kind) {
  window.location.href =
    '/purchase?role=' + encodeURIComponent(role) +
    '&id=' + encodeURIComponent(id) +
    '&kind=' + encodeURIComponent(kind);
}

function bookConsultation(name, type) {
  closeAllModals();
  window.location.href = `consultation.html?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
}

function purchaseWorkout(name, price, event) {
  event.stopPropagation();
  const btn = event.target;
  btn.textContent = 'Purchased!';
  btn.disabled = true;
  btn.classList.remove('btn-outline');
  btn.classList.add('btn-primary');
  showToast(`Purchased "${name}" — $${price.toFixed(2)} one-time`);

  // Save to purchased workouts in localStorage
  const purchased = JSON.parse(localStorage.getItem('shapePurchasedWorkouts') || '[]');
  purchased.push({ name, price, purchasedAt: new Date().toISOString() });
  localStorage.setItem('shapePurchasedWorkouts', JSON.stringify(purchased));
}

function openModal(type) {
  const content = document.getElementById('authModalContent');
  if (type === 'login') {
    content.innerHTML = `
      <h2>Welcome back</h2>
      <p class="subtitle">Log in to your Shape account</p>
      <div class="form-group">
        <label>Email</label>
        <input type="email" placeholder="you@example.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" placeholder="Enter your password">
      </div>
      <button class="btn btn-primary btn-block" onclick="closeAllModals(); showToast('Welcome back!')">Log In</button>
      <p style="text-align:center;margin-top:16px;font-size:0.88rem;color:var(--text-muted);">
        Don't have an account? <a href="#" style="color:var(--primary-light)" onclick="event.preventDefault();openModal('signup')">Sign up</a>
      </p>
    `;
  } else {
    content.innerHTML = `
      <h2>Get started</h2>
      <p class="subtitle">Create your free Shape account</p>
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" placeholder="Your name">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" placeholder="you@example.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" placeholder="Create a password">
      </div>
      <div class="form-group">
        <label>I'm interested in</label>
        <select>
          <option>Personal Training</option>
          <option>Nutrition</option>
          <option>Both</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block" onclick="closeAllModals(); showToast('Account created! Welcome to Shape.')">Create Account</button>
      <p style="text-align:center;margin-top:16px;font-size:0.88rem;color:var(--text-muted);">
        Already have an account? <a href="#" style="color:var(--primary-light)" onclick="event.preventDefault();openModal('login')">Log in</a>
      </p>
    `;
  }
  document.getElementById('authModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAllModals();
  });
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllModals();
});

// ===== Toast =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 3000);
}

// ===== Close mobile nav on link click =====
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', function() {
    // Don't close nav when tapping dropdown parent links on mobile
    if (window.innerWidth <= 768 && this.parentElement.classList.contains('nav-dropdown')) return;
    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.classList.remove('open');
    const toggle = document.getElementById('navToggle');
    if (toggle) toggle.classList.remove('active');
  });
});

// ===== AI Trainer =====
const chatMessages = document.getElementById('aiChatMessages');
const aiState = { step: 'goal', goal: '', level: '', equipment: '', duration: '' };

const exerciseDB = {
  'Muscle Gain': {
    gym: [
      { name: 'Barbell Bench Press', sets: '4', reps: '8-10' },
      { name: 'Incline Dumbbell Press', sets: '3', reps: '10-12' },
      { name: 'Barbell Rows', sets: '4', reps: '8-10' },
      { name: 'Lat Pulldowns', sets: '3', reps: '10-12' },
      { name: 'Overhead Press', sets: '4', reps: '8-10' },
      { name: 'Barbell Squats', sets: '4', reps: '8-10' },
      { name: 'Romanian Deadlifts', sets: '3', reps: '10-12' },
      { name: 'Leg Press', sets: '3', reps: '12' },
      { name: 'Cable Flyes', sets: '3', reps: '12-15' },
      { name: 'Dumbbell Curls', sets: '3', reps: '12' },
      { name: 'Tricep Dips', sets: '3', reps: '10-12' },
      { name: 'Face Pulls', sets: '3', reps: '15' },
    ],
    home: [
      { name: 'Push-Ups', sets: '4', reps: '15-20' },
      { name: 'Diamond Push-Ups', sets: '3', reps: '12' },
      { name: 'Pike Push-Ups', sets: '3', reps: '10-12' },
      { name: 'Inverted Rows', sets: '4', reps: '12' },
      { name: 'Bulgarian Split Squats', sets: '3', reps: '12 each' },
      { name: 'Pistol Squat Progressions', sets: '3', reps: '8 each' },
      { name: 'Glute Bridges', sets: '3', reps: '15' },
      { name: 'Plank to Push-Up', sets: '3', reps: '10' },
      { name: 'Chin-Ups (door frame bar)', sets: '4', reps: '8-10' },
      { name: 'Dips (between chairs)', sets: '3', reps: '12' },
    ],
    minimal: [
      { name: 'Dumbbell Goblet Squats', sets: '4', reps: '12' },
      { name: 'Dumbbell Floor Press', sets: '4', reps: '10-12' },
      { name: 'Dumbbell Rows', sets: '4', reps: '10 each' },
      { name: 'Dumbbell Lunges', sets: '3', reps: '12 each' },
      { name: 'Dumbbell Shoulder Press', sets: '3', reps: '10-12' },
      { name: 'Dumbbell RDLs', sets: '3', reps: '12' },
      { name: 'Resistance Band Pull-Aparts', sets: '3', reps: '15' },
      { name: 'Dumbbell Curls', sets: '3', reps: '12' },
    ],
  },
  'Fat Loss': {
    gym: [
      { name: 'Kettlebell Swings', sets: '4', reps: '20' },
      { name: 'Battle Ropes', sets: '4', reps: '30 sec' },
      { name: 'Box Jumps', sets: '3', reps: '12' },
      { name: 'Rowing Machine Intervals', sets: '5', reps: '200m sprints' },
      { name: 'Dumbbell Thrusters', sets: '4', reps: '12' },
      { name: 'Medicine Ball Slams', sets: '3', reps: '15' },
      { name: 'Sled Push', sets: '4', reps: '30 sec' },
      { name: 'Cable Woodchops', sets: '3', reps: '12 each' },
      { name: 'Treadmill Incline Walk', sets: '1', reps: '10 min' },
    ],
    home: [
      { name: 'Burpees', sets: '4', reps: '12' },
      { name: 'Mountain Climbers', sets: '4', reps: '30 sec' },
      { name: 'Jump Squats', sets: '4', reps: '15' },
      { name: 'High Knees', sets: '4', reps: '30 sec' },
      { name: 'Plank Jacks', sets: '3', reps: '20' },
      { name: 'Skater Jumps', sets: '3', reps: '12 each' },
      { name: 'Bicycle Crunches', sets: '3', reps: '20' },
      { name: 'Jumping Lunges', sets: '3', reps: '10 each' },
      { name: 'High Knees Sprint', sets: '3', reps: '1 min' },
    ],
    minimal: [
      { name: 'Dumbbell Snatch', sets: '4', reps: '10 each' },
      { name: 'Dumbbell Squat to Press', sets: '4', reps: '12' },
      { name: 'Renegade Rows', sets: '3', reps: '10 each' },
      { name: 'Dumbbell Swings', sets: '4', reps: '15' },
      { name: 'Band-Assisted Sprints', sets: '4', reps: '20 sec' },
      { name: 'Dumbbell Burpees', sets: '3', reps: '10' },
      { name: 'Plank Rows', sets: '3', reps: '12 each' },
    ],
  },
  'Endurance': {
    gym: [
      { name: 'Treadmill Intervals', sets: '8', reps: '1 min on / 1 min off' },
      { name: 'Rowing Machine', sets: '4', reps: '500m' },
      { name: 'Stairmaster', sets: '1', reps: '10 min' },
      { name: 'Assault Bike', sets: '5', reps: '30 sec sprints' },
      { name: 'Bodyweight Circuit (squats, push-ups, lunges)', sets: '3', reps: '15 each' },
      { name: 'Farmer Carries', sets: '4', reps: '40m' },
      { name: 'Jump Rope', sets: '5', reps: '1 min' },
    ],
    home: [
      { name: 'Jumping Jacks', sets: '4', reps: '1 min' },
      { name: 'Running in Place (high knees)', sets: '4', reps: '45 sec' },
      { name: 'Step-Ups (on stairs)', sets: '4', reps: '20 each' },
      { name: 'Squat Holds', sets: '3', reps: '45 sec' },
      { name: 'Push-Up to Plank Hold', sets: '3', reps: '10 + 20 sec' },
      { name: 'Lateral Shuffles', sets: '4', reps: '30 sec' },
      { name: 'Burpee Broad Jumps', sets: '3', reps: '8' },
      { name: 'Bear Crawls', sets: '3', reps: '30 sec' },
    ],
    minimal: [
      { name: 'Dumbbell Complex (clean, press, squat)', sets: '5', reps: '8 each' },
      { name: 'Band Sprints', sets: '6', reps: '20 sec' },
      { name: 'Dumbbell Walking Lunges', sets: '4', reps: '20 steps' },
      { name: 'Band Pull-Aparts', sets: '3', reps: '20' },
      { name: 'Dumbbell Step-Ups', sets: '3', reps: '12 each' },
      { name: 'Plank with Dumbbell Drag', sets: '3', reps: '10 each' },
    ],
  },
  'Flexibility': {
    gym: [
      { name: 'Foam Roll Full Body', sets: '1', reps: '5 min' },
      { name: 'Hip Flexor Stretch', sets: '2', reps: '45 sec each' },
      { name: 'Pigeon Pose', sets: '2', reps: '60 sec each' },
      { name: 'Hanging Lat Stretch', sets: '2', reps: '30 sec' },
      { name: 'Cat-Cow Stretch', sets: '2', reps: '10 reps' },
      { name: 'World\'s Greatest Stretch', sets: '2', reps: '8 each' },
      { name: 'Seated Hamstring Stretch', sets: '2', reps: '45 sec each' },
      { name: 'Thoracic Spine Rotations', sets: '2', reps: '10 each' },
    ],
    home: [
      { name: 'Sun Salutations', sets: '3', reps: '5 flows' },
      { name: 'Deep Squat Hold', sets: '3', reps: '45 sec' },
      { name: 'Standing Forward Fold', sets: '2', reps: '60 sec' },
      { name: 'Supine Spinal Twist', sets: '2', reps: '45 sec each' },
      { name: 'Butterfly Stretch', sets: '2', reps: '60 sec' },
      { name: 'Downward Dog to Cobra Flow', sets: '3', reps: '8' },
      { name: 'Neck & Shoulder Rolls', sets: '2', reps: '10 each' },
      { name: 'Child\'s Pose', sets: '1', reps: '60 sec' },
    ],
    minimal: [
      { name: 'Band-Assisted Hamstring Stretch', sets: '2', reps: '45 sec each' },
      { name: 'Band Shoulder Dislocates', sets: '3', reps: '10' },
      { name: 'Band-Assisted Hip Opener', sets: '2', reps: '45 sec each' },
      { name: 'Foam Roll Quads & IT Band', sets: '1', reps: '3 min' },
      { name: 'Doorway Chest Stretch', sets: '2', reps: '30 sec each' },
      { name: 'Seated Spinal Twist', sets: '2', reps: '45 sec each' },
    ],
  },
  'General Fitness': {
    gym: [
      { name: 'Dumbbell Bench Press', sets: '3', reps: '12' },
      { name: 'Cable Rows', sets: '3', reps: '12' },
      { name: 'Leg Press', sets: '3', reps: '12' },
      { name: 'Dumbbell Shoulder Press', sets: '3', reps: '12' },
      { name: 'Lat Pulldowns', sets: '3', reps: '12' },
      { name: 'Plank', sets: '3', reps: '45 sec' },
      { name: 'Treadmill Walk/Jog', sets: '1', reps: '10 min' },
      { name: 'Bicycle Crunches', sets: '3', reps: '15' },
    ],
    home: [
      { name: 'Push-Ups', sets: '3', reps: '12-15' },
      { name: 'Bodyweight Squats', sets: '3', reps: '15' },
      { name: 'Lunges', sets: '3', reps: '12 each' },
      { name: 'Plank', sets: '3', reps: '30 sec' },
      { name: 'Glute Bridges', sets: '3', reps: '15' },
      { name: 'Superman Hold', sets: '3', reps: '20 sec' },
      { name: 'Jumping Jacks', sets: '3', reps: '30 sec' },
      { name: 'Mountain Climbers', sets: '3', reps: '20' },
    ],
    minimal: [
      { name: 'Dumbbell Squats', sets: '3', reps: '12' },
      { name: 'Dumbbell Press', sets: '3', reps: '12' },
      { name: 'Dumbbell Rows', sets: '3', reps: '12 each' },
      { name: 'Dumbbell Lunges', sets: '3', reps: '10 each' },
      { name: 'Band Lateral Raises', sets: '3', reps: '15' },
      { name: 'Plank', sets: '3', reps: '45 sec' },
      { name: 'Band Face Pulls', sets: '3', reps: '15' },
    ],
  },
};

function scrollChat() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addBotMsg(html, delay) {
  return new Promise(resolve => {
    const typing = document.createElement('div');
    typing.className = 'ai-msg ai-msg-bot';
    typing.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
    chatMessages.appendChild(typing);
    scrollChat();
    setTimeout(() => {
      typing.innerHTML = `<p>${html}</p>`;
      scrollChat();
      resolve(typing);
    }, delay || 800);
  });
}

function addUserMsg(text) {
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-user';
  div.innerHTML = `<p>${text}</p>`;
  chatMessages.appendChild(div);
  scrollChat();
}

function addQuickReplies(container, options, step) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-quick-replies';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.onclick = () => aiSelectOption(step, opt);
    wrap.appendChild(btn);
  });
  container.appendChild(wrap);
  scrollChat();
}

function aiSelectOption(step, value) {
  // Remove quick reply buttons
  document.querySelectorAll('.ai-quick-replies').forEach(el => el.remove());
  addUserMsg(value);
  processStep(step, value);
}

function aiSendMessage() {
  const input = document.getElementById('aiInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  document.querySelectorAll('.ai-quick-replies').forEach(el => el.remove());
  addUserMsg(text);
  processStep(aiState.step, text);
}

async function processStep(step, value) {
  if (step === 'goal') {
    aiState.goal = value;
    aiState.step = 'level';
    const msg = await addBotMsg(`Great choice — <strong>${value}</strong>! What's your <strong>experience level</strong>?`);
    addQuickReplies(msg, ['Beginner', 'Intermediate', 'Advanced'], 'level');

  } else if (step === 'level') {
    aiState.level = value;
    aiState.step = 'equipment';
    const msg = await addBotMsg(`Got it, <strong>${value}</strong>. What <strong>equipment</strong> do you have access to?`);
    addQuickReplies(msg, ['Full Gym', 'Minimal (Dumbbells/Bands)', 'No Equipment (Bodyweight)'], 'equipment');

  } else if (step === 'equipment') {
    aiState.equipment = value;
    aiState.step = 'duration';
    const msg = await addBotMsg(`Perfect. How long do you want your workout to be?`);
    addQuickReplies(msg, ['15 minutes', '30 minutes', '45 minutes', '60 minutes'], 'duration');

  } else if (step === 'duration') {
    aiState.duration = value;
    aiState.step = 'done';
    await addBotMsg(`Building your personalized <strong>${aiState.goal}</strong> workout...`, 600);
    await generateWorkout();

  } else if (step === 'done') {
    // Allow follow-up requests
    const lower = value.toLowerCase();
    if (lower.includes('another') || lower.includes('new') || lower.includes('again') || lower.includes('different')) {
      aiState.step = 'goal';
      const msg = await addBotMsg(`Let's build another one! What's your <strong>fitness goal</strong> this time?`);
      addQuickReplies(msg, ['Muscle Gain', 'Fat Loss', 'Endurance', 'Flexibility', 'General Fitness'], 'goal');
    } else if (lower.includes('harder') || lower.includes('intense')) {
      await addBotMsg(`Ramping up the intensity...`, 600);
      await generateWorkout(true);
    } else if (lower.includes('easier') || lower.includes('lighter')) {
      await addBotMsg(`Scaling it down...`, 600);
      await generateWorkout(false, true);
    } else {
      const msg = await addBotMsg(`Want me to generate <strong>another workout</strong>, make this one <strong>harder</strong>, or <strong>easier</strong>?`);
      addQuickReplies(msg, ['Another Workout', 'Make It Harder', 'Make It Easier'], 'done');
    }
  }
}

async function generateWorkout(harder, easier) {
  let equipKey = 'home';
  if (aiState.equipment.toLowerCase().includes('gym')) equipKey = 'gym';
  else if (aiState.equipment.toLowerCase().includes('minimal') || aiState.equipment.toLowerCase().includes('dumbbell')) equipKey = 'minimal';

  const goal = aiState.goal || 'General Fitness';
  const pool = (exerciseDB[goal] && exerciseDB[goal][equipKey]) || exerciseDB['General Fitness']['home'];

  // Determine exercise count based on duration
  let durationMin = parseInt(aiState.duration) || 30;
  let count = Math.min(pool.length, Math.max(4, Math.round(durationMin / 7)));

  // Shuffle and pick exercises
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  let exercises = shuffled.slice(0, count).map(ex => {
    let sets = parseInt(ex.sets);
    let reps = ex.reps;
    if (harder) { sets = Math.min(sets + 1, 6); }
    if (easier) { sets = Math.max(sets - 1, 2); }
    return { ...ex, sets: String(sets), reps };
  });

  const workoutName = `${aiState.goal} — ${durationMin} Min ${aiState.level} Blast`;
  const totalSets = exercises.reduce((sum, e) => sum + parseInt(e.sets), 0);

  const exerciseRows = exercises.map(e =>
    `<div class="ai-exercise">
      <span class="ai-exercise-name">${e.name}</span>
      <span class="ai-exercise-detail">${e.sets} x ${e.reps}</span>
    </div>`
  ).join('');

  const workoutHtml = `Here's your workout:
    <div class="ai-workout-card">
      <h4>${workoutName}</h4>
      ${exerciseRows}
      <div class="ai-workout-footer">
        <span>${exercises.length} exercises &middot; ${totalSets} total sets &middot; ~${durationMin} min</span>
        <button class="ai-save-btn" onclick="saveWorkout(this)">Save Workout</button>
      </div>
    </div>`;

  const msg = await addBotMsg(workoutHtml, 1200);
  const followUp = await addBotMsg(`How's that look? I can generate <strong>another workout</strong>, make this <strong>harder</strong> or <strong>easier</strong>, or you can type any request!`);
  addQuickReplies(followUp, ['Another Workout', 'Make It Harder', 'Make It Easier'], 'done');
}

function saveWorkout(btn) {
  btn.textContent = 'Saved!';
  btn.style.background = 'var(--primary)';
  btn.disabled = true;
  showToast('Workout saved to your library!');
}
