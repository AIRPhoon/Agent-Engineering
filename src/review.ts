/** 检查的数据及 JSON 入口；由插件和离线流程测试共同使用。 */
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools';

/** 函数检查交给审计，模块及跨模块检查交给监理。 */
export interface ReviewRequest {
  kind: 'function' | 'module';
  target: string;
  goal: string;
  contract: string;
  /** 报送方粘贴的代码；给出 files 时可只写摘要或关键片段。 */
  code: string;
  /** 工作区相对路径；插件自行读取真实文件内容，不接受绝对路径或越界路径。 */
  files: string[];
  context: string;
  evidence: string;
  /** 可选的检查必要性或范围疑问；触发财务判断，不绕过精确重复拦截。 */
  financeQuestion?: string;
}

/** 每条意见都必须包含定位、问题和可复核依据。 */
export interface Finding { location: string; problem: string; evidence: string }

/** replan 只允许模块监理提出；inconclusive 表示证据不足，不能当作通过。 */
export interface ReviewReport {
  verdict: 'pass' | 'changes-required' | 'inconclusive' | 'replan';
  summary: string;
  findings: Finding[];
}

// as const 保留字面量类型，使 schema 中的 'string' 不被扩宽为任意字符串。
const text = { type: 'string' } as const;
const requiredFields = ['kind', 'target', 'goal', 'contract', 'code', 'context', 'evidence'] as const;
const allowedFields = [...requiredFields, 'files', 'financeQuestion'] as const;

/** 原始工具的参数声明；parseRequest 负责在执行入口验证相同字段。 */
export const requestSchema: ObjectJsonSchema = {
  type: 'object', additionalProperties: false, required: [...requiredFields],
  properties: {
    kind: { type: 'string', enum: ['function', 'module'] },
    target: text, goal: text, contract: text, context: text, evidence: text,
    financeQuestion: { type: 'string', description: '可选：为何需要财务判断本次检查的必要性或范围；不作为强制重试开关。' },
    code: { type: 'string', description: '粘贴的代码；给出 files 时可写摘要。' },
    // 上限由 parseRequest 在执行入口强制；DSH 的 JSON Schema 子集不接收 maxItems。
    files: {
      type: 'array', items: { type: 'string' },
      description: '工作区相对路径（最多 40 个）；插件读取真实内容并计算哈希，优先于粘贴文本。',
    },
  },
};

/** 输入、审计与财务协议共用的对象校验；多余字段视为协议错误，不猜测意图。 */
export function record(value: unknown, keys: readonly string[], exact: boolean): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  const present = Object.keys(value);
  const unknown = present.filter(key => !keys.includes(key));
  if (unknown.length > 0) throw new Error(`Unexpected fields: ${unknown.join(', ')}.`);
  if (exact) {
    const missing = keys.filter(key => !Object.hasOwn(value, key));
    if (missing.length > 0) throw new Error(`Expected exactly these fields: ${keys.join(', ')}.`);
  }
  return value as Record<string, unknown>;
}

/** 输入、审计与财务协议共用的非空文本校验；未知条件须写明未知，不补默认约定。 */
export function nonempty(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Review fields must be non-empty strings.');
  return value;
}

/** 依次取出必填字段，缺一个就报错，而不是静默补空串。 */
function field(row: Record<string, unknown>, key: string): string {
  if (!Object.hasOwn(row, key)) throw new Error(`Missing field: ${key}.`);
  return nonempty(row[key]);
}

/** 允许空白取值：code 在给出 files 时可以只写摘要，但不能连字段都没有。 */
function loose(row: Record<string, unknown>, key: string): string {
  if (!Object.hasOwn(row, key)) throw new Error(`Missing field: ${key}.`);
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Field ${key} must be a string.`);
  return value;
}

/** files 允许省略；给出时必须是路径字符串数组，去重后保持报送顺序。 */
function paths(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) throw new Error('files must be an array of at most 40 paths.');
  const unique = new Set<string>();
  for (const item of value) {
    const path = nonempty(item);
    if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) throw new Error('files must be workspace-relative paths.');
    unique.add(path);
  }
  return [...unique];
}

/**
 * 工具 execute 调用本函数，把模型提供的 JSON 转成规范字段顺序的请求。
 * @param value 未验证的工具参数。
 * @returns 完整的函数或模块检查请求；缺失信息直接报错。
 */
export function parseRequest(value: unknown): ReviewRequest {
  const row = record(value, allowedFields, false);
  if (row.kind !== 'function' && row.kind !== 'module') throw new Error('kind must be function or module.');
  const code = loose(row, 'code');
  const files = paths(row.files);
  // 至少要有一种成果来源：粘贴代码或可读取的真实文件，不接受空报送。
  if (code.trim() === '' && files.length === 0) throw new Error('Provide code or files.');
  return {
    kind: row.kind, target: field(row, 'target'), goal: field(row, 'goal'),
    contract: field(row, 'contract'), code, files,
    context: field(row, 'context'), evidence: field(row, 'evidence'),
    ...(row.financeQuestion === undefined ? {} : { financeQuestion: nonempty(row.financeQuestion) }),
  };
}

/**
 * 子 Agent 完成后校验结构化结果，额外核对 schema 无法表达的职责和结论约束。
 * @param value DSH 子 Agent 文本解析后的 JSON，或测试用检查器的输出。
 * @param kind 此次检查类型。
 * @returns 可反馈给执行方或规划方的意见。
 */
export function parseReport(value: unknown, kind: ReviewRequest['kind']): ReviewReport {
  const row = record(value, ['verdict', 'summary', 'findings'], true);
  const verdict = row.verdict;
  if (verdict !== 'pass' && verdict !== 'changes-required' && verdict !== 'inconclusive' && verdict !== 'replan') {
    throw new Error('Unsupported review verdict.');
  }
  if (!Array.isArray(row.findings)) throw new Error('findings must be an array.');
  const findings = row.findings.map(value => {
    const item = record(value, ['location', 'problem', 'evidence'], true);
    return { location: nonempty(item.location), problem: nonempty(item.problem), evidence: nonempty(item.evidence) };
  });
  if (verdict === 'pass' && findings.length !== 0) throw new Error('A pass cannot contain unresolved findings.');
  if ((verdict === 'changes-required' || verdict === 'replan') && findings.length === 0) throw new Error('An adverse verdict requires evidence-backed findings.');
  if (verdict === 'replan' && kind !== 'module') throw new Error('Only module supervision can request replanning.');
  return { verdict, summary: nonempty(row.summary), findings };
}

/**
 * 从子 Agent 的文本里取出 JSON 再交给 parseReport。
 * 只容忍传输噪声（Markdown 围栏、前后说明文字），结论本身仍按严格规则校验；
 * 找不到对象或解析失败直接报错，不猜测结论。
 * @param value 子 Agent 返回的原始文本。
 * @param kind 此次检查类型。
 * @returns 经校验的检查结论。
 */
export function parseReportText(value: unknown, kind: ReviewRequest['kind']): ReviewReport {
  return parseJsonText(value, item => parseReport(item, kind));
}

/**
 * 供审计与财务的文本协议共用：提取 JSON 后由调用方自己的校验器验证，不放松结论规则。
 * @param value 子 Agent 原始输出。
 * @param parse 对解析后的未知对象进行领域校验；校验失败继续尝试原始文本，仍失败就抛出。
 * @returns 经调用方校验的数据；泛型 T 表示审计或财务各自的返回类型。
 */
export function parseJsonText<T>(value: unknown, parse: (item: unknown) => T): T {
  if (typeof value !== 'string') throw new Error('Review output must be text.');
  const stripped = value.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/, '').trim();
  let lastError: unknown = new Error('Review output contains no JSON object.');
  for (const candidate of [stripped, value]) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      return parse(JSON.parse(candidate.slice(start, end + 1)));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
