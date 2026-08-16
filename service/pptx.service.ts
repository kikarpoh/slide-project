// import { cropHighResPdfToImage } from "../../slides-generator/service/crop.service";

export interface UploadResponse {
  success: boolean;
  fileType: 'pptx' | 'pdf';
  serverFileName: string; // 原始文件全名 (如 171_template.pptx)
  pdfFileName: string;    // 对应的 PDF 文件名 (如 171_template.pdf)
  originalUrl: string;    // 原始文件访问 API
  pdfUrl: string;         // 提供给 react-pdf 渲染的 API
}

export async function uploadTempFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || '文件上传失败');
  }

  return await res.json();
}
// import { cropHighResPdfToImage, uploadCropImage } from "@/utils/cropUtils";

export interface CropTaskNode {
  id: string;
  pdfPageNumber: number;
  targetSlideNumbers: number[];
  label?: string;
  cropImageServerFileName?: string;
  completedCrop?: { x: number; y: number; width: number; height: number };
  previewDimensions?: { width: number; height: number }; // UI 预览框物理宽高
}

export type PythonTask =
  | { type: "pptx_upload"; pptxServerFileName: string; slides: number[] }
  | { type: "image_crop"; cropImageServerFileName: string; slides: number[] }
  | { type: "image_upload"; imageServerFileName: string };

/**
 * 将前端 CropTaskNode 异步转换为 Python 后端可直接执行的 PythonTask[]
 */
// export async function convertNodesToPythonTasks(
//   globalState: { selectedPptServerFileName: string; mappedNodes: CropTaskNode[] },
//   pdfCanvasMap: Map<number, HTMLCanvasElement>
// ): Promise<PythonTask[]> {
//   // 并行处理所有裁切节点：高清坐标映射 -> 导出 Base64 -> 上传服务器 -> 生成 Python Task
//   const cropTaskPromises = globalState.mappedNodes.map(async (node) => {
//     let serverFileName = node.cropImageServerFileName;

//     // 如果该节点尚未生成/上传过图片，则进行高清裁剪与上传
//     if (!serverFileName) {
//       const highResCanvas = pdfCanvasMap.get(node.pdfPageNumber);

//       if (node.completedCrop && node.previewDimensions && highResCanvas) {
//         // 将 UI 框选按比例转换并截取 A4 级高清图片
//         const base64Image = await cropHighResPdfToImage(
//           highResCanvas,
//           node.previewDimensions,
//           node.completedCrop
//         );

//         // 上传至服务器保存为 png
//         serverFileName = await uploadCropImage(base64Image);
//         node.cropImageServerFileName = serverFileName; // 回写到全局节点
//       } else {
//         // 兜底降级文件名
//         serverFileName = `crop_${node.id}.png`;
//       }
//     }

//     // 获取目标 Slide 页码数组（如 [1] 或 [2, 3]）
//     const targetSlides = node.targetSlideNumbers?.length ? node.targetSlideNumbers : [1];

//     return {
//       type: "image_crop" as const,
//       cropImageServerFileName: serverFileName,
//       slides: targetSlides,              // 👈 核心修复：补充 PythonTask 必须的 slides 字段
//       targetSlideNumbers: targetSlides,  // 备用语义字段
//       targetSlideIndex: targetSlides[0], // 单页兼容字段
//     };
//   });

//   const cropTasks = await Promise.all(cropTaskPromises);

//   return cropTasks;
// }

/**
 * 将裁切好的 Base64 图片上传至后端临时存储目录，并返回服务器保存的文件名
 */
export async function uploadCropImage(base64Image: string): Promise<string> {
  try {
    const response = await fetch("/api/upload-crop", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ base64Image }),
    });

    if (!response.ok) {
      throw new Error(`上传图片失败: ${response.statusText}`);
    }

    const data: { serverFileName: string } = await response.json();
    return data.serverFileName;
  } catch (error) {
    console.error("uploadCropImage 出错:", error);
    throw error;
  }
}