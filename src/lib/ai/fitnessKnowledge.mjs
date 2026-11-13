// What Nora knows about TRAINING, NUTRITION, RECOVERY AND WEIGHT, as a small, SOURCED
// library the chat route exposes through the `fitness_knowledge` tool (to a member's chat:
// the assistant is the membership). The same pattern as shapeKnowledge.mjs: every entry
// names where its figures come from, and Nora answers from the entry, never from memory.
//
// ⚠ AN ENTRY STATES ONLY WHAT ITS SOURCE SAYS. The sources are position stands, national
// guidelines and meta-analyses, each named with its year so a reader can find it. A figure
// with no source does not go in; a guideline that changes is a replaced entry, not an
// added one beside it. Body text is plain prose (Nora's reply is a plain bubble), and a
// figure in kilograms carries its pounds where a member would ask in pounds.
//
// ⚠ NOT YET REVIEWED by a Verified Shape coach. Each entry was written from its sources on
// 2026-11-13; the owner's War Room item asks for a Verified trainer and a Verified
// dietitian to read them. A coach's credentials are self-reported unless Verified (Terms,
// clause 04), so only a Verified coach's review counts.
//
// Plain ESM, no deps: node:test drives searchFitness() directly.

import { searchEntries } from './shapeKnowledge.mjs';

export const FITNESS_TOPICS = Object.freeze(['nutrition', 'training', 'recovery', 'weight', 'safety']);

export const FITNESS_KNOWLEDGE = Object.freeze([
  // ── Protein and macros ─────────────────────────────────────────────────────
  {
    id: 'protein-daily',
    topic: 'nutrition',
    title: 'How much protein to eat a day',
    tags: ['protein', 'grams of protein', 'protein target', 'protein intake', 'protein goal', 'g/kg', 'per pound', 'build muscle', 'muscle gain'],
    body: 'For people who train, the International Society of Sports Nutrition recommends 1.4 to 2.0 grams of protein per kilogram of bodyweight a day, about 0.6 to 0.9 grams per pound, against 0.8 g/kg, the baseline for adults who do not exercise. A 2018 meta-analysis found the muscle gained from lifting levels off around 1.6 g/kg a day on average, with some people still benefiting up to about 2.2 g/kg (1 g per pound). Eating in a deficit calls for the higher end (see losing fat and keeping muscle). Anyone with kidney disease has their protein set by their doctor or dietitian.',
    source: 'ISSN position stand: protein and exercise (Jäger et al., 2017) · Morton et al., British Journal of Sports Medicine (2018) · National Academies, Dietary Reference Intakes for macronutrients (2005)',
  },
  {
    id: 'protein-timing',
    topic: 'nutrition',
    title: 'Spreading protein across the day, and protein after training',
    tags: ['protein timing', 'per meal', 'protein per meal', 'before bed', 'casein', 'after workout', 'post workout', 'post-workout', 'anabolic window', 'protein shake', 'shake', 'leucine'],
    body: 'The ISSN suggests spreading protein over the day: about 0.25 g per kilogram of bodyweight a meal, roughly 20 to 40 grams, every 3 to 4 hours. The daily total matters more than exact timing, and the window around training is wider than once thought, so protein in a meal within a couple of hours either side of a session is a sensible habit, not a deadline. 30 to 40 grams of casein before sleep can support overnight muscle repair. Food and shakes count the same.',
    source: 'ISSN position stand: protein and exercise (Jäger et al., 2017) · ISSN position stand: nutrient timing (Kerksick et al., 2017)',
  },
  {
    id: 'carbs-training',
    topic: 'nutrition',
    title: 'How many carbs to eat for training',
    tags: ['carb', 'carbs', 'carbohydrate', 'carbohydrates', 'endurance', 'marathon', 'long run', 'fuel', 'fueling', 'gel', 'energy for training'],
    body: 'Carbohydrate needs scale with training. The joint position of the American College of Sports Medicine, the Academy of Nutrition and Dietetics and Dietitians of Canada gives 3 to 5 grams per kilogram of bodyweight a day for light or skill-based training; 5 to 7 g/kg for about an hour a day of moderate exercise; 6 to 10 g/kg for 1 to 3 hours a day of endurance work; and 8 to 12 g/kg for 4 to 5 hours a day or more. In sessions longer than about an hour, 30 to 60 grams an hour during exercise helps, and up to 90 grams an hour past 2.5 hours, from mixed sugars such as glucose and fructose.',
    source: 'ACSM, Academy of Nutrition and Dietetics and Dietitians of Canada joint position: Nutrition and Athletic Performance (Thomas, Erdman and Burke, 2016)',
  },
  {
    id: 'macro-ranges',
    topic: 'nutrition',
    title: 'Fat, carbs and protein as a share of calories; fiber and sugar',
    tags: ['macros', 'macro split', 'macronutrients', 'fat', 'fats', 'fiber', 'fibre', 'sugar', 'saturated fat', 'percent of calories', 'ratio'],
    body: 'The National Academies’ acceptable ranges for adults are 45 to 65% of calories from carbohydrate, 20 to 35% from fat and 10 to 35% from protein; the sports-nutrition joint position advises athletes not to go below about 20% fat. Fiber: about 14 grams per 1,000 calories, which is roughly 25 grams a day for women and 38 for men. The WHO advises keeping saturated fat under 10% of calories, and free sugars under 10%, ideally under 5%.',
    source: 'National Academies, Dietary Reference Intakes for macronutrients (2005) · ACSM, AND and DC joint position (2016) · WHO guideline: sugars intake (2015) · WHO guideline: saturated and trans fatty acid intake (2023)',
  },
  {
    id: 'creatine',
    topic: 'nutrition',
    title: 'Creatine: what it does, how much, and is it safe',
    tags: ['creatine', 'creatine monohydrate', 'supplement', 'supplements', 'loading phase', 'loading'],
    body: 'Creatine monohydrate is the most studied supplement for strength and muscle and, per the ISSN, safe for healthy people at the recommended doses. Take 3 to 5 grams a day, at any time; muscle stores fill in about 3 to 4 weeks. An optional loading phase, about 0.3 g per kilogram a day (roughly 20 grams split into four doses) for 5 to 7 days, fills them in a week. Expect some water weight early on. It can raise the creatinine on a blood test without harming the kidneys, so tell your doctor you take it; anyone with kidney disease asks their doctor first.',
    source: 'ISSN position stand: safety and efficacy of creatine supplementation (Kreider et al., 2017)',
  },
  {
    id: 'caffeine',
    topic: 'nutrition',
    title: 'Caffeine and pre-workout',
    tags: ['caffeine', 'coffee', 'pre-workout', 'preworkout', 'pre workout', 'energy drink', 'stimulant'],
    body: 'Caffeine improves performance in most kinds of exercise. The ISSN puts the effective dose at 3 to 6 mg per kilogram of bodyweight, about 60 minutes before training; doses near 2 mg/kg can help too, and above about 9 mg/kg bring side effects without more benefit. The FDA considers up to 400 mg a day, about four cups of brewed coffee, generally safe for healthy adults; ACOG advises under 200 mg a day in pregnancy. Caffeine even 6 hours before bed measurably cut sleep in a controlled study.',
    source: 'ISSN position stand: caffeine and exercise performance (Guest et al., 2021) · U.S. FDA consumer guidance on caffeine · ACOG Committee Opinion 462 (2010, reaffirmed) · Drake et al., Journal of Clinical Sleep Medicine (2013)',
  },
  {
    id: 'hydration',
    topic: 'nutrition',
    title: 'How much water to drink, and hydration for training',
    tags: ['water', 'hydration', 'hydrate', 'dehydration', 'drink', 'fluid', 'fluids', 'electrolytes', 'sweat', 'litres', 'liters'],
    body: 'The National Academies’ adequate intake of water from all drinks and food is about 2.7 litres a day for women and 3.7 for men; thirst and pale urine are reasonable everyday guides. For training, the ACSM’s aim is to avoid losing more than about 2% of bodyweight in sweat, without drinking so much that you gain weight, which risks low blood sodium. Before a session, about 5 to 7 ml per kilogram of bodyweight over the 4 hours before; after, about 1.5 litres for every kilogram lost.',
    source: 'National Academies, Dietary Reference Intakes for water and electrolytes (2005) · ACSM position stand: exercise and fluid replacement (Sawka et al., 2007)',
  },

  // ── Training ───────────────────────────────────────────────────────────────
  {
    id: 'lifting-frequency-volume',
    topic: 'training',
    title: 'How often to lift and how many sets',
    tags: ['how often', 'frequency', 'days a week', 'sets', 'sets per week', 'volume', 'hypertrophy', 'muscle growth', 'split', 'full body', 'body part split'],
    body: 'The minimum for health, in both the US Physical Activity Guidelines and the WHO’s, is muscle-strengthening work for all major muscle groups on 2 or more days a week. For building muscle, meta-analyses find training each muscle at least twice a week beats once a week, and that more weekly sets bring more growth, with 10 or more hard sets per muscle a week outperforming fewer. Start lower and add sets as recovery allows.',
    source: 'Physical Activity Guidelines for Americans, 2nd edition (HHS, 2018) · WHO guidelines on physical activity and sedentary behaviour (2020) · Schoenfeld, Ogborn and Krieger, Sports Medicine (2016) · Schoenfeld, Ogborn and Krieger, Journal of Sports Sciences (2017)',
  },
  {
    id: 'reps-load-rest',
    topic: 'training',
    title: 'How many reps, how heavy, and how long to rest',
    tags: ['reps', 'rep range', 'how heavy', 'weight', 'load', 'heavy', 'light weight', 'rest', 'rest between sets', 'one rep max', '1rm', 'strength'],
    body: 'Muscle grows across a wide range of loads, light or heavy, as long as sets are taken close to failure; heavier loads build more maximal strength (a 2017 meta-analysis). The ACSM’s progression model suggests 8 to 12 reps at moderate loads for beginners, and for strength in trained lifters, heavier loads of 1 to 6 reps. Rest 2 to 3 minutes between heavy sets of big lifts such as squats, deadlifts and presses, and 1 to 2 minutes for lighter or smaller-muscle work.',
    source: 'Schoenfeld et al., Journal of Strength and Conditioning Research (2017) · ACSM position stand: progression models in resistance training for healthy adults (2009)',
  },
  {
    id: 'progression-effort',
    topic: 'training',
    title: 'Progressive overload, reps in reserve and training to failure',
    tags: ['progressive overload', 'progress', 'progression', 'plateau', 'stuck', 'add weight', 'failure', 'to failure', 'rir', 'reps in reserve', 'rpe', 'intensity'],
    body: 'Progress by adding load, reps or sets over time. The ACSM’s rule of thumb: when you can do 1 or 2 more reps than your target on two sessions in a row, add about 2 to 10% to the load. Most working sets can stop 1 to 3 reps short of failure, which is RPE 7 to 9 on the reps-in-reserve scale. A 2023 meta-analysis found muscle growth similar whether sets went to failure or stopped short of it, and failure costs more recovery.',
    source: 'ACSM position stand: progression models in resistance training (2009) · Zourdos et al., Journal of Strength and Conditioning Research (2016) · Refalo et al., Sports Medicine (2023)',
  },
  {
    id: 'beginner-lifting',
    topic: 'training',
    title: 'Starting to lift as a beginner',
    tags: ['beginner', 'new to lifting', 'start lifting', 'starting out', 'first program', 'novice', 'never lifted', 'gym first time'],
    body: 'A simple start: 2 to 3 full-body sessions a week on non-consecutive days, covering a squat, a hinge, a push, a pull and a carry or core move, for 1 to 3 sets of 8 to 12 reps with a weight you could lift a couple more times. Learn each movement before adding load. The ACSM advises at least 48 hours between sessions that train the same muscles.',
    source: 'ACSM position stand: progression models in resistance training (2009) · ACSM position stand: quantity and quality of exercise (Garber et al., 2011)',
  },
  {
    id: 'activity-guidelines',
    topic: 'training',
    title: 'How much exercise and cardio a week',
    tags: ['cardio', 'aerobic', 'how much exercise', 'exercise every day', 'work out every day', 'daily exercise', 'minutes a week', 'walking', 'running', 'cycling', 'zone 2', 'vigorous', 'moderate', 'heart health'],
    body: 'For adults, the US Physical Activity Guidelines and the WHO both advise 150 to 300 minutes a week of moderate activity such as brisk walking, or 75 to 150 minutes of vigorous activity such as running or hard intervals, or a mix, plus muscle-strengthening on 2 or more days. More brings further benefit and any amount beats none. Adults 65 and over add balance training.',
    source: 'Physical Activity Guidelines for Americans, 2nd edition (HHS, 2018) · WHO guidelines on physical activity and sedentary behaviour (2020)',
  },
  {
    id: 'steps',
    topic: 'training',
    title: 'How many steps a day',
    tags: ['steps', 'step count', '10,000 steps', '10000 steps', 'walking', 'walk', 'neat'],
    body: 'A 2022 meta-analysis of 15 studies found the risk of death fell as daily steps rose, levelling off at about 6,000 to 8,000 steps a day for adults 60 and over and 8,000 to 10,000 for younger adults. 10,000 is not a threshold: the biggest gains come to people starting from few steps.',
    source: 'Paluch et al., The Lancet Public Health (2022)',
  },
  {
    id: 'warmup-stretching',
    topic: 'training',
    title: 'Warming up and stretching',
    tags: ['warm up', 'warm-up', 'warmup', 'stretch', 'stretching', 'mobility', 'flexibility', 'static stretching', 'dynamic'],
    body: 'Warm up with a few minutes of light cardio and lighter sets of your first lift. Short static stretches, under about 60 seconds per muscle, have little effect on strength before training, while longer holds can briefly reduce it. For flexibility, the ACSM advises stretching the major muscle groups at least 2 to 3 days a week, holding each stretch 10 to 30 seconds at the point of mild tightness, for about 60 seconds in total per stretch.',
    source: 'Behm et al., Applied Physiology, Nutrition, and Metabolism (2016) · ACSM position stand: quantity and quality of exercise (Garber et al., 2011)',
  },

  // ── Recovery and sleep ─────────────────────────────────────────────────────
  {
    id: 'sleep-amount',
    topic: 'recovery',
    title: 'How much sleep you need',
    tags: ['sleep', 'how much sleep', 'hours of sleep', 'tired', 'fatigue', 'insomnia', 'rest'],
    body: 'The American Academy of Sleep Medicine and the Sleep Research Society advise adults to sleep 7 or more hours a night on a regular basis; teenagers need 8 to 10. Short sleep is linked to worse recovery, appetite control and training. Lasting trouble sleeping, loud snoring with gasping, or daytime sleepiness despite enough time in bed are worth raising with a doctor.',
    source: 'AASM and SRS consensus statement (Watson et al., 2015) · AASM consensus statement on sleep for children and teenagers (Paruthi et al., 2016)',
  },
  {
    id: 'sleep-habits',
    topic: 'recovery',
    title: 'Sleeping better',
    tags: ['sleep better', 'fall asleep', 'sleep quality', 'bedtime', 'late workout', 'evening workout', 'alcohol', 'screens'],
    body: 'What helps: the same wake time every day, a dark, quiet, cool bedroom, daylight in the morning, and a wind-down without screens. Caffeine taken even 6 hours before bed measurably cut sleep in a controlled study, and alcohol disturbs the second half of the night. Evening exercise does not harm sleep for most people; a 2019 meta-analysis found only vigorous exercise ending within an hour of bedtime did.',
    source: 'AASM healthy sleep habits · Drake et al., Journal of Clinical Sleep Medicine (2013) · Stutz, Eiholzer and Spengler, Sports Medicine (2019)',
  },
  {
    id: 'soreness',
    topic: 'recovery',
    title: 'Sore muscles after training',
    tags: ['sore', 'soreness', 'doms', 'muscle pain', 'aching', 'stiff', 'leg day'],
    body: 'Soreness after new or harder training (delayed-onset muscle soreness) usually peaks 24 to 72 hours later and fades within a few days. Gentle movement eases it; it is not a sign of a good workout, and it lessens as you adapt. Different, and worth a doctor: sharp or joint pain, swelling, pain that worsens over days, or severe pain and weakness with dark, cola-coloured urine after a hard session, which can be rhabdomyolysis and needs urgent care.',
    source: 'ACSM information on delayed onset muscle soreness (2011) · MedlinePlus (U.S. National Library of Medicine): rhabdomyolysis',
  },
  {
    id: 'overreaching',
    topic: 'recovery',
    title: 'Signs you need more recovery, and overtraining',
    tags: ['overtraining', 'overreaching', 'burnout', 'deload', 'rest day', 'rest days', 'recovery', 'exhausted', 'performance dropping', 'resting heart rate'],
    body: 'Signs you need more recovery: performance stalling or dropping for a week or more, unusual fatigue, poor sleep, low mood or irritability, frequent colds, and a raised morning heart rate. Short-term overreaching clears with a few easier days; the joint European College of Sport Science and ACSM consensus describes overtraining syndrome as taking weeks to months to recover from, so it is worth catching early, and other causes of fatigue are for a doctor to rule out.',
    source: 'Meeusen et al., joint consensus statement of the ECSS and ACSM on overtraining syndrome (2013)',
  },
  {
    id: 'cold-plunge',
    topic: 'recovery',
    title: 'Ice baths, cold plunges and recovery',
    tags: ['ice bath', 'cold plunge', 'cold water', 'cold therapy', 'cryotherapy', 'sauna', 'recovery tools'],
    body: 'Cold-water immersion can ease soreness, which helps between closely spaced sessions or competitions. Taken regularly right after lifting, it blunted muscle and strength gains over 12 weeks in a controlled trial, so when building muscle is the goal, keep cold plunges away from lifting sessions. People with heart conditions check with their doctor before cold plunges or saunas.',
    source: 'Roberts et al., The Journal of Physiology (2015)',
  },

  // ── Weight ─────────────────────────────────────────────────────────────────
  {
    id: 'weight-loss-rate',
    topic: 'weight',
    title: 'How fast to lose weight',
    tags: ['lose weight', 'weight loss', 'how fast', 'per week', 'pounds a week', 'kg a week', 'deficit', 'calorie deficit', 'cut', 'cutting', 'fat loss'],
    body: 'A steady, sustainable pace is about 0.5 to 1 kg (1 to 2 pounds) a week, per the CDC; for lifters keeping muscle, about 0.5 to 1% of bodyweight a week. The old rule that 3,500 calories make a pound overstates loss over time: as weight drops the body burns less, so progress slows and the deficit needs revisiting.',
    source: 'CDC, Losing weight · Helms, Aragon and Fitschen, Journal of the International Society of Sports Nutrition (2014) · Hall et al., The Lancet (2011)',
  },
  {
    id: 'calorie-floor',
    topic: 'weight',
    title: 'Calorie targets for weight loss, and how low to go',
    tags: ['calories', 'how many calories', 'calorie target', 'calorie goal', '1200', '1,200', 'eat less', 'very low calorie', 'starvation', 'crash diet'],
    body: 'Typical calorie targets for weight loss in US clinical guidelines are 1,200 to 1,500 calories a day for women and 1,500 to 1,800 for men, or a deficit of about 500 to 750 calories a day below what maintains weight. Very-low-calorie diets, under about 800 a day, are for medical supervision only. Nora does not suggest a target below 1,200 a day for women or 1,500 for men; going lower is for a doctor to oversee.',
    source: 'AHA/ACC/TOS guideline for the management of overweight and obesity in adults (Jensen et al., 2013)',
  },
  {
    id: 'keep-muscle',
    topic: 'weight',
    title: 'Losing fat and keeping muscle',
    tags: ['keep muscle', 'lose fat', 'recomp', 'body recomposition', 'lose muscle', 'muscle loss', 'tone', 'toned', 'lean'],
    body: 'To lose fat and keep muscle: keep lifting, at least 2 days a week; keep protein high, at the top of the ISSN’s everyday range of 1.4 to 2.0 g per kilogram of bodyweight or above, and for lean, trained people up to 2.3 to 3.1 g per kilogram of lean mass; lose at a moderate pace of about 0.5 to 1% of bodyweight a week; and sleep enough. Cardio adds to the deficit, but lifting is the signal to keep muscle.',
    source: 'Aragon et al., ISSN position stand: diets and body composition (2017) · ISSN position stand: protein and exercise (Jäger et al., 2017) · Helms, Aragon and Fitschen (2014)',
  },
  {
    id: 'which-diet',
    topic: 'weight',
    title: 'Which diet works best: low-carb, low-fat, keto, fasting',
    tags: ['diet', 'best diet', 'keto', 'low carb', 'low-carb', 'low fat', 'low-fat', 'intermittent fasting', 'fasting', 'paleo', 'carnivore', 'vegan'],
    body: 'Diets with different macros give similar fat loss when calories and protein are matched. In a year-long trial of 609 adults, a healthy low-fat diet and a healthy low-carb diet lost about the same weight. Intermittent fasting gives results similar to daily calorie restriction. The best diet is the one you can keep: enough protein, mostly whole foods, plenty of vegetables and fiber, and a deficit you can live with.',
    source: 'Gardner et al., JAMA (2018) · Aragon et al., ISSN position stand: diets and body composition (2017)',
  },
  {
    id: 'scale-swings',
    topic: 'weight',
    title: 'Why the scale goes up and down',
    tags: ['scale', 'weigh in', 'weigh-in', 'weight went up', 'gained weight', 'fluctuation', 'water weight', 'bloated', 'plateau'],
    body: 'Bodyweight moves from day to day with water, salt, carbohydrate and what is in your gut; stored carbohydrate holds about 3 grams of water per gram, so a high-carb day can add weight that is not fat. Weigh at the same time, after waking and the bathroom, and judge by the weekly average or the trend over 2 to 3 weeks, not one morning. Measurements, photos and strength show progress the scale can hide.',
    source: 'Fernández-Elías et al., European Journal of Applied Physiology (2015)',
  },
  {
    id: 'glp1',
    topic: 'weight',
    // Answers alone, like a safety entry: on these medicines the calorie target is the prescriber's.
    alone: true,
    title: 'Training and eating on GLP-1 medicines (semaglutide, tirzepatide)',
    tags: ['glp-1', 'glp1', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'semaglutide', 'tirzepatide', 'weight loss medication', 'weight loss drug'],
    body: 'On GLP-1 medicines such as semaglutide or tirzepatide, appetite drops and part of the weight lost can be muscle. A 2025 joint advisory from the American College of Lifestyle Medicine, the American Society for Nutrition, the Obesity Medicine Association and The Obesity Society stresses enough protein, fluids and fiber, nutrient-dense food, and resistance training to protect muscle. The dose, side effects and any calorie target belong to the prescriber.',
    source: 'Joint advisory of the ACLM, ASN, OMA and TOS: nutritional priorities to support GLP-1 therapy for obesity (Mozaffarian et al., 2025)',
  },

  // ── Safety ─────────────────────────────────────────────────────────────────
  {
    id: 'red-flags',
    topic: 'safety',
    title: 'When to stop exercising and get medical help',
    tags: ['chest pain', 'chest pressure', 'dizzy', 'dizziness', 'faint', 'fainted', 'fainting', 'passed out', 'heart racing', 'palpitations', 'short of breath', 'shortness of breath', 'i injured my', 'ive injured my', 'i have injured my', 'just injured my', 'i hurt my', 'ive hurt my', 'i have hurt my', 'just hurt my', 'new injury', 'swollen', 'swelling', 'joint pain', 'sharp pain', 'numb', 'numbness', 'blacked out', 'blackout', 'black out', 'lightheaded', 'light-headed', 'collapsed', 'chest tightness', 'breathless', 'breathlessness', 'unusually breathless', 'cant breathe', 'cannot breathe', 'trouble breathing', 'difficulty breathing', 'gasping for air', 'irregular heartbeat', 'medical clearance'],
    // A condition counts only when the member claims it (claimed(), below): "I have high blood pressure",
    // "I'm on insulin", "with heart disease". "Does exercise lower blood pressure?" and "insulin
    // sensitivity" are ordinary questions (Codex on #2731 and #2732).
    conditions: ['heart condition', 'heart failure', 'stroke', 'metabolic syndrome', 'metabolic disease', 'metabolic condition', 'prediabetes', 'pre-diabetes', 'type 1 diabetes', 'type 2 diabetes', 'insulin', 'chronic kidney disease', 'copd', 'heart disease', 'heart problem', 'heart attack', 'high blood pressure', 'blood pressure', 'hypertension', 'arrhythmia', 'afib', 'heart murmur', 'pacemaker', 'kidney disease', 'diabetes', 'medical condition'],
    body: 'Stop and get medical help for chest pain or pressure, fainting or nearly fainting, a racing or irregular heartbeat, or unusual breathlessness during exercise; call emergency services for chest pain that does not settle with rest, or for fainting. The ACSM’s screening advice: anyone with heart, kidney or metabolic disease, or symptoms that suggest one, gets medical clearance before starting moderate or vigorous exercise. Pain that is sharp, in a joint, or comes with swelling or numbness is checked before training through it.',
    source: 'ACSM preparticipation health screening recommendations (Riebe et al., 2015) · American Heart Association: warning signs of a heart attack',
  },
  {
    id: 'eating-disorders',
    topic: 'safety',
    title: 'Eating disorders, restricting, bingeing or purging',
    tags: ['eating disorder', 'eating disorders', 'disordered eating', 'anorexia', 'anorexic', 'bulimia', 'bulimic', 'binge', 'bingeing', 'binge eating', 'arfid', 'orthorexia', 'purge', 'purging', 'make myself throw up', 'making myself throw up', 'made myself throw up', 'make myself sick', 'laxatives', 'starving myself', 'starve myself', 'skip every meal', 'skipping meals to lose', 'make up for eating', 'make up for what i ate', 'make up for what i eat', 'work off what i ate', 'burn off what i ate', 'burn off everything i eat', 'earn my food', 'earn my meals', 'restricting hard', 'barely eating', 'barely eat', 'eat almost nothing', 'eating almost nothing'],
    // Any binge form is the behaviour the safety line covers, one-off or nightly ("I keep bingeing", "I
    // binged on pizza"; Codex P1 on #2731). Binge-watching and binge-drinking are not eating.
    except: ['binge watch', 'binge drink', 'binge drank', 'binge drinker', 'binge listen', 'binge read'],
    body: 'When eating involves restricting hard, bingeing, purging, laxatives, or exercising to make up for food, or someone names an eating disorder, a calorie target or a deficit is not the right next step, and Nora gives none. Eating disorders are serious and treatable, and the American Psychiatric Association’s guideline puts care with a doctor, a therapist and a dietitian who treat them at the centre. Talk to a doctor or an eating-disorder specialist; in a crisis in the US, call or text 988, the Suicide and Crisis Lifeline.',
    source: 'American Psychiatric Association, Practice Guideline for the Treatment of Patients With Eating Disorders, 4th edition (2023) · 988 Suicide and Crisis Lifeline (2022)',
  },
  {
    id: 'pregnancy',
    topic: 'safety',
    title: 'Exercise in pregnancy and after giving birth',
    tags: ['pregnant', 'pregnancy', 'expecting a baby', 'prenatal', 'postpartum', 'after birth', 'after giving birth', 'had a baby', 'having a baby', 'new baby', 'trimester', 'c-section'],
    body: 'ACOG advises at least 150 minutes a week of moderate activity in an uncomplicated pregnancy, with the go-ahead of the obstetric care provider. Avoid contact sports, activities with a high risk of falling, scuba diving and hot yoga, and long spells lying flat on the back. Stop and call the provider for vaginal bleeding, regular painful contractions, leaking fluid, dizziness, chest pain, headache, calf pain or swelling, muscle weakness affecting balance, or breathlessness before exertion. After birth, return gradually, as soon as the provider says it is medically safe.',
    source: 'ACOG Committee Opinion 804: physical activity and exercise during pregnancy and the postpartum period (2020)',
  },
]);

// ⚠ A WARNING SIGN OR A CONDITION REPLACES ANY HOW-TO. When one of a safety entry's own tags is in the
// question, only the safety entries come back, whatever else scores higher: "I have high blood
// pressure, can I lift heavy?" gets the clearance entry, not reps and load (Codex on #2731).
// The entries that answer alone: every safety entry, and any entry marked `alone` (GLP-1 medicines,
// whose calorie target is the prescriber's; Codex P1 on #2731).
const SAFETY = FITNESS_KNOWLEDGE.filter((e) => e.topic === 'safety' || e.alone === true);
// A tag matches its inflections, not just its exact words: "starve myself", "starved myself" and
// "starving myself" are one tag; so are "faint", "fainted" and "fainting" (Codex on #2731). Each
// word is cut to a light stem on both sides, and the tag's stems must appear in order, side by side.
const stem = (w) => (w.length > 4 ? w.replace(/(?:ing|ed|es|e|s)$/, '') : w);
const stems = (t) => String(t).toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean).map(stem);
const at = (qStems, t, i) => i + t.length <= qStems.length && t.every((w, k) => qStems[i + k] === w);
// An entry's `except` phrases veto a tag where they start at the same word: "binge" is a tag, and
// "binge-watched" is not a binge.
// A condition counts only when the member claims it (Codex on #2732): "I", "I'm" or "I've" in the six
// words before it with nothing between that asks about or changes the condition ("I have high blood
// pressure", "I suffer from diabetes", "I was diagnosed with prediabetes"; not "how can I improve insulin
// sensitivity", "can I use exercise to lower blood pressure", "I read that exercise prevents heart
// disease"); "my" right before it ("my blood pressure is high"); or "with" right before it when no one
// else is named ("is it safe to exercise with heart disease?" asks for the member, "people with
// diabetes" and "my father has diabetes" do not).
const FIRST_PERSON = new Set(['i', 'im', 'ive']);
const NOT_A_CLAIM = new Set(['improve', 'improving', 'lower', 'lowers', 'lowering', 'raise', 'raises', 'reduce', 'reduces', 'reducing', 'prevent', 'prevents', 'preventing', 'increase', 'increases', 'boost', 'affect', 'affects', 'help', 'helps', 'protect', 'protects', 'avoid', 'wonder', 'wondering', 'curious', 'read', 'heard', 'learn', 'learning', 'know', 'worry', 'worried', 'afraid', 'scared', 'about', 'risk']);
const OTHERS = new Set(['people', 'person', 'someone', 'somebody', 'anyone', 'everyone', 'they', 'them', 'their', 'he', 'him', 'his', 'she', 'her', 'father', 'mother', 'dad', 'mom', 'mum', 'parent', 'parents', 'wife', 'husband', 'partner', 'friend', 'friends', 'client', 'clients', 'patient', 'patients', 'son', 'daughter', 'kid', 'kids', 'child', 'children', 'brother', 'sister', 'grandma', 'grandpa', 'grandmother', 'grandfather']);
const words = (t) => String(t).toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean);
function claimed(qWords, i) {
  const before = qWords[i - 1];
  if (before === 'my') return true;
  const w = qWords.slice(Math.max(0, i - 6), i);
  const p = w.map((x) => FIRST_PERSON.has(x)).lastIndexOf(true);
  if (p !== -1 && !w.slice(p + 1).some((x) => NOT_A_CLAIM.has(x))) return true;
  return before === 'with' && !qWords.some((x) => OTHERS.has(x));
}
function hasCondition(qWords, qStems, tag) {
  const t = stems(tag);
  for (let i = 0; i + t.length <= qStems.length; i++) if (at(qStems, t, i) && claimed(qWords, i)) return true;
  return false;
}
function hasTag(qStems, tag, except = []) {
  const t = stems(tag);
  const vetoes = except.map(stems);
  for (let i = 0; i + t.length <= qStems.length; i++) if (at(qStems, t, i) && !vetoes.some((v) => at(qStems, v, i))) return true;
  return false;
}
const shown = (e) => ({ id: e.id, title: e.title, body: e.body, source: e.source });

export function searchFitness(query, { limit = 3, minScore = 1 } = {}) {
  const max = Math.max(1, Math.min(5, limit));
  const found = searchEntries(FITNESS_KNOWLEDGE, query, { limit: 5, minScore });
  const q = stems(query);
  const qWords = words(query);
  const flagged = SAFETY.filter((e) => e.tags.some((t) => hasTag(q, t, e.except)) || (e.conditions || []).some((t) => hasCondition(qWords, q, t)));
  if (!flagged.length) {
    // A safety entry comes back only on its own tag, never on a stray body word: "restricting carbs"
    // is a nutrition question, not an eating-disorder one.
    const everyday = found.entries.filter((e) => !SAFETY.some((x) => x.id === e.id));
    return everyday.length ? { entries: everyday.slice(0, max) } : { entries: [], topics: FITNESS_KNOWLEDGE.map((e) => e.title) };
  }
  // Only the safety entries: a how-to or a calorie figure beside them would ground exactly the
  // answer the safety line forbids ("I have anorexia, how many calories?"; Codex P1 on #2731).
  return { entries: flagged.map(shown).slice(0, max) };
}
