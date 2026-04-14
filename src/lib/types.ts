// Shared types for Shape marketplace data.
// These mirror the row shapes in the Supabase `trainers`, `nutritionists`,
// and `gyms` tables (plus their nested children).

export type Trainer = {
  id: number;
  name: string;
  specialty: string | null;
  category: string | null;
  price: number | null;
  rating: number | null;
  subscribers: number | null;
  experience: string | null;
  credential: string | null;
  credential_full: string | null;
  specialty_type: string | null;
  bio: string | null;
  color: string | null;
  tags: string[];
  trainer_of_month: boolean;
  totm_quote: string | null;
  featured: boolean;
  workouts?: TrainerWorkout[];
};

export type TrainerWorkout = {
  id: number;
  name: string;
  type: string | null;
  duration: string | null;
  difficulty: string | null;
  location: string | null;
  price: number | null;
  description: string | null;
  sample_days?: WorkoutSampleDay[];
};

export type WorkoutSampleDay = {
  id: number;
  day_label: string | null;
  exercises: string[];
};

export type Nutritionist = {
  id: number;
  name: string;
  specialty: string | null;
  category: string | null;
  price: number | null;
  rating: number | null;
  subscribers: number | null;
  experience: string | null;
  credential: string | null;
  credential_full: string | null;
  specialty_type: string | null;
  bio: string | null;
  color: string | null;
  tags: string[];
  services: string[];
  nutritionist_of_month: boolean;
  notm_quote: string | null;
  featured: boolean;
  plans?: NutritionistPlan[];
};

export type NutritionistPlan = {
  id: number;
  name: string;
  type: string | null;
  duration: string | null;
  difficulty: string | null;
  price: number | null;
  description: string | null;
  sample_days?: PlanSampleDay[];
};

export type PlanSampleDay = {
  id: number;
  day_label: string | null;
  calories: string | null;
  protein: string | null;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
};

export type Gym = {
  id: number;
  name: string;
  type: string | null;
  category: string | null;
  location: string | null;
  rating: number | null;
  members: number | null;
  trainers: number | null;
  price: number | null;
  bio: string | null;
  color: string | null;
  amenities: string[];
  classes: string[];
  tags: string[];
  featured: boolean;
  gym_of_month: boolean;
  gotm_quote: string | null;
};
