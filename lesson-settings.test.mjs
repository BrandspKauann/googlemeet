import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createCloudHandler} from './cloud/handler.mjs';
import {lessonSettings, publicLessonSettings, updateLessonSettings} from './cloud/lesson-settings.mjs';

test('official lesson clock starts independently, pauses and resumes without counting the break', () => {
  const created = Date.parse('2026-11-23T10:00:00Z'), start = created + 15 * 60_000;
  const defaults = lessonSettings(); assert.equal(defaults.status, 'idle'); assert.equal(defaults.captionsEnabled, true);
  const running = updateLessonSettings(defaults, {action: 'start', durationMinutes: 60}, start);
  assert.equal(running.startedAt, new Date(start).toISOString()); assert.equal(running.elapsedMs, 0);
  assert.deepEqual(updateLessonSettings(running, {action: 'start'}, start + 10_000), running);
  const paused = updateLessonSettings(running, {action: 'pause'}, start + 90_000);
  assert.equal(paused.elapsedMs, 90_000); assert.equal(paused.runningSince, null);
  const resumed = updateLessonSettings(paused, {action: 'resume'}, start + 300_000);
  const pausedAgain = updateLessonSettings(resumed, {action: 'pause'}, start + 360_000);
  assert.equal(pausedAgain.elapsedMs, 150_000); assert.equal(pausedAgain.startedAt, running.startedAt);
  const reset = updateLessonSettings(pausedAgain, {action: 'reset'}, start + 400_000);
  assert.equal(reset.elapsedMs, 0); assert.equal(reset.startedAt, null); assert.equal(reset.durationMinutes, 60);
  assert.equal(publicLessonSettings(reset, created).serverNow, new Date(created).toISOString());
});

test('lesson settings reject forged client clock fields and bounded invalid durations', () => {
  for (const patch of [{}, null, [], {elapsedMs: 100}, {serverNow: 'forged'}, {action: 'end'}, {durationMinutes: 4}, {durationMinutes: 241}, {durationMinutes: 50.5}, {durationMinutes: '50'}, {captionsEnabled: 'false'}]) {
    assert.throws(() => updateLessonSettings({}, patch), error => error.status === 400);
  }
  assert.equal(updateLessonSettings({}, {captionsEnabled: false}).captionsEnabled, false);
  assert.equal(lessonSettings({elapsedMs: -1, durationMinutes: 999, status: 'running', runningSince: 'not-a-date'}).elapsedMs, 0);
});

test('teacher controls persist across sessions; students cannot bill while captions are disabled', async () => {
  const db = new PGlite(), schema = fs.readFileSync(new URL('./db/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema); await db.exec(schema);
  const calls = {soniox: 0, asr: 0, translate: 0, usage: []};
  const sonioxRelay = {configured: () => true, session: async () => {calls.soniox++; return {apiKey: 'temporary-key'};}, usage: async room => {calls.usage.push(room.id); return {available: true, estimated: true, totalUsd: 0};}};
  const asrRelay = {configured: () => true, transcribe: async () => {calls.asr++; return {text: '你好'};}};
  const translationRelay = {configured: () => true, translate: async () => {calls.translate++; return {text: 'Olá'};}};
  const server = http.createServer(createCloudHandler(() => db, {sonioxRelay, asrRelay, translationRelay}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/';
  const req = (route, data, headers = {}) => fetch(endpoint + route, {method: data === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: data === undefined ? undefined : JSON.stringify(data)});
  try {
    const auth = await req('auth', {mode: 'register', name: 'Teacher', email: 'lesson-settings@example.test', password: 'test-password'});
    const cookie = auth.headers.get('set-cookie').split(';')[0];
    const room = await (await req('rooms', {language: 'zh', targetLanguage: 'pt'}, {Cookie: cookie})).json();
    const route = 'rooms/' + room.id, teacher = {Authorization: 'Bearer ' + room.token};
    const authOther = await req('auth', {mode: 'register', name: 'Other teacher', email: 'lesson-isolation@example.test', password: 'another-password'});
    const otherCookie = authOther.headers.get('set-cookie').split(';')[0];
    const otherRoom = await (await req('rooms', {language: 'pt', targetLanguage: 'zh'}, {Cookie: otherCookie})).json();
    const otherRoute = 'rooms/' + otherRoom.id, otherTeacher = {Authorization: 'Bearer ' + otherRoom.token};
    assert.equal((await req(route + '/lesson', {captionsEnabled: false}, otherTeacher)).status, 401);
    assert.equal((await req(otherRoute + '/lesson', {action: 'start'}, teacher)).status, 401);
    assert.equal((await req(route + '/usage', undefined, otherTeacher)).status, 401);
    assert.equal((await req(otherRoute + '/usage', undefined, teacher)).status, 401);
    const joined = await (await req(route + '/join', {name: 'Student'})).json(), student = {Authorization: 'Bearer ' + joined.token};
    assert.equal(room.lesson.captionsEnabled, true); assert.equal(room.lesson.status, 'idle');
    assert.equal((await req(route + '/lesson', {action: 'start'}, student)).status, 403);
    await req(route + '/admit', {id: joined.you.id, accept: true}, teacher);
    assert.equal((await req(route + '/lesson', {action: 'start'}, student)).status, 403);
    assert.equal((await req(route + '/lesson', undefined, teacher)).status, 405);
    assert.equal((await req(route + '/usage', undefined, student)).status, 403);
    assert.equal((await req(route + '/usage', {}, teacher)).status, 405);
    assert.equal((await req(route + '/usage', undefined, teacher)).status, 200); assert.deepEqual(calls.usage, [room.id]);
    assert.equal((await req(route + '/lesson', {durationMinutes: 0}, teacher)).status, 400);
    const started = await (await req(route + '/lesson', {action: 'start', durationMinutes: 60}, teacher)).json();
    assert.equal(started.lesson.status, 'running'); assert.ok(Date.parse(started.lesson.serverNow) >= Date.parse(started.lesson.startedAt));
    const [off, duration] = await Promise.all([req(route + '/lesson', {captionsEnabled: false}, teacher), req(route + '/lesson', {durationMinutes: 50}, teacher)]);
    assert.equal(off.status, 200); assert.equal(duration.status, 200);
    const state = await (await req(route + '/state', undefined, student)).json();
    assert.equal(state.lesson.captionsEnabled, false); assert.equal(state.lesson.durationMinutes, 50); assert.equal(state.lesson.status, 'running');
    const otherBefore = await (await req(otherRoute + '/state', undefined, otherTeacher)).json();
    assert.equal(otherBefore.lesson.captionsEnabled, true); assert.equal(otherBefore.lesson.status, 'idle');
    await req(otherRoute + '/lesson', {action: 'start', durationMinutes: 120}, otherTeacher);
    for (const path of ['soniox', 'asr', 'translate']) assert.equal((await req(route + '/' + path, path === 'translate' ? {text: '你好', source: 'zh'} : {}, student)).status, 403);
    assert.equal(calls.soniox + calls.asr + calls.translate, 0);
    const persisted = (await db.query('SELECT lesson_settings FROM ag_rooms WHERE id=$1', [room.id])).rows[0].lesson_settings;
    assert.equal(persisted.captionsEnabled, false); assert.equal(persisted.serverNow, undefined);
    await req(route + '/lesson', {action: 'pause'}, teacher);
    const paused = await (await req(route + '/state', undefined, teacher)).json(); assert.equal(paused.lesson.status, 'paused');
    await req(route + '/lesson', {action: 'resume', captionsEnabled: true}, teacher);
    assert.equal((await req(route + '/soniox', {}, student)).status, 200); assert.equal(calls.soniox, 1);
    await req(route + '/lesson', {action: 'reset'}, teacher);
    assert.equal((await (await req(route + '/state', undefined, teacher)).json()).lesson.status, 'idle');
    const otherAfter = await (await req(otherRoute + '/state', undefined, otherTeacher)).json();
    assert.equal(otherAfter.lesson.status, 'running'); assert.equal(otherAfter.lesson.durationMinutes, 120); assert.equal(otherAfter.lesson.captionsEnabled, true);
    await db.query('UPDATE ag_rooms SET ended_at=now() WHERE id=$1', [room.id]);
    assert.equal((await req(route + '/lesson', {action: 'start'}, teacher)).status, 409);
  } finally {await new Promise(resolve => server.close(resolve)); await db.close();}
});
