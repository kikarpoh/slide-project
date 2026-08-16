import { NextRequest, NextResponse } from 'next/server';
import { getTempFilePath } from '@/service/temp.service';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('name');

    if (!fileName) {
      return NextResponse.json({ error: '缺少文件名参数' }, { status: 400 });
    }

    // 防止路径穿越攻击 (Security)
    const safeName = path.basename(fileName);
    const filePath = getTempFilePath(safeName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: '文件不存在或已清除' }, { status: 404 });
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const ext = path.extname(safeName).toLowerCase();

    // 匹配 Header 类型
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.pptx') {
      contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    } else if (ext === '.ppt') {
      contentType = 'application/vnd.ms-powerpoint';
    }

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(safeName)}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '读取文件失败' }, { status: 500 });
  }
}