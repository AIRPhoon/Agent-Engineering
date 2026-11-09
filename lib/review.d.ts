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
export interface Finding {
    location: string;
    problem: string;
    evidence: string;
}
/** replan 只允许模块监理提出；inconclusive 表示证据不足，不能当作通过。 */
export interface ReviewReport {
    verdict: 'pass' | 'changes-required' | 'inconclusive' | 'replan';
    summary: string;
    findings: Finding[];
}
/** 原始工具的参数声明；parseRequest 负责在执行入口验证相同字段。 */
export declare const requestSchema: ObjectJsonSchema;
/** 输入、审计与财务协议共用的对象校验；多余字段视为协议错误，不猜测意图。 */
export declare function record(value: unknown, keys: readonly string[], exact: boolean): Record<string, unknown>;
/** 输入、审计与财务协议共用的非空文本校验；未知条件须写明未知，不补默认约定。 */
export declare function nonempty(value: unknown): string;
/**
 * 工具 execute 调用本函数，把模型提供的 JSON 转成规范字段顺序的请求。
 * @param value 未验证的工具参数。
 * @returns 完整的函数或模块检查请求；缺失信息直接报错。
 */
export declare function parseRequest(value: unknown): ReviewRequest;
/**
 * 子 Agent 完成后校验结构化结果，额外核对 schema 无法表达的职责和结论约束。
 * @param value DSH 子 Agent 文本解析后的 JSON，或测试用检查器的输出。
 * @param kind 此次检查类型。
 * @returns 可反馈给执行方或规划方的意见。
 */
export declare function parseReport(value: unknown, kind: ReviewRequest['kind']): ReviewReport;
/**
 * 从子 Agent 的文本里取出 JSON 再交给 parseReport。
 * 只容忍传输噪声（Markdown 围栏、前后说明文字），结论本身仍按严格规则校验；
 * 找不到对象或解析失败直接报错，不猜测结论。
 * @param value 子 Agent 返回的原始文本。
 * @param kind 此次检查类型。
 * @returns 经校验的检查结论。
 */
export declare function parseReportText(value: unknown, kind: ReviewRequest['kind']): ReviewReport;
/**
 * 供审计与财务的文本协议共用：提取 JSON 后由调用方自己的校验器验证，不放松结论规则。
 * @param value 子 Agent 原始输出。
 * @param parse 对解析后的未知对象进行领域校验；校验失败继续尝试原始文本，仍失败就抛出。
 * @returns 经调用方校验的数据；泛型 T 表示审计或财务各自的返回类型。
 */
export declare function parseJsonText<T>(value: unknown, parse: (item: unknown) => T): T;
