/** 单个文件的真实内容、身份哈希和字节数；text 直接进入检查提示。 */
export interface EvidenceFile {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly text: string;
}
/**
 * 计算内容哈希；指纹和证据身份都用同一种编码，避免同一份内容算出两个值。
 * @param text 文件或提交文本。
 * @returns 十六进制 SHA-256。
 */
export declare function sha256(text: string): string;
/**
 * 在工作区根目录下读取报送的文件。
 * 路径字符串合法不等于文件真的在工作区里：stat 和 readFile 都会跟随符号链接与目录联接。
 * 因此先按真实路径核对边界，再打开同一个文件句柄读取，避免把区外内容当作证据。
 * @param root 当前会话的工作目录绝对路径。
 * @param paths 报送的工作区相对路径，允许重复，重复项只读一次。
 * @returns 按报送顺序排列的文件内容；越界、非常规文件、二进制或超限时抛出。
 */
export declare function readEvidence(root: string, paths: readonly string[]): Promise<EvidenceFile[]>;
