'use client';

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  useJoyride,
  Step,
  STATUS,
  TooltipRenderProps,
  EVENTS,
} from "react-joyride";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Play,
  Sparkles,
  RefreshCw,
  Eye,
  Check,
  Crop as CropIcon,
  ImageIcon,
  Presentation,
  GripVertical,
  Plus,
  Trash2,
  Loader2,
  HelpCircle,
  X,
  Layers,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { pdfjs } from "react-pdf";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  pointerWithin,
} from "@dnd-kit/core";

import { useGlobalContext, NodesType } from "@/context/global";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ================= 1. 类型定义 =================

export type PythonTask =
  | {
      type: "pptx_upload";
      pptxServerFileName: string;
      sourceSlides: number[];
      targetSlides: number[];
      label?: string;
    }
  | {
      type: "image_crop";
      cropImageServerFileName: string;
      targetSlides: number[];
      label?: string;
    }
  | {
      type: "image_upload";
      imageServerFileName: string;
      targetSlides?: number[];
      label?: string;
    };

type ActiveDragItem =
  | { type: "asset"; asset: NodesType }
  | { type: "sequence_slide"; index: number; node: NodesType };

interface RenderTask {
  type: "pptx_upload" | "image_crop" | "image_upload";
  pptxServerFileName?: string;
  cropImageServerFileName?: string;
  imageServerFileName?: string;
  sourceSlides?: number[];
  targetSlides: number[];
  label?: string;
}

// ================= 2. 导览配置与 Custom Tooltip UI =================

const TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="tour-sequence-panel"]',
    title: "1. PPT 页面序列区",
    content:
      "这里是转码提取的所有页面序列。支持键盘上下键快速切换选中，或按住拖拽卡片调整渲染顺序。",
    skipBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="tour-canvas-preview"]',
    title: "2. 中央画布预览",
    content: "实时预览当前选中页面的图片全貌与节点属性信息。",
    placement: "right",
  },
  {
    target: '[data-tour="tour-asset-pool"]',
    title: "3. 截取资产库",
    content: "包含了在 Step 2 裁切与截取的素材资产，可直接拖拽插入到左侧 PPT 序列的任意位置。",
    placement: "left",
  },
  {
    target: '[data-tour="tour-render-console"]',
    title: "4. 全量混编控制台",
    content:
      "编排完成后，点击此处发送给后端 Node.js Automizer 进行自动化渲染合成并下载 PPTX 结果文件。",
    placement: "left",
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
          <span>渲染控制台导览 ({index + 1}/{size})</span>
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
        ) : (
          <div />
        )}

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

function getMediaUrl(item?: Partial<NodesType> | null): string {
  if (!item) return "";


  if(item.type!== "upload_pptx") return (item as any).img_data;

  const urlOrName = item.url || item.fileName;
  if (!urlOrName) return "";

  if (
    urlOrName.startsWith("/") ||
    urlOrName.startsWith("blob:") ||
    urlOrName.startsWith("http://") ||
    urlOrName.startsWith("https://") ||
    urlOrName.startsWith("data:")
  ) {
    return urlOrName;
  }

  return `/api/temp-file?name=${encodeURIComponent(urlOrName)}`;
}

async function convertPdfToBlobUrls(pdfUrl: string): Promise<string[]> {
  const loadingTask = pdfjs.getDocument(pdfUrl);
  const pdfDocument = await loadingTask.promise;
  const blobUrls: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.2 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport ,canvas:null}).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject("Canvas 导出 Blob 失败")),
        "image/webp",
        0.85
      );
    });

    blobUrls.push(URL.createObjectURL(blob));
  }

  return blobUrls;
}

// ================= 4. 头部 UI 组件 =================

export const Header: React.FC<{ onStartTour?: () => void }> = ({ onStartTour }) => (
  <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
        <Layers className="w-5 h-5" />
      </div>
      <div>
        <h1 className="text-base font-semibold text-slate-900">
          PPT 多态序列混编系统
        </h1>
        <p className="text-xs text-slate-500">
          向导式工作流 · Step 3/3 Render 混编合成与导出
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
        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 font-medium rounded-lg border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>2. 素材编排与节点绑定</span>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400" />
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white font-medium rounded-lg shadow-sm">
          <span className="w-4 h-4 rounded-full bg-white text-indigo-600 text-[10px] flex items-center justify-center font-bold">
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

// ================= 5. Dnd & Slide Components =================

const DraggableAssetItem = React.memo(function DraggableAssetItem({
  asset,
  assetId,
}: {
  asset: NodesType;
  assetId: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: assetId,
    data: { type: "asset", asset } as ActiveDragItem,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 p-2 rounded-lg border bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-300 cursor-grab active:cursor-grabbing transition-all group ${
        isDragging ? "opacity-30 border-dashed border-indigo-500 bg-indigo-50" : ""
      }`}
    >
      <GripVertical className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 shrink-0" />
      <div className="w-10 h-10 bg-white border rounded overflow-hidden shrink-0">
        <img
          src={getMediaUrl(asset)}
          alt="asset"
          className="w-full h-full object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-700 truncate">
          {asset.fileName || `截取元素`}
        </p>
        <span className="text-[9px] text-indigo-600 font-mono">拖拽插入序列</span>
      </div>
    </div>
  );
});

const InsertionSlot = React.memo(function InsertionSlot({
  index,
  isDragging,
}: {
  index: number;
  isDragging: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `insertion_slot_${index}`,
    data: { insertIndex: index },
  });

  return (
    <div ref={setNodeRef} className="w-full">
      <AnimatePresence initial={false}>
        {isOver ? (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden py-2 my-1"
          >
            <div className="aspect-[16/9] w-full border-2 border-dashed border-indigo-500 bg-indigo-100/80 rounded-xl flex flex-col items-center justify-center text-indigo-700 gap-2 shadow-md ring-4 ring-indigo-500/20">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Plus className="w-5 h-5 stroke-[3]" />
              </div>
              <span className="text-xs font-bold tracking-wide">
                松开即可插入此处
              </span>
            </div>
          </motion.div>
        ) : isDragging ? (
          <div className="h-7 py-1.5 my-1 flex items-center justify-center transition-all">
            <div className="w-full h-2.5 bg-indigo-500/80 rounded-full shadow-md ring-4 ring-indigo-300/50" />
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});

interface SlidePageCardProps {
  node: NodesType;
  index: number;
  isSelected: boolean;
  onClick: (index: number) => void;
  onDelete: (index: number, e: React.MouseEvent) => void;
}

const SlidePageCard = React.memo(function SlidePageCard({
  node,
  index,
  isSelected,
  onClick,
  onDelete,
}: SlidePageCardProps) {
  const pageNo = index + 1;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `seq_slide_${index}`,
    data: { type: "sequence_slide", index, node } as ActiveDragItem,
  });

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: isDragging ? 0.2 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden py-0.5"
    >
      <div
        onClick={() => onClick(index)}
        className={`relative aspect-[16/9] w-full p-1.5 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-colors group ${
          isSelected
            ? "border-indigo-600 bg-indigo-50/50 shadow-md ring-2 ring-indigo-400"
            : "border-slate-200 bg-slate-50 hover:border-slate-300"
        }`}
      >
        <div
          {...listeners}
          {...attributes}
          className="w-full h-full bg-white overflow-hidden relative rounded border flex items-center justify-center"
        >
          <img
            src={getMediaUrl(node)}
            alt={node.fileName || `Slide ${pageNo}`}
            className="w-full h-full object-contain bg-slate-50"
            loading="lazy"
          />

          <span className="absolute top-1 left-1 bg-black/70 text-white font-mono text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1">
            {node.type === "crop_img" && <CropIcon className="w-2.5 h-2.5 text-indigo-400" />}
            {node.type === "upload_img" && <ImageIcon className="w-2.5 h-2.5 text-emerald-400" />}
            {node.type === "upload_pptx" && <Presentation className="w-2.5 h-2.5 text-amber-400" />}
            第 {pageNo} 页
          </span>

          <GripVertical className="absolute bottom-1.5 right-1.5 w-4 h-4 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity" />

          <button
            onClick={(e) => onDelete(index, e)}
            className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-600 text-white rounded transition-opacity opacity-0 group-hover:opacity-100 shadow-md z-10"
            title="删除此页"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
});

// ================= 6. 主渲染界面组件 =================

export default function PPTHybridRenderStep() {
  const { state: globalState } = useGlobalContext();

  const [sequence, setSequence] = useState<NodesType[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [activeDragData, setActiveDragData] = useState<ActiveDragItem | null>(null);

  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [isExported, setIsExported] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string>("");

  // 1. 受控导览状态：决定 Joyride 是否开启
  const [runTour, setRunTour] = useState<boolean>(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const createdBlobUrlsRef = useRef<string[]>([]);

  // 2. 条件驱动标志：PPT 是否全面加载完毕（动画/切图完成且序列非空）
  const isPptLoaded = !isLoadingPdf && sequence.length > 0;

  // 💡 Joyride callback 处理居中与受控状态同步
  const handleJoyrideCallback = (data:any) => {
    const { type, step, status } = data;

    if (type === EVENTS.STEP_BEFORE || type === EVENTS.TOOLTIP) {
      const targetElement =
        typeof step.target === "string"
          ? document.querySelector(step.target)
          : step.target;

      if (targetElement) {
        setTimeout(() => {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }, 80);
      }
    }

    // 导览结束或跳过时，反向更新 state 闭环
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false);
      localStorage.setItem("PPT_RENDER_TOUR_SEEN", "true");
    }
  };

  // 💡 配置 useJoyride Hook (注入受控 run 状态)
  const { Tour } = useJoyride({
    steps: TOUR_STEPS,
    run: runTour, // 受控模式核心：将运行与 state 完全绑定
    continuous: true,
    tooltipComponent: CustomTooltip,
    scrollToFirstStep: true,
    
    options:{
      scrollOffset: 150,
      scrollDuration: 300,
      // showSkipButton: true,
      skipBeacon:true
    
    // disableScrollParentFix: false,

    },

    // floatingOptions

    // callback: handleJoyrideCallback,
  
    styles: {
               overlay:{
                color:'rgba(15, 23, 42, 0.45)',
                zIndex:100000
            },
    },
  });

  const pdfTargetName = globalState.ppt?.pdfName || globalState.ppt?.fileName;
  const pdfReadUrl = pdfTargetName
    ? getMediaUrl({ fileName: pdfTargetName, url: globalState.ppt?.url })
    : globalState.ppt?.url;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // 负责 PDF 解析与序列提取
  useEffect(() => {
    if (!pdfReadUrl) return;

    let isMounted = true;
    setIsLoadingPdf(true);

    convertPdfToBlobUrls(pdfReadUrl)
      .then((blobUrls) => {
        if (!isMounted) return;

        createdBlobUrlsRef.current = blobUrls;

        const initialSlides: NodesType[] = blobUrls.map((blobUrl, i) => ({
          type: "upload_pptx",
          fileName: globalState.ppt?.fileName || `PPT_Slide_${i + 1}.pptx`,
          page: i + 1,
          url: blobUrl,
        }));

        setSequence(initialSlides);
        setRunTour(true)
      })
      .catch((err) => {
        console.error("PDF 切图预处理失败:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingPdf(false);
      });

    return () => {
      isMounted = false;
    };
  }, [pdfReadUrl, globalState.ppt?.fileName]);

  // 💡 条件驱动模式：仅当 isPptLoaded 条件满足时才发起 setRunTour(true)
  // useEffect(() => {
  //   if (!isPptLoaded) return;

  //   const hasSeenTour = localStorage.getItem("PPT_RENDER_TOUR_SEEN");
  //   if (!hasSeenTour) {
  //     setRunTour(true);
  //   }
  // }, [isPptLoaded]);

  useEffect(() => {
    return () => {
      createdBlobUrlsRef.current.forEach((url) => {
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
      createdBlobUrlsRef.current = [];
    };
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: sequence.length + 1,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 115,
    overscan: 5,
  });

  const handleSelectPage = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const handleDeletePage = useCallback((indexToDelete: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSequence((prev) => {
      const nextSequence = prev.filter((_, idx) => idx !== indexToDelete);
      setActiveIndex((currIndex) => {
        if (currIndex >= nextSequence.length) {
          return Math.max(0, nextSequence.length - 1);
        }
        return currIndex;
      });
      return nextSequence;
    });
  }, []);

  const assetPool = globalState.nodes || [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (sequence.length === 0) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(sequence.length - 1, prev + 1));
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const dragData = active.data.current as ActiveDragItem;
    if (dragData) {
      setActiveDragData(dragData);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragData(null);

    if (!over || !active) return;

    const dragData = active.data.current as ActiveDragItem;
    const insertIndex = over.data.current?.insertIndex;

    if (typeof insertIndex !== "number") return;

    setSequence((prevSequence) => {
      if (dragData.type === "asset") {
        const newSequence = [...prevSequence];
        newSequence.splice(insertIndex, 0, dragData.asset);
        setActiveIndex(insertIndex);
        return newSequence;
      }

      if (dragData.type === "sequence_slide") {
        const fromIndex = dragData.index;

        if (fromIndex === insertIndex || fromIndex === insertIndex - 1) {
          return prevSequence;
        }

        const newSequence = [...prevSequence];
        const [movedItem] = newSequence.splice(fromIndex, 1);
        const targetIndex = fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
        newSequence.splice(targetIndex, 0, movedItem);

        setActiveIndex(targetIndex);
        return newSequence;
      }

      return prevSequence;
    });
  };

  const extractServerFileName = (node: NodesType): string => {
    if ((node as any).serverFileName) {
      return (node as any).serverFileName;
    }

    if (node.url && node.url.includes("name=")) {
      const match = node.url.match(/[?&]name=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    return node.fileName;
  };

  const convertSequenceToRenderTasks = async (): Promise<RenderTask[]> => {
    return sequence.map((node: NodesType, index: number) => {
      const targetPageNo = index + 1;
      const realFileName = extractServerFileName(node);

      if (node.type === "crop_img") {
        return {
          type: "image_crop",
          cropImageServerFileName: node.serverFileName,
          targetSlides: [targetPageNo],
          label: node.fileName,
        };
      }

      if (node.type === "upload_img") {
        return {
          type: "image_upload",
          imageServerFileName: node.serverFileName,
          targetSlides: [targetPageNo],
          label: node.fileName,
        };
      }

      return {
        type: "pptx_upload",
        pptxServerFileName: realFileName || globalState.ppt?.fileName,
        sourceSlides: [node.page || 1],
        targetSlides: [targetPageNo],
        label: node.fileName,
      };
    });
  };

  const clearLocalStorageCache = () => {
    const keysToRemove = ["GLOBAL_CONTEXT_STATE", "PPT_SEQUENCE_CACHE"];
    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });
  };

  const handleActionClick = async () => {
    if (isExported && downloadUrl) {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `混编成果_${Date.now()}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    try {
      setIsRendering(true);
      setRenderProgress(10);
      setStatusMessage("编译混编序列任务...");

      const renderTasks = await convertSequenceToRenderTasks();

      if (renderTasks.length === 0) {
        throw new Error("当前混编序列为空，请先添加页面或图片");
      }

      setRenderProgress(40);
      setStatusMessage("提交后端 Node.js Automizer 服务渲染...");

      const uploadSessionId =
        globalState.ppt?.fileName?.split("_")[0] ||
        globalState.pdf?.fileName?.split("_")[0] ||
        "default_session";

      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: renderTasks,
          uploadSessionId: uploadSessionId,
          templatePath: globalState.ppt.serverFileName,
        }),
      });

      setRenderProgress(70);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `服务端渲染失败 (Status: ${res.status})`);
      }

      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      setRenderProgress(100);
      setStatusMessage("渲染完成！");
      setDownloadUrl(blobUrl);
      setIsRendering(false);
      setIsExported(true);

      clearLocalStorageCache();

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `混编成果_${Date.now()}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      console.error("执行 Render 失败:", error);
      setIsRendering(false);
      setStatusMessage(`渲染失败: ${error.message || "请检查后端服务"}`);
    }
  };

  const currentActiveNode = sequence[activeIndex];
  const isDraggingAny = !!activeDragData;

  const activeImageUrl = activeDragData
    ? getMediaUrl(activeDragData.type === "asset" ? activeDragData.asset : activeDragData.node)
    : "";

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-900">
      {Tour}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* 点击新手引导按钮同样触发受控开启 state */}
        <Header onStartTour={() => setRunTour(true)} />

        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          autoScroll={{
            threshold: { x: 0, y: 0.2 },
            acceleration: 10,
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ----- 左侧：PPT 页面序列 ----- */}
            <div
              data-tour="tour-sequence-panel"
              className="lg:col-span-3 space-y-3 scroll-mt-28"
            >
              <Card className="border shadow-sm bg-white rounded-2xl">
                <CardHeader className="py-3 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                    <Presentation className="w-4 h-4 text-indigo-600" />
                    PPT 页面序列
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] bg-white">
                      共 {sequence.length} 页
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-2">
                  <div
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    className="outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-lg transition-all"
                  >
                    <div
                      ref={parentRef}
                      className="h-[520px] overflow-auto pr-1 relative"
                    >
                      {isLoadingPdf && sequence.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                          <span className="text-xs">解析并提取 PPT 页面中...</span>
                        </div>
                      ) : (
                        <div
                          style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            width: "100%",
                            position: "relative",
                          }}
                        >
                          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const index = virtualRow.index;
                            const isLastSlotOnly = index === sequence.length;
                            const node = sequence[index];

                            return (
                              <div
                                key={
                                  isLastSlotOnly
                                    ? `seq_last_slot`
                                    : `seq_node_${index}_${node?.fileName}_P${(node as any)?.page}`
                                }
                                ref={rowVirtualizer.measureElement}
                                data-index={index}
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: "100%",
                                  transform: `translateY(${virtualRow.start}px)`,
                                }}
                              >
                                <InsertionSlot index={index} isDragging={isDraggingAny} />

                                {!isLastSlotOnly && node && (
                                  <SlidePageCard
                                    node={node}
                                    index={index}
                                    isSelected={activeIndex === index}
                                    onClick={handleSelectPage}
                                    onDelete={handleDeletePage}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ----- 中间：画布预览 ----- */}
            <div
              data-tour="tour-canvas-preview"
              className="lg:col-span-6 space-y-4 scroll-mt-28"
            >
              <Card className="border shadow-sm bg-white rounded-2xl">
                <CardHeader className="py-3 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-semibold text-slate-800">
                      第 {activeIndex + 1} 页画布预览
                    </span>
                  </div>
                  {currentActiveNode && (
                    <Badge variant="secondary" className="text-[10px]">
                      {currentActiveNode.type}
                    </Badge>
                  )}
                </CardHeader>

                <CardContent className="p-6 bg-slate-100 min-h-[420px] flex items-center justify-center">
                  <div className="w-full aspect-[16/9] bg-white rounded-xl border-2 border-slate-300 shadow-xl p-4 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute inset-0 flex items-center justify-center">
                      {currentActiveNode ? (
                        <img
                          src={getMediaUrl(currentActiveNode)}
                          alt="Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="text-xs text-slate-400 font-mono">
                          序列为空，请从右侧拖拽资产加入
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ----- 右侧：资产库与导出控制台 ----- */}
            <div className="lg:col-span-3 space-y-4">
              <Card
                data-tour="tour-asset-pool"
                className="border shadow-sm bg-white rounded-2xl scroll-mt-28"
              >
                <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
                  <CardTitle className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                    <CropIcon className="w-4 h-4 text-indigo-600" />
                    截取资产库 (拖拽插入)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="h-[200px] overflow-auto pr-1 space-y-2">
                    {assetPool.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs">
                        暂无截取资产
                      </div>
                    ) : (
                      assetPool.map((asset: NodesType, idx: number) => (
                        <DraggableAssetItem
                          key={`asset_pool_${idx}_${asset.fileName}`}
                          asset={asset}
                          assetId={`asset_pool_${idx}_${asset.fileName}`}
                        />
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card
                data-tour="tour-render-console"
                className="border shadow-sm bg-white rounded-2xl scroll-mt-28"
              >
                <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
                  <CardTitle className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    混编导出控制台
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {isRendering && (
                    <div className="space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 font-medium truncate max-w-[70%]">
                          {statusMessage}
                        </span>
                        <span className="font-mono text-indigo-600 font-bold">
                          {renderProgress}%
                        </span>
                      </div>
                      <Progress value={renderProgress} className="h-2 bg-slate-100" />
                    </div>
                  )}

                  {isExported && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2 animate-in zoom-in-95">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">渲染成功！</p>
                        <p className="text-[11px] text-emerald-600">
                          目标 PPTX 共有 {sequence.length} 页。
                        </p>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleActionClick}
                    disabled={isRendering || sequence.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-10 shadow-md flex items-center justify-center gap-2 rounded-xl"
                  >
                    {isRendering ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>渲染生成中...</span>
                      </>
                    ) : isExported ? (
                      <>
                        <Download className="w-4 h-4" />
                        <span>下载混编结果 PPTX</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" />
                        <span>开始全量混编渲染</span>
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDragData ? (
              <div className="w-48 aspect-[16/9] bg-white border-2 border-indigo-600 rounded-lg shadow-2xl overflow-hidden relative cursor-grabbing pointer-events-none ring-4 ring-indigo-500/20">
                {activeImageUrl ? (
                  <img
                    src={activeImageUrl}
                    alt="Drag preview"
                    className="w-full h-full object-contain bg-slate-50"
                  />
                ) : (
                  <div className="w-full h-full bg-indigo-50 flex items-center justify-center text-xs font-semibold text-indigo-700">
                    PPT 页面
                  </div>
                )}
                <span className="absolute top-1.5 left-1.5 bg-indigo-600 text-white font-mono text-[9px] px-1.5 py-0.5 rounded shadow-sm font-medium">
                  {activeDragData.type === "asset"
                    ? "插入新页"
                    : `第 ${activeDragData.index + 1} 页`}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}