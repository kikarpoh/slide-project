'use client'
import React, {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  useEffect
} from 'react'

// ================= 节点类型定义 =================
export interface CropNode {
  type: 'crop_img'
  img_data: string
  url: string
  fileName: string
  serverFileName: string
}

export interface ImgNode {
  type: 'upload_img'
  img_data: string
  url: string
  fileName: string
  serverFileName: string
}

export interface PptxNode {
  type: 'upload_pptx'
  page: number
  url: string
  fileName: string
}

export type NodesType = CropNode | ImgNode | PptxNode

// ================= 全局状态定义 =================
export interface GlobalState {
  pdf: {
    url: string
    fileName: string
    serverFileName: string
  }
  ppt: {
    url: string
    fileName: string
    pdfName: string
    serverFileName: string
  }
  nodes: NodesType[]
}

// ================= Reducer Action 定义 =================
export type Action =
  | {
      type: 'SET_PDF'
      payload: { url: string; fileName: string; serverFileName: string }
    }
  | {
      type: 'SET_PPT'
      payload: { url: string; fileName: string; pdfName: string; serverFileName: string }
    }
  | { type: 'ADD_NODE'; payload: NodesType }
  | { type: 'REMOVE_NODE'; payload: number }
  | { type: 'UPDATE_NODE'; payload: { index: number; node: NodesType } }
  | { type: 'SET_NODES'; payload: NodesType[] }
  | { type: 'CLEAR_NODES' }
  | { type: 'RESET_ALL' }

// ================= 初始状态 =================
const initialState: GlobalState = {
  pdf: {
    url: '',
    fileName: '',
    serverFileName: ''
  },
  ppt: {
    url: '',
    fileName: '',
    pdfName: '',
    serverFileName: ''
  },
  nodes: []
}

const STORAGE_KEY = 'GLOBAL_CONTEXT_STATE'

// 💡 从 localStorage 中安全获取初始状态 (兼顾 SSR / Next.js)
function getInitialState(): GlobalState {
  if (typeof window === 'undefined') {
    return initialState
  }
  try {
    const localData = localStorage.getItem(STORAGE_KEY)
    return localData ? JSON.parse(localData) : initialState
  } catch (error) {
    console.error('读取 localStorage 失败:', error)
    return initialState
  }
}

// ================= Reducer 函数 =================
function globalReducer(state: GlobalState, action: Action): GlobalState {
  switch (action.type) {
    case 'SET_PDF':
      return { ...state, pdf: action.payload }

    case 'SET_PPT':
      return { ...state, ppt: action.payload }

    case 'ADD_NODE':
      return { ...state, nodes: [...state.nodes, action.payload] }

    case 'REMOVE_NODE':
      return {
        ...state,
        nodes: state.nodes.filter((_, index) => index !== action.payload)
      }

    case 'UPDATE_NODE':
      return {
        ...state,
        nodes: state.nodes.map((node, index) =>
          index === action.payload.index ? action.payload.node : node
        )
      }

    case 'SET_NODES':
      return { ...state, nodes: action.payload }

    case 'CLEAR_NODES':
      return { ...state, nodes: [] }

    case 'RESET_ALL':
      return initialState

    default:
      return state
  }
}

// ================= Context 值类型定义 =================
interface GlobalContextType {
  state: GlobalState
  dispatch: React.Dispatch<Action>
  setPdf: (pdf: { url: string; fileName: string; serverFileName: string }) => void
  setPpt: (ppt: { url: string; fileName: string; pdfName: string; serverFileName: string }) => void
  addNode: (node: NodesType) => void
  removeNode: (index: number) => void
  updateNode: (index: number, node: NodesType) => void
  setNodes: (nodes: NodesType[]) => void
  clearNodes: () => void
  resetAll: () => void
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined)

// ================= Provider 组件 =================
export const GlobalProvider = ({ children }: { children: React.ReactNode }) => {
  // 💡 传递 getInitialState 作为 useReducer 的第三个参数 (惰性初始化)
  const [state, dispatch] = useReducer(globalReducer, initialState, getInitialState)

  // 💡 每当 state 发生更改时，自动序列化写入 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('保存 state 到 localStorage 失败:', error)
    }
  }, [state])

  const setPdf = useCallback(
    (pdf: { url: string; fileName: string; serverFileName: string }) => {
      dispatch({ type: 'SET_PDF', payload: pdf })
    },
    []
  )

  const setPpt = useCallback(
    (ppt: { url: string; fileName: string; pdfName: string; serverFileName: string }) => {
      dispatch({ type: 'SET_PPT', payload: ppt })
    },
    []
  )

  const addNode = useCallback((node: NodesType) => {
    dispatch({ type: 'ADD_NODE', payload: node })
  }, [])

  const removeNode = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_NODE', payload: index })
  }, [])

  const updateNode = useCallback((index: number, node: NodesType) => {
    dispatch({ type: 'UPDATE_NODE', payload: { index, node } })
  }, [])

  const setNodes = useCallback((nodes: NodesType[]) => {
    dispatch({ type: 'SET_NODES', payload: nodes })
  }, [])

  const clearNodes = useCallback(() => {
    dispatch({ type: 'CLEAR_NODES' })
  }, [])

  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY) // 💡 重置时清除缓存
    dispatch({ type: 'RESET_ALL' })
  }, [])

  const contextValue = useMemo(
    () => ({
      state,
      dispatch,
      setPdf,
      setPpt,
      addNode,
      removeNode,
      updateNode,
      setNodes,
      clearNodes,
      resetAll
    }),
    [
      state,
      setPdf,
      setPpt,
      addNode,
      removeNode,
      updateNode,
      setNodes,
      clearNodes,
      resetAll
    ]
  )

  return (
    <GlobalContext.Provider value={contextValue}>
      {children}
    </GlobalContext.Provider>
  )
}

// ================= Custom Hook =================
export const useGlobalContext = () => {
  const context = useContext(GlobalContext)
  if (!context) {
    throw new Error('useGlobalContext 必须在 GlobalProvider 内部使用')
  }
  return context
}