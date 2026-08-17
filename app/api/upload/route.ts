// import { NextRequest, NextResponse } from 'next/server';
// import { getTempFilePath } from '@/service/temp.service';
// import fs from 'fs';
// import path from 'path';

// // 1. 强制指定 Node.js 运行时（确保可以使用 fs / path 模块）
// export const runtime = 'nodejs';

// // 2. 声明 Next.js API 路由最大允许执行时间为 60 秒
// export const maxDuration = 60;

// export async function POST(req: NextRequest) {
//   try {
//     const formData = await req.formData();
//     const file = formData.get('file') as File | null;

//     // 💡 1. 拦截空文件输入
//     if (!file || file.size === 0) {
//       return NextResponse.json(
//         { error: '未接收到有效的上传文件，或文件内容为空(0字节)' },
//         { status: 400 }
//       );
//     }

//     const buffer = Buffer.from(await file.arrayBuffer());

//     if (buffer.length === 0) {
//       return NextResponse.json(
//         { error: '读取文件 Buffer 失败，文件内容为空' },
//         { status: 400 }
//       );
//     }

//     // 2. 清洗文件名并拼接唯一时间戳
//     const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
//     const safeName = `${Date.now()}_${sanitizedName}`;
//     const filePath = getTempFilePath(safeName);

//     // 3. 创建存放目录
//     const dirPath = path.dirname(filePath);
//     await fs.promises.mkdir(dirPath, { recursive: true });

//     // 4. 写入原始文件 (PDF 或 PPTX)
//     await fs.promises.writeFile(filePath, buffer);

//     // 💡 5. 校验磁盘中的物理文件大小，防止产生 0 字节破坏性文件
//     const originalStat = await fs.promises.stat(filePath);
//     if (originalStat.size === 0) {
//       await fs.promises.unlink(filePath).catch(() => {});
//       return NextResponse.json(
//         { error: '原始文件写入失败，磁盘占用为 0 字节' },
//         { status: 500 }
//       );
//     }

//     const isPptx = /\.(pptx|ppt)$/i.test(safeName);
//     const isPdf = /\.pdf$/i.test(safeName);

//     if (!isPptx && !isPdf) {
//       // 格式不符时删除已写入的临时文件
//       await fs.promises.unlink(filePath).catch(() => {});
//       return NextResponse.json(
//         { error: '仅支持上传 PDF 或 PPTX/PPT 格式文件' },
//         { status: 400 }
//       );
//     }

//     let pdfFileName = safeName;

//     // 6. 若为 PPTX，通过 Gotenberg HTTP API 转换为 PDF
//     if (isPptx) {
//       console.log(
//         `[Upload API] 开始将 PPTX 发送至 Gotenberg 转换: ${safeName} (${originalStat.size} bytes)`
//       );

//       try {
//         const gotenbergUrl = process.env.GOTENBERG_URL || 'http://localhost:3001';
//         const gotenbergSecret = process.env.GOTENBERG_SECRET;

//         // 构建 FormData 发往 Gotenberg
//         const gotenbergFormData = new FormData();
//         const blob = new Blob([buffer], {
//           type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
//         });

//         // ⚠️ Gotenberg 规定接收文件的字段名必须叫 'files'
//         gotenbergFormData.append('files', blob, file.name);

//         const headers: Record<string, string> = {};
//         if (gotenbergSecret) {
//           headers['X-Api-Key'] = gotenbergSecret;
//         }

//         // 设置 1 分钟 (60,000 ms) 超时控制器
//         const controller = new AbortController();
//         const timeoutId = setTimeout(() => controller.abort(), 60000);

//         // 发起 HTTP 请求到 Gotenberg
//         const gotenbergRes = await fetch(`${gotenbergUrl}/forms/libreoffice/convert`, {
//           method: 'POST',
//           headers: headers,
//           body: gotenbergFormData,
//           signal: controller.signal,
//         });

//         // 收到响应后清理超时定时器
//         clearTimeout(timeoutId);

//         if (!gotenbergRes.ok) {
//           const errorText = await gotenbergRes.text().catch(() => '');
//           throw new Error(
//             `Gotenberg 响应异常 [${gotenbergRes.status}]: ${errorText || gotenbergRes.statusText}`
//           );
//         }

//         // 接收转换好的 PDF 二进制流
//         const pdfArrayBuffer = await gotenbergRes.arrayBuffer();
//         const convertedPdfBuffer = Buffer.from(pdfArrayBuffer);

//         if (convertedPdfBuffer.length === 0) {
//           throw new Error('Gotenberg 返回的 PDF 文件流为空(0字节)');
//         }

//         // 写入本地临时文件，保持与后续 API 兼容
//         const convertedPdfName = safeName.replace(/\.(pptx|ppt)$/i, '.pdf');
//         const convertedPdfPath = getTempFilePath(convertedPdfName);

//         await fs.promises.writeFile(convertedPdfPath, convertedPdfBuffer);

//         // 💡 校验转换出来的 PDF 磁盘大小
//         const pdfStat = await fs.promises.stat(convertedPdfPath);
//         if (pdfStat.size === 0) {
//           throw new Error('Gotenberg 转换出来的 PDF 写入磁盘为 0 字节');
//         }

//         pdfFileName = convertedPdfName;
//         console.log(
//           `[Upload API] PPTX -> PDF 转换成功: ${pdfFileName} (${pdfStat.size} bytes)`
//         );
//       } catch (convError: any) {
//         console.error('[Upload API] Gotenberg 转换失败:', convError);

//         const isAbort = convError.name === 'AbortError';
//         const errorMessage = isAbort
//           ? 'PPTX 转换超时（超过 60 秒），文件可能过大，请压缩后再试'
//           : `PPTX 转换失败: ${convError.message}。请检查 Gotenberg 服务状态`;

//         return NextResponse.json({ error: errorMessage }, { status: 500 });
//       }
//     }

//     // 7. 返回给前端成功结构
//     return NextResponse.json({
//       success: true,
//       fileType: isPptx ? 'pptx' : 'pdf',
//       serverFileName: safeName,
//       pdfFileName: pdfFileName,
//       originalUrl: `/api/temp-file?name=${safeName}`,
//       pdfUrl: `/api/temp-file?name=${pdfFileName}`,
//     });
//   } catch (error: any) {
//     console.error('[Upload Error]:', error);
//     return NextResponse.json(
//       { error: error.message || '服务器内部错误' },
//       { status: 500 }
//     );
//   }
// }

import { NextRequest, NextResponse } from 'next/server';
import { getTempFilePath } from '@/service/temp.service';
import CloudConvert from 'cloudconvert';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 120; // 120 秒超时，足够上传与转码 20MB+ 大文件

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: '未接收到有效的上传文件，或文件内容为空(0字节)' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json(
        { error: '读取文件 Buffer 失败，文件内容为空' },
        { status: 400 }
      );
    }

    // Step 1: 清洗文件名并将原始文件存入磁盘
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = `${Date.now()}_${sanitizedName}`;
    const filePath = getTempFilePath(safeName);

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);

    const isPptx = /\.(pptx|ppt)$/i.test(safeName);
    const isPdf = /\.pdf$/i.test(safeName);

    if (!isPptx && !isPdf) {
      await fs.promises.unlink(filePath).catch(() => {});
      return NextResponse.json(
        { error: '仅支持上传 PDF 或 PPTX/PPT 格式文件' },
        { status: 400 }
      );
    }

    let pdfFileName = safeName;

    // Step 2: 如果是 PPTX，通过 CloudConvert 转码为 PDF
    if (isPptx) {
      console.log(`[Upload API] 开始通过 CloudConvert 转码: ${safeName}`);

      const apiKey = process.env.CLOUDCONVERT_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: '服务端未配置 CLOUDCONVERT_API_KEY 环境变量' },
          { status: 500 }
        );
      }

      const cloudConvert = new CloudConvert(apiKey);

      // 创建转码 Job
      const job = await cloudConvert.jobs.create({
        tasks: {
          'upload-file': { operation: 'import/upload' },
          'convert-pptx': {
            operation: 'convert',
            input: 'upload-file',
            output_format: 'pdf',
            engine: 'office',
          },
          'export-file': {
            operation: 'export/url',
            input: 'convert-pptx',
          },
        },
      });

      // 流式上传至 CloudConvert，避免服务器 RAM 溢出
      const uploadTask = job.tasks.find((task) => task.name === 'upload-file');
      if (!uploadTask) {
        throw new Error('无法初始化 CloudConvert 上传任务');
      }

      const fileStream = fs.createReadStream(filePath);
      await cloudConvert.tasks.upload(uploadTask, fileStream, safeName);

      // 挂起等待云端转换完成
      const completedJob = await cloudConvert.jobs.wait(job.id);

      // 获取并下载转码后的 PDF
      const exportTask = completedJob.tasks.find((task) => task.name === 'export-file');
      const pdfResultFile = exportTask?.result?.files?.[0];

      if (!pdfResultFile || !pdfResultFile.url) {
        throw new Error('CloudConvert 转码完成，但未返回有效的 PDF 下载链接');
      }

      const convertedPdfName = safeName.replace(/\.(pptx|ppt)$/i, '.pdf');
      const convertedPdfPath = getTempFilePath(convertedPdfName);

      const pdfResponse = await fetch(pdfResultFile.url);
      if (!pdfResponse.ok) {
        throw new Error(`下载转换后的 PDF 失败: ${pdfResponse.statusText}`);
      }

      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      await fs.promises.writeFile(convertedPdfPath, pdfBuffer);

      pdfFileName = convertedPdfName;
      console.log(`[Upload API] PPTX -> PDF 转换成功: ${pdfFileName}`);
    }

    // Step 3: 一次性返回前端所需的全部文件结构
    return NextResponse.json({
      success: true,
      fileType: isPptx ? 'pptx' : 'pdf',
      serverFileName: safeName,
      pdfFileName: pdfFileName,
      originalUrl: `/api/temp-file?name=${safeName}`,
      pdfUrl: `/api/temp-file?name=${pdfFileName}`,
    });

  } catch (error: any) {
    console.error('[Upload API Error]:', error);

    let errorMessage = error.message || '服务器内部错误';
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}