/** 读取报送方指定的真实文件；本模块只读，不写入工作区。 */
import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
/** 单文件与合计上限；超限直接报错，不静默截断后再冒充完整证据。 */
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024;
/**
 * 计算内容哈希；指纹和证据身份都用同一种编码，避免同一份内容算出两个值。
 * @param text 文件或提交文本。
 * @returns 十六进制 SHA-256。
 */
export function sha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
/**
 * 判断一个真实路径是否落在根目录之外（根目录本身也算在外）。
 * 同时适用于词法路径与 realpath 得到的真实路径；Windows 跨盘符时 relative 返回绝对路径，也在这里拦下。
 * @param base 工作区的真实根目录。
 * @param target 待判断的绝对路径。
 * @returns 越界为 true。
 */
function outside(base, target) {
    const inside = relative(base, target);
    // 只比较完整的 '..' 段，避免把合法的 '..foo.ts' 文件名误判为越界。
    return inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside);
}
/**
 * 在工作区根目录下读取报送的文件。
 * 路径字符串合法不等于文件真的在工作区里：stat 和 readFile 都会跟随符号链接与目录联接。
 * 因此先按真实路径核对边界，再打开同一个文件句柄读取，避免把区外内容当作证据。
 * @param root 当前会话的工作目录绝对路径。
 * @param paths 报送的工作区相对路径，允许重复，重复项只读一次。
 * @returns 按报送顺序排列的文件内容；越界、非常规文件、二进制或超限时抛出。
 */
export async function readEvidence(root, paths) {
    // 只报送粘贴文本时不读文件，也就没必要解析工作区根目录。
    if (paths.length === 0)
        return [];
    const files = [];
    const seen = new Set();
    // 工作目录本身也可能是经目录联接挂入的，先把根规范成真实路径，后续比较才有意义。
    const base = await realpath(root);
    let total = 0;
    for (const raw of paths) {
        const path = raw.trim();
        if (seen.has(path))
            continue;
        seen.add(path);
        const requested = resolve(base, path);
        // 第一道检查拦住词法上的 ../ 与绝对路径。
        if (outside(base, requested))
            throw new Error(`Evidence path escapes the workspace: ${path}`);
        // 第二道检查拦住“路径字符串在区内、链接目标在区外”的情况。
        const actual = await realpath(requested);
        if (outside(base, actual))
            throw new Error(`Evidence path resolves outside the workspace: ${path}`);
        const handle = await open(actual, 'r');
        try {
            const info = await handle.stat();
            if (!info.isFile())
                throw new Error(`Evidence path is not a regular file: ${path}`);
            if (info.size > MAX_FILE_BYTES)
                throw new Error(`Evidence file exceeds ${MAX_FILE_BYTES} bytes: ${path}`);
            const buffer = await handle.readFile();
            // fstat 与读取之间文件可能被替换；尺寸以实际读到的字节为准，不静默接受不一致内容。
            if (buffer.byteLength !== info.size)
                throw new Error(`Evidence file changed while being read: ${path}`);
            total += buffer.byteLength;
            if (total > MAX_TOTAL_BYTES)
                throw new Error(`Evidence exceeds ${MAX_TOTAL_BYTES} bytes in total.`);
            // NUL 字节是二进制文件的可靠信号；不把乱码当代码送去审查。
            if (buffer.includes(0))
                throw new Error(`Evidence file appears to be binary: ${path}`);
            const text = buffer.toString('utf8');
            files.push({ path, sha256: sha256(text), bytes: buffer.byteLength, text });
        }
        finally {
            await handle.close();
        }
    }
    return files;
}
//# sourceMappingURL=evidence.js.map