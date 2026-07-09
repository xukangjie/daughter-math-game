const STORAGE_KEY = "math_app_progress_v1";
const AUDIO_BASE_PATH = "assets/audio/";
const AUDIO_LIBRARY = {
  correct: ["correct-1", "correct-2", "correct-3", "correct-4", "correct-5"],
  tryAgain: ["try-again-1", "try-again-2", "try-again-3", "try-again-4", "try-again-5"],
  reward3: ["reward-3", "reward-3-1"],
  reward5: ["reward-5", "reward-5-1"],
  reward10: ["reward-10", "reward-10-1"],
  teachEnd: ["teach-end-1", "teach-end-2", "teach-end-3", "teach-end-4", "teach-end-5"]
};
const AUDIO_EXTENSIONS = ["mp3", "m4a", "wav"];
const missingAudioFiles = new Set();
let activeAudio = null;
let progressRenderSignature = "";

const games = {
  practice: { label: "魔法算式屋", skill: "20以内加减" },
  count: { label: "点点花田", skill: "数数量" },
  add: { label: "水果小篮", skill: "加法理解" },
  subtract: { label: "饼干小铺", skill: "减法理解" },
  make10: { label: "数字小屋", skill: "10以内分合" },
  shape: { label: "图形收纳站", skill: "图形分类" }
};

const profileLimits = {
  sister: { maxCount: 20, maxAdd: 20, maxSubtract: 20, games: ["practice"] },
  younger: { maxCount: 10, maxAdd: 10, maxSubtract: 10, games: ["count", "shape"] },
  play: { maxCount: 12, maxAdd: 10, maxSubtract: 10, games: ["count", "add", "subtract", "shape"] }
};

const state = {
  profile: "sister",
  game: "practice",
  round: 1,
  roundTotal: 6,
  parentTips: false,
  isAdvancing: false,
  animationToken: 0,
  session: createSession(),
  celebratedCorrectCounts: new Set(),
  currentQuestion: null,
  progress: loadProgress()
};

const els = {
  parentToggle: document.querySelector("#parentToggle"),
  profileCards: document.querySelectorAll(".profile-card"),
  gameTiles: document.querySelectorAll(".game-tile"),
  gameLabel: document.querySelector("#gameLabel"),
  roundLabel: document.querySelector("#roundLabel"),
  sceneBadge: document.querySelector("#sceneBadge"),
  promptKicker: document.querySelector("#promptKicker"),
  questionText: document.querySelector("#questionText"),
  visualStage: document.querySelector("#visualStage"),
  typedAnswerPanel: document.querySelector("#typedAnswerPanel"),
  answerInput: document.querySelector("#answerInput"),
  numberPad: document.querySelector("#numberPad"),
  checkBtn: document.querySelector("#checkBtn"),
  answerGrid: document.querySelector("#answerGrid"),
  feedback: document.querySelector("#feedback"),
  teachCard: document.querySelector("#teachCard"),
  teachTitle: document.querySelector("#teachTitle"),
  animationStage: document.querySelector("#animationStage"),
  stepCaption: document.querySelector("#stepCaption"),
  teachVisual: document.querySelector("#teachVisual"),
  teachSteps: document.querySelector("#teachSteps"),
  replayTeachBtn: document.querySelector("#replayTeachBtn"),
  helperNote: document.querySelector("#helperNote"),
  skipBtn: document.querySelector("#skipBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  summaryTitle: document.querySelector("#summaryTitle"),
  summaryText: document.querySelector("#summaryText"),
  progressBars: document.querySelector("#progressBars"),
  sessionStats: document.querySelector("#sessionStats"),
  todayStats: document.querySelector("#todayStats"),
  wrongCount: document.querySelector("#wrongCount"),
  wrongBookList: document.querySelector("#wrongBookList"),
  operatorKeys: document.querySelectorAll("[data-operator-key]"),
  compareKeys: document.querySelectorAll("[data-compare-key]")
};

function defaultProgress() {
  return {
    profile: "sister",
    daily: {},
    wrongBook: [],
    sessions: [],
    skills: Object.fromEntries(
      Object.keys(games).map((key) => [key, { attempts: 0, supported: 0 }])
    )
  };
}

function loadProgress() {
  const base = defaultProgress();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return base;
    return {
      ...base,
      ...saved,
      daily: { ...base.daily, ...(saved.daily || {}) },
      wrongBook: Array.isArray(saved.wrongBook) ? saved.wrongBook : [],
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      skills: { ...base.skills, ...(saved.skills || {}) }
    };
  } catch (error) {
    console.warn("Progress could not be loaded.", error);
    return base;
  }
}

function saveProgress() {
  state.progress.profile = state.profile;
  upsertCurrentSession();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function createSession() {
  const now = new Date();
  return {
    id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    date: dateKey(now),
    startedAt: now.toISOString(),
    attempts: 0,
    correct: 0,
    wrong: 0
  };
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeLabel(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function emptyRecord() {
  return { attempts: 0, correct: 0, wrong: 0 };
}

function upsertCurrentSession() {
  const sessions = Array.isArray(state.progress.sessions) ? state.progress.sessions : [];
  const index = sessions.findIndex((session) => session.id === state.session.id);
  const snapshot = { ...state.session };
  if (index >= 0) {
    sessions[index] = snapshot;
  } else {
    sessions.unshift(snapshot);
  }
  state.progress.sessions = sessions.slice(0, 30);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function clampChoice(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildChoices(answer, min, max, labels) {
  if (labels) return shuffle(labels);
  const choices = new Set([answer]);
  while (choices.size < 4) {
    choices.add(clampChoice(answer + randInt(-4, 4), min, max));
  }
  return shuffle([...choices]);
}

function numberToChinese(value) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 20) return String(value);
  if (number < 10) return digits[number];
  if (number === 10) return "十";
  if (number < 20) return `十${digits[number - 10]}`;
  return "二十";
}

function formatSpeechText(text) {
  return text
    .replace(/\d+/g, (match) => numberToChinese(match))
    .replace(/\+/g, "加")
    .replace(/-/g, "减")
    .replace(/=/g, "等于")
    .replace(/\?/g, "几");
}

function pickChineseVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const chineseVoices = voices.filter((voice) => /zh|cmn|mandarin/i.test(`${voice.lang} ${voice.name}`));
  if (!chineseVoices.length) return null;
  const priorities = [
    /xiaoxiao/i,
    /xiaoyi/i,
    /xiaobei/i,
    /ting-?ting/i,
    /meijia/i,
    /female/i,
    /普通话|国语/i,
    /zh-cn/i
  ];
  return [...chineseVoices].sort((a, b) => {
    const score = (voice) => {
      const haystack = `${voice.name} ${voice.lang}`;
      const index = priorities.findIndex((pattern) => pattern.test(haystack));
      return index === -1 ? priorities.length : index;
    };
    return score(a) - score(b);
  })[0];
}

function speakText(text, onDone, options = {}) {
  const done = once(onDone);
  const spokenText = formatSpeechText(text);
  const fallbackMs = options.fallbackMs || Math.max(2400, spokenText.length * 260);
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    window.setTimeout(done, fallbackMs);
    return;
  }
  const utterance = new window.SpeechSynthesisUtterance(spokenText);
  utterance.lang = "zh-CN";
  utterance.rate = options.rate || 0.9;
  utterance.pitch = options.pitch || 1.02;
  const voice = pickChineseVoice();
  if (voice) utterance.voice = voice;
  const fallback = window.setTimeout(done, fallbackMs);
  utterance.onend = () => {
    window.clearTimeout(fallback);
    done();
  };
  utterance.onerror = () => {
    window.clearTimeout(fallback);
    done();
  };
  if (options.cancel !== false) window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function audioKindForMilestone(correctCount) {
  return `reward${correctCount}`;
}

function audioCandidates(kind) {
  const names = AUDIO_LIBRARY[kind] || [];
  const files = [];
  names.forEach((name) => {
    AUDIO_EXTENSIONS.forEach((extension) => {
      const src = `${AUDIO_BASE_PATH}${name}.${extension}`;
      if (!missingAudioFiles.has(src)) files.push(src);
    });
  });
  return files;
}

function stopActiveAudio() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.src = "";
  activeAudio = null;
}

function playLocalAudio(kind, onDone, onFallback) {
  const done = once(onDone);
  const fallbackToSpeech = once(onFallback);
  if (typeof window.Audio !== "function") return false;
  const candidates = shuffle(audioCandidates(kind));
  if (!candidates.length) return false;

  stopActiveAudio();
  const startedAt = Date.now();
  const tryNext = () => {
    const src = candidates.shift();
    if (!src || Date.now() - startedAt > 1800) {
      fallbackToSpeech();
      return;
    }

    const audio = new window.Audio(src);
    let fallback;
    const finish = () => {
      window.clearTimeout(fallback);
      if (activeAudio === audio) activeAudio = null;
      done();
    };
    const miss = () => {
      missingAudioFiles.add(src);
      window.clearTimeout(fallback);
      if (activeAudio === audio) activeAudio = null;
      tryNext();
    };

    activeAudio = audio;
    audio.preload = "auto";
    audio.onended = finish;
    audio.onerror = miss;
    fallback = window.setTimeout(finish, 4500);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(miss);
    }
  };

  tryNext();
  return true;
}

function playFeedback(kind, onDone) {
  if (playLocalAudio(kind, onDone, () => speakFeedback(kind, onDone))) return;
  speakFeedback(kind, onDone);
}

function speakFeedback(kind, onDone) {
  const phrases = {
    correct: [
      "叮咚，小星星亮起来啦！",
      "哇，答对啦，数字朋友很开心！",
      "太好啦，这题你自己想出来了！",
      "答对啦，我们去下一扇小门！"
    ],
    tryAgain: [
      "没关系，我们慢慢来。",
      "小灯泡会帮忙，再试一次。",
      "别着急，换个方法想一想。"
    ],
    teachEnd: [
      "现在你再写一次试试。",
      "看完方法啦，自己算一算吧。",
      "不着急，按刚才的方法来。"
    ]
  };
  const options = phrases[kind] || phrases.tryAgain;
  speakText(options[randInt(0, options.length - 1)], onDone, {
    fallbackMs: kind === "correct" ? 2200 : 2600,
    rate: 0.94,
    pitch: 1.02
  });
}

function speakMilestone(correctCount, onDone) {
  const phrases = {
    3: [
      "哇塞，已经点亮三颗小星星啦！",
      "太棒啦，三道小任务都被你想出来了！"
    ],
    5: [
      "哇塞，已经点亮五颗小星星啦，加油加油！",
      "五道小任务完成啦，小脑袋转得真快！"
    ],
    10: [
      "太厉害啦，今天已经点亮十颗小星星了！",
      "十道小任务完成啦，给自己一个大大的鼓励！"
    ]
  };
  const options = phrases[correctCount];
  if (!options) {
    if (typeof onDone === "function") onDone();
    return;
  }
  speakText(options[randInt(0, options.length - 1)], onDone, {
    fallbackMs: 3200,
    rate: 0.92,
    pitch: 1.02
  });
}

function playMilestone(correctCount, onDone) {
  if (playLocalAudio(audioKindForMilestone(correctCount), onDone, () => speakMilestone(correctCount, onDone))) return;
  speakMilestone(correctCount, onDone);
}

function getPendingMilestone() {
  const correctCount = state.session.correct;
  const milestones = [3, 5, 10];
  const matched = milestones.find((count) => count === correctCount && !state.celebratedCorrectCounts.has(count));
  if (matched) state.celebratedCorrectCounts.add(matched);
  return matched || null;
}

function speakStep(text, onDone) {
  const spokenText = formatSpeechText(text);
  speakText(text, onDone, { rate: 0.78, pitch: 1.03, fallbackMs: Math.max(5200, spokenText.length * 520) });
}

function once(callback) {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    if (typeof callback === "function") callback();
  };
}

function makeQuestion() {
  resetTypedAdvanceState();
  const limits = profileLimits[state.profile];
  if (!limits.games.includes(state.game)) {
    state.game = limits.games[0];
  }

  const makers = {
    practice: makePracticeQuestion,
    count: makeCountQuestion,
    add: makeAddQuestion,
    subtract: makeSubtractQuestion,
    make10: makeMake10Question,
    shape: makeShapeQuestion
  };

  state.currentQuestion = makers[state.game]();
  render();
}

function resetTypedAdvanceState() {
  state.isAdvancing = false;
  state.animationToken += 1;
  if (!els.answerInput || !els.checkBtn) return;
  els.answerInput.readOnly = false;
  els.checkBtn.disabled = false;
  els.checkBtn.textContent = "送出";
}

function makePracticeQuestion() {
  const roll = Math.random();
  if (roll < 0.23) return makeEquationAddQuestion();
  if (roll < 0.46) return makeEquationSubtractQuestion();
  if (roll < 0.64) return makeMissingAddendQuestion();
  if (roll < 0.8) return makeMissingSubtrahendQuestion();
  if (roll < 0.9) return makeMissingOperatorQuestion();
  return makeCompareQuestion();
}

function makeEquationAddQuestion() {
  const useMakeTen = Math.random() < 0.7;
  let left;
  let right;

  if (useMakeTen) {
    left = randInt(6, 9);
    right = randInt(10 - left + 1, 9);
  } else {
    left = randInt(3, 9);
    right = randInt(1, Math.min(9, 20 - left));
  }

  const answer = left + right;
  const toTen = Math.max(0, 10 - left);
  const rest = right - toTen;
  const useCountOn = answer <= 10 || right <= 4;
  const strategyName = useCountOn ? "接着数" : "凑十法";
  const teachSteps = useCountOn
    ? [
        `从比较大的数 ${left} 开始。`,
        `伸出手指往后数 ${right} 个。`,
        "停在哪个数，就把那个数写进答案框。"
      ]
    : [
        `${left} 离 10 还差 ${toTen}。`,
        `把 ${right} 分成 ${toTen} 和 ${rest}。`,
        `${left} + ${toTen} = 10。`,
        `再想 10 + ${rest} 是多少，自己写出来。`
      ];

  return {
    type: "equation",
    operation: "add",
    left,
    right,
    answer,
    expression: `${left} + ${right} = ?`,
    choices: buildChoices(answer, 0, 20),
    kicker: "魔法算式屋",
    text: "帮数字朋友打开这扇小门，把答案写进小窗。",
    feedback: `小门打开啦：${left} + ${right} = ${answer}。`,
    tryAgain: "小门还没打开，我们点亮方法小灯泡。",
    strategyName,
    teachSteps,
    visualModel: useCountOn ? "countOn" : "makeTen",
    animationPlan: useCountOn
      ? buildCountOnPlan(left, right, answer)
      : buildMakeTenPlan(left, right, answer),
    helper: "家长提示：先让孩子自己写答案；答错时只说“看看小灯泡”，不急着批评。"
  };
}

function makeEquationSubtractQuestion() {
  const useBreakTen = Math.random() < 0.7;
  let start;
  let gone;

  if (useBreakTen) {
    start = randInt(11, 18);
    gone = randInt(start - 10 + 1, Math.min(9, start));
  } else {
    start = randInt(5, 20);
    gone = randInt(1, Math.min(5, start));
  }

  const answer = start - gone;
  const toTen = Math.max(0, start - 10);
  const rest = gone - toTen;
  const useThinkAdd = answer >= 5 && gone >= 5 && Math.random() < 0.45;
  const strategyName = useThinkAdd ? "想加算减" : useBreakTen ? "破十法" : "往回数";
  const teachSteps = useThinkAdd
    ? [
        `把 ${start} - ${gone} 想成：${gone} + ? = ${start}。`,
        `${gone} 先加到 10，需要 ${10 - gone}。`,
        `10 再加到 ${start}，需要 ${start - 10}。`,
        "把两次补上的数合起来，再写进答案框。"
      ]
    : useBreakTen
      ? [
          `${start} 先减 ${toTen}，正好到 10。`,
          `${gone} 已经减了 ${toTen}，还要再减 ${rest}。`,
          `再想 10 - ${rest} 是多少，自己写出来。`
        ]
      : [
          `从 ${start} 开始往回数。`,
          `伸出手指往回数 ${gone} 个。`,
          "停在哪个数，就把那个数写进答案框。"
        ];

  return {
    type: "equation",
    operation: "subtract",
    left: start,
    right: gone,
    answer,
    expression: `${start} - ${gone} = ?`,
    choices: buildChoices(answer, 0, 20),
    kicker: "饼干小铺",
    text: "小饼干被拿走了一些，帮小店数一数还剩多少。",
    feedback: `数清楚啦：${start} - ${gone} = ${answer}。`,
    tryAgain: "先别急，我们点亮方法小灯泡。",
    strategyName,
    teachSteps,
    visualModel: useThinkAdd ? "thinkAdd" : useBreakTen ? "breakTen" : "countBack",
    animationPlan: useThinkAdd
      ? buildThinkAddPlan(gone, answer, start)
      : useBreakTen
        ? buildBreakTenPlan(start, gone, answer)
        : buildCountBackPlan(start, gone, answer),
    helper: "家长提示：如果孩子卡住，可以让她说“先到 10，再算剩下”。"
  };
}

function makeMissingAddendQuestion() {
  const left = randInt(11, 18);
  const answer = randInt(1, Math.min(8, 20 - left));
  const total = left + answer;
  const sequence = makeCountingSequence(left + 1, total);

  return {
    type: "equation",
    operation: "missingAddend",
    left,
    right: total,
    answer,
    expression: `${left} + ? = ${total}`,
    choices: buildChoices(answer, 0, 20),
    kicker: "寻找藏起来的数",
    text: "问号躲起来了，从前面的数走到后面的数，找找它是几。",
    feedback: `找到了：${left} + ${answer} = ${total}。`,
    tryAgain: "问号还在藏，我们沿着数字路再找一次。",
    strategyName: "接着数找缺数",
    teachSteps: [
      `从 ${left} 开始，看要到 ${total}。`,
      `一个一个往后数：${sequence.join("、")}。`,
      "数了几步，问号就是几。请自己写出来。"
    ],
    visualModel: "missingAddend",
    animationPlan: buildFindAddendPlan(left, total, answer),
    helper: "家长提示：把“加几等于”说成“从前面的数走到后面的数，要走几步”。"
  };
}

function makeMissingSubtrahendQuestion() {
  const remaining = randInt(5, 10);
  const answer = randInt(3, 9);
  const start = remaining + answer;

  return {
    type: "equation",
    operation: "missingSubtrahend",
    left: start,
    right: remaining,
    answer,
    expression: `${start} - ? = ${remaining}`,
    choices: buildChoices(answer, 0, 20),
    kicker: "拿走了几块",
    text: "小饼干少了一些，问号就是被拿走的数量。",
    feedback: `找到了：${start} - ${answer} = ${remaining}。`,
    tryAgain: "我们把它换成加法小路走一走。",
    strategyName: "想加算减",
    teachSteps: [
      `把 ${start} - ? = ${remaining} 想成：${remaining} + ? = ${start}。`,
      `${remaining} 先补到 10，需要 ${10 - remaining}。`,
      `10 再补到 ${start}，需要 ${start - 10}。`,
      "把两次补上的数合起来，就是问号。请自己写出来。"
    ],
    visualModel: "missingSubtrahend",
    animationPlan: buildThinkAddPlan(remaining, answer, start),
    helper: "家长提示：这类题不要硬背减法，先问“剩下的数再加几个能回到原来的数？”"
  };
}

function makeMissingOperatorQuestion() {
  const useSubtract = Math.random() < 0.55;
  let left;
  let right;
  let result;
  let answer;

  if (useSubtract) {
    left = randInt(10, 19);
    right = randInt(2, Math.min(9, left));
    result = left - right;
    answer = "-";
  } else {
    left = randInt(5, 12);
    right = randInt(2, Math.min(9, 20 - left));
    result = left + right;
    answer = "+";
  }

  const grows = result > left;
  return {
    type: "equation",
    operation: "missingOperator",
    answerKind: "operator",
    left,
    right,
    result,
    answer,
    expression: `${left} ? ${right} = ${result}`,
    kicker: "符号小侦探",
    text: "中间的符号躲起来了，看数字变多还是变少。",
    feedback: `小侦探找对啦：${left} ${answer} ${right} = ${result}。`,
    tryAgain: "先看结果变多还是变少，小侦探再试一次。",
    strategyName: "看变化找符号",
    teachSteps: grows
      ? [
          `先看第一个数 ${left}。`,
          `最后变成 ${result}，结果比 ${left} 大。`,
          "数变多了，想一想应该用表示合起来的符号。"
        ]
      : [
          `先看第一个数 ${left}。`,
          `最后变成 ${result}，结果比 ${left} 小。`,
          "数变少了，想一想应该用表示拿走的符号。"
        ],
    visualModel: "missingOperator",
    animationPlan: buildFindOperatorPlan(left, right, result, grows),
    helper: "家长提示：这类题先不算答案，先问孩子“结果变大还是变小”。"
  };
}

function makeCompareQuestion() {
  const leftQuestion = Math.random() < 0.5 ? makeEquationAddQuestion() : makeEquationSubtractQuestion();
  const leftValue = leftQuestion.answer;
  const calcOperator = leftQuestion.operation === "add" ? "+" : "-";
  const mode = randInt(0, 2);
  let rightValue;
  if (mode === 0) {
    rightValue = leftValue;
  } else if (mode === 1) {
    rightValue = randInt(0, Math.max(0, leftValue - 1));
  } else {
    rightValue = randInt(Math.min(20, leftValue + 1), 20);
  }
  const answer = leftValue > rightValue ? ">" : leftValue < rightValue ? "<" : "=";

  return {
    type: "equation",
    operation: "compare",
    answerKind: "compare",
    left: leftQuestion.left,
    right: leftQuestion.right,
    calcOperator,
    compareTarget: rightValue,
    answer,
    expression: `${leftQuestion.left} ${calcOperator} ${leftQuestion.right} ? ${rightValue}`,
    kicker: "天平比大小",
    text: "先算左边，再看看天平应该往哪边倒。",
    feedback: `天平摆好啦：${leftQuestion.left} ${calcOperator} ${leftQuestion.right} ${answer} ${rightValue}。`,
    tryAgain: "先把左边算出来，再放到天平上比一比。",
    strategyName: "先算再比较",
    teachSteps: [
      `先只看左边：${leftQuestion.left} ${calcOperator} ${leftQuestion.right}。`,
      `把左边算出来以后，再和右边的 ${rightValue} 比。`,
      "左边大，就写 >；左边小，就写 <；一样大，就写 =。"
    ],
    visualModel: "compare",
    animationPlan: buildComparePlan(leftQuestion.left, leftQuestion.right, leftQuestion.operation, rightValue),
    helper: "家长提示：这类题先遮住比较符号，让孩子只算左边，再问“左边和右边谁大”。"
  };
}

function buildMakeTenPlan(left, right, answer) {
  const toTen = 10 - left;
  const rest = right - toTen;
  return {
    type: "makeTen",
    steps: [
      { text: `先看 ${left}，还差 ${toTen} 个到 10。`, action: "start" },
      { text: `把 ${right} 分成 ${toTen} 和 ${rest}。`, action: "split" },
      { text: `${left} 加 ${toTen}，正好是 10。`, action: "fillTen" },
      { text: `再想 10 加 ${rest} 是多少。`, action: "finish" }
    ]
  };
}

function buildCountOnPlan(left, right, answer) {
  return {
    type: "countOn",
    steps: [
      { text: `从大的数 ${left} 开始。`, action: "start" },
      { text: `往后数 ${right} 个。`, action: "jump" },
      { text: "停在哪个数，就把哪个数写出来。", action: "finish" }
    ]
  };
}

function buildFindAddendPlan(left, total, answer) {
  return {
    type: "findAddend",
    steps: [
      { text: `从 ${left} 开始。`, action: "start" },
      { text: `往后数到 ${total}。`, action: "jump" },
      { text: "走了几步，问号就是几。", action: "finish" }
    ]
  };
}

function buildFindOperatorPlan(left, right, result, grows) {
  return {
    type: "findOperator",
    steps: grows
      ? [
          { text: `先看 ${left}。`, action: "start" },
          { text: `最后变成 ${result}，数变大了。`, action: "compare" },
          { text: "数变大，想一想用哪个符号表示合起来。", action: "finish" }
        ]
      : [
          { text: `先看 ${left}。`, action: "start" },
          { text: `最后变成 ${result}，数变小了。`, action: "compare" },
          { text: "数变小，想一想用哪个符号表示拿走。", action: "finish" }
        ]
  };
}

function buildComparePlan(left, right, operation, compareTarget) {
  return {
    type: "compare",
    steps: [
      { text: `先算左边，${left} ${operation === "add" ? "加" : "减"} ${right}。`, action: "left" },
      { text: `再拿左边算出的数，和右边的 ${compareTarget} 比。`, action: "compare" },
      { text: "左边大写大于号，左边小写小于号，一样大写等号。", action: "finish" }
    ]
  };
}

function buildBreakTenPlan(start, gone, answer) {
  const toTen = start - 10;
  const rest = gone - toTen;
  return {
    type: "breakTen",
    steps: [
      { text: `先把 ${start} 看成 10 和 ${toTen}。`, action: "split" },
      { text: `先减 ${toTen}，回到 10。`, action: "toTen" },
      { text: `还要再减 ${rest}。`, action: "rest" },
      { text: `再想 10 减 ${rest} 是多少。`, action: "finish" }
    ]
  };
}

function buildThinkAddPlan(part, missing, total) {
  return {
    type: "thinkAdd",
    steps: [
      { text: `把减法想成加法，${part} 加几等于 ${total}？`, action: "start" },
      { text: `${part} 先补到 10。`, action: "toTen" },
      { text: `再从 10 补到 ${total}。`, action: "toTotal" },
      { text: "把补上的数合起来，再写出来。", action: "finish" }
    ]
  };
}

function buildCountBackPlan(start, gone, answer) {
  return {
    type: "countBack",
    steps: [
      { text: `从 ${start} 开始。`, action: "start" },
      { text: `往回数 ${gone} 个。`, action: "jump" },
      { text: "停在哪个数，就把哪个数写出来。", action: "finish" }
    ]
  };
}

function makeCountingSequence(start, end, step = 1) {
  const values = [];
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    values.push(value);
  }
  return values;
}

function makeCountQuestion() {
  const max = profileLimits[state.profile].maxCount;
  const modes = state.profile === "younger" ? ["count", "compare"] : ["count", "compare", "fill"];
  const mode = modes[randInt(0, modes.length - 1)];

  if (mode === "compare") {
    const left = randInt(1, max);
    let right = randInt(1, max);
    while (right === left) right = randInt(1, max);
    const answer = left > right ? "左边多" : "右边多";
    return {
      type: "count",
      mode,
      left,
      right,
      answer,
      choices: shuffle(["左边多", "右边多", "一样多"]),
      kicker: "点点花田",
      text: "两块小花田里，哪边的点点花更多？",
      feedback: `${left} 和 ${right} 比，${answer}。可以先数左边，再数右边。`,
      tryAgain: "先数左边的小花，再数右边的小花。",
      helper: "家长提示：比较多少时先让孩子分别数两边，再说出判断理由。"
    };
  }

  const count = randInt(1, max);
  return {
    type: "count",
    mode,
    answer: count,
    choices: buildChoices(count, 1, max),
    kicker: "点点花田",
    text: "小花田里开了几个点点花？",
    feedback: `是 ${count} 个。可以从左到右，一个一个点着数。`,
    tryAgain: "我们再数一次，手指碰到一个点点就说一个数。",
    helper: "家长提示：请孩子用手指点数，不急着心算。数完后问：“最后一个数是几？”"
  };
}

function makeAddQuestion() {
  const left = randInt(1, 5);
  const right = randInt(1, 5);
  const answer = left + right;
  return {
    type: "add",
    left,
    right,
    answer,
    choices: buildChoices(answer, 1, 10),
    kicker: "水果小篮",
    text: `把 ${left} 个水果和 ${right} 个水果放进同一个小篮，一共有几个？`,
    feedback: `小篮装好啦，${left} 和 ${right} 合起来是 ${answer}。`,
    tryAgain: "可以先数左边，再接着数右边。",
    helper: "家长提示：少说“算出来”，多说“合起来”。"
  };
}

function makeSubtractQuestion() {
  const start = randInt(3, 10);
  const gone = randInt(1, start - 1);
  const answer = start - gone;
  return {
    type: "subtract",
    start,
    gone,
    answer,
    choices: buildChoices(answer, 0, 10),
    kicker: "饼干小铺",
    text: `小铺原来有 ${start} 块饼干，拿走 ${gone} 块，还剩几块？`,
    feedback: `小铺数清楚啦，还剩 ${answer} 块。`,
    tryAgain: "把拿走的遮住，数一数剩下的。",
    helper: "家长提示：用“拿走、剩下”讲故事。"
  };
}

function makeMake10Question() {
  const total = randInt(5, 10);
  const part = randInt(1, total - 1);
  const answer = total - part;
  return {
    type: "make10",
    total,
    part,
    answer,
    choices: buildChoices(answer, 1, 10),
    kicker: "数字小屋",
    text: `${total} 住在小屋里，它可以分成 ${part} 和几？`,
    feedback: `小屋配对成功：${total} 可以分成 ${part} 和 ${answer}。`,
    tryAgain: `想一想，${part} 再添几个就到 ${total}？`,
    helper: "家长提示：鼓励孩子用点点补到目标数。"
  };
}

function makeShapeQuestion() {
  const shapes = [
    { key: "circle", label: "圆形" },
    { key: "square", label: "正方形" },
    { key: "triangle", label: "三角形" }
  ];
  const target = shapes[randInt(0, shapes.length - 1)];
  const counts = {
    circle: randInt(1, 5),
    square: randInt(1, 5),
    triangle: randInt(1, 5)
  };
  return {
    type: "shape",
    target: target.key,
    answer: target.label,
    counts,
    choices: shuffle(shapes.map((shape) => shape.label)),
    kicker: "图形收纳站",
    text: `图形小盒要整理啦，请找出所有${target.label}。`,
    feedback: `收纳成功，这些都是${target.label}。`,
    tryAgain: "先看边和角，再看是不是弯弯的圆边。",
    helper: "家长提示：问孩子“你按什么标准分类？”"
  };
}

function render() {
  const question = state.currentQuestion;
  els.gameLabel.textContent = games[state.game].label;
  els.roundLabel.textContent = `第 ${state.round} 题 / ${state.roundTotal} 题`;
  els.promptKicker.textContent = question.kicker;
  els.questionText.textContent = question.text;
  els.feedback.textContent = isTypedPractice()
    ? "先自己想一想，把答案送进小窗。不会也没关系，可以试一试。"
    : state.profile === "play"
      ? "陪玩模式：说出你的想法就很好。"
      : "不用着急，可以一个一个找。";
  els.helperNote.textContent = question.helper;
  els.helperNote.classList.toggle("hidden", !state.parentTips);
  els.parentToggle.setAttribute("aria-pressed", String(state.parentTips));
  if (els.sceneBadge) els.sceneBadge.dataset.scene = sceneForQuestion(question);

  renderActiveButtons();
  renderVisual(question);
  renderAnswerArea(question);
  hideTeachCard();
  renderProgress();
}

function sceneForQuestion(question) {
  if (question.operation === "compare") return "scale";
  if (question.operation === "missingOperator") return "search";
  if (question.operation === "missingAddend" || question.operation === "missingSubtrahend") return "path";
  if (question.operation === "subtract" || question.type === "subtract") return "cookie";
  if (question.operation === "add" || question.type === "add") return "fruit";
  if (question.type === "shape") return "shape";
  if (question.type === "count") return "flower";
  return "star";
}

function isTypedPractice() {
  return state.profile === "sister" && state.game === "practice";
}

function renderActiveButtons() {
  els.profileCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.profile === state.profile);
  });

  const allowedGames = profileLimits[state.profile].games;
  els.gameTiles.forEach((tile) => {
    const allowed = allowedGames.includes(tile.dataset.game);
    tile.hidden = !allowed;
    tile.classList.toggle("active", tile.dataset.game === state.game);
  });
}

function renderVisual(question) {
  els.visualStage.innerHTML = "";

  if (question.type === "equation") {
    const card = document.createElement("div");
    card.className = "equation-card";
    card.innerHTML = `<div class="equation-text">${question.expression}</div>`;
    els.visualStage.appendChild(card);
    return;
  }

  if (question.type === "count") {
    if (question.mode === "compare") {
      const row = document.createElement("div");
      row.className = "split-row";
      row.appendChild(objectGroup("dot", question.left));
      row.appendChild(operator("?"));
      row.appendChild(objectGroup("dot", question.right));
      els.visualStage.appendChild(row);
    } else {
      els.visualStage.appendChild(objectRow("dot", question.answer));
    }
  }

  if (question.type === "add") {
    const row = document.createElement("div");
    row.className = "split-row";
    row.appendChild(objectGroup("fruit apple", question.left));
    row.appendChild(operator("+"));
    row.appendChild(objectGroup("fruit pear", question.right));
    els.visualStage.appendChild(row);
  }

  if (question.type === "subtract") {
    const row = document.createElement("div");
    row.className = "object-row";
    for (let index = 0; index < question.start; index += 1) {
      const cookie = document.createElement("span");
      cookie.className = "cookie";
      cookie.style.opacity = index < question.gone ? "0.26" : "1";
      cookie.setAttribute("aria-hidden", "true");
      row.appendChild(cookie);
    }
    els.visualStage.appendChild(row);
  }

  if (question.type === "make10") {
    const row = document.createElement("div");
    row.className = "split-row";
    row.appendChild(objectGroup("dot", question.part));
    row.appendChild(operator("+"));
    row.appendChild(objectGroup("dot", question.answer, true));
    row.appendChild(operator("="));
    row.appendChild(objectGroup("dot", question.total));
    els.visualStage.appendChild(row);
  }

  if (question.type === "shape") {
    const row = document.createElement("div");
    row.className = "shape-row";
    Object.entries(question.counts).forEach(([shape, count]) => {
      for (let index = 0; index < count; index += 1) {
        const piece = document.createElement("span");
        piece.className = `shape-piece ${shape}`;
        piece.setAttribute("aria-hidden", "true");
        row.appendChild(piece);
      }
    });
    els.visualStage.appendChild(row);
  }
}

function renderAnswerArea(question) {
  els.answerGrid.innerHTML = "";
  els.typedAnswerPanel.classList.toggle("hidden", !isTypedPractice());
  els.answerGrid.classList.toggle("hidden", isTypedPractice());

  if (isTypedPractice()) {
    els.answerInput.value = "";
    const isSymbolQuestion = question.answerKind === "operator" || question.answerKind === "compare";
    els.answerInput.inputMode = isSymbolQuestion ? "text" : "numeric";
    els.answerInput.placeholder = question.answerKind === "operator"
      ? "+ 或 -"
      : question.answerKind === "compare"
        ? ">、< 或 ="
        : "0-20";
    els.operatorKeys.forEach((button) => {
      button.hidden = question.answerKind !== "operator";
    });
    els.compareKeys.forEach((button) => {
      button.hidden = question.answerKind !== "compare";
    });
    els.answerInput.focus({ preventScroll: true });
    return;
  }

  question.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "answer-btn";
    button.type = "button";
    button.textContent = choice;
    button.addEventListener("click", () => handleChoiceAnswer(choice, button));
    els.answerGrid.appendChild(button);
  });
}

function objectRow(className, count) {
  const row = document.createElement("div");
  row.className = "object-row";
  for (let index = 0; index < count; index += 1) {
    const item = document.createElement("span");
    item.className = className;
    item.setAttribute("aria-hidden", "true");
    row.appendChild(item);
  }
  return row;
}

function objectGroup(className, count, ghost = false) {
  const group = document.createElement("div");
  group.className = "object-group";
  for (let index = 0; index < count; index += 1) {
    const item = document.createElement("span");
    item.className = className;
    item.style.opacity = ghost ? "0.24" : "1";
    item.setAttribute("aria-hidden", "true");
    group.appendChild(item);
  }
  return group;
}

function operator(value) {
  const item = document.createElement("span");
  item.className = "operator";
  item.textContent = value;
  return item;
}

function handleChoiceAnswer(choice, button) {
  const question = state.currentQuestion;
  const isPlay = state.profile === "play";
  const isCorrect = choice === question.answer;
  recordAttempt(isCorrect || isPlay);

  document.querySelectorAll(".answer-btn").forEach((answer) => {
    answer.classList.remove("selected", "good", "try");
  });

  button.classList.add("selected", isCorrect || isPlay ? "good" : "try");
  els.feedback.textContent = isCorrect || isPlay ? question.feedback : question.tryAgain;
  playFeedback(isCorrect || isPlay ? "correct" : "tryAgain");
  renderProgress();
}

function checkTypedAnswer() {
  if (!isTypedPractice() || state.isAdvancing) return;
  const question = state.currentQuestion;
  const raw = els.answerInput.value.trim();

  if (!raw) {
    els.feedback.textContent = "先写一个答案。随便试一试也可以。";
    hideTeachCard();
    return;
  }

  const typed = normalizeTypedAnswer(raw, question);
  if (typed === null) return;

  const isCorrect = typed === question.answer;
  recordAttempt(isCorrect, question, raw);

  if (isCorrect) {
    state.isAdvancing = true;
    els.feedback.textContent = question.feedback;
    els.answerInput.value = "";
    els.answerInput.readOnly = true;
    els.checkBtn.disabled = true;
    els.checkBtn.textContent = "下一题马上来";
    hideTeachCard();
    const milestone = getPendingMilestone();
    if (milestone) {
      els.feedback.textContent = `已经答对 ${milestone} 道题啦，真不错。`;
    }
    const advance = () => {
      state.isAdvancing = false;
      els.answerInput.readOnly = false;
      els.checkBtn.disabled = false;
      els.checkBtn.textContent = "送出";
      nextQuestion();
    };
    if (milestone) {
      playMilestone(milestone, advance);
    } else {
      playFeedback("correct", advance);
    }
  } else {
    els.feedback.textContent = question.tryAgain;
    els.answerInput.value = "";
    showTeachCard(question);
    playTeachAnimation(question, () => {
      els.feedback.textContent = "你再写一次试试。";
      els.answerInput.focus({ preventScroll: true });
    });
  }

  renderProgress();
}

function normalizeTypedAnswer(raw, question) {
  if (question.answerKind === "operator") {
    const value = raw.replace(/[＋﹢]/g, "+").replace(/[－−—]/g, "-");
    if (value !== "+" && value !== "-") {
      els.feedback.textContent = "这题写 + 或 -。";
      hideTeachCard();
      return null;
    }
    return value;
  }

  if (question.answerKind === "compare") {
    const value = raw
      .replace(/[＞》]/g, ">")
      .replace(/[＜《]/g, "<")
      .replace(/[＝]/g, "=")
      .replace(/大于/g, ">")
      .replace(/小于/g, "<")
      .replace(/等于/g, "=");
    if (value !== ">" && value !== "<" && value !== "=") {
      els.feedback.textContent = "这题写 >、< 或 =。";
      hideTeachCard();
      return null;
    }
    return value;
  }

  if (/^[+\-<>=]$/.test(raw)) {
    els.feedback.textContent = "这题写 0 到 20 以内的数字。";
    hideTeachCard();
    return null;
  }

  const typed = Number(raw);
  if (!Number.isInteger(typed) || typed < 0 || typed > 20) {
    els.feedback.textContent = "这次只练 0 到 20 以内的答案。";
    hideTeachCard();
    return null;
  }
  return typed;
}

function recordAttempt(isSupported, question = null, childAnswer = "") {
  const skill = state.progress.skills[state.game] || { attempts: 0, supported: 0 };
  const isCorrect = Boolean(isSupported);
  skill.attempts += 1;
  if (isCorrect) skill.supported += 1;
  state.progress.skills[state.game] = skill;

  const today = dateKey();
  const daily = state.progress.daily[today] || emptyRecord();
  daily.attempts += 1;
  if (isCorrect) {
    daily.correct += 1;
    state.session.correct += 1;
  } else {
    daily.wrong += 1;
    state.session.wrong += 1;
  }
  state.session.attempts += 1;
  state.progress.daily[today] = daily;

  if (!isCorrect && question && isTypedPractice()) {
    addWrongQuestion(question, childAnswer);
  }
  saveProgress();
}

function addWrongQuestion(question, childAnswer) {
  const wrongBook = Array.isArray(state.progress.wrongBook) ? state.progress.wrongBook : [];
  const now = new Date();
  wrongBook.unshift({
    id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    date: dateKey(now),
    time: timeLabel(now),
    expression: question.expression,
    childAnswer: String(childAnswer).trim(),
    expected: String(question.answer),
    operation: question.operation,
    strategyName: question.strategyName
  });
  state.progress.wrongBook = wrongBook.slice(0, 40);
}

function showTeachCard(question) {
  els.teachTitle.textContent = question.strategyName;
  els.teachSteps.innerHTML = "";
  question.teachSteps.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    els.teachSteps.appendChild(item);
  });
  renderTeachVisual(question);
  els.teachCard.classList.remove("hidden");
  renderAnimationFrame(question, -1);
}

function hideTeachCard() {
  state.animationToken += 1;
  els.teachCard.classList.add("hidden");
  els.animationStage.innerHTML = "";
  els.animationStage.classList.remove("is-speaking");
  els.stepCaption.textContent = "";
  els.teachVisual.innerHTML = "";
  els.teachSteps.innerHTML = "";
}

function playTeachAnimation(question, onDone) {
  const token = ++state.animationToken;
  const steps = question.animationPlan?.steps || [];
  if (!steps.length) {
    playFeedback("tryAgain", onDone);
    return;
  }

  let index = 0;
  const playNext = () => {
    if (token !== state.animationToken) return;
    if (index >= steps.length) {
      els.animationStage.classList.remove("is-speaking");
      playFeedback("teachEnd", onDone);
      return;
    }

    const step = steps[index];
    renderAnimationFrame(question, index);
    els.stepCaption.textContent = step.text;
    els.animationStage.classList.add("is-speaking");
    index += 1;
    window.setTimeout(() => {
      if (token !== state.animationToken) return;
      window.setTimeout(playNext, 300);
    }, step.delay || 1100);
  };

  playNext();
}

function renderAnimationFrame(question, activeIndex) {
  els.animationStage.innerHTML = "";
  const plan = question.animationPlan;
  if (!plan) return;

  if (plan.type === "makeTen") renderMakeTenAnimation(question, activeIndex);
  if (plan.type === "countOn") renderCountOnAnimation(question, activeIndex);
  if (plan.type === "findAddend") renderFindAddendAnimation(question, activeIndex);
  if (plan.type === "findOperator") renderFindOperatorAnimation(question, activeIndex);
  if (plan.type === "compare") renderCompareAnimation(question, activeIndex);
  if (plan.type === "breakTen") renderBreakTenAnimation(question, activeIndex);
  if (plan.type === "thinkAdd") renderThinkAddAnimation(question, activeIndex);
  if (plan.type === "countBack") renderCountBackAnimation(question, activeIndex);
}

function renderMakeTenAnimation(question, activeIndex) {
  const toTen = 10 - question.left;
  const rest = question.right - toTen;
  const row = document.createElement("div");
  row.className = "animated-groups";
  row.appendChild(tenFrame(question.left, activeIndex >= 2 ? toTen : 0));
  row.appendChild(teachEquation("+"));
  row.appendChild(tokenGroup(question.right, activeIndex >= 1 ? `${toTen} 和 ${rest}` : `${question.right}`));
  if (activeIndex >= 3) row.appendChild(teachEquation(`10 + ${rest} = ?`));
  els.animationStage.appendChild(row);
}

function renderBreakTenAnimation(question, activeIndex) {
  const toTen = question.left - 10;
  const rest = question.right - toTen;
  const row = document.createElement("div");
  row.className = "decompose-row";
  row.appendChild(numberToken(question.left));
  row.appendChild(teachEquation("拆成"));
  row.appendChild(numberToken(10));
  row.appendChild(numberToken(toTen));
  if (activeIndex >= 1) row.appendChild(teachEquation(`先减 ${toTen}`));
  if (activeIndex >= 2) row.appendChild(teachEquation(`再减 ${rest}`));
  if (activeIndex >= 3) row.appendChild(teachEquation(`10 - ${rest} = ?`));
  els.animationStage.appendChild(row);
}

function renderThinkAddAnimation(question, activeIndex) {
  const toTen = 10 - question.right;
  const toTotal = question.left - 10;
  const row = document.createElement("div");
  row.className = "decompose-row";
  row.appendChild(teachEquation(`${question.right} + ? = ${question.left}`));
  if (activeIndex >= 1) row.appendChild(teachEquation(`+ ${toTen} 到 10`));
  if (activeIndex >= 2) row.appendChild(teachEquation(`+ ${toTotal} 到 ${question.left}`));
  if (activeIndex >= 3) row.appendChild(teachEquation("合起来是几？"));
  els.animationStage.appendChild(row);
}

function renderFindAddendAnimation(question, activeIndex) {
  const row = document.createElement("div");
  row.className = "decompose-row";
  row.appendChild(teachEquation(`${question.left} + ? = ${question.right}`));
  if (activeIndex >= 1) row.appendChild(teachEquation(`数到 ${question.right}`));
  if (activeIndex >= 2) row.appendChild(teachEquation("数一数走了几步"));
  els.animationStage.appendChild(row);
  renderNumberLineAnimation(question.left, question.right, activeIndex);
}

function renderFindOperatorAnimation(question, activeIndex) {
  const row = document.createElement("div");
  row.className = "decompose-row";
  row.appendChild(teachEquation(`${question.left} ? ${question.right} = ${question.result}`));
  if (activeIndex >= 1) {
    row.appendChild(teachEquation(question.result > question.left ? "结果变大" : "结果变小"));
  }
  if (activeIndex >= 2) row.appendChild(teachEquation("想想该用哪个符号"));
  els.animationStage.appendChild(row);
}

function renderCompareAnimation(question, activeIndex) {
  const row = document.createElement("div");
  row.className = "decompose-row";
  row.appendChild(teachEquation(question.expression));
  if (activeIndex >= 1) row.appendChild(teachEquation(`先算 ${question.left} ${question.calcOperator} ${question.right}`));
  if (activeIndex >= 2) row.appendChild(teachEquation(`再和 ${question.compareTarget} 比`));
  els.animationStage.appendChild(row);
}

function renderCountOnAnimation(question, activeIndex) {
  const row = document.createElement("div");
  row.className = "decompose-row";
  row.appendChild(teachEquation(`${question.left} + ${question.right} = ?`));
  if (activeIndex >= 1) row.appendChild(teachEquation(`往后数 ${question.right} 个`));
  if (activeIndex >= 2) row.appendChild(teachEquation("停在哪个数？"));
  els.animationStage.appendChild(row);
}

function renderCountBackAnimation(question, activeIndex) {
  const row = document.createElement("div");
  row.className = "decompose-row";
  row.appendChild(teachEquation(`${question.left} - ${question.right} = ?`));
  if (activeIndex >= 1) row.appendChild(teachEquation(`往回数 ${question.right} 个`));
  if (activeIndex >= 2) row.appendChild(teachEquation("停在哪个数？"));
  els.animationStage.appendChild(row);
}

function renderNumberLineAnimation(start, end, activeIndex, backward = false) {
  const line = document.createElement("div");
  line.className = "number-line";
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  for (let value = low; value <= high; value += 1) {
    const mark = document.createElement("span");
    mark.className = "number-mark";
    mark.textContent = value;
    const inPath = value >= low && value <= high;
    if (value === start || (activeIndex >= 1 && inPath) || (activeIndex >= 2 && value === end)) {
      mark.classList.add("active");
    }
    line.appendChild(mark);
  }
  els.animationStage.appendChild(line);
}

function tokenGroup(total, label) {
  const group = document.createElement("div");
  group.className = "animated-groups";
  group.appendChild(numberToken(label || total));
  for (let index = 0; index < Math.min(total, 10); index += 1) {
    const dot = document.createElement("span");
    dot.className = "moving-dot";
    group.appendChild(dot);
  }
  return group;
}

function numberToken(text) {
  const token = document.createElement("div");
  token.className = "number-token";
  token.textContent = text;
  return token;
}

function renderTeachVisual(question) {
  els.teachVisual.innerHTML = "";
  const row = document.createElement("div");
  row.className = "ten-frame-row";

  if (question.visualModel === "makeTen") {
    row.appendChild(tenFrame(question.left, 10 - question.left));
    row.appendChild(teachEquation(`${question.left} + ${10 - question.left} = 10`));
    row.appendChild(teachEquation(`10 + ${question.answer - 10} = ?`));
  } else if (question.visualModel === "breakTen") {
    row.appendChild(teachEquation(`${question.left} - ${question.right} = ?`));
    row.appendChild(teachEquation(`${question.left} - ${question.left - 10} = 10`));
    row.appendChild(teachEquation(`10 - ${10 - question.answer} = ?`));
  } else if (question.visualModel === "thinkAdd") {
    row.appendChild(teachEquation(`${question.right} + ? = ${question.left}`));
    row.appendChild(teachEquation("先补到 10，再补到原来的数"));
  } else if (question.visualModel === "missingAddend") {
    row.appendChild(teachEquation(`${question.left} + ? = ${question.right}`));
    row.appendChild(teachEquation("从前面的数数到后面的数"));
  } else if (question.visualModel === "missingSubtrahend") {
    row.appendChild(teachEquation(`${question.left} - ? = ${question.right}`));
    row.appendChild(teachEquation(`${question.right} + ? = ${question.left}`));
  } else if (question.visualModel === "missingOperator") {
    row.appendChild(teachEquation(`${question.left} ? ${question.right} = ${question.result}`));
    row.appendChild(teachEquation(question.result > question.left ? "结果变大" : "结果变小"));
  } else if (question.visualModel === "compare") {
    row.appendChild(teachEquation(question.expression));
    row.appendChild(teachEquation(`先算左边，再和 ${question.compareTarget} 比`));
  } else if (question.visualModel === "countOn") {
    row.appendChild(teachEquation(`${question.left} + ${question.right} = ?`));
    row.appendChild(teachEquation(`从 ${question.left} 往后数 ${question.right} 个`));
  } else if (question.visualModel === "countBack") {
    row.appendChild(teachEquation(`${question.left} - ${question.right} = ?`));
    row.appendChild(teachEquation(`从 ${question.left} 往回数 ${question.right} 个`));
  } else {
    row.appendChild(teachEquation(question.expression));
  }

  els.teachVisual.appendChild(row);
}

function tenFrame(filled, extra = 0) {
  const frame = document.createElement("div");
  frame.className = "ten-frame";
  for (let index = 1; index <= 10; index += 1) {
    const cell = document.createElement("span");
    cell.className = "ten-cell";
    if (index <= filled) cell.classList.add("filled");
    if (index > filled && index <= filled + extra) cell.classList.add("extra");
    frame.appendChild(cell);
  }
  return frame;
}

function teachEquation(text) {
  const item = document.createElement("div");
  item.className = "teach-equation";
  item.textContent = text;
  return item;
}

function nextQuestion() {
  state.round += 1;
  if (state.round > state.roundTotal) {
    state.round = 1;
    showRoundSummary();
  }
  makeQuestion();
}

function showRoundSummary() {
  els.summaryTitle.textContent = "这一小轮点亮啦";
  els.summaryText.textContent = isTypedPractice()
    ? "今天先到这里也可以。下次继续用小方法打开算式门。"
    : "可以喝口水、伸伸手。下次继续去小花园找数量。";
}

function renderProgress() {
  const today = state.progress.daily[dateKey()] || emptyRecord();
  const wrongBook = Array.isArray(state.progress.wrongBook) ? state.progress.wrongBook : [];
  const signature = JSON.stringify({
    session: state.session,
    today,
    skills: Object.keys(games).map((key) => state.progress.skills[key] || { attempts: 0, supported: 0 }),
    wrong: wrongBook.slice(0, 6).map((item) => item.id)
  });
  if (signature === progressRenderSignature) return;
  progressRenderSignature = signature;

  els.sessionStats.textContent = formatRecord(state.session);
  els.todayStats.textContent = formatRecord(today);
  els.progressBars.innerHTML = "";
  Object.entries(games).forEach(([key, game]) => {
    const item = state.progress.skills[key] || { attempts: 0, supported: 0 };
    const percent = item.attempts ? Math.round((item.supported / item.attempts) * 100) : 0;
    const row = document.createElement("div");
    row.className = "progress-item";
    row.innerHTML = `
      <div class="progress-label">
        <span>${game.skill}</span>
        <span>${item.attempts ? `${percent}%` : "还没玩"}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width: ${percent}%"></div></div>
    `;
    els.progressBars.appendChild(row);
  });
  renderWrongBook(wrongBook);
}

function formatRecord(record) {
  return `${record.attempts || 0} 题 · 对 ${record.correct || 0} · 再想 ${record.wrong || 0}`;
}

function renderWrongBook(wrongBook = Array.isArray(state.progress.wrongBook) ? state.progress.wrongBook : []) {
  els.wrongCount.textContent = wrongBook.length ? `${wrongBook.length} 道待复习` : "还没有错题";
  els.wrongBookList.innerHTML = "";

  if (!wrongBook.length) {
    const empty = document.createElement("div");
    empty.className = "empty-wrong";
    empty.textContent = "现在复习小篮还是空的。需要再看的题会自动放到这里。";
    els.wrongBookList.appendChild(empty);
    return;
  }

  wrongBook.slice(0, 6).forEach((item) => {
    const row = document.createElement("div");
    row.className = "wrong-item";
    row.innerHTML = `
      <div class="wrong-expression">${item.expression}</div>
      <div class="wrong-meta">${item.date} ${item.time} · 当时写了 ${item.childAnswer || "空"} · ${item.strategyName || "看方法"}</div>
    `;
    els.wrongBookList.appendChild(row);
  });
}

els.profileCards.forEach((card) => {
  card.addEventListener("click", () => {
    state.profile = card.dataset.profile;
    state.round = 1;
    const allowedGames = profileLimits[state.profile].games;
    if (!allowedGames.includes(state.game)) state.game = allowedGames[0];
    saveProgress();
    makeQuestion();
  });
});

els.gameTiles.forEach((tile) => {
  tile.addEventListener("click", () => {
    const allowedGames = profileLimits[state.profile].games;
    if (!allowedGames.includes(tile.dataset.game)) return;
    state.game = tile.dataset.game;
    state.round = 1;
    makeQuestion();
  });
});

els.parentToggle.addEventListener("click", () => {
  state.parentTips = !state.parentTips;
  render();
});

els.skipBtn.addEventListener("click", () => {
  els.feedback.textContent = "换一题也可以，保持轻松最重要。";
  makeQuestion();
});

els.nextBtn.addEventListener("click", nextQuestion);
els.checkBtn.addEventListener("click", checkTypedAnswer);
els.replayTeachBtn.addEventListener("click", () => {
  if (state.currentQuestion?.animationPlan) {
    playTeachAnimation(state.currentQuestion, () => {
      els.feedback.textContent = "你再写一次试试。";
      els.answerInput.focus({ preventScroll: true });
    });
  }
});
els.answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkTypedAnswer();
});

els.numberPad.addEventListener("click", (event) => {
  if (state.isAdvancing) return;
  const key = event.target.dataset.key;
  if (!key) return;
  const isOperatorQuestion = state.currentQuestion?.answerKind === "operator";
  const isCompareQuestion = state.currentQuestion?.answerKind === "compare";
  if (key === "clear") {
    els.answerInput.value = "";
  } else if (key === "back") {
    els.answerInput.value = els.answerInput.value.slice(0, -1);
  } else if (key === "+" || key === "-") {
    if (isOperatorQuestion) {
      els.answerInput.value = key;
    } else {
      els.feedback.textContent = "这题写数字就可以。";
    }
  } else if (key === ">" || key === "<" || key === "=") {
    if (isCompareQuestion) {
      els.answerInput.value = key;
    } else {
      els.feedback.textContent = "这题写数字就可以。";
    }
  } else if (isOperatorQuestion) {
    els.feedback.textContent = "这题写 + 或 -。";
  } else if (isCompareQuestion) {
    els.feedback.textContent = "这题写 >、< 或 =。";
  } else if (els.answerInput.value.length < 2) {
    els.answerInput.value += key;
  }
  els.answerInput.focus({ preventScroll: true });
});

state.profile = profileLimits[state.progress.profile] ? state.progress.profile : "sister";
if (!profileLimits[state.profile].games.includes(state.game)) {
  state.game = profileLimits[state.profile].games[0];
}
makeQuestion();
