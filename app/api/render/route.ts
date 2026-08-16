import { NextRequest, NextResponse } from "next/server";
import Automizer, { ModifyImageHelper, ModifyShapeHelper } from "pptx-automizer"; // 💡 补全 ModifyShapeHelper
import path from "path";
import fs from "fs/promises";
import { existsSync, statSync, readFileSync } from "fs"; // 💡 补全 readFileSync
import { imageSize } from "image-size";

export const runtime = "nodejs";

const TEMP_DIR = path.join(process.cwd(), "public", "temp");
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "tmp", "output");
const BLANK_TEMPLATE = "blank_template.pptx";

// 💡 PPT 尺寸常量 (标准 16:9 幻灯片尺寸，单位: EMU)
// 1 像素 (96 DPI) ≈ 9525 EMU
const PX_TO_EMU = 9525;
const SLIDE_WIDTH_EMU = 12192000;  // 13.333 英寸 (标准宽屏宽度)
const SLIDE_HEIGHT_EMU = 6858000;   // 7.5 英寸 (标准宽屏高度)

// 💡 辅助函数：校验 PPTX 文件合法性 (存在、非空、是 .pptx 后缀)
function validatePptxFile(filename: string, dirPath: string): { valid: boolean; reason?: string } {
    if (!filename || !filename.toLowerCase().endsWith(".pptx")) {
        return { valid: false, reason: `文件 "${filename}" 不是 .pptx 格式` };
    }

    const fullPath = path.join(dirPath, filename);
    if (!existsSync(fullPath)) {
        return { valid: false, reason: `文件不存在: ${fullPath}` };
    }

    const stats = statSync(fullPath);
    if (stats.size === 0) {
        return { valid: false, reason: `文件大小为 0 字节 (坏文件): ${fullPath}` };
    }

    return { valid: true };
}

export async function POST(req: NextRequest) {
    try {
        const { tasks, uploadSessionId, templatePath } = await req.json();

        if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
            return NextResponse.json({ error: "任务序列不能为空" }, { status: 400 });
        }

        await fs.mkdir(TEMP_DIR, { recursive: true });
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.mkdir(OUTPUT_DIR, { recursive: true });

        // 1. 初始化 Automizer
        const automizer = new Automizer({
            templateDir: TEMP_DIR,   // PPTX 根目录
            mediaDir: UPLOAD_DIR,     // 图片根目录
            outputDir: OUTPUT_DIR,
            removeExistingSlides: true,
        });

        // 2. 确定并校验根模板 Root Template
        let rootTemplate = BLANK_TEMPLATE;
        const firstPptxTask = tasks.find(
            (t) => t.type === "pptx_upload" && t.pptxServerFileName
        );

        if (firstPptxTask?.pptxServerFileName) {
            const check = validatePptxFile(firstPptxTask.pptxServerFileName, TEMP_DIR);
            if (check.valid) {
                rootTemplate = firstPptxTask.pptxServerFileName;
            }
        } else if (templatePath) {
            const check = validatePptxFile(templatePath, TEMP_DIR);
            if (check.valid) {
                rootTemplate = templatePath;
            }
        }

        // 校验最终确定的 Root Template
        const rootCheck = validatePptxFile(rootTemplate, TEMP_DIR);
        if (!rootCheck.valid) {
            console.error(`[Render Error] 根模板无效: ${rootCheck.reason}`);
            return NextResponse.json(
                { error: `渲染失败：根模板损坏或无效 (${rootCheck.reason})` },
                { status: 400 }
            );
        }

        console.log(`[Render API] 加载根模板: ${rootTemplate} (${statSync(path.join(TEMP_DIR, rootTemplate)).size} bytes)`);
        automizer.loadRoot(rootTemplate);

        // 3. 预加载所有有效 PPTX（去重 + 内存优化）
        const loadedPptxMap = new Map<string, string>(); // 映射：pptxServerFileName -> aliasKey

        tasks.forEach((task) => {
            if (task.type === "pptx_upload" && task.pptxServerFileName) {
                const fileName = task.pptxServerFileName;

                // 核心优化：判断该 PPTX 是否已经在内存中 loaded 过
                if (!loadedPptxMap.has(fileName)) {
                    const check = validatePptxFile(fileName, TEMP_DIR);
                    if (check.valid) {
                        // 生成全局唯一的内存别名，防止多次装载同一模板消耗内存
                        const aliasKey = `src_pptx_uniq_${loadedPptxMap.size}`;
                        console.log(`[Render API] 首次加载 PPTX 至内存: ${fileName} -> ${aliasKey}`);

                        automizer.load(fileName, aliasKey);
                        loadedPptxMap.set(fileName, aliasKey);

                        // 绑死映射别名到 task 对象中
                        task.pptxAlias = aliasKey;
                    } else {
                        console.warn(`[Render Warning] 跳过无效 PPTX 任务: ${check.reason}`);
                    }
                } else {
                    // 已存在，直接复用已有的别名，不再重复装载解压包！
                    const existingAlias = loadedPptxMap.get(fileName);
                    console.log(`[Render API] 复用已载入内存的 PPTX: ${fileName} (${existingAlias})`);
                    task.pptxAlias = existingAlias;
                }
            }
        });

        // 如果涉及图片插入，确保空白底板合法
        const hasImgTasks = tasks.some(
            (t) => t.type === "image_upload" || t.type === "image_crop"
        );
        if (hasImgTasks && rootTemplate !== BLANK_TEMPLATE) {
            const blankCheck = validatePptxFile(BLANK_TEMPLATE, TEMP_DIR);
            if (blankCheck.valid) {
                automizer.load(BLANK_TEMPLATE, BLANK_TEMPLATE);
            } else {
                console.warn(`[Render Warning] Blank 模板不可用: ${blankCheck.reason}`);
            }
        }


        console.log(tasks)
        // 4. 按序组装
        tasks.forEach((task, index) => {

            console.log(task.type,)
            if (task.type === "pptx_upload") {
                // 💡 关键修复：直接读取步骤 3 中绑定的 pptxAlias，绝不可再用 src_pptx_${index} 重新拼别名！
                if (task.pptxAlias) {
                    const pageNum = task.sourceSlides?.[0] || 1;
                    console.log(`[Render API] 成功添加 Slide (索引 ${index}): 别名 ${task.pptxAlias}, 页码 P.${pageNum}`);
                    automizer.addSlide(task.pptxAlias, pageNum);
                } else {
                    console.warn(`[Render Warning] 跳过添加 Slide (索引 ${index}): PPTX 未通过预加载校验`);
                }
            } else if (
                (task.type === "image_upload" || task.type === "image_crop") &&
                (task.imageServerFileName || task.cropImageServerFileName)
            ) {
                const imgName =
                    task.type === "image_upload"
                        ? task.imageServerFileName!
                        : task.cropImageServerFileName!;

                    console.log(imgName)

                const imgFullPath = path.join(UPLOAD_DIR, imgName);
                if (!existsSync(imgFullPath)) return;

                // 1. 读取图片原始尺寸 (px)
                const imgBuffer = readFileSync(imgFullPath);
                const dimensions = imageSize(imgBuffer);
                const originalWidthPx = dimensions.width || 800;
                const originalHeightPx = dimensions.height || 600;

                // 2. 转换为 EMU 原始物理大小
                const origW = Math.round(originalWidthPx * PX_TO_EMU);
                const origH = Math.round(originalHeightPx * PX_TO_EMU);

                // 3. 设定最大允许范围 max_w, max_h (默认等于幻灯片画布大小)
                const max_w = SLIDE_WIDTH_EMU;
                const max_h = SLIDE_HEIGHT_EMU;

                // 4. 超出范围时进行等比缩小
                let scale = 1;
                if (origW > max_w || origH > max_h) {
                    scale = Math.min(max_w / origW, max_h / origH);
                }

                const finalW = Math.round(origW * scale);
                const finalH = Math.round(origH * scale);

                // 5. 居中计算
                const xEmu = Math.round((SLIDE_WIDTH_EMU - finalW) / 2);
                const yEmu = Math.round((SLIDE_HEIGHT_EMU - finalH) / 2);

                automizer.loadMedia(imgName, UPLOAD_DIR);

                const targetTemplate = validatePptxFile(BLANK_TEMPLATE, TEMP_DIR).valid
                    ? BLANK_TEMPLATE
                    : rootTemplate;

                automizer.addSlide(targetTemplate, 1, (slide) => {
                    slide.modifyElement("ImagePlaceholder", [
                        // 替换图片内容
                        ModifyImageHelper.setRelationTarget(imgName) as any,

                        // 设置居中坐标与最终宽高
                        ModifyShapeHelper.setPosition({
                            x: xEmu,
                            y: yEmu,
                            w: finalW,
                            h: finalH,
                        }) as any,

                        // 清理占位符默认裁切与填充推移，确保精准渲染
                        (element: any) => {
                            const blipFill = element?.['p:blipFill']?.[0];
                            if (blipFill) {
                                delete blipFill['a:srcRect'];
                                blipFill['a:stretch'] = [{
                                    'a:fillRect': [{ $: { l: '0', t: '0', r: '0', b: '0' } }]
                                }];
                            }
                        }
                    ]);
                });
            }
        });
        // 5. 写入导出
        const outputFileName = `render_${uploadSessionId}_${Date.now()}.pptx`;
        await automizer.write(outputFileName);

        const resultFilePath = path.join(OUTPUT_DIR, outputFileName);
        const fileBuffer = await fs.readFile(resultFilePath);
        await fs.unlink(resultFilePath).catch(() => { });

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type":
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(
                    outputFileName
                )}"`,
            },
        });
    } catch (error: any) {
        console.error("[Render API Error]:", error);
        return NextResponse.json(
            { error: error.message || "PPT 渲染失败" },
            { status: 500 }
        );
    }
}