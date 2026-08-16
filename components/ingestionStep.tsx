'use client';

import React, { useState, useEffect } from "react";
import { useJoyride, Step, TooltipRenderProps } from "react-joyride";
import { 
  FileUp, 
  FileText, 
  Presentation, 
  ArrowRight, 
  Trash2, 
  AlertCircle,
  XCircle,
  CornerDownLeft,
  HelpCircle,
  Sparkles,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import { uploadTempFile } from "@/service/pptx.service";

export interface PPTTemplate {
  id: string;
  name: string;
  serverFileName: string;
  pdfFileName: string;
}

interface DataIngestionProps {
  onConfirm: (data: { 
    pdfUrl: string; 
    pdfServerFileName: string; 
    pptDocs: PPTTemplate[];
    selectedPptServerFileName: string;
    selectedPptPdfFileName: string;
  }) => void;
}

// 💡 导览步骤定义
const TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="source-upload"]',
    title: "1. 注入源数据文档",
    content: "支持拖拽或点击上传 PDF 报表/PPTX 资料。系统会自动解析结构用于后续的截图与框选。",
    disableBeacon: true,
  },
  {
    target: '[data-tour="ppt-upload"]',
    title: "2. 注入目标 PPT 模板",
    content: "上传你的核心演示文稿 (.pptx)，我们将以此为基础进行图层融合与动态替换。",
  },
  {
    target: '[data-tour="confirm-btn"]',
    title: "3. 快捷确认进入 Step 2",
    content: "文件就绪后，可直接点击此按钮，或在页面任意位置直接敲击键盘 Enter 键提交！",
  },
];

// 💡 自定义 Joyride Tooltip UI 浮层组件 (Shadcn UI 风格)
const CustomTooltip = ({
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  isLastStep,
  size,
}: TooltipRenderProps) => {
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-5 max-w-sm w-full space-y-4 font-sans text-slate-800 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-1.5 text-indigo-600 font-semibold text-xs">
          <Sparkles className="w-3.5 h-3.5" />
          <span>新手导览 ({index + 1}/{size})</span>
        </div>
        <button
          {...closeProps}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        {step.title && <h4 className="text-sm font-bold text-slate-900">{step.title}</h4>}
        <p className="text-xs text-slate-600 leading-relaxed">{step.content}</p>
      </div>

      <div className="flex items-center justify-between pt-1">
        {!isLastStep ? (
          <button
            {...skipProps}
            className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
          >
            跳过导览
          </button>
        ) : <div />}

        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button
              {...(backProps as any)}
              variant="outline"
              size="sm"
              className="h-8 text-xs px-3 rounded-lg border-slate-200"
            >
              上一步
            </Button>
          )}
          <Button
            {...(primaryProps as any)}
            size="sm"
            className="h-8 text-xs px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            {isLastStep ? "知道了" : "下一步"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function DataIngestionStep({ onConfirm }: DataIngestionProps) {
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pptxFiles, setPptxFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isHoveringSource, setIsHoveringSource] = useState<boolean>(false);
  const [isHoveringPpt, setIsHoveringPpt] = useState<boolean>(false);

  // 💡 使用 react-joyride V3 Hook API
  const { controls, Tour } = useJoyride({
    steps: TOUR_STEPS,
    continuous: true,
    showSkipButton: true,
    tooltipComponent: CustomTooltip,
    styles: {
      options: {
        overlayColor: 'rgba(15, 23, 42, 0.45)',
        zIndex: 10000,
      },
    },
  });

  // 组件装载后自动启动导览
  useEffect(() => {
    const timer = setTimeout(() => {
      controls.start();
    }, 600);
    return () => clearTimeout(timer);
  }, [controls]);

  // 键盘 Enter 监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && sourceFile && pptxFiles.length > 0 && !uploading) {
        e.preventDefault();
        handleConfirmAndProceed();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sourceFile, pptxFiles, uploading]);

  const validateAndSetSourceFile = (file: File) => {
    setErrorMessage(null);
    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isPpt = fileName.endsWith('.pptx') || fileName.endsWith('.ppt');

    if (!isPdf && !isPpt) {
      setErrorMessage("源数据文档仅支持 .pdf, .pptx 或 .ppt 格式");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage("文件大小不能超过 50MB");
      return;
    }
    setSourceFile(file);
  };

  const validateAndSetPptx = (files: File[]) => {
    setErrorMessage(null);
    const validFiles = files.filter(f => f.name.toLowerCase().endsWith('.pptx') || f.name.toLowerCase().endsWith('.ppt'));
    
    if (validFiles.length === 0) {
      setErrorMessage("请选择格式为 .pptx 或 .ppt 的演示文稿");
      return;
    }
    setPptxFiles(validFiles);
  };

  const handleSourceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetSourceFile(file);
    e.target.value = "";
  };

  const handlePptxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) validateAndSetPptx(Array.from(files));
    e.target.value = "";
  };

  const handleConfirmAndProceed = async () => {
    if (!sourceFile || pptxFiles.length === 0 || uploading) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      setErrorMessage(null);

      const sourceRes = await uploadTempFile(sourceFile);
      const serverPdfFileName = sourceRes.pdfFileName || sourceRes.serverFileName;
      const serverPdfUrl = sourceRes.pdfUrl; 
      setUploadProgress(20);

      const newDocs: PPTTemplate[] = [];
      for (let i = 0; i < pptxFiles.length; i++) {
        const pptRes = await uploadTempFile(pptxFiles[i]);
        newDocs.push({
          id: `doc_${Date.now()}_${i}`,
          name: pptxFiles[i].name,
          serverFileName: pptRes.serverFileName,
          pdfFileName: pptRes.pdfUrl
        });

        const currentProgress = 20 + Math.round(((i + 1) / pptxFiles.length) * 80);
        setUploadProgress(currentProgress);
      }

      const selectedPptFileName = newDocs[0]?.serverFileName || "";
      const selectedPptPdfFileName = newDocs[0]?.pdfFileName || "";

      onConfirm({
        pdfUrl: serverPdfUrl,
        pdfServerFileName: serverPdfFileName,
        pptDocs: newDocs,
        selectedPptServerFileName: selectedPptFileName,
        selectedPptPdfFileName: selectedPptPdfFileName
      });

      setUploadProgress(100);
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMessage(
        err?.message || "文件上传或 PPTX 转码失败，请确认系统已安装 LibreOffice 并重试"
      );
    } finally {
      setUploading(false);
    }
  };

  const isSourcePpt = sourceFile?.name.toLowerCase().endsWith('.pptx') || sourceFile?.name.toLowerCase().endsWith('.ppt');

  return (
    <div className="space-y-6 relative">
      {/* 💡 渲染 useJoyride Hook 返回的 Tour JSX 元素 */}
      {Tour}

      {/* 顶部标题栏与触发按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">数据与模板注入</h2>
          <p className="text-xs text-slate-400">导入源文件与编辑模板，进行下一步坐标映射与裁切</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => controls.start()}
          className="text-xs gap-1.5 text-slate-600 hover:text-indigo-600 border-slate-200 rounded-xl"
        >
          <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
          重新查看新手引导
        </Button>
      </div>

      {errorMessage && (
        <div className="p-3.5 border border-red-200 bg-red-50 text-red-700 text-xs rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-auto p-0 text-red-500 hover:text-red-700 hover:bg-transparent text-xs" 
            onClick={() => setErrorMessage(null)}
          >
            忽略
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 源数据文档上传区 */}
        <Card data-tour="source-upload" className="border shadow-sm bg-white hover:border-indigo-200 transition-all rounded-2xl">
          <CardHeader className="py-4 px-5 border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-600" />
                1. 注入源数据文档 (PDF / PPTX)
              </CardTitle>
              {sourceFile && <Badge className="bg-emerald-500 text-white text-[10px]">已就绪</Badge>}
            </div>
            <CardDescription className="text-xs">支持 PDF 报表或 PPTX 资料，上传后自动转换用于截图提取</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {!sourceFile ? (
              <label 
                onDragOver={(e) => { e.preventDefault(); setIsHoveringSource(true); }}
                onDragLeave={() => setIsHoveringSource(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsHoveringSource(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    validateAndSetSourceFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all space-y-3 ${
                  isHoveringSource 
                    ? "border-sky-500 bg-sky-50/50" 
                    : "border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20"
                }`}
              >
                <div className="p-3 bg-sky-50 text-sky-600 rounded-full">
                  <FileUp className="w-6 h-6" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold text-slate-700">点击或将 PDF / PPTX 文件拖拽至此处</p>
                  <p className="text-[11px] text-slate-400">支持最大 50MB 的 PDF 报表或 PPT 资料</p>
                </div>
                <input type="file" accept=".pdf,.pptx,.ppt" className="hidden" onChange={handleSourceFileUpload} />
              </label>
            ) : (
              <div className="p-4 border rounded-xl bg-sky-50/40 border-sky-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isSourcePpt ? (
                    <Presentation className="w-8 h-8 text-orange-500" />
                  ) : (
                    <FileText className="w-8 h-8 text-sky-600" />
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-800 max-w-[200px] truncate">{sourceFile.name}</p>
                    <p className="text-[10px] text-slate-400">{(sourceFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  disabled={uploading} 
                  className="h-7 w-7 text-slate-400 hover:text-red-500" 
                  onClick={() => setSourceFile(null)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PPTX 模板上传区 */}
        <Card data-tour="ppt-upload" className="border shadow-sm bg-white hover:border-indigo-200 transition-all rounded-2xl">
          <CardHeader className="py-4 px-5 border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Presentation className="w-4 h-4 text-orange-500" />
                2. 注入目标 PPT 模板 (.PPTX)
              </CardTitle>
              {pptxFiles.length > 0 && <Badge className="bg-emerald-500 text-white text-[10px]">已就绪</Badge>}
            </div>
            <CardDescription className="text-xs">作为图层融合与页码映射的主体演示文稿</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {!pptxFiles.length ? (
              <label 
                onDragOver={(e) => { e.preventDefault(); setIsHoveringPpt(true); }}
                onDragLeave={() => setIsHoveringPpt(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsHoveringPpt(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    validateAndSetPptx(Array.from(e.dataTransfer.files));
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all space-y-3 ${
                  isHoveringPpt 
                    ? "border-orange-500 bg-orange-50/50" 
                    : "border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20"
                }`}
              >
                <div className="p-3 bg-orange-50 text-orange-600 rounded-full">
                  <FileUp className="w-6 h-6" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold text-slate-700">点击或将 PPTX 模板拖拽至此处</p>
                  <p className="text-[11px] text-slate-400">支持原生 PowerPoint (.pptx) 格式</p>
                </div>
                <input type="file" accept=".pptx,.ppt" multiple className="hidden" onChange={handlePptxUpload} />
              </label>
            ) : (
              <div className="p-4 border rounded-xl bg-orange-50/40 border-orange-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Presentation className="w-8 h-8 text-orange-500" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 max-w-[200px] truncate">{pptxFiles[0]?.name}</p>
                    <p className="text-[10px] text-slate-400">{(pptxFiles[0]?.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  disabled={uploading} 
                  className="h-7 w-7 text-slate-400 hover:text-red-500" 
                  onClick={() => setPptxFiles([])}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 提交动作操作区 */}
      <Card className="border shadow-sm bg-white p-4 rounded-2xl">
        {uploading && (
          <div className="mb-4 space-y-1.5">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>正在上传并转码矢量结构...</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <AlertCircle className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>需同时注入源数据文档与 PPT 模板方可进入下一步。</span>
          </div>

          <Button
            data-tour="confirm-btn"
            onClick={handleConfirmAndProceed}
            disabled={!sourceFile || pptxFiles.length === 0 || uploading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-md rounded-xl"
          >
            <span>{uploading ? "正在上传与转码..." : "开始源文档框选与页码绑定 (Step 2)"}</span>
            {sourceFile && pptxFiles.length > 0 && !uploading && (
              <span className="flex items-center gap-0.5 text-[10px] bg-indigo-500 px-1.5 py-0.5 rounded text-indigo-100 font-mono">
                <CornerDownLeft className="w-3 h-3" /> Enter
              </span>
            )}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}