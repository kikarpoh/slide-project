import * as fs from 'fs';
import * as path from 'path';

/**
 * 获取 public/temp 目录下的完整绝对路径（若目录不存在则自动创建）
 * @param filename 文件名，例如 'composed_12345.pptx'
 */


export function getTempFilePath(filename: string): string {
  // 1. 使用 process.cwd() 获取项目根目录，拼装绝对路径
  const tempDir = path.join(process.cwd(), 'public', 'temp');

  // 2. 防御性检查：确保 public/temp 文件夹存在
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 3. 返回文件绝对路径 (例: C:\Project\my-app\public\temp\composed_12345.pptx)
  return path.join(tempDir, filename);
}
