import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let fileBuffer: Buffer;
    let fileName: string;

    // 1. 处理 FormData (图片直接上传)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json(
          { success: false, error: "未接收到上传的文件" },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      fileBuffer = Buffer.from(bytes);
      const ext = path.extname(file.name) || ".png";
      fileName = `upload_${Date.now()}${ext}`;
    } 
    // 2. 处理 JSON (PDF 高清 Canvas 截取的 Base64 文本)
    else {
      const body = await req.json();
      const { base64Image } = body;

      if (!base64Image) {
        return NextResponse.json(
          { success: false, error: "未接收到 Base64 图片数据" },
          { status: 400 }
        );
      }

      // 提取 base64 纯文本并转为 Buffer
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
      fileBuffer = Buffer.from(base64Data, "base64");
      fileName = `crop_${Date.now()}.png`;
    }

    // 3. 保存文件到临时/公共上传目录
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, fileBuffer);

    // 返回后端保存的文件名
    return NextResponse.json({
      success: true,
      serverFileName: fileName,
      filePath: `/uploads/${fileName}`,
    });
  } catch (error: any) {
    console.error("上传处理异常:", error);
    return NextResponse.json(
      { success: false, error: error.message || "服务器内部错误" },
      { status: 500 }
    );
  }
}