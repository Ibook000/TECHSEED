import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectRoot);

const demoDirectory = path.join(projectRoot, '.demo-data');
const databasePath = path.join(demoDirectory, 'db.json');
const passwordPath = path.join(demoDirectory, '.admin-password');
const markerPath = path.join(demoDirectory, '.demo-seeded');
const databaseExists = existsSync(databasePath);
const markerExists = existsSync(markerPath);

if ((databaseExists && !markerExists) || (!databaseExists && markerExists)) {
  throw new Error(
    'Refusing to use .demo-data because its database and demo marker do not match. ' +
    'Move or back up that directory before initializing demo data.'
  );
}

mkdirSync(demoDirectory, { recursive: true, mode: 0o700 });

let adminPassword;
if (existsSync(passwordPath)) {
  adminPassword = readFileSync(passwordPath, 'utf8').trim();
} else if (!databaseExists) {
  adminPassword = randomBytes(24).toString('base64url');
  writeFileSync(passwordPath, adminPassword + '\n', { flag: 'wx', mode: 0o600 });
} else {
  adminPassword = randomBytes(24).toString('base64url');
}

process.env.TECHSEED_DEMO_MODE = 'true';
process.env.TECHSEED_DATA_DIR = '';
process.env.ADMIN_DEFAULT_PASSWORD = adminPassword;
process.env.AUTH_TOKEN_SECRET = '';
process.env.HOST = '127.0.0.1';
process.env.PORT = process.env.TECHSEED_DEMO_PORT || '3000';
process.env.NODE_ENV = 'development';
process.env.TRUST_PROXY_HOPS = '0';
process.env.VITE_ORGANIZATION_NAME = 'xxxxx学院';
process.env.DISABLE_HMR = 'false';

// Keep the default demo self-contained and avoid unexpected external API calls or costs.
for (const name of [
  'OPENAI_API_KEY',
  'OPENAI_API_KEYS',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'FALLBACK_OPENAI_API_KEY',
  'FALLBACK_OPENAI_API_KEYS',
  'FALLBACK_OPENAI_BASE_URL',
  'FALLBACK_OPENAI_MODEL',
]) {
  process.env[name] = '';
}

if (!databaseExists) {
  const { db } = await import('../server/db/index.ts');
  seedDemoData(db);
  if (!db.changePassword('admin', adminPassword)) {
    throw new Error('Could not set the generated local demo administrator password.');
  }
  writeFileSync(
    markerPath,
    'Synthetic demo data was created by npm run demo. Remove this directory to reset the local demo.\n',
    { flag: 'wx', mode: 0o600 }
  );
  console.log('Created an isolated local database in .demo-data with synthetic demo applicants.');
}

console.log('TECHSEED local demo: http://127.0.0.1:' + process.env.PORT);
console.log('Admin username: admin');
if (!databaseExists) {
  console.log('Initial admin password: ' + adminPassword);
} else if (existsSync(passwordPath)) {
  console.log('Initial password is saved in .demo-data/.admin-password; use it only if you have not changed the admin password.');
} else {
  console.log('The saved initial password is missing; use the password you changed it to, or remove .demo-data to reset.');
}
console.log('Demo records are fictional. This launcher ignores AI provider settings from .env.');

const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.kill(signal));
}

server.once('error', (error) => {
  console.error('Could not start the local demo server:', error);
  process.exitCode = 1;
});

server.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

function seedDemoData(db) {
  const activeBatch = db.getActiveBatch();
  if (!activeBatch) {
    throw new Error('The demo database has no active recruitment batch.');
  }

  const samples = [
    {
      number: 1,
      finalStatus: 'REGISTERED',
      daysAgo: 1,
      direction: '暂时不确定',
      foundation: '完全没有',
    },
    {
      number: 2,
      finalStatus: 'AI_INTERVIEWING',
      daysAgo: 2,
      direction: 'Web 前端',
      foundation: '了解一点',
    },
    {
      number: 3,
      finalStatus: 'AI_COMPLETED',
      daysAgo: 4,
      direction: '后端',
      foundation: '有基础',
      scores: { learning: 76, initiative: 72, logic: 70, technology_interest: 80, communication: 70, technical_foundation: 60 },
    },
    {
      number: 4,
      finalStatus: 'MANUAL_PASSED',
      daysAgo: 6,
      direction: 'AI',
      foundation: '有基础',
      scores: { learning: 86, initiative: 84, logic: 82, technology_interest: 88, communication: 78, technical_foundation: 70 },
    },
    {
      number: 5,
      finalStatus: 'ADMITTED',
      daysAgo: 8,
      direction: '嵌入式',
      foundation: '可以独立写简单程序',
      scores: { learning: 93, initiative: 91, logic: 90, technology_interest: 94, communication: 84, technical_foundation: 82 },
    },
    {
      number: 6,
      finalStatus: 'MANUAL_REJECTED',
      daysAgo: 10,
      direction: '产品',
      foundation: '了解一点',
      scores: { learning: 58, initiative: 55, logic: 62, technology_interest: 68, communication: 70, technical_foundation: 48 },
    },
  ];

  for (const sample of samples) {
    const id = 'cand-demo-' + String(sample.number).padStart(2, '0');
    const registeredAt = daysAgo(sample.daysAgo);
    const candidate = {
      id,
      batchId: activeBatch.id,
      profile: {
        name: '演示候选人 ' + String(sample.number).padStart(2, '0'),
        studentId: 'DEMO-' + String(1000 + sample.number),
        major: '演示专业',
        className: '演示班级',
        phone: '00000000000',
        wechat: 'DEMO-ONLY-' + String(sample.number).padStart(2, '0'),
        technicalFoundation: sample.foundation,
        techDirection: sample.direction,
        selfIntro: '虚构演示档案，不对应真实个人。用于展示报名、面试和人工审核流程。',
      },
      privacyConsent: {
        version: 'registration-consent-v2',
        acceptedAt: registeredAt,
      },
      status: 'REGISTERED',
      registeredAt,
      updatedAt: registeredAt,
    };
    db.createCandidate(candidate);

    if (sample.finalStatus === 'REGISTERED') continue;

    db.updateCandidateStatus(id, 'AI_INTERVIEWING', '演示流程', '虚构演示档案进入 AI 面试');
    const completed = sample.finalStatus !== 'AI_INTERVIEWING';
    const startedAt = daysAgo(sample.daysAgo);
    const completedAt = completed ? daysAgo(Math.max(sample.daysAgo - 1, 0)) : undefined;
    const messages = [
      {
        id: 'msg-demo-' + sample.number + '-1',
        sender: 'ai',
        content: '你最近尝试过什么让你感兴趣的小工具？可以讲讲从哪里开始的吗？',
        timestamp: startedAt,
        round: 1,
        analysis: '演示数据：邀请候选人描述一个具体的尝试过程。',
      },
      {
        id: 'msg-demo-' + sample.number + '-2',
        sender: 'candidate',
        content: '[演示回答] 我先查看了入门文档，跟着一个小例子动手，再记录了遇到的问题。',
        timestamp: new Date(Date.parse(startedAt) + 60000).toISOString(),
        round: 1,
      },
      {
        id: 'msg-demo-' + sample.number + '-3',
        sender: 'ai',
        content: '这个过程中遇到的一个问题是什么？你是怎么继续排查的？',
        timestamp: new Date(Date.parse(startedAt) + 120000).toISOString(),
        round: 2,
        analysis: '演示数据：追问解决问题的步骤，不对候选人作性格推断。',
      },
    ];

    if (completed) {
      messages.push({
        id: 'msg-demo-' + sample.number + '-4',
        sender: 'candidate',
        content: '[演示回答] 我对比了报错信息和文档步骤，缩小了问题范围，并做了一个小的修正。',
        timestamp: new Date(Date.parse(startedAt) + 180000).toISOString(),
        round: 2,
      });
      messages.push({
        id: 'msg-demo-' + sample.number + '-5',
        sender: 'ai',
        content: '谢谢分享。之后如果继续探索，你会想尝试什么？',
        timestamp: new Date(Date.parse(startedAt) + 240000).toISOString(),
        round: 3,
        analysis: '演示数据：结束本轮交流，后续由管理员结合完整材料复核。',
      });
    }

    db.createInterview({
      id: 'intv-' + id,
      candidateId: id,
      batchId: activeBatch.id,
      status: completed ? 'COMPLETED' : 'INTERVIEWING',
      currentRound: completed ? 3 : 2,
      maxRounds: 5,
      messages,
      startedAt,
      completedAt,
      updatedAt: completedAt || startedAt,
    });

    if (!completed) continue;

    const evaluation = makeEvaluation(id, sample.number, sample.scores);
    db.saveEvaluation(evaluation);
    db.updateCandidateScores(id, evaluation.overallScore, evaluation.recommendation, evaluation.candidateType);
    db.updateCandidateStatus(id, 'AI_COMPLETED', '演示流程', '虚构演示面试已完成，AI 结果仅供人工复核');

    if (sample.finalStatus === 'MANUAL_PASSED' || sample.finalStatus === 'ADMITTED') {
      db.updateCandidateStatus(id, 'MANUAL_PASSED', '演示管理员', '演示人工审核通过');
      db.saveManualReview(makeManualReview(id, sample.number, 'PASSED', completedAt));
      if (sample.finalStatus === 'ADMITTED') {
        db.updateCandidateStatus(id, 'ADMITTED', '演示管理员', '演示录取状态');
      } else {
        db.addCandidateNote({
          id: 'note-demo-' + sample.number,
          candidateId: id,
          authorId: 'usr-admin-1',
          authorName: '演示管理员',
          content: '虚构演示备注：后续可安排一次团队协作交流。',
          createdAt: completedAt,
        });
      }
    } else if (sample.finalStatus === 'MANUAL_REJECTED') {
      db.updateCandidateStatus(id, 'MANUAL_REJECTED', '演示管理员', '演示人工审核结果');
      db.saveManualReview(makeManualReview(id, sample.number, 'REJECTED', completedAt));
    }
  }
}

function makeEvaluation(candidateId, number, scores) {
  const weighted =
    scores.learning * 0.25 +
    scores.initiative * 0.2 +
    scores.logic * 0.2 +
    scores.technology_interest * 0.15 +
    scores.communication * 0.1 +
    scores.technical_foundation * 0.1;
  const overallScore = Math.round(weighted);
  const recommendation = overallScore >= 90 ? 'S' : overallScore >= 80 ? 'A' : overallScore >= 70 ? 'B' : 'C';

  return {
    id: 'eval-demo-' + number,
    candidateId,
    overallScore,
    recommendation,
    candidateType: '虚构演示记录 · 仅用于展示报告结构',
    scores,
    quality: {
      authenticity_score: 50,
      specificity_score: 70,
      consistency_score: 70,
    },
    strengths: ['演示回答描述了查看资料和排查问题的步骤'],
    risks: ['需要通过后续交流进一步了解实际项目细节'],
    summary: '虚构演示报告：根据示例问答整理出的结构化初筛信息。',
    recommendationReason: '本报告仅用于演示界面；实际招新决定应结合证据并由管理员人工审核。',
    antiTemplateFlag: false,
    evaluationSource: 'heuristic',
    evaluatedAt: new Date().toISOString(),
  };
}

function makeManualReview(candidateId, number, result, reviewedAt) {
  return {
    id: 'review-demo-' + number,
    candidateId,
    reviewerId: 'usr-admin-1',
    reviewerName: '演示管理员',
    result,
    technicalRating: result === 'PASSED' ? 4 : 2,
    communicationRating: 3,
    teamworkRating: result === 'PASSED' ? 4 : 3,
    potentialRating: 4,
    overallEvaluation: '虚构演示审核记录：此处展示人工决定与说明，不代表真实候选人。',
    internalComments: '演示数据，仅用于查看后台流程。',
    reviewedAt,
  };
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}
