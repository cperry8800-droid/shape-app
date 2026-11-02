// Mutation spec for the screens reading again what Nora's account setup changed (Codex on #2566):
// the announcement (mobile-app/src/services/userGoalsRefresh.mjs), the card announcing it after
// Confirm and Undo, and each mounted reader's effect taking the hook's number in its deps. A survivor
// is a missing test, or a proven no-op marked expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/user-goals-refresh-2026-11-02.mutations.mjs --fail-on-skipped
const SERV = 'mobile-app/src/services/userGoalsRefresh.mjs';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const HOME = 'mobile-app/src/broadsheet/BSHomeSections.jsx';
const GOALS = 'mobile-app/src/broadsheet/BSGoals.jsx';
const COACH = 'mobile-app/src/broadsheet/BSTrainerProfile.jsx';

export default {
  test: 'node --test tests/user-goals-refresh.test.mjs tests/nora-account-setup-surfaces.test.mjs tests/trainer-profile.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The announcement ──
    { name: 'the setup announces nothing', file: APP, find: '  try { bsAnnounceUserGoals(BS_ACCOUNT_SETUP_KINDS); } catch (e) {}\n', replace: '' },
    { name: "the announcement leaves the coach's profile out", file: SERV, find: "'client_training_prefs', 'client_nutrition_prefs', 'profile_custom',", replace: "'client_training_prefs', 'client_nutrition_prefs'," },
    { name: 'an announcement carries no kinds', file: SERV, find: '{ detail: { kinds: list } }', replace: '{ detail: {} }' },
    { name: "an announcement is made with the module's CustomEvent, not the window's", file: SERV, find: "(target && typeof target.CustomEvent === 'function' && target.CustomEvent) || ", replace: '' },
    { name: 'a listener hears every announcement', file: SERV, find: 'if (named.some((k) => mine.has(k))) fn(named);', replace: 'fn(named);' },
    { name: 'the hook never moves', file: SERV, find: '() => setRev((n) => n + 1)), [key]);', replace: '() => {}), [key]);' },
    { name: 'the hook keeps listening after unmount', file: SERV, find: "React.useEffect(() => bsOnUserGoals(key ? key.split('|') : [], () => setRev((n) => n + 1)), [key]);", replace: "React.useEffect(() => { bsOnUserGoals(key ? key.split('|') : [], () => setRev((n) => n + 1)); }, [key]);" },

    // ── Each reader ──
    { name: "Home's Energy card keeps its first read", file: APP, find: "      setEnergyGoal(bsGoalKind((np && np.primary_goal) || '', (tp && tp.primary_goal) || (tp && tp.goal) || ''));\n    });\n    return () => { cancelled = true; };\n  }, [prefsRev]);", replace: "      setEnergyGoal(bsGoalKind((np && np.primary_goal) || '', (tp && tp.primary_goal) || (tp && tp.goal) || ''));\n    });\n    return () => { cancelled = true; };\n  }, []);" },
    { name: "Eat's goal line keeps its first read", file: APP, find: "      setPlanGoal(bsGoalKind((np && np.primary_goal) || '', (tp && tp.primary_goal) || (tp && tp.goal) || ''));\n    }).catch(() => {});\n    return () => { cancelled = true; };\n  }, [prefsRev]);", replace: "      setPlanGoal(bsGoalKind((np && np.primary_goal) || '', (tp && tp.primary_goal) || (tp && tp.goal) || ''));\n    }).catch(() => {});\n    return () => { cancelled = true; };\n  }, []);" },
    { name: "Settings' Training and Nutrition rows keep their first read", file: APP, find: "        setNutritionPrefs(np || {}); setTrainingPrefs(tp || {});\n      } catch (e) {}\n    })();\n    return () => { cancelled = true; };\n  }, [prefsRev]);", replace: "        setNutritionPrefs(np || {}); setTrainingPrefs(tp || {});\n      } catch (e) {}\n    })();\n    return () => { cancelled = true; };\n  }, []);" },
    { name: 'the prefs readers listen for training only', file: APP, find: "const BS_PREF_KINDS = ['client_training_prefs', 'client_nutrition_prefs'];", replace: "const BS_PREF_KINDS = ['client_training_prefs'];" },
    { name: "the own profile's doc keeps its first read", file: APP, find: "  const customRev = useBSUserGoalsRev(BS_PROFILE_CUSTOM_KINDS);\n  React.useEffect(() => { let on = true; if (isSelf) { (async () => { try { const d = await window.shapeDb?.getUserGoals?.('profile_custom'); if (on && d) setCustom(d); } catch (e) {} })(); } return () => { on = false; }; }, [isSelf, customRev]);\n  React.useEffect(() => { if (!isSelf && live", replace: "  const customRev = useBSUserGoalsRev(BS_PROFILE_CUSTOM_KINDS);\n  React.useEffect(() => { let on = true; if (isSelf) { (async () => { try { const d = await window.shapeDb?.getUserGoals?.('profile_custom'); if (on && d) setCustom(d); } catch (e) {} })(); } return () => { on = false; }; }, [isSelf]);\n  React.useEffect(() => { if (!isSelf && live" },
    { name: "the coach app's own profile keeps its first read", file: APP, find: "}, [isSelf, customRev]);\n  // Live sigil rings for your own coach profile", replace: "}, [isSelf]);\n  // Live sigil rings for your own coach profile" },
    { name: "the profile's climb keeps its first goal read", file: APP, find: '  }, [isSelf, goalsRev]);', replace: '  }, [isSelf]);' },
    { name: "the Me goal card keeps its first read", file: APP, find: '  }, [goalsRev]);', replace: '  }, []);' },
    { name: "Settings' profile form keeps its first identity read", file: APP, find: '  }, [identityRev]);', replace: '  }, []);' },
    { name: 'the Preferences pane keeps its first read', file: APP, find: '  }, [settingsRev]);', replace: '  }, []);' },
    { name: "Home's goal keeps its first read", file: HOME, find: '  }, [signedIn, goalsRev]);', replace: '  }, [signedIn]);' },
    { name: "Home's goal listens for the goal only, not its mirror", file: HOME, find: "const BS_HOME_GOAL_KINDS = ['client_goals', 'client_identity'];", replace: "const BS_HOME_GOAL_KINDS = ['client_goals'];" },
    { name: 'Goals keeps its first read', file: GOALS, find: '  }, [loggedIn, goalsRev]);', replace: '  }, [loggedIn]);' },
    { name: "the coach page keeps its first read", file: COACH, find: '  }, [isSelf, ownEpoch, demoOn, customRev]);', replace: '  }, [isSelf, ownEpoch, demoOn]);' },
    { name: 'the coach page listens for another document', file: COACH, find: "const BS_OWN_PROFILE_KINDS = ['profile_custom'];", replace: "const BS_OWN_PROFILE_KINDS = ['client_settings'];" },
  ],
};
