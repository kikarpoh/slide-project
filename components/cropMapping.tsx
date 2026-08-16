'use client';

import React, { useState, useRef, useEffect } from "react";
import { useJoyride, Step, TooltipRenderProps, EVENTS } from "react-joyride";
import { Document, Page, pdfjs } from "react-pdf";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import { useGlobalContext, NodesType, PptxNode, ImgNode, CropNode } from "@/context/global";
import "react-image-crop/dist/ReactCrop.css";

import {
    Layers,
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    FileText,
    Crop as CropIcon,
    Target,
    ListOrdered,
    Trash2,
    ArrowRight,
    Upload,
    Image as ImageIcon,
    Presentation,
    Sparkles,
    Eye,
    Maximize2,
    HelpCircle,
    X
} from "lucide-react";

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// 配置 pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ================= 1. 类型定义 =================

export interface PPTTemplate {
    id: string;
    name: string;
    serverFileName: string;
}

export interface CropBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SequenceMappingStepProps {
    uploadSessionId?: string;
    onNext: (nodes: NodesType[]) => void;
    onBack?: () => void;
}

// ================= 2. 导览配置与 Custom Tooltip UI =================

// 💡 关键修改：为步骤显式指定 placement，防止气泡跑到屏幕上方外面
const TOUR_STEPS: Step[] = [
    {
        target: '[data-tour="tour-tabs"]',
        title: "1. 选型素材注入模式",
        content: "系统支持 PDF 截图裁切、本地图片上传以及 PPTX 页码映射三种方式组装混编节点。",
        skipBeacon: true,
        placement: "bottom",
    },
    {
        target: '[data-tour="tour-crop-area"]',
        title: "2. PDF 选区与截取",
        content: "在 PDF 预览区直接按住鼠标左键拖拽选区，设置节点名称后点击“绑定至队列”即可完成截取。",
        placement: "right", // 强制在下方显示，避免超屏
    },
    {
        target: '[data-tour="tour-node-queue"]',
        title: "3. Task 节点队列管理",
        content: "所有添加的节点都会在此队列实时排队。可自由调整映射的目标 Slide 页码，或点击缩略图放大预览视觉 Mockup。",
        placement: "left-start", // 强制在队列左侧显示，避免顶部被冲掉
    },
    {
        target: '[data-tour="tour-next-btn"]',
        title: "4. 提交序列进入 Step 3",
        content: "编排完成后，点击此按钮将混编任务序列交付给系统进行渲染合成。",
        placement: "top",
    },
];

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
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-5 max-w-sm w-full space-y-4 font-sans text-slate-800 animate-in fade-in zoom-in-95 duration-200 z-[10000]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-1.5 text-indigo-600 font-semibold text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>编排系统向导 ({index + 1}/{size})</span>
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

// ================= 3. 工具函数 =================

export async function cropHighResPdfToImage(
    highResCanvas: HTMLCanvasElement,
    previewDimensions: { width: number; height: number },
    completedCrop: CropBounds
): Promise<string> {
    const scaleX = highResCanvas.width / previewDimensions.width;
    const scaleY = highResCanvas.height / previewDimensions.height;

    const realX = completedCrop.x * scaleX;
    const realY = completedCrop.y * scaleY;
    const realWidth = completedCrop.width * scaleX;
    const realHeight = completedCrop.height * scaleY;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = realWidth;
    cropCanvas.height = realHeight;

    const ctx = cropCanvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas 上下文");

    ctx.drawImage(
        highResCanvas,
        realX,
        realY,
        realWidth,
        realHeight,
        0,
        0,
        realWidth,
        realHeight
    );

    return cropCanvas.toDataURL("image/png", 1.0);
}

function getNodeAssetPreviewUrl(node: NodesType): string | null {
    if (node.type === "crop_img" || node.type === "upload_img") {
        return node.img_data || node.url || null;
    }
    return null;
}

// ================= 4. 头部 UI 组件 =================

export const Header: React.FC<{ onStartTour?: () => void }> = ({ onStartTour }) => (
    <div className="bg-white border rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Layers className="w-5 h-5" />
            </div>
            <div>
                <h1 className="text-base font-semibold text-slate-900">
                    PPT 多态序列混编系统
                </h1>
                <p className="text-xs text-slate-500">
                    向导式工作流 · Step 2/3 素材编排与节点绑定
                </p>
            </div>
        </div>

        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs md:text-sm">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 font-medium rounded-lg border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>1. 资料注入</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white font-medium rounded-lg shadow-sm">
                    <span className="w-4 h-4 rounded-full bg-white text-indigo-600 text-[10px] flex items-center justify-center font-bold">
                        2
                    </span>
                    <span>2. 素材编排与节点绑定</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 font-medium rounded-lg bg-slate-100">
                    <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] flex items-center justify-center font-bold">
                        3
                    </span>
                    <span>3. Render 混编序列</span>
                </div>
            </div>

            {onStartTour && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onStartTour}
                    className="text-xs gap-1.5 text-slate-600 hover:text-indigo-600 border-slate-200 rounded-xl"
                >
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
                    新手引导
                </Button>
            )}
        </div>
    </div>
);

// ================= 5. Slide Visual Card =================

interface SlideVisualCardProps {
    slideNumber: number;
    node: NodesType;
}

const SlideVisualCard: React.FC<SlideVisualCardProps> = ({ slideNumber, node }) => {
    const assetUrl = getNodeAssetPreviewUrl(node);

    return (
        <Dialog>
            <DialogTrigger>
                <div className="group/slide relative w-24 h-14 bg-slate-900 border-2 border-indigo-400 rounded-lg shadow-sm overflow-hidden cursor-pointer hover:border-indigo-600 hover:shadow-md transition-all flex flex-col justify-between p-1 shrink-0">
                    <div className="flex items-center justify-between z-10">
                        <span className="px-1 py-0.2 bg-indigo-600 text-white font-mono font-bold text-[9px] rounded-xs shadow-2xs">
                            P.{slideNumber}
                        </span>
                        <Maximize2 className="w-2.5 h-2.5 text-white/70 group-hover/slide:text-white transition-colors" />
                    </div>

                    <div className="absolute inset-0 bg-slate-800 flex items-center justify-center overflow-hidden">
                        {assetUrl ? (
                            <img
                                src={assetUrl}
                                alt={`Slide ${slideNumber} Preview`}
                                className="w-full h-full object-cover opacity-80 group-hover/slide:opacity-100 transition-opacity"
                            />
                        ) : (
                            <div className="text-slate-400 flex flex-col items-center justify-center text-[10px]">
                                <ImageIcon className="w-4 h-4 opacity-50 mb-0.5" />
                                <span>无预览</span>
                            </div>
                        )}
                    </div>

                    <div className="z-10 bg-slate-900/80 backdrop-blur-xs px-1 py-0.5 rounded text-[8px] text-slate-200 truncate font-sans">
                        {node.fileName}
                    </div>
                </div>
            </DialogTrigger>

            <DialogContent className="max-w-2xl bg-white border rounded-xl p-6">
                <DialogHeader className="pb-2 border-b">
                    <DialogTitle className="text-sm font-bold flex items-center gap-2">
                        <Eye className="w-4 h-4 text-indigo-600" />
                        Target Slide #{slideNumber} Visual Mockup
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="aspect-video bg-slate-900 rounded-lg border-2 border-indigo-500 shadow-2xl relative overflow-hidden flex items-center justify-center p-4">
                        <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-indigo-600 text-white font-mono text-xs font-bold rounded">
                            Slide Page: {slideNumber}
                        </div>
                        {assetUrl ? (
                            <img
                                src={assetUrl}
                                alt="High-res Slide Mockup"
                                className="max-h-full max-w-full object-contain rounded shadow-lg"
                            />
                        ) : (
                            <div className="text-slate-400 flex flex-col items-center justify-center gap-2">
                                <ImageIcon className="w-8 h-8 opacity-40" />
                                <span className="text-xs">无可用预览图像</span>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border">
                        <div>
                            <span className="text-slate-400 block">节点标识:</span>
                            <span className="font-semibold text-slate-700">{node.fileName}</span>
                        </div>
                        <div>
                            <span className="text-slate-400 block">节点类型:</span>
                            <span className="font-semibold text-slate-700 uppercase">{node.type}</span>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

// ================= 6. Task 节点 Component =================

function TaskNodeItem({
    node,
    index,
    onRemoveNode,
    onUpdateTargetSlide,
}: {
    node: NodesType;
    index: number;
    onRemoveNode: (index: number) => void;
    onUpdateTargetSlide: (index: number, rawInput: string) => void;
}) {
    const assetPreviewUrl = getNodeAssetPreviewUrl(node);
    const targetPage = node.type === "upload_pptx" ? node.page : 1;

    return (
        <div className="p-3.5 border rounded-xl bg-white hover:border-indigo-300 transition-all shadow-sm space-y-3 group relative overflow-hidden">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400 font-bold">
                        #{index + 1}
                    </span>

                    {node.type === "crop_img" && (
                        <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] gap-1">
                            <CropIcon className="w-3 h-3" />
                            PDF 裁切
                        </Badge>
                    )}
                    {node.type === "upload_img" && (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                            <ImageIcon className="w-3 h-3" />
                            图片注入
                        </Badge>
                    )}
                    {node.type === "upload_pptx" && (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                            <Presentation className="w-3 h-3" />
                            PPTX 抽取 P.{node.page}
                        </Badge>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-300 hover:text-red-500 hover:bg-red-50"
                    onClick={() => onRemoveNode(index)}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </Button>
            </div>

            <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800 truncate pt-1">
                    {node.fileName}
                </p>

                {assetPreviewUrl ? (
                    <div className="relative w-12 h-9 rounded border overflow-hidden bg-slate-100 shrink-0 shadow-2xs">
                        <img src={assetPreviewUrl} alt="node preview" className="w-full h-full object-cover" />
                    </div>
                ) : node.type === "upload_pptx" ? (
                    <div className="w-12 h-9 rounded border bg-amber-50 border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                        <Presentation className="w-4 h-4" />
                    </div>
                ) : null}
            </div>

            <div className="p-2.5 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium flex items-center gap-1 shrink-0 text-[11px]">
                        <Target className="w-3.5 h-3.5 text-indigo-600" />
                        目标页码:
                    </span>
                    <Input
                        type="text"
                        defaultValue={targetPage}
                        onBlur={(e) => onUpdateTargetSlide(index, e.target.value)}
                        className="w-24 h-6 text-xs text-center font-bold bg-white border-indigo-200 px-1 py-0 font-mono focus-visible:ring-1 focus-visible:ring-indigo-500"
                    />
                </div>

                <div className="pt-2 border-t border-slate-200/60">
                    <div className="flex items-center gap-1 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        <Eye className="w-3 h-3 text-indigo-500" />
                        <span>Slides Visual Render Mockup:</span>
                    </div>

                    <ScrollArea className="w-full whitespace-nowrap pb-1">
                        <div className="flex items-center gap-2">
                            <SlideVisualCard
                                slideNumber={targetPage}
                                node={node}
                            />
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
}

// ================= 7. Task 节点队列面板 =================

export const TaskNodeQueue: React.FC<{
    mappedNodes: NodesType[];
    onRemoveNode: (index: number) => void;
    onUpdateTargetSlide: (index: number, rawInput: string) => void;
}> = ({ mappedNodes, onRemoveNode, onUpdateTargetSlide }) => {
    return (
        <Card data-tour="tour-node-queue" className="border shadow-sm bg-white rounded-2xl scroll-mt-28">
            <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between space-y-0 bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-indigo-600" />
                    <CardTitle className="text-sm font-semibold text-slate-800">
                        已映射 Task 节点队列
                    </CardTitle>
                </div>
                <Badge className="bg-indigo-600 text-white text-[11px]">
                    {mappedNodes.length} 项已组装
                </Badge>
            </CardHeader>

            <CardContent className="p-3">
                <ScrollArea className="h-[520px] pr-2">
                    {mappedNodes.length === 0 ? (
                        <div className="text-center py-16 px-4 border-2 border-dashed rounded-xl bg-slate-50/50 text-slate-400 space-y-2">
                            <Sparkles className="w-8 h-8 mx-auto text-slate-300" />
                            <p className="text-xs font-medium text-slate-600">暂无编排节点</p>
                            <p className="text-[11px] text-slate-400">
                                截取 PDF、上传图片或抽取 PPTX Slide 均可实时加入该队列
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {mappedNodes.map((node, index) => (
                                <TaskNodeItem
                                    key={`node_${index}_${node.fileName}`}
                                    node={node}
                                    index={index}
                                    onRemoveNode={onRemoveNode}
                                    onUpdateTargetSlide={onUpdateTargetSlide}
                                />
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>

            <CardFooter className="py-3 px-4 border-t bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
                <span>💡 点击卡片可放大预览视觉 Mockup</span>
            </CardFooter>
        </Card>
    );
};

// ================= 8. 主流程组件 (PDFCropMappingStep) =================

export default function PDFCropMappingStep({
    uploadSessionId,
    onNext,
    onBack,
}: SequenceMappingStepProps) {
    const { state: { pdf, ppt, nodes }, addNode, removeNode, updateNode } = useGlobalContext();

    const [activeTab, setActiveTab] = useState<"crop_img" | "upload_img" | "upload_pptx">("crop_img");
    const [isUploading, setIsUploading] = useState<boolean>(false);

    // PDF Crop 状态
    const [numPages, setNumPages] = useState<number>(1);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const highResCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
    const [cropNodeLabel, setCropNodeLabel] = useState<string>("");

    // Image Upload 状态
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [imageNodeLabel, setImageNodeLabel] = useState<string>("");

    // PPTX Extract 状态
    const [selectedPptxFileName] = useState<string>(ppt.fileName ?? "");
    const [pptxSourcePageStr, setPptxSourcePageStr] = useState<string>("1");
    const [pptxNodeLabel, setPptxNodeLabel] = useState<string>("");

    // 💡 强行精准滚动的 Callback
    // const handleJoyrideCallback = (data: CallBackProps) => {
    //     const { type, step } = data;

    //     if (type === EVENTS.STEP_BEFORE || type === EVENTS.TOOLTIP) {
    //         const targetElement = typeof step.target === 'string' 
    //             ? document.querySelector(step.target) 
    //             : step.target;

    //         if (targetElement) {
    //             setTimeout(() => {
    //                 targetElement.scrollIntoView({
    //                     behavior: 'smooth',
    //                     block: 'center', // 强制滚动到视口正中央
    //                     inline: 'nearest'
    //                 });
    //             }, 80);
    //         }
    //     }
    // };

    // 💡 优化配置 Popper 参数
    const { controls, Tour } = useJoyride({
        steps: TOUR_STEPS,
        continuous: true,
        tooltipComponent: CustomTooltip,
        options:{
      scrollOffset: 150,
      scrollDuration: 300,
      // showSkipButton: true,
      skipBeacon:true
    
    // disableScrollParentFix: false,

    },
        // callback: handleJoyrideCallback,
        // floaterProps: {
        //     // 防溢出关键属性：如果边界受限会自动修饰或翻转
        //     preventOverflow: {
        //         boundariesElement: 'viewport',
        //     },
        // },
        styles: {
            overlay:{
                color:'rgba(15, 23, 42, 0.45)',
                zIndex:100000
            },

            
            
            // options: {
            //     overlayColor: ,
            //     zIndex: 10000,
            // },
        },
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            controls.start();
        }, 800);
        return () => clearTimeout(timer);
    }, [controls]);

    // PDF 裁剪提交
    const handleConfirmCropMapping = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!completedCrop || !completedCrop.width || !completedCrop.height) {
            alert("请先在 PDF 上拖拽框选区域");
            return;
        }

        try {
            setIsUploading(true);
            const highResCanvas =
                highResCanvasRef.current || (containerRef.current?.querySelector("canvas") as HTMLCanvasElement);

            if (!highResCanvas) {
                alert("无法获取 PDF 画布，请重新加载");
                return;
            }

            const previewDimensions = {
                width: containerRef.current?.clientWidth || highResCanvas.width,
                height: containerRef.current?.clientHeight || highResCanvas.height,
            };

            const base64Image = await cropHighResPdfToImage(highResCanvas, previewDimensions, completedCrop);

            const uploadRes = await fetch("/api/upload-crop", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ base64Image, uploadSessionId }),
            });
            const uploadData = await uploadRes.json();

            const newNode: CropNode = {
                type: 'crop_img',
                img_data: base64Image,
                url: uploadData.serverFileName ? `/api/temp-file?name=${uploadData.serverFileName}` : pdf.url,
                fileName: cropNodeLabel.trim() || `Crop_P${pageNumber}_${nodes.length + 1}`,
                serverFileName: uploadData.serverFileName
            };

            addNode(newNode);

            setCrop(undefined);
            setCompletedCrop(null);
            setCropNodeLabel("");
        } catch (error: any) {
            alert(`生成裁剪节点失败: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    // 图片上传提交
    const handleConfirmImageUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!imageFile) return;

        try {
            setIsUploading(true);
            const formData = new FormData();
            formData.append("file", imageFile);

            const res = await fetch("/api/upload-crop", { method: "POST", body: formData });
            const data = await res.json();

            const newNode: ImgNode = {
                type: 'upload_img',
                img_data: imagePreviewUrl || '',
                url: data.serverFileName ? `/api/temp-file?name=${data.serverFileName}` : '',
                fileName: imageNodeLabel.trim() || `Image_${nodes.length + 1}`,
                serverFileName: data.serverFileName
            };

            addNode(newNode);
            setImageFile(null);
            setImagePreviewUrl(null);
            setImageNodeLabel("");
        } catch (error: any) {
            alert(`图片上传失败: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    // PPTX 提取提交
    const handleConfirmPptxUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        const pageNum = parseInt(pptxSourcePageStr.trim(), 10) || 1;

        const newNode: PptxNode = {
            type: 'upload_pptx',
            page: pageNum,
            url: selectedPptxFileName || ppt.fileName,
            fileName: pptxNodeLabel.trim() || `PPTX_Slide_${nodes.length + 1}`,
        };

        addNode(newNode);
        setPptxNodeLabel("");
    };

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-900">
            {Tour}

            <div className="max-w-7xl mx-auto space-y-6">
                <Header onStartTour={() => controls.start()} />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-8 space-y-4">
                        <Tabs defaultValue="crop_img" value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                            <TabsList data-tour="tour-tabs" className="grid grid-cols-3 bg-white border p-1 rounded-xl h-11 scroll-mt-28">
                                <TabsTrigger value="crop_img" className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                                    <CropIcon className="w-4 h-4" />
                                    <span>1. PDF 截图裁切</span>
                                </TabsTrigger>
                                <TabsTrigger value="upload_img" className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                                    <ImageIcon className="w-4 h-4" />
                                    <span>2. 图片文件注入</span>
                                </TabsTrigger>
                                <TabsTrigger value="upload_pptx" className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                                    <Presentation className="w-4 h-4" />
                                    <span>3. PPTX 页码提取</span>
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="crop_img" className="mt-4">
                                <Card data-tour="tour-crop-area" className="border shadow-sm bg-white overflow-hidden rounded-2xl scroll-mt-28">
                                    <CardHeader className="py-3 px-4 border-b bg-slate-50/80 flex flex-row items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-sky-600" />
                                            <span className="text-xs font-semibold text-slate-800 truncate max-w-[200px]">
                                                {pdf.fileName || "source.pdf"}
                                            </span>
                                            <Badge variant="outline" className="text-[10px] bg-white">
                                                页码: {pageNumber} / {numPages || 1}
                                            </Badge>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center border rounded-lg bg-white p-0.5">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>
                                                    <ChevronLeft className="w-4 h-4" />
                                                </Button>
                                                <span className="text-xs font-mono px-2">{pageNumber}</span>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pageNumber >= numPages} onClick={() => setPageNumber(pageNumber + 1)}>
                                                    <ChevronRight className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="p-6 bg-slate-100/60 min-h-[480px] flex items-center justify-center relative overflow-auto">
                                        <Document file={pdf.url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                                            <div ref={containerRef} className="inline-block border shadow-xl bg-white relative">
                                                <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}>
                                                    <Page pageNumber={pageNumber} scale={1.2} canvasRef={highResCanvasRef as any} renderAnnotationLayer={false} renderTextLayer={false} />
                                                </ReactCrop>
                                            </div>
                                        </Document>

                                        {completedCrop && completedCrop.width > 10 && (
                                            <div className="absolute top-4 right-4 z-20 w-80 bg-white border-2 border-indigo-500 shadow-2xl rounded-xl p-4">
                                                <form onSubmit={handleConfirmCropMapping} className="space-y-3 text-xs">
                                                    <p className="font-bold text-indigo-600 flex items-center gap-1">
                                                        <CropIcon className="w-4 h-4" /> 已截取区域选区
                                                    </p>
                                                    <div>
                                                        <Label className="text-[11px] text-slate-500">节点名称 (fileName)</Label>
                                                        <Input value={cropNodeLabel} onChange={(e) => setCropNodeLabel(e.target.value)} className="h-8 text-xs" />
                                                    </div>
                                                    <Button type="submit" disabled={isUploading} className="w-full h-8 bg-indigo-600 text-white text-xs rounded-lg">
                                                        {isUploading ? "保存中..." : "绑定至队列"}
                                                    </Button>
                                                </form>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="upload_img" className="mt-4">
                                <Card className="border shadow-sm bg-white p-6 rounded-2xl">
                                    <form onSubmit={handleConfirmImageUpload} className="space-y-4">
                                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                                            {imagePreviewUrl ? (
                                                <img src={imagePreviewUrl} alt="Upload preview" className="max-h-48 mx-auto rounded shadow-sm" />
                                            ) : (
                                                <label className="cursor-pointer space-y-2 block">
                                                    <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                                                    <span className="text-xs text-slate-600 block">点击上传本地图片 (PNG/JPG)</span>
                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) { setImageFile(file); setImagePreviewUrl(URL.createObjectURL(file)); }
                                                    }} />
                                                </label>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            <Input placeholder="节点名称 (fileName)" value={imageNodeLabel} onChange={(e) => setImageNodeLabel(e.target.value)} />
                                        </div>
                                        <Button type="submit" disabled={!imageFile} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">添加图片节点</Button>
                                    </form>
                                </Card>
                            </TabsContent>

                            <TabsContent value="upload_pptx" className="mt-4">
                                <Card className="border shadow-sm bg-white p-6 rounded-2xl">
                                    <form onSubmit={handleConfirmPptxUpload} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <Input placeholder="源 PPT 页码 (page)" value={pptxSourcePageStr} onChange={(e) => setPptxSourcePageStr(e.target.value)} />
                                            <Input placeholder="节点名称 (fileName)" value={pptxNodeLabel} onChange={(e) => setPptxNodeLabel(e.target.value)} />
                                        </div>
                                        <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-lg">绑定 PPTX 提取节点</Button>
                                    </form>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>

                    <div className="lg:col-span-4">
                        <TaskNodeQueue
                            mappedNodes={nodes}
                            onRemoveNode={(index) => removeNode(index)}
                            onUpdateTargetSlide={(index, rawInput) => {
                                const parsedNum = parseInt(rawInput, 10);
                                if (isNaN(parsedNum)) return;

                                const targetNode = nodes[index];
                                if (targetNode && targetNode.type === 'upload_pptx') {
                                    updateNode(index, {
                                        ...targetNode,
                                        page: parsedNum,
                                    });
                                }
                            }}
                        />
                    </div>
                </div>

                <div className="bg-white border rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={onBack} className="rounded-xl border-slate-200">⬅ 返回上一页</Button>
                    <Button
                        data-tour="tour-next-btn"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-2 rounded-xl shadow-md scroll-mt-28"
                        disabled={nodes.length === 0}
                        onClick={() => onNext(nodes)}
                    >
                        <span>下一步：进入 Render 混编序列</span>
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}