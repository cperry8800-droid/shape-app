/* Single source of truth for marketplace coaches.
   Loaded as a plain script before the babel-compiled jsx so
   marketplace.jsx and publicProfile.jsx can share it. */
(function () {
  // Self-hosted AI-generated marketing portraits (one consistent studio set) so
  // the signed-out coach cards read as real people; the card falls back to
  // initials if a photo is absent or fails to load.
  function face(slug) { return "/newdesign/faces/" + slug + ".jpg"; }
  var COACHES = [
    // Trainers
    { name: "Maya Okafor", role: "Strength & Hypertrophy", city: "Brooklyn, NY", rate: 120, rating: 4.97, sessions: 1284, tag: "Trainer", specialties: ["Strength", "Hypertrophy"], cert: "NASM-CPT", years: 9, format: "In-person", category: "Strength & Resistance", photo: face("maya") },
    { name: "Leo Martins", role: "Powerlifting", city: "Lisbon", rate: 105, rating: 4.86, sessions: 1120, tag: "Trainer", specialties: ["Powerlifting", "Strength"], cert: "NSCA-CSCS", years: 8, format: "In-person", category: "Strength & Resistance", photo: face("leo") },
    { name: "Anya Volkov", role: "Barbell Foundations", city: "Berlin", rate: 98, rating: 4.91, sessions: 680, tag: "Trainer", specialties: ["Strength", "Technique"], cert: "NSCA-CSCS", years: 6, format: "Hybrid", category: "Strength & Resistance", photo: face("anya") },
    { name: "Diego Alvarez", role: "Endurance · Marathon", city: "Austin, TX", rate: 95, rating: 4.92, sessions: 912, tag: "Trainer", specialties: ["Running", "VO2"], cert: "ACE-CPT", years: 7, format: "Hybrid", category: "Cardio & Endurance", photo: face("diego") },
    { name: "Kenji Watanabe", role: "Triathlon Coaching", city: "San Francisco", rate: 150, rating: 4.91, sessions: 590, tag: "Trainer", specialties: ["Triathlon", "Swimming"], cert: "USAT-L2", years: 14, format: "Hybrid", category: "Cardio & Endurance", photo: face("kenji") },
    { name: "Hana Reyes", role: "Cycling & VO2", city: "Girona", rate: 110, rating: 4.88, sessions: 720, tag: "Trainer", specialties: ["Cycling", "Endurance"], cert: "USA-C-L2", years: 9, format: "Remote", category: "Cardio & Endurance", photo: face("hana") },
    { name: "Jordan Park", role: "Mobility · PT Recovery", city: "Los Angeles", rate: 110, rating: 4.89, sessions: 1510, tag: "Trainer", specialties: ["Mobility", "Post-op"], cert: "NSCA-CSCS", years: 8, format: "In-person", category: "Mobility, Recovery & Rehab", photo: face("jordan") },
    { name: "Priya Natarajan", role: "Yoga & Mobility", city: "Brooklyn, NY", rate: 90, rating: 4.93, sessions: 1680, tag: "Trainer", specialties: ["Yoga", "Breath"], cert: "RYT-500", years: 9, format: "In-person", category: "Mobility, Recovery & Rehab", photo: face("priya") },
    { name: "Sam Oduya", role: "Rehab & Return-to-Sport", city: "Atlanta", rate: 125, rating: 4.94, sessions: 540, tag: "Trainer", specialties: ["Rehab", "PT"], cert: "DPT · CSCS", years: 11, format: "In-person", category: "Mobility, Recovery & Rehab" },
    { name: "Tomás Reyes", role: "CrossFit · Olympic Lifts", city: "Miami", rate: 130, rating: 4.88, sessions: 2010, tag: "Trainer", specialties: ["CrossFit", "Olympic"], cert: "CF-L3", years: 12, format: "In-person", category: "Functional & Hybrid" },
    { name: "Isla Park", role: "Hybrid Athlete", city: "Austin, TX", rate: 115, rating: 4.90, sessions: 640, tag: "Trainer", specialties: ["Hybrid", "Hyrox"], cert: "NSCA-CSCS", years: 7, format: "Hybrid", category: "Functional & Hybrid" },
    { name: "Marcus Hale", role: "Classic Bodybuilding", city: "Las Vegas", rate: 140, rating: 4.87, sessions: 980, tag: "Trainer", specialties: ["Hypertrophy", "Prep"], cert: "NASM · PN-1", years: 13, format: "In-person", category: "Bodybuilding" },
    { name: "Yuki Tanaka", role: "Physique & Posing", city: "Tokyo", rate: 125, rating: 4.92, sessions: 460, tag: "Trainer", specialties: ["Physique", "Cutting"], cert: "IFBB-PT", years: 10, format: "Remote", category: "Bodybuilding" },
    { name: "Malik Freeman", role: "HIIT Athletic Performance", city: "Chicago", rate: 135, rating: 4.90, sessions: 770, tag: "Trainer", specialties: ["HIIT", "Plyo"], cert: "NSCA-CSCS", years: 11, format: "In-person", category: "HIIT" },
    { name: "Zoë Carter", role: "Metabolic Conditioning", city: "Denver", rate: 95, rating: 4.89, sessions: 820, tag: "Trainer", specialties: ["HIIT", "MetCon"], cert: "NASM-CPT", years: 6, format: "Hybrid", category: "HIIT" },
    { name: "Priscilla Adams", role: "Fat-loss & Nutrition-tied", city: "Miami", rate: 100, rating: 4.85, sessions: 1240, tag: "Trainer", specialties: ["Fat loss", "Conditioning"], cert: "NASM · PN-1", years: 8, format: "Remote", category: "Fat Burn" },
    { name: "Omar Haddad", role: "Lean & Cut Programs", city: "Dubai", rate: 120, rating: 4.91, sessions: 560, tag: "Trainer", specialties: ["Fat loss", "Cutting"], cert: "NASM-CPT", years: 9, format: "Hybrid", category: "Fat Burn" },
    { name: "Amara Johnson", role: "At-home Full Body", city: "Denver", rate: 85, rating: 4.94, sessions: 840, tag: "Trainer", specialties: ["At-home", "Prenatal"], cert: "NASM · PPES", years: 10, format: "Remote", category: "At Home" },
    { name: "Rhea Kapoor", role: "Minimal-Equipment Strength", city: "Mumbai", rate: 70, rating: 4.88, sessions: 910, tag: "Trainer", specialties: ["At-home", "Bands"], cert: "NASM-CPT", years: 5, format: "Remote", category: "At Home" },
    { name: "Nora Kessler", role: "Women's Strength & Cycle-Synced", city: "Berlin", rate: 115, rating: 4.94, sessions: 720, tag: "Trainer", specialties: ["Women-only", "Hormonal"], cert: "NSCA-CSCS · PN-2", years: 10, format: "Hybrid", category: "Just for Women" },
    { name: "Amelia Finch", role: "Postpartum & Core Rebuild", city: "Portland, OR", rate: 105, rating: 4.96, sessions: 540, tag: "Trainer", specialties: ["Postpartum", "Pelvic floor"], cert: "NASM · PCES", years: 8, format: "In-person", category: "Just for Women" },
    { name: "Sana Khoury", role: "Women-only Strength Studio", city: "Toronto", rate: 95, rating: 4.90, sessions: 880, tag: "Trainer", specialties: ["Strength", "Beginner-friendly"], cert: "NASM-CPT", years: 6, format: "In-person", category: "Just for Women" },
    { name: "Cal Redmond", role: "5K to Marathon Coaching", city: "Boulder, CO", rate: 90, rating: 4.96, sessions: 1040, tag: "Trainer", specialties: ["Marathon", "Tempo"], cert: "RRCA · UESCA", years: 11, format: "Remote", category: "Pure Running" },
    { name: "Fiona Walsh", role: "Trail & Ultra Running", city: "Chamonix", rate: 120, rating: 4.93, sessions: 410, tag: "Trainer", specialties: ["Trail", "Ultra"], cert: "UESCA-UEC", years: 9, format: "Hybrid", category: "Pure Running" },
    { name: "Jamal Brooks", role: "Track & Speed Work", city: "Eugene, OR", rate: 105, rating: 4.91, sessions: 620, tag: "Trainer", specialties: ["Track", "Speed"], cert: "USATF-L2", years: 12, format: "In-person", category: "Pure Running" },
    { name: "Dax Whitaker", role: "Hyrox Elite & Mixed Ergs", city: "London", rate: 125, rating: 4.94, sessions: 680, tag: "Trainer", specialties: ["Hyrox", "SkiErg"], cert: "NSCA-CSCS · Hyrox-CT", years: 9, format: "Hybrid", category: "Hyrox" },
    { name: "Greta Lindqvist", role: "Hyrox Pro Doubles", city: "Stockholm", rate: 115, rating: 4.92, sessions: 520, tag: "Trainer", specialties: ["Hyrox", "Doubles"], cert: "Hyrox-CT · NASM", years: 7, format: "In-person", category: "Hyrox" },
    { name: "Rafa Moreno", role: "Hyrox Strength & Run Carry-over", city: "Madrid", rate: 105, rating: 4.89, sessions: 440, tag: "Trainer", specialties: ["Hyrox", "Conditioning"], cert: "Hyrox-CT", years: 6, format: "In-person", category: "Hyrox" },
    // Nutritionists
    { name: "Rae Lindqvist", role: "Sports Performance & Hydration", city: "Stockholm", rate: 140, rating: 5.00, sessions: 640, tag: "Nutritionist", specialties: ["Hydration", "Metabolic"], cert: "RD · RDN", years: 11, format: "Remote", category: "Sports Performance & Hydration", photo: face("rae") },
    { name: "Claire Donovan", role: "Performance Nutrition", city: "London", rate: 130, rating: 4.93, sessions: 520, tag: "Nutritionist", specialties: ["Athlete fueling"], cert: "AfN-RNutr", years: 9, format: "Remote", category: "Performance Nutrition", photo: face("claire") },
    { name: "Sofia Marchetti", role: "Clinical Nutrition", city: "London", rate: 160, rating: 4.98, sessions: 420, tag: "Nutritionist", specialties: ["Auto-immune", "Gut"], cert: "AfN-RNutr", years: 13, format: "Remote", category: "Medical & Condition-Specific" },
    { name: "David Mehta", role: "Medical Nutrition Therapy", city: "Toronto", rate: 150, rating: 4.95, sessions: 380, tag: "Nutritionist", specialties: ["Diabetes", "Cardiac"], cert: "RD", years: 14, format: "Remote", category: "Medical & Condition-Specific" },
    { name: "Ben Caldwell", role: "Muscle Gain & Bulking", city: "Sydney", rate: 110, rating: 4.87, sessions: 690, tag: "Nutritionist", specialties: ["Bulking", "Recomp"], cert: "APD", years: 7, format: "Remote", category: "Muscle Gain / Bulking", photo: face("ben") },
    { name: "Nadia Chen", role: "Gut Health & Functional", city: "Toronto", rate: 125, rating: 4.95, sessions: 730, tag: "Nutritionist", specialties: ["GI health", "Functional"], cert: "RDN", years: 6, format: "Remote", category: "Gut Health & Functional Nutrition" },
    { name: "Ingrid Olsen", role: "Longevity & Healthspan", city: "Copenhagen", rate: 145, rating: 4.96, sessions: 310, tag: "Nutritionist", specialties: ["Longevity", "Metabolic"], cert: "RD", years: 12, format: "Remote", category: "Longevity & Healthspan" },
    { name: "Ayo Adeyemi", role: "Weight Management", city: "Lagos", rate: 95, rating: 4.89, sessions: 820, tag: "Nutritionist", specialties: ["Weight", "Habits"], cert: "RD", years: 8, format: "Remote", category: "Weight Mgmt" },
    { name: "Liana Torres", role: "Plant-based Nutrition", city: "Madrid", rate: 105, rating: 4.92, sessions: 490, tag: "Nutritionist", specialties: ["Plant-based", "Athlete"], cert: "RD", years: 7, format: "Remote", category: "Plant-Based" },
    { name: "Hana Matsuda", role: "Prenatal Nutrition", city: "Osaka", rate: 120, rating: 4.94, sessions: 340, tag: "Nutritionist", specialties: ["Prenatal", "Postnatal"], cert: "RD · CLC", years: 9, format: "Remote", category: "Prenatal" },
    { name: "Marco Bellini", role: "Meal Prep & Habits", city: "Milan", rate: 90, rating: 4.88, sessions: 760, tag: "Nutritionist", specialties: ["Meal prep", "Habits"], cert: "RD", years: 6, format: "Remote", category: "Meal Prep" }
  ];
  function slug(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  window.SHAPE_COACHES = COACHES;
  window.coachSlug = slug;
  window.coachBySlug = function (s) {
    s = String(s || "").toLowerCase();
    for (var i = 0; i < COACHES.length; i++) {
      if (slug(COACHES[i].name) === s) return COACHES[i];
    }
    return null;
  };
})();
