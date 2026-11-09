/**
 * 插件级检查记忆：按工作区持久化去重、比较基线和财务判断，并按活跃度遗忘。
 * 状态放在 DSH_HOME 下，不依赖项目是否维护 memory/，也不进入任何一次检查的材料。
 */
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isDecision } from './finance.js';
import { isKind, isVerdict } from './review.js';
/** 活跃项目 60 天未使用即视为不活跃；单项目与全局都有上限，防止 C 盘无序增长。 */
const DEFAULT_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_PROJECTS = 32;
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_PROJECT_BYTES = 512 * 1024;
const DEFAULT_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const KEEP_RECENT_REVIEWS = 20;
const KEEP_FINANCE = 32;
const SUMMARY_REVIEWS = 20;
const SUMMARY_FINANCE = 10;
/** 项目目录名：真实路径的短哈希；Windows 路径不区分大小写，先转小写。 */
function projectKey(workspace) {
    const normalized = process.platform === 'win32' ? workspace.toLowerCase() : workspace;
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
/** 错误统一转成可读文本，写进 degraded 后由工具结果提示。 */
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/** 先写临时文件再改名，避免读到写了一半的索引或摘要。 */
async function writeAtomic(file, text) {
    const temp = `${file}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(temp, text, 'utf8');
    await rename(temp, file);
}
/** 读取 JSON 文件；缺失或损坏都返回 null，由调用方决定回退。 */
async function readJson(file) {
    try {
        return JSON.parse(await readFile(file, 'utf8'));
    }
    catch {
        return null;
    }
}
/** 记录文件大小；文件不存在按 0 处理，用于触发压缩。 */
async function fileSize(file) {
    try {
        return (await stat(file)).size;
    }
    catch {
        return 0;
    }
}
/** 非空文本；结构校验只判断可读性，不重新解释内容。 */
function isText(value) {
    return typeof value === 'string' && value.trim() !== '';
}
/** 可解析的时间戳；坏时间会让基线排序失序，因此按坏记录处理。 */
function stamp(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
/** 查报告里的一条意见；字段类型不对就不能当作可用报告。 */
function isFinding(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const row = value;
    return isText(row.location) && isText(row.problem) && isText(row.evidence);
}
/**
 * 校验审查报告的结构与自洽性。
 * 只接受程序会写出的形状，并与 parseReport 的规则对齐：
 * pass 不能带未解决意见，要求修改或重规划必须有意见，replan 只属于模块检查。
 * @param value 记录里的 report 字段。
 * @param kind 记录声明的检查类型。
 * @returns 可安全用于去重与基线恢复时为 true。
 */
function isReviewReport(value, kind) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const row = value;
    const verdict = row.verdict;
    if (!isVerdict(verdict))
        return false;
    if (!isText(row.summary) || !Array.isArray(row.findings) || !row.findings.every(isFinding))
        return false;
    if (verdict === 'pass' && row.findings.length !== 0)
        return false;
    if ((verdict === 'changes-required' || verdict === 'replan') && row.findings.length === 0)
        return false;
    return verdict !== 'replan' || kind === 'module';
}
/** 校验财务理由：来源、引文和说明都必须是文本，缺一个就不能复核。 */
function isFinanceReason(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const row = value;
    return isText(row.source) && isText(row.quote) && isText(row.explanation);
}
/**
 * 校验一条审查记录：浅层字段、文件配对与报告结构都要成立。
 * 坏记录曾经的后果是被当作真实性通过塞进去重集，或让 new Map 直接抛错，
 * 因此这里宁可整条跳过，也不把可疑数据当历史。
 * @param value 一行 JSON 解析结果。
 * @returns 结构可信时为 true。
 */
function isReviewRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const row = value;
    if (row.type !== 'review' || row.v !== 1)
        return false;
    if (!isText(row.fp) || !isText(row.scope) || !isText(row.target) || !isText(row.details))
        return false;
    const kind = row.kind;
    if (!isKind(kind))
        return false;
    const verdict = row.verdict;
    if (!isVerdict(verdict))
        return false;
    if (!stamp(row.startedAt) || !stamp(row.at))
        return false;
    if (row.model !== null && typeof row.model !== 'string')
        return false;
    if (!Array.isArray(row.files))
        return false;
    for (const pair of row.files) {
        if (!Array.isArray(pair) || pair.length !== 2 || !isText(pair[0]) || !isText(pair[1]))
            return false;
    }
    if (!isReviewReport(row.report, kind))
        return false;
    // 记录结论与报告结论必须一致，避免改了一处就留下自相矛盾的通过记录。
    return row.report.verdict === verdict;
}
/**
 * 校验一条财务记录：结论、理由与建议文件都必须自洽。
 * @param value 一行 JSON 解析结果。
 * @returns 结构可信时为 true。
 */
function isFinanceRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const row = value;
    if (row.type !== 'finance' || row.v !== 1 || !isText(row.key) || !stamp(row.at))
        return false;
    const decision = row.decision;
    if (!isDecision(decision))
        return false;
    if (row.model !== null && typeof row.model !== 'string')
        return false;
    const report = row.report;
    if (report === null || typeof report !== 'object' || Array.isArray(report))
        return false;
    const fields = report;
    const reportDecision = fields.decision;
    if (!isDecision(reportDecision))
        return false;
    if (!isText(fields.summary))
        return false;
    if (!Array.isArray(fields.reasons) || fields.reasons.length === 0 || !fields.reasons.every(isFinanceReason))
        return false;
    if (!Array.isArray(fields.proposedFiles) || !fields.proposedFiles.every(isText))
        return false;
    // 与 parseFinanceReport 一致：只有 narrow 可以给出较小的文件范围。
    if (reportDecision === 'narrow' ? fields.proposedFiles.length === 0 : fields.proposedFiles.length !== 0)
        return false;
    return reportDecision === decision;
}
/** 项目目录总大小（记录 + 摘要），用于全局预算与淘汰。 */
async function dirSize(dir) {
    let total = 0;
    let names = [];
    try {
        names = await readdir(dir);
    }
    catch {
        return 0;
    }
    for (const name of names)
        total += await fileSize(join(dir, name));
    return total;
}
/** 读取并校验记录；单行损坏只跳过该行，不让整份历史失效。 */
async function readProject(dir) {
    const reviews = [];
    const finance = [];
    let text;
    try {
        text = await readFile(join(dir, 'records.jsonl'), 'utf8');
    }
    catch {
        return { reviews, finance };
    }
    for (const line of text.split('\n')) {
        if (line.trim() === '')
            continue;
        let row;
        try {
            row = JSON.parse(line);
        }
        catch {
            continue;
        }
        // 结构不可信的记录整条跳过：坏行只损失一条历史，不能污染去重集或让加载抛错。
        if (isReviewRecord(row))
            reviews.push(row);
        else if (isFinanceRecord(row))
            finance.push(row);
    }
    return { reviews, finance };
}
/** 超过单项目上限时压缩：保留每个对象最新一条、最近 20 条审查与最近 32 条财务判断。 */
async function compact(dir) {
    const { reviews, finance } = await readProject(dir);
    // “最近”按报送开始时间排序，而不是按完成顺序；否则乱序完成会把旧版本留成基线。
    const reviewOrder = [...reviews].sort((left, right) => (left.startedAt ?? '').localeCompare(right.startedAt ?? '') || (left.at ?? '').localeCompare(right.at ?? ''));
    const latestReview = new Map();
    for (const record of reviewOrder)
        latestReview.set(record.scope, record);
    const recentReviews = new Set(reviewOrder.slice(-KEEP_RECENT_REVIEWS));
    const keepReview = new Set([...latestReview.values(), ...recentReviews]);
    const financeOrder = [...finance].sort((left, right) => (left.at ?? '').localeCompare(right.at ?? ''));
    const latestFinance = new Map();
    for (const record of financeOrder)
        latestFinance.set(record.key, record);
    const recentFinance = new Set(financeOrder.slice(-KEEP_FINANCE));
    const keepFinance = new Set([...latestFinance.values(), ...recentFinance]);
    const kept = [
        ...reviews.filter(record => keepReview.has(record)),
        ...finance.filter(record => keepFinance.has(record)),
    ];
    const text = kept.map(record => JSON.stringify(record)).join('\n');
    await writeAtomic(join(dir, 'records.jsonl'), text === '' ? '' : `${text}\n`);
}
/** 生成人读摘要；只列最近结论，完整状态仍在 records.jsonl。 */
async function writeSummary(dir, workspace, reviews, finance, now) {
    const lines = [
        '# 检查记忆摘要',
        '',
        `工作区：${workspace}`,
        `更新：${now.toISOString()}`,
        `已记录：${reviews.length} 条审查、${finance.length} 条财务判断`,
        '',
        '## 最近审查',
        ...reviews.slice(-SUMMARY_REVIEWS).map(record => `- ${record.at} [${record.verdict}] ${record.kind} ${record.target}（${record.fp.slice(0, 8)}）`),
        '',
        '## 最近财务',
        ...finance.slice(-SUMMARY_FINANCE).map(record => `- ${record.at} [${record.decision}] ${record.report.summary.slice(0, 80)}`),
        '',
    ];
    await writeAtomic(join(dir, 'summary.md'), lines.join('\n'));
}
/** 记录不可写时的降级句柄：本次检查照常完成，只是不会跨重启保留。 */
function degradedMemory(reason) {
    return { reviews: [], finance: [], degraded: reason, async append() { } };
}
/** 当前工作区的记忆；append 由 ReviewFlow 在结论产生后调用。 */
class LiveMemory {
    store;
    key;
    dir;
    workspace;
    reviews;
    finance;
    degraded = null;
    constructor(store, key, dir, workspace, reviews, finance) {
        this.store = store;
        this.key = key;
        this.dir = dir;
        this.workspace = workspace;
        this.reviews = reviews;
        this.finance = finance;
    }
    async append(record) {
        try {
            await this.store.appendRecord(this.dir, this.key, this.workspace, record);
            if (record.type === 'review')
                this.reviews.push(record);
            else
                this.finance.push(record);
        }
        catch (error) {
            this.degraded = errorText(error);
        }
    }
}
/** 宿主侧的记忆服务：加载当前项目、写入记录、按 TTL 与预算遗忘不活跃项目。 */
export class ReviewStore {
    base;
    now;
    ttlMs;
    maxProjects;
    maxBytes;
    maxProjectBytes;
    pruneIntervalMs;
    remove;
    /** 进程内所有记忆写操作共用一个队列：追加、压缩、摘要、索引与遗忘不会交错。 */
    queue = Promise.resolve();
    /** @param options 测试可注入 home、时钟和预算；生产使用 DSH_HOME 与默认值。 */
    constructor(options = {}) {
        const home = options.home ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');
        this.base = join(home, 'quality', 'v1');
        this.now = options.now ?? (() => new Date());
        this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
        this.maxProjects = options.maxProjects ?? DEFAULT_MAX_PROJECTS;
        this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
        this.maxProjectBytes = options.maxProjectBytes ?? DEFAULT_MAX_PROJECT_BYTES;
        this.pruneIntervalMs = options.pruneIntervalMs ?? DEFAULT_PRUNE_INTERVAL_MS;
        this.remove = options.remove ?? (path => rm(path, { recursive: true, force: true }));
    }
    /**
     * 加载一个工作区的记忆；首次访问会登记项目并顺带执行节流后的遗忘。
     * @param workspace 当前会话工作目录（绝对路径）。
     * @returns 历史记录与写入句柄；目录不可写时返回 degraded，不抛错阻断检查。
     */
    async load(workspace) {
        try {
            const real = await realpath(workspace);
            const key = projectKey(real);
            const dir = join(this.base, 'projects', key);
            // 整个加载（建目录、读记录、登记、遗忘、摘要）都在写队列内，另一个工作区的
            // prune 不会在本项目读盘后、登记前删掉它的目录。
            const { reviews, finance } = await this.enqueue(async () => {
                await mkdir(dir, { recursive: true });
                const state = await readProject(dir);
                // 索引/节流/摘要写失败只影响登记与摘要，不能丢掉刚读到的历史。
                await this.touchDirect(key, real).catch(() => { });
                await this.pruneThrottledDirect(key).catch(() => { });
                await writeSummary(dir, real, state.reviews, state.finance, this.now()).catch(() => { });
                return state;
            });
            return new LiveMemory(this, key, dir, real, reviews, finance);
        }
        catch (error) {
            return degradedMemory(errorText(error));
        }
    }
    /** 串行执行记忆写操作；单个任务失败不会让后续写永远被拒绝。 */
    async enqueue(task) {
        const next = this.queue.then(() => task());
        this.queue = next.then(() => undefined, () => undefined);
        return next;
    }
    /** 追加记录并完成压缩、摘要与索引更新；全部在同一条队列内。 */
    async appendRecord(dir, key, workspace, record) {
        await this.enqueue(async () => {
            await appendFile(join(dir, 'records.jsonl'), `${JSON.stringify(record)}\n`, 'utf8');
            if (await fileSize(join(dir, 'records.jsonl')) > this.maxProjectBytes)
                await compact(dir);
            const { reviews, finance } = await readProject(dir);
            await writeSummary(dir, workspace, reviews, finance, this.now()).catch(() => { });
            await this.touchDirect(key, workspace).catch(() => { });
        });
    }
    /** 直接更新索引；调用方已持有写队列。 */
    async touchDirect(key, workspace) {
        const index = await this.readIndex();
        index.projects[key] = { path: workspace, lastUsed: this.now().toISOString() };
        await this.writeIndex(index);
    }
    /** 读取索引；缺失或版本不符时从空索引开始，不迁移旧格式。 */
    async readIndex() {
        const raw = await readJson(join(this.base, 'index.json'));
        const projects = raw !== null && typeof raw === 'object' ? raw.projects : undefined;
        // projects 必须是对象；null 也满足 typeof === 'object'，会在这里被排除。
        if (raw !== null && typeof raw === 'object' && raw.v === 1 && projects !== null && typeof projects === 'object') {
            return raw;
        }
        return { v: 1, projects: {} };
    }
    /** 原子写入索引，目录不存在时先创建。 */
    async writeIndex(index) {
        await mkdir(this.base, { recursive: true });
        await writeAtomic(join(this.base, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    }
    /** 遗忘节流：默认每 6 小时检查一次；调用方已持有写队列。 */
    async pruneThrottledDirect(currentKey) {
        const marker = await readJson(join(this.base, 'last-prune.json'));
        const last = marker !== null && typeof marker === 'object' && typeof marker.at === 'string'
            ? Date.parse(marker.at) : 0;
        if (this.now().getTime() - last < this.pruneIntervalMs)
            return;
        await this.pruneDirect(currentKey);
        await mkdir(this.base, { recursive: true });
        await writeAtomic(join(this.base, 'last-prune.json'), `${JSON.stringify({ at: this.now().toISOString() })}\n`);
    }
    /**
     * 遗忘不活跃项目：先按 TTL，再按项目数/总字节预算淘汰最久未用的项目。
     * 当前项目永不淘汰；被清项目写一行 prune.log。调用方已持有写队列，
     * 因此这里的删目录不会与本进程的追加/压缩并发。
     * @param currentKey 当前正在使用的项目，必须保留。
     */
    async pruneDirect(currentKey) {
        const index = await this.readIndex();
        const projects = index.projects;
        const sizes = new Map();
        for (const key of Object.keys(projects))
            sizes.set(key, await dirSize(join(this.base, 'projects', key)));
        const now = this.now().getTime();
        const evicted = [];
        const drop = async (key, reason) => {
            const path = projects[key]?.path ?? key;
            try {
                await this.remove(join(this.base, 'projects', key));
            }
            catch {
                // 删不掉就保留索引条目：下一轮还会尝试，避免目录变成预算看不见的孤儿。
                return false;
            }
            delete projects[key];
            evicted.push(`${this.now().toISOString()}\t${reason}\t${path}`);
            return true;
        };
        for (const key of Object.keys(projects)) {
            if (key === currentKey)
                continue;
            const last = Date.parse(projects[key]?.lastUsed ?? '');
            if (!Number.isFinite(last) || now - last > this.ttlMs)
                await drop(key, 'ttl');
        }
        let total = [...sizes].reduce((sum, [key, size]) => sum + (projects[key] === undefined ? 0 : size), 0);
        let count = Object.keys(projects).length;
        if (count > this.maxProjects || total > this.maxBytes) {
            const candidates = Object.keys(projects)
                .filter(key => key !== currentKey)
                .sort((left, right) => Date.parse(projects[left]?.lastUsed ?? '') - Date.parse(projects[right]?.lastUsed ?? ''));
            for (const key of candidates) {
                if (count <= this.maxProjects && total <= this.maxBytes)
                    break;
                const size = sizes.get(key) ?? 0;
                const removed = await drop(key, 'lru');
                if (!removed)
                    continue;
                count -= 1;
                total -= size;
            }
        }
        if (evicted.length > 0) {
            await mkdir(this.base, { recursive: true }).catch(() => { });
            await appendFile(join(this.base, 'prune.log'), `${evicted.join('\n')}\n`, 'utf8').catch(() => { });
        }
        await this.writeIndex(index);
    }
}
//# sourceMappingURL=store.js.map