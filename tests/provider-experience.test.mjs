// The coach experience rule (src/lib/provider-experience.mjs), and the website's copy of it.
// Owner, 2026-10-12: five years is the standard, and less is "not a hard no": the application
// asks where they have worked and what kind of experience it is, and is reviewed individually.
// The website's form is a babel page that cannot import the module, so it carries its own copy,
// held equal here.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  EXPERIENCE_STANDARD_YEARS,
  PROVIDER_EXPERIENCE_OPTIONS,
  belowExperienceStandard,
  experienceProblem,
  experienceYears,
} from '../src/lib/provider-experience.mjs'
import * as appConfig from '../mobile-app/src/config/providerApplications.js'
import { CHOICES } from '../src/lib/ai/noraForms.mjs'

const UNDER = "With under 5 years, tell us where you've worked and what type of experience you have, so we can review your application."

test('each answer reads as the fewest years it states; no answer is no reading', () => {
  assert.equal(EXPERIENCE_STANDARD_YEARS, 5)
  assert.deepEqual(PROVIDER_EXPERIENCE_OPTIONS.map(experienceYears), [0, 1, 3, 5, 7, 10, 15])
  for (const none of ['', '   ', null, undefined, 'a while']) assert.equal(experienceYears(none), null, JSON.stringify(none))
  assert.equal(experienceYears('8'), 8, 'an old row\'s bare number')
  assert.deepEqual(PROVIDER_EXPERIENCE_OPTIONS.map(belowExperienceStandard), [true, true, true, false, false, false, false])
  assert.equal(belowExperienceStandard(''), false, 'no answer is not "below"; it is asked for')
})

test('below the standard needs where and what kind; it is never a refusal of the years', () => {
  assert.equal(experienceProblem(''), 'Choose your years of professional experience.')
  for (const years of ['Less than 1 year', '1-2 years', '3-4 years']) {
    assert.equal(experienceProblem(years), UNDER, years)
    assert.equal(experienceProblem(years, { experience_history: 'Gym A' }), UNDER)
    assert.equal(experienceProblem(years, { experience_history: ' ', experience_type: 'Floor' }), UNDER, 'blank is not an answer')
    assert.equal(experienceProblem(years, { experience_history: 'Gym A', experience_type: 'Floor' }), '')
  }
  for (const years of ['5-7 years', '7-10 years', '10-15 years', '15+ years']) assert.equal(experienceProblem(years), '', years)
})

test('the app and Nora read the same list', () => {
  assert.deepEqual(appConfig.PROVIDER_EXPERIENCE_OPTIONS, PROVIDER_EXPERIENCE_OPTIONS)
  assert.equal(appConfig.EXPERIENCE_STANDARD_YEARS, EXPERIENCE_STANDARD_YEARS)
  assert.deepEqual(CHOICES.years, PROVIDER_EXPERIENCE_OPTIONS)
})

test('the website\'s copy is the module: the list, the standard, the reading and the sentences', () => {
  const src = readFileSync('public/newdesign/signup.jsx', 'utf8').replace(/\r\n/g, '\n')
  const list = JSON.parse(src.match(/const proExperienceOptions = (\[[^\]]*\]);/)[1])
  assert.deepEqual(list, PROVIDER_EXPERIENCE_OPTIONS)
  assert.equal(Number(src.match(/const EXPERIENCE_STANDARD_YEARS = (\d+);/)[1]), EXPERIENCE_STANDARD_YEARS)
  const start = src.indexOf('function experienceYearsOf')
  const body = src.slice(start, src.indexOf('\n}\n', start) + 2)
  const read = new Function(`${body}\nreturn experienceYearsOf;`)()
  for (const v of [...PROVIDER_EXPERIENCE_OPTIONS, '', '  ', null, undefined, 'a while', '8']) {
    assert.equal(read(v), experienceYears(v), JSON.stringify(v))
  }
  assert.ok(src.includes('setError("Choose your years of professional experience.")'))
  assert.ok(src.includes("setError(`With under ${EXPERIENCE_STANDARD_YEARS} years, tell us where you've worked and what type of experience you have, so we can review your application.`)"))
})
