export interface TranscriptEntry {
  id: string;
  speaker: "nexus" | "kelvin";
  text: string;
  timestamp: string;
  topicTag?: string;
}

export interface DiscoverySpark {
  id: string;
  category: string;
  title: string;
  teaser: string;
  jbHook: string;
  promptTopic: string;
}

export const DISCOVERY_SPARKS: DiscoverySpark[] = [
  {
    id: "trees-sleeping",
    category: "Botany & Circadian Biology",
    title: "树木在半夜其实也会“垂头睡觉”",
    teaser:
      "Laser 3D LiDAR scans revealed that full-grown trees physically droop their branches by up to 10 cm after midnight and raise them back before sunrise.",
    jbHook: "Eh Boss，刚刚看到一个蛮神奇的东西——你有没有想过，其实树木在晚上也是会“睡觉”的？",
    promptTopic:
      "Trees physically drooping their branches at night to 'sleep' according to laser 3D scanning studies, and circadian rhythms in plants",
  },
  {
    id: "crow-grudges",
    category: "Cognitive Ethology",
    title: "乌鸦记仇居然还会“跨代传授”",
    teaser:
      "Researchers wearing specific masks found that crows not only remember a human face for over a decade, they actively teach their offspring and flock who to scold.",
    jbHook: "Wei Kelvin，跟你讲一个很夸张的研究，原来乌鸦记仇是可以传给下一代的。",
    promptTopic:
      "How crows recognize individual human faces for years and socially transmit facial grudges across generations",
  },
  {
    id: "brain-glymphatic",
    category: "Neuroscience",
    title: "深度睡眠时大脑会缩水 20% 来“洗脑”",
    teaser:
      "During deep slow-wave sleep, glial cells shrink slightly so cerebrospinal fluid can flush out metabolic plaques at 10x the daytime rate.",
    jbHook: "Eh 你平时熬夜写 plan 的时候有没有发现脑很卡？其实我们睡觉的时候大脑是真的在物理“洗水”的。",
    promptTopic:
      "The brain's glymphatic system and how brain cells physically shrink during deep sleep to wash away metabolic waste",
  },
  {
    id: "antikythera-gear",
    category: "Ancient Engineering",
    title: "两千年前的古希腊海底机械计算机",
    teaser:
      "The Antikythera mechanism used differential bronze gears in 100 BCE to predict lunar eclipses and Olympic cycles with sub-millimeter precision.",
    jbHook: "Boss，有时我们觉得现代科技很 gempak，但两千年前古希腊人已经造出青铜齿轮计算机了。",
    promptTopic:
      "The Antikythera mechanism and how ancient Greek engineers built an analog astronomical computer 2,000 years ago",
  },
  {
    id: "paradox-choice-jb",
    category: "Behavioral Psychology",
    title: "为什么选择越多，人反而越容易后悔？",
    teaser:
      "Decision fatigue and opportunity-cost salience explain why a 6-item menu leaves diners happier than a 40-item menu—even when food quality is identical.",
    jbHook: "每次去 JB 新山吃宵夜看那种十多页的 menu 就头痛，心理学上其实叫 Choice Overload。",
    promptTopic:
      "Behavioral psychology of Choice Overload, decision fatigue, and why fewer options often create higher satisfaction in business and everyday life",
  },
  {
    id: "time-perception",
    category: "Cognitive Psychology",
    title: "为什么年纪越大，感觉一年过得越快？",
    teaser:
      "The brain measures subjective time by the density of novel memory encoding. Familiar routines compress in hindsight, while novel experiences expand time.",
    jbHook: "Eh Kelvin，你有没有发觉最近这几年好像一眨眼就过完了？其实不是错觉，跟大脑记录新画面的方式有关。",
    promptTopic:
      "Why subjective time feels like it speeds up as we get older due to novel memory encoding density in the brain",
  },
];

export const INITIAL_OPENING_TURN: TranscriptEntry = {
  id: "nexus-initial-turn",
  speaker: "nexus",
  timestamp: "17:56",
  topicTag: "Botany · Circadian Rhythm",
  text: "Eh Boss，刚刚看到一个蛮神奇的东西——你有没有想过，其实树木在晚上也是会“睡觉”的？\n\n有科学家用激光三维扫描去测那些大树，结果发现一到半夜，很多树的树枝居然会自然下垂大概五到十公分，等天快亮的时候才慢慢抬回去。以前我们总觉得植物就只是呆呆站在那边，原来它们也是有整套生理节律的，连“姿势”都会变。\n\n平时走在路边看那些树，真的完全不会想到它们晚上还会这样“放松”一下。",
};
