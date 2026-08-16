'use client'
import DataIngestionStep from "@/components/ingestionStep";
import dynamic from 'next/dynamic'
import { useGlobalContext } from "@/context/global";
import { useState, useEffect } from "react"; // 💡 引入 useEffect

const PDFCropMappingStep = dynamic(
  () => import("@/components/cropMapping"),
  {
    ssr: false,
    loading: () => (
      <div className="p-12 text-center text-slate-500 text-sm font-medium">
        正在加载 PDF 渲染引擎...
      </div>
    ),
  }
);

const PPTHybridRenderStep = dynamic(
  () => import("@/components/render"),
  {
    ssr: false,
    loading: () => (
      <div className="p-12 text-center text-slate-500 text-sm font-medium">
        正在加载 PDF 渲染引擎...
      </div>
    )
  }
)

export default function Home() {
  const { setPdf, setPpt, state: { pdf, ppt } } = useGlobalContext()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // 💡 检测全局数据是否存在：如果 pdf 和 ppt 已有服务端文件名，跳过 Step 1 直接进入 Step 2
  useEffect(() => {
    const hasExistingData = Boolean(pdf?.serverFileName && ppt?.serverFileName);
    if (hasExistingData && step === 1) {
      setStep(2);
    }
  }, [pdf?.serverFileName, ppt?.serverFileName]);

  console.log(pdf, ppt)

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">

        {step === 1 && (
          <DataIngestionStep
            onConfirm={(d) => {
              setPdf({
                url: d.pdfUrl,
                fileName: d.pdfServerFileName,
                serverFileName: d.pdfServerFileName
              })

              setPpt({
                url: d.pptDocs[0].pdfFileName,
                fileName: d.selectedPptServerFileName,
                pdfName: d.pptDocs[0].pdfFileName,
                serverFileName: d.pdfServerFileName
              })

              setStep(2)
            }}
          />
        )}

        {step === 2 && (
          <PDFCropMappingStep
            onBack={() => {
              setStep(1)
            }}
            onNext={(d) => {
              console.log(d)
              setStep(3)
            }}
          />
        )}

        {step === 3 && (
          <PPTHybridRenderStep />
        )}

      </div>
    </div>
  );
}