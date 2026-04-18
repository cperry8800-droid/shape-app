// Shape — Supabase client (Phase 1: auth + profiles)
// Loads the Supabase JS v2 client from CDN and exposes it as window.shapeDb.
// All pages that need auth should include this file *after* the CDN script:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="supabase.js"></script>

(function () {
  var SUPABASE_URL = 'https://zznufekgjngecelwxndw.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vuOq-03RJHruIz0PWtXiUA_R4zvTJcR';

  if (typeof window === 'undefined') return;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[shape] Supabase CDN script missing. Add @supabase/supabase-js@2 before supabase.js');
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'shape.auth'
    }
  });

  // ===== Public API (attached to window.shapeDb) =====
  var shapeDb = {
    client: client,

    // Sign up a new user and create their profile row.
    async signUp(opts) {
      var email = opts.email;
      var password = opts.password;
      var role = opts.role; // 'client' | 'trainer' | 'nutritionist'
      var fullName = opts.fullName || '';

      var signUpRes = await client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { full_name: fullName, role: role }
        }
      });
      if (signUpRes.error) return { error: signUpRes.error };

      var user = signUpRes.data && signUpRes.data.user;
      // If email confirmations are enabled, user exists but no session yet.
      // Either way, upsert the profile row now.
      if (user) {
        var profileRes = await client.from('profiles').upsert({
          id: user.id,
          role: role,
          roles: [role],
          full_name: fullName
        });
        if (profileRes.error) {
          console.warn('[shape] profile upsert failed', profileRes.error);
        }
      }
      return { data: signUpRes.data, user: user };
    },

    // Add an additional role to the logged-in user's profile.
    // Used by the "Become a trainer / nutritionist" flow on existing accounts.
    async addRole(newRole) {
      try {
        if (['client','trainer','nutritionist'].indexOf(newRole) === -1) {
          return { error: { message: 'Invalid role' } };
        }
        var session = await shapeDb.getSession();
        if (!session) return { error: { message: 'Not logged in' } };
        var profile = await shapeDb.getProfile(session.user.id);
        if (!profile) return { error: { message: 'Profile not found' } };
        var roles = Array.isArray(profile.roles) && profile.roles.length
          ? profile.roles.slice()
          : (profile.role ? [profile.role] : []);
        if (roles.indexOf(newRole) === -1) roles.push(newRole);
        // Bare .update() — no .select().single() so RLS return-read issues
        // don't hang the call when everything actually succeeded.
        var res = await client.from('profiles')
          .update({ roles: roles })
          .eq('id', session.user.id);
        if (res && res.error) {
          console.error('[shape] addRole update error', res.error);
          return { error: res.error };
        }
        return { data: { roles: roles } };
      } catch (e) {
        console.error('[shape] addRole threw', e);
        return { error: { message: (e && e.message) || 'Unknown error' } };
      }
    },

    // True if the current profile has this role (array-aware, legacy-safe).
    profileHasRole(profile, role) {
      if (!profile) return false;
      if (Array.isArray(profile.roles) && profile.roles.indexOf(role) !== -1) return true;
      return profile.role === role;
    },

    // Sign in with email + password, returning the user's profile.
    async signIn(email, password) {
      var res = await client.auth.signInWithPassword({ email: email, password: password });
      if (res.error) return { error: res.error };
      var user = res.data.user;
      // Push the session into Next.js auth cookies so server-rendered
      // /dashboard/* routes recognize the user. Non-blocking — if this fails
      // legacy HTML pages still work via localStorage.
      try {
        var session = res.data.session;
        if (session && session.access_token && session.refresh_token) {
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
          });
        }
      } catch (e) { console.warn('[shape] cookie bridge failed', e); }
      var profile = await shapeDb.getProfile(user.id);
      return { user: user, profile: profile };
    },

    async signOut() {
      await client.auth.signOut();
      // Clear the Next.js cookie session too so server-rendered routes
      // don't think the user is still signed in.
      try {
        await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
      } catch (e) {}
      // Clear legacy demo keys so stale UI state doesn't linger.
      try {
        localStorage.removeItem('shapeLoggedIn');
        localStorage.removeItem('shapeUserType');
        localStorage.removeItem('shapeFirstName');
        localStorage.removeItem('shapeLastName');
        localStorage.removeItem('shapeEmail');
      } catch (e) {}
    },

    async getSession() {
      var res = await client.auth.getSession();
      var session = res.data && res.data.session;
      if (session) return session;
      // Legacy pages persist sessions in localStorage but the Next.js app
      // stores them in HTTP cookies. If nothing is in localStorage yet,
      // try to bootstrap from the Next.js /api/auth/session bridge before
      // giving up.
      try {
        var bridgeRes = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!bridgeRes.ok) return null;
        var bridge = await bridgeRes.json();
        if (!bridge || !bridge.access_token || !bridge.refresh_token) return null;
        var setRes = await client.auth.setSession({
          access_token: bridge.access_token,
          refresh_token: bridge.refresh_token,
        });
        return setRes.data && setRes.data.session;
      } catch (e) {
        console.warn('[shape] session bridge failed', e);
        return null;
      }
    },

    async getUser() {
      var res = await client.auth.getUser();
      return res.data && res.data.user;
    },

    async getProfile(userId) {
      if (!userId) {
        var u = await shapeDb.getUser();
        if (!u) return null;
        userId = u.id;
      }
      var res = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (res.error) {
        console.warn('[shape] getProfile error', res.error);
        return null;
      }
      return res.data;
    },

    // Guard a dashboard page.
    // - No session → return { demo: true } so the page can render a sample view.
    // - Logged in with wrong role → bounce to their own dashboard.
    // - Logged in with right role → return { session, profile }.
    async requireRole(expectedRole) {
      var session = await shapeDb.getSession();
      if (!session) {
        return { demo: true };
      }
      var profile = await shapeDb.getProfile(session.user.id);
      if (!profile) {
        return { demo: true };
      }
      if (expectedRole && !shapeDb.profileHasRole(profile, expectedRole)) {
        // User doesn't hold this role → send them to their primary dashboard.
        window.location.href = shapeDb.dashboardFor(profile.role);
        return null;
      }
      return { session: session, profile: profile };
    },

    // Inject a top-of-page "sample dashboard" banner for logged-out visitors.
    showDemoBanner(role) {
      if (document.getElementById('shapeDemoBanner')) return;
      // Push fixed navbar + page content down to clear the banner.
      var offsetCss = document.getElementById('shapeDemoBannerOffset');
      if (!offsetCss) {
        offsetCss = document.createElement('style');
        offsetCss.id = 'shapeDemoBannerOffset';
        offsetCss.textContent =
          'body.shape-has-demo-banner .navbar{top:48px !important;}' +
          'body.shape-has-demo-banner{padding-top:48px;}' +
          '@media(max-width:600px){' +
            '#shapeDemoBanner>div{flex-wrap:nowrap !important;padding:10px 12px !important;font-size:0.72rem !important;gap:12px !important;}' +
            '#shapeDemoBanner>div>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}' +
            'body.shape-has-demo-banner .navbar{top:40px !important;}' +
            'body.shape-has-demo-banner{padding-top:40px;}' +
          '}';
        document.head.appendChild(offsetCss);
      }
      document.body.classList.add('shape-has-demo-banner');
      var signupHref = role === 'trainer' ? 'signup-trainer.html'
        : role === 'nutritionist' ? 'signup-nutritionist.html'
        : 'signup-client.html';
      var label = role === 'trainer' ? 'trainer' : role === 'nutritionist' ? 'nutritionist' : 'client';
      var bar = document.createElement('div');
      bar.id = 'shapeDemoBanner';
      bar.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;' +
        'padding:14px 24px;background:#1A1A1A;color:#fff;font-size:0.82rem;font-weight:500;' +
        'letter-spacing:0.02em;border-bottom:1px solid rgba(255,255,255,0.1);' +
        'position:fixed;top:0;left:0;right:0;z-index:10000;text-align:center;">' +
        '<span style="opacity:0.85;">Sample ' + label + ' dashboard — sign up to get your own.</span>' +
        '<span style="display:inline-flex;align-items:center;gap:18px;">' +
          '<a href="' + signupHref + '" style="color:#fff;text-decoration:underline;font-weight:600;white-space:nowrap;">Sign up</a>' +
          '<a href="login.html" style="color:#fff;opacity:0.7;white-space:nowrap;">Log in</a>' +
        '</span>' +
        '</div>';
      document.body.insertBefore(bar, document.body.firstChild);
    },

    // ===== Sessions (bookings) =====

    // Create a new session request. Called by a client from a provider's profile.
    async requestSession(opts) {
      var session = await shapeDb.getSession();
      if (!session) return { error: { message: 'You must be logged in to book.' } };
      var row = {
        client_id: session.user.id,
        provider_id: opts.providerId,
        provider_role: opts.providerRole,
        type: opts.type,
        scheduled_at: opts.scheduledAt,
        duration_min: opts.durationMin || 30,
        notes: opts.notes || null,
        client_phone: opts.type === 'phone' ? (opts.clientPhone || null) : null,
        status: 'requested'
      };
      var res = await client.from('sessions').insert(row).select().single();
      return res;
    },

    // List sessions where current user is a participant (client OR provider).
    async listSessions(opts) {
      opts = opts || {};
      var session = await shapeDb.getSession();
      if (!session) return { data: [], error: null };
      var q = client.from('sessions').select('*');
      if (opts.asClient) q = q.eq('client_id', session.user.id);
      else if (opts.asProvider) q = q.eq('provider_id', session.user.id);
      // If neither flag set, RLS still limits to participants.
      if (opts.status) q = q.eq('status', opts.status);
      if (opts.upcoming) q = q.gte('scheduled_at', new Date().toISOString());
      q = q.order('scheduled_at', { ascending: opts.ascending !== false });
      return await q;
    },

    async updateSession(id, patch) {
      return await client.from('sessions').update(patch).eq('id', id).select().single();
    },

    // Accept a booking request → generate a Jitsi room URL for video sessions.
    async acceptSession(id) {
      var url = 'https://meet.jit.si/shape-' + id.replace(/-/g, '').slice(0, 16);
      var s = await client.from('sessions').select('type').eq('id', id).single();
      var patch = { status: 'confirmed' };
      if (s.data && s.data.type === 'video') patch.meeting_url = url;
      return await client.from('sessions').update(patch).eq('id', id).select().single();
    },

    // Fetch the trainer or nutritionist row owned by the signed-in user.
    // Used by dashboard pages to drive Stripe Connect onboarding banners.
    // If the user somehow owns multiple rows (stale claims, data import),
    // we just return the lowest-id row instead of erroring.
    async getMyProvider(role) {
      var session = await shapeDb.getSession();
      if (!session) return null;
      var table = role === 'trainer' ? 'trainers' : role === 'nutritionist' ? 'nutritionists' : null;
      if (!table) return null;
      var res = await client
        .from(table)
        .select('id, name, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at')
        .eq('owner_id', session.user.id)
        .order('id', { ascending: true })
        .limit(1);
      if (res.error) {
        console.warn('[shape] getMyProvider error', res.error);
        return null;
      }
      var row = (res.data && res.data[0]) || null;
      // Lazy cleanup: if resume date has passed, flip at_capacity off so
      // the dashboard + listings reflect reality without a cron job.
      if (row && row.at_capacity && row.capacity_resume_at) {
        var resumeMs = new Date(row.capacity_resume_at).getTime();
        if (isFinite(resumeMs) && resumeMs <= Date.now()) {
          await client
            .from(table)
            .update({ at_capacity: false, capacity_resume_at: null })
            .eq('id', row.id);
          row.at_capacity = false;
          row.capacity_resume_at = null;
        }
      }
      return row;
    },

    // Flip the at_capacity flag on the signed-in provider's row and
    // optionally schedule an auto-resume date. RLS only allows updates
    // when owner_id = auth.uid(), so this is safe to call from the
    // dashboard without an extra ownership check.
    //
    // resumeAt: ISO string or null. Ignored when isAtCapacity is false
    // (auto-resume only makes sense while paused).
    async setAtCapacity(role, providerId, isAtCapacity, resumeAt) {
      var table = role === 'trainer' ? 'trainers' : role === 'nutritionist' ? 'nutritionists' : null;
      if (!table) return { error: { message: 'invalid role' } };
      var patch = { at_capacity: !!isAtCapacity };
      patch.capacity_resume_at = isAtCapacity ? (resumeAt || null) : null;
      return await client
        .from(table)
        .update(patch)
        .eq('id', providerId)
        .select('id, at_capacity, capacity_resume_at')
        .single();
    },

    // Extract a Spotify playlist ID from a URL or spotify: URI. Returns
    // null if the input isn't a recognizable playlist reference.
    parseSpotifyPlaylistId(input) {
      if (!input || typeof input !== 'string') return null;
      var s = input.trim();
      var m = s.match(/playlist[/:]([A-Za-z0-9]{10,40})/);
      return m ? m[1] : null;
    },

    async listMyPlaylists(trainerId) {
      return await client
        .from('trainer_playlists')
        .select('id, trainer_id, workout_id, title, description, spotify_playlist_id, created_at')
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false });
    },

    async createPlaylist(trainerId, fields) {
      var spotifyId = shapeDb.parseSpotifyPlaylistId(fields.spotifyUrl || '');
      if (!spotifyId) return { error: { message: 'Please paste a valid Spotify playlist link.' } };
      var row = {
        trainer_id: trainerId,
        title: (fields.title || '').slice(0, 200),
        description: fields.description ? String(fields.description).slice(0, 1000) : null,
        spotify_playlist_id: spotifyId,
        workout_id: fields.workoutId || null,
      };
      if (!row.title) return { error: { message: 'Playlist title is required.' } };
      return await client
        .from('trainer_playlists')
        .insert(row)
        .select()
        .single();
    },

    async deletePlaylist(playlistId) {
      return await client.from('trainer_playlists').delete().eq('id', playlistId);
    },

    // List the signed-in provider's active subscribers with their first/last
    // names from client_intakes. Powers the "Assign to Client" dropdown in
    // the workout builder. Falls back to an empty array if either query
    // fails — the caller renders "None" in that case.
    async listMySubscribers(role, providerId) {
      var subs = await client
        .from('subscriptions')
        .select('client_id, status')
        .eq('provider_id', providerId)
        .eq('provider_role', role)
        .in('status', ['active', 'trialing']);
      if (subs.error || !subs.data || subs.data.length === 0) return { data: [], error: subs.error || null };
      var ids = subs.data.map(function (s) { return s.client_id; });
      var intakes = await client
        .from('client_intakes')
        .select('user_id, first_name, last_name')
        .in('user_id', ids);
      if (intakes.error) return { data: [], error: intakes.error };
      var byId = {};
      (intakes.data || []).forEach(function (r) { byId[r.user_id] = r; });
      var out = ids.map(function (id) {
        var r = byId[id];
        var name = r ? ((r.first_name || '') + ' ' + (r.last_name || '')).trim() : '';
        return { id: id, name: name || 'Client' };
      });
      return { data: out, error: null };
    },

    // Publish a workout from the builder to Supabase so it reaches a real
    // assigned client. localStorage still holds the in-progress draft — this
    // only runs on "Publish & Send to Client".
    async publishClientWorkout(trainerId, fields) {
      var row = {
        trainer_id: trainerId,
        client_id: fields.clientId,
        title: (fields.title || '').slice(0, 200),
        description: fields.description ? String(fields.description).slice(0, 2000) : null,
        kind: fields.kind === 'custom' ? 'custom' : 'template',
        payload: fields.payload || {},
        playlist_id: fields.playlistId || null,
        status: 'published',
      };
      if (!row.client_id) return { error: { message: 'Pick a client first.' } };
      if (!row.title) return { error: { message: 'Workout name is required.' } };
      return await client.from('client_workouts').insert(row).select().single();
    },

    // Pull all workouts assigned to the signed-in client. Joins the playlist
    // so the detail view can embed Spotify without a second round-trip.
    async listMyClientWorkouts() {
      var session = await shapeDb.getSession();
      if (!session) return { data: [], error: null };
      return await client
        .from('client_workouts')
        .select('id, title, description, kind, payload, playlist_id, created_at, trainer_id, trainers:trainer_id(name), trainer_playlists:playlist_id(id, title, spotify_playlist_id)')
        .eq('client_id', session.user.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });
    },

    async getClientWorkout(id) {
      return await client
        .from('client_workouts')
        .select('id, title, description, kind, payload, playlist_id, created_at, trainer_id, trainers:trainer_id(name), trainer_playlists:playlist_id(id, title, spotify_playlist_id)')
        .eq('id', id)
        .maybeSingle();
    },

    // Fetch playlists from trainers the signed-in user subscribes to.
    // Returns [{ id, title, description, spotify_playlist_id, trainer_id, trainer_name }].
    async listPlaylistsForMe() {
      var session = await shapeDb.getSession();
      if (!session) return { data: [], error: null };
      var subs = await client
        .from('subscriptions')
        .select('provider_id, provider_role, status')
        .eq('provider_role', 'trainer')
        .in('status', ['active', 'trialing']);
      if (subs.error) return { data: [], error: subs.error };
      var ids = (subs.data || []).map(function (s) { return s.provider_id; });
      if (ids.length === 0) return { data: [], error: null };
      var pls = await client
        .from('trainer_playlists')
        .select('id, trainer_id, workout_id, title, description, spotify_playlist_id, created_at, trainers:trainer_id(name)')
        .in('trainer_id', ids)
        .order('created_at', { ascending: false });
      if (pls.error) return { data: [], error: pls.error };
      var out = (pls.data || []).map(function (p) {
        return {
          id: p.id,
          trainer_id: p.trainer_id,
          workout_id: p.workout_id,
          title: p.title,
          description: p.description,
          spotify_playlist_id: p.spotify_playlist_id,
          trainer_name: p.trainers && p.trainers.name ? p.trainers.name : 'Your trainer',
          created_at: p.created_at,
        };
      });
      return { data: out, error: null };
    },

    // Kick off Stripe Connect onboarding for the signed-in provider. Server
    // creates (or reuses) the Connect account and returns a hosted
    // onboarding URL; we send the user there.
    async startStripeOnboarding(role, providerId) {
      var session = await shapeDb.getSession();
      if (!session) { window.location.href = 'login.html'; return; }
      var res = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ provider_role: role, provider_id: providerId }),
      });
      if (!res.ok) {
        var text = await res.text();
        alert('Stripe onboarding failed: ' + text);
        return;
      }
      var json = await res.json();
      if (json.url) window.location.href = json.url;
    },

    // ===== Marketplace reads (Phase 1b) =====
    // These return data in the SAME SHAPE as the hardcoded arrays in app.js
    // (camelCase field names, nested workouts/plans, etc.) so the existing
    // render code in trainers.html / nutritionists.html / gyms.html can
    // consume them as a drop-in replacement.

    async listTrainers() {
      var res = await client
        .from('trainers')
        .select('*, trainer_workouts(*, workout_sample_days(*))')
        .not('owner_id', 'is', null)
        .order('sort_order', { ascending: true });
      if (res.error) { console.warn('[shape] listTrainers error', res.error); return []; }
      return (res.data || []).map(function (t) {
        var workouts = (t.trainer_workouts || [])
          .sort(function (a, b) { return a.sort_order - b.sort_order; })
          .map(function (w) {
            var days = (w.workout_sample_days || [])
              .sort(function (a, b) { return a.sort_order - b.sort_order; })
              .map(function (d) { return { day: d.day_label, exercises: d.exercises || [] }; });
            return {
              name: w.name, type: w.type, duration: w.duration,
              difficulty: w.difficulty, location: w.location, price: w.price,
              description: w.description, sampleDays: days
            };
          });
        return {
          id: t.id, name: t.name, specialty: t.specialty, category: t.category,
          price: t.price, rating: t.rating, subscribers: t.subscribers,
          experience: t.experience, credential: t.credential,
          credentialFull: t.credential_full, specialtyType: t.specialty_type,
          bio: t.bio, color: t.color, tags: t.tags || [],
          trainerOfMonth: t.trainer_of_month, totmQuote: t.totm_quote,
          featured: t.featured, workouts: workouts
        };
      });
    },

    async listNutritionists() {
      var res = await client
        .from('nutritionists')
        .select('*, nutritionist_plans(*, plan_sample_days(*))')
        .not('owner_id', 'is', null)
        .order('sort_order', { ascending: true });
      if (res.error) { console.warn('[shape] listNutritionists error', res.error); return []; }
      return (res.data || []).map(function (n) {
        var plans = (n.nutritionist_plans || [])
          .sort(function (a, b) { return a.sort_order - b.sort_order; })
          .map(function (p) {
            var days = (p.plan_sample_days || [])
              .sort(function (a, b) { return a.sort_order - b.sort_order; })
              .map(function (d) {
                return {
                  day: d.day_label, calories: d.calories, protein: d.protein,
                  breakfast: d.breakfast, lunch: d.lunch, dinner: d.dinner
                };
              });
            return {
              name: p.name, type: p.type, duration: p.duration,
              difficulty: p.difficulty, price: p.price,
              description: p.description, sampleDays: days
            };
          });
        return {
          id: n.id, name: n.name, specialty: n.specialty, category: n.category,
          price: n.price, rating: n.rating, subscribers: n.subscribers,
          experience: n.experience, credential: n.credential,
          credentialFull: n.credential_full, specialtyType: n.specialty_type,
          bio: n.bio, color: n.color, tags: n.tags || [], services: n.services || [],
          nutritionistOfMonth: n.nutritionist_of_month, notmQuote: n.notm_quote,
          featured: n.featured, plans: plans
        };
      });
    },

    async listGyms() {
      var res = await client
        .from('gyms')
        .select('*')
        .order('sort_order', { ascending: true });
      if (res.error) { console.warn('[shape] listGyms error', res.error); return []; }
      return (res.data || []).map(function (g) {
        return {
          id: g.id, name: g.name, type: g.type, category: g.category,
          location: g.location, rating: g.rating, members: g.members,
          trainers: g.trainers, price: g.price, bio: g.bio, color: g.color,
          amenities: g.amenities || [], classes: g.classes || [],
          tags: g.tags || [], featured: g.featured,
          gymOfMonth: g.gym_of_month, gotmQuote: g.gotm_quote
        };
      });
    },

    dashboardFor(role) {
      if (role === 'trainer') return 'trainer-dashboard.html';
      if (role === 'nutritionist') return 'nutrition-schedule.html';
      return 'clients.html';
    },

    // Swap any element with .shape-auth-logged-out / .shape-auth-logged-in
    // classes based on the current session. Safe to call on any page.
    async applyNavAuthState() {
      var session = await shapeDb.getSession();
      var loggedIn = !!session;
      // Sync the session into Next.js auth cookies so server-rendered
      // /dashboard/* routes don't redirect to /login. Fire-and-forget.
      if (loggedIn && session.access_token && session.refresh_token) {
        try {
          fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
          }).catch(function () {});
        } catch (e) {}
      }
      if (document.body) {
        document.body.classList.toggle('shape-logged-in', loggedIn);
      }
      document.querySelectorAll('.shape-auth-logged-out').forEach(function (el) {
        el.style.display = loggedIn ? 'none' : '';
      });
      document.querySelectorAll('.shape-auth-logged-in').forEach(function (el) {
        el.style.display = loggedIn ? '' : 'none';
      });
      if (loggedIn) {
        var profile = await shapeDb.getProfile(session.user.id);
        document.querySelectorAll('#shapeNavUserName, .shape-nav-user-name').forEach(function (el) {
          if (profile && profile.full_name) el.textContent = profile.full_name;
          else el.textContent = session.user.email || '';
        });
        // Rewrite any dashboard-link anchors with data-shape-dashboard-link
        // to point at the user's own dashboard. Use the page context (e.g.
        // on shape-score-trainer we want Dashboard -> trainer-dashboard, not
        // the user's primary role's dashboard).
        if (profile) {
          var ctxRole = shapeDb._detectPageRole(profile);
          var dash = shapeDb.dashboardFor(ctxRole);
          document.querySelectorAll('[data-shape-dashboard-link]').forEach(function (el) {
            el.setAttribute('href', dash);
          });
          shapeDb._injectRoleSwitcher(profile);
        }
      }
    },

    // Figure out which role context the current page belongs to.
    // Used for the Dashboard link and the role-switcher "active" indicator.
    _detectPageRole(profile) {
      var path = (window.location.pathname || '').toLowerCase();
      if (path.indexOf('trainer-dashboard') !== -1) return 'trainer';
      if (path.indexOf('nutrition-schedule') !== -1) return 'nutritionist';
      if (path.indexOf('shape-score-trainer') !== -1) return 'trainer';
      if (path.indexOf('shape-score-nutritionist') !== -1) return 'nutritionist';
      if (path.indexOf('trainer-profile') !== -1) return 'trainer';
      if (path.indexOf('nutritionist-profile') !== -1) return 'nutritionist';
      if (path.indexOf('clients.html') !== -1 || path.indexOf('/clients') !== -1) return 'client';
      if (path.indexOf('shape-store') !== -1 || path.indexOf('shape-score') !== -1) {
        try {
          var ctx = sessionStorage.getItem('shapeStoreContext');
          if (ctx === 'trainer' || ctx === 'nutritionist' || ctx === 'client') return ctx;
        } catch (e) {}
      }
      return (profile && profile.role) || 'client';
    },

    // Auto-inject a "You're viewing as…" switcher when the user holds 2+ roles.
    _injectRoleSwitcher(profile) {
      var roles = (profile && Array.isArray(profile.roles) && profile.roles.length)
        ? profile.roles
        : (profile && profile.role ? [profile.role] : []);
      if (roles.length < 2) return;
      if (document.getElementById('shapeRoleSwitcher')) return;

      // Prefer inserting before the Dashboard link in nav-actions — it gives
      // a stable slot that matches the existing flex layout. Fall back to the
      // user name span, then any logged-in element anywhere.
      var anchor =
        document.querySelector('.nav-actions [data-shape-dashboard-link]') ||
        document.querySelector('.nav-actions .shape-nav-user-name') ||
        document.querySelector('.nav-actions .shape-auth-logged-in') ||
        document.querySelector('[data-shape-dashboard-link]') ||
        document.querySelector('.shape-nav-user-name') ||
        document.querySelector('.shape-auth-logged-in');
      if (!anchor) return;

      var labels = { client: 'Client', trainer: 'Trainer', nutritionist: 'Nutritionist' };

      var current = shapeDb._detectPageRole(profile);

      var style = document.createElement('style');
      style.textContent =
        '#shapeRoleSwitcher{position:relative;display:inline-flex;align-items:center;align-self:center;font-family:Inter,system-ui,sans-serif;line-height:1;flex:0 0 auto;}' +
        '#shapeRoleSwitcher .srs-btn{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;line-height:1.4;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);color:var(--text,#fff);border-radius:999px;font-size:0.72rem;font-weight:500;cursor:pointer;font-family:inherit;vertical-align:middle;white-space:nowrap;}' +
        '#shapeRoleSwitcher .srs-btn:hover{border-color:rgba(255,255,255,0.3);}' +
        '#shapeRoleSwitcher .srs-btn .srs-caret{opacity:0.5;font-size:0.6rem;}' +
        '#shapeRoleSwitcher .srs-menu{display:none;position:absolute;top:calc(100% + 6px);right:0;background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:10px;min-width:180px;padding:6px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.5);}' +
        '#shapeRoleSwitcher.open .srs-menu{display:block;}' +
        '#shapeRoleSwitcher .srs-menu a{display:flex;align-items:center;gap:10px;padding:10px 12px;color:var(--text,#fff);font-size:0.82rem;border-radius:6px;text-decoration:none;}' +
        '#shapeRoleSwitcher .srs-menu a:hover{background:rgba(255,255,255,0.06);}' +
        '#shapeRoleSwitcher .srs-menu a.active{background:rgba(255,255,255,0.08);font-weight:600;}' +
        '#shapeRoleSwitcher .srs-menu a .srs-check{margin-left:auto;opacity:0.6;font-size:0.72rem;}' +
        // Mobile: .nav-actions is hidden on <=768px site-wide; force the
        // switcher (and only the switcher) to remain visible and sit next
        // to the hamburger toggle so users can still change roles.
        '@media (max-width: 768px){' +
          '.nav-container .nav-actions{display:flex !important;position:absolute;right:52px;top:50%;transform:translateY(-50%);margin:0;gap:0;background:transparent;padding:0;pointer-events:none;z-index:1055;}' +
          '.nav-container .nav-actions > *{display:none !important;}' +
          '.nav-container .nav-actions > #shapeRoleSwitcher{display:inline-flex !important;pointer-events:auto;}' +
          '#shapeRoleSwitcher .srs-btn{padding:6px 10px;font-size:0.68rem;}' +
          '#shapeRoleSwitcher .srs-menu{min-width:160px;}' +
        '}';
      document.head.appendChild(style);

      var wrap = document.createElement('div');
      wrap.id = 'shapeRoleSwitcher';
      var menuHtml = '';
      roles.forEach(function (r) {
        var active = r === current ? ' active' : '';
        var check = r === current ? '<span class="srs-check">Active</span>' : '';
        menuHtml +=
          '<a href="' + shapeDb.dashboardFor(r) + '" class="' + active.trim() + '">' +
            '<span>' + (labels[r] || r) + '</span>' + check +
          '</a>';
      });
      wrap.innerHTML =
        '<button class="srs-btn" type="button">' +
          '<span>' + (labels[current] || current) + '</span>' +
          '<span class="srs-caret">&#9662;</span>' +
        '</button>' +
        '<div class="srs-menu">' + menuHtml + '</div>';

      anchor.parentNode.insertBefore(wrap, anchor);
      var btn = wrap.querySelector('.srs-btn');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        wrap.classList.toggle('open');
      });
      document.addEventListener('click', function () { wrap.classList.remove('open'); });
    }
  };

  window.shapeDb = shapeDb;

  // Global sign-out helper (used by navbar buttons site-wide).
  window.shapeSignOut = async function () {
    if (window.shapeDb) await window.shapeDb.signOut();
    window.location.href = 'home.html';
  };

  // Auto-apply nav auth state on every page that loads this script.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { shapeDb.applyNavAuthState(); });
  } else {
    shapeDb.applyNavAuthState();
  }
})();
