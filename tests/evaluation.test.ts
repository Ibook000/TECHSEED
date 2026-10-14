import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CandidateProfile, CapabilityScores, InterviewMessage } from '../src/types.js';
import {
  calculateOverallScore,
  createHeuristicEvaluation,
  gradeForScore,
  hasCandidateAnswers,
  isInvalidAnswer,
  readOptionalScore,
  readRequiredScore,
  redactKnownProfileIdentifiers,
} from '../server/services/evaluation.js';

const profile: CandidateProfile = {
  name: '林同学',
  studentId: '20261001',
  major: '计算机科学',
  className: '26计科1班',
  phone: '138 0013 8000',
  wechat: 'lin-tech-2026',
  technicalFoundation: '完全没有',
  techDirection: 'Web 前端',
  selfIntro: '希望了解开源项目',
};

function message(sender: InterviewMessage['sender'], content: string): InterviewMessage {
  return { id: `message-${sender}`, sender, content, timestamp: '2026-01-01T00:00:00.000Z' };
}

test('requires at least one non-empty candidate answer before evaluating an interview', () => {
  assert.equal(hasCandidateAnswers([message('ai', '请介绍一个你做过的项目')]), false);
  assert.equal(hasCandidateAnswers([message('candidate', '   ')]), false);
  assert.equal(hasCandidateAnswers([message('candidate', '我尝试查阅官方文档')]), true);
  assert.throws(() => createHeuristicEvaluation('candidate-1', profile, []), /without a candidate answer/);
});

test('clamps model scores and rejects missing required scores', () => {
  assert.equal(readRequiredScore(-3), 0);
  assert.equal(readRequiredScore(80.6), 81);
  assert.equal(readRequiredScore(108), 100);
  assert.throws(() => readRequiredScore(undefined), /missing or invalid/);
  assert.throws(() => readRequiredScore(Number.NaN), /missing or invalid/);
  assert.equal(readOptionalScore('not-a-score', 42), 42);
  assert.equal(readOptionalScore(120), 100);
});

test('uses the documented weights and grade boundaries', () => {
  const zeroScores: CapabilityScores = {
    learning: 0,
    initiative: 0,
    logic: 0,
    technology_interest: 0,
    communication: 0,
    technical_foundation: 0,
  };
  assert.equal(calculateOverallScore(zeroScores), 0);
  assert.equal(calculateOverallScore({ ...zeroScores, learning: 100 }), 25);
  assert.equal(calculateOverallScore({ ...zeroScores, learning: 100, initiative: 100, logic: 100, technology_interest: 100, communication: 100, technical_foundation: 100 }), 100);
  assert.equal(gradeForScore(90), 'S');
  assert.equal(gradeForScore(89), 'A');
  assert.equal(gradeForScore(80), 'A');
  assert.equal(gradeForScore(79), 'B');
  assert.equal(gradeForScore(70), 'B');
  assert.equal(gradeForScore(69), 'C');
});

test('redacts profile identifiers even when punctuation is formatted differently', () => {
  const raw = '我是林同学，学号 20261001，电话 138-0013-8000，微信 lin-tech-2026。';
  const redacted = redactKnownProfileIdentifiers(raw, profile);

  assert.doesNotMatch(redacted, /林同学|20261001|138[- ]?0013|lin-tech-2026/);
  assert.equal((redacted.match(/\[已隐藏\]/g) ?? []).length, 4);
});

test('treats unreadable text as insufficient evidence without labeling it dishonest', () => {
  assert.equal(isInvalidAnswer('!!!???'), true);
  assert.equal(isInvalidAnswer('啊啊啊啊啊啊啊'), true);
  assert.equal(isInvalidAnswer('我尝试查阅了官方文档并定位配置问题。'), false);

  const evaluation = createHeuristicEvaluation('candidate-2', profile, [message('candidate', '!!!???')]);
  assert.equal(evaluation.evaluationSource, 'heuristic');
  assert.equal(evaluation.antiTemplateFlag, false);
  assert.match(evaluation.candidateType, /信息不足/);
  assert.match(evaluation.recommendationReason, /不据此作淘汰判断/);
});

test('fallback only raises dimensions when it sees observable evidence', () => {
  const evaluation = createHeuristicEvaluation('candidate-3', profile, [
    message('candidate', '我查阅了官方文档，后来遇到配置报错，就尝试定位原因并修改。'),
  ]);

  assert.equal(evaluation.scores.learning, 80);
  assert.equal(evaluation.scores.initiative, 80);
  assert.equal(evaluation.scores.logic, 80);
  assert.equal(evaluation.scores.technology_interest, 70);
  assert.equal(evaluation.scores.communication, 70);
  assert.equal(evaluation.antiTemplateFlag, false);
});
