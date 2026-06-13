import { create } from 'zustand'

const DEFAULT_CHAT_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'
const LEGACY_DEFAULT_CHAT_MODEL = 'deepseek/deepseek-v4-flash:free'
const storedChatModel = localStorage.getItem('pdfomni_chat_model')

export const useAppStore = create((set) => ({
  // Files management
  files: [],
  activeFileIndex: 0,
  
  addFiles: (newFiles) => set((state) => ({
    files: [...state.files, ...newFiles.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      name: f.name,
      size: f.size,
      pageCount: 0,
      thumbnails: [],
      pdfBytes: null,
      status: 'pending', // pending | processing | ready | error
      error: null,
    }))]
  })),
  
  updateFile: (id, updates) => set((state) => ({
    files: state.files.map(f => f.id === id ? { ...f, ...updates } : f)
  })),
  
  removeFile: (id) => set((state) => ({
    files: state.files.filter(f => f.id !== id),
    activeFileIndex: Math.min(state.activeFileIndex, Math.max(0, state.files.length - 2))
  })),
  
  clearFiles: () => set({ files: [], activeFileIndex: 0 }),
  
  setActiveFileIndex: (index) => set({ activeFileIndex: index }),
  
  reorderFiles: (fromIndex, toIndex) => set((state) => {
    const files = [...state.files]
    const [moved] = files.splice(fromIndex, 1)
    files.splice(toIndex, 0, moved)
    return { files }
  }),

  // Processing state
  isProcessing: false,
  progress: 0,
  progressMessage: '',
  
  setProcessing: (isProcessing, message = '') => set({ 
    isProcessing, 
    progressMessage: message,
    progress: isProcessing ? 0 : 100 
  }),
  
  setProgress: (progress, message) => set((state) => ({ 
    progress, 
    progressMessage: message || state.progressMessage 
  })),

  // Tool state
  currentTool: null,
  setCurrentTool: (tool) => set({ currentTool: tool }),

  // Toast notifications
  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID()
    set((state) => ({
      toasts: [...state.toasts, { id, ...toast }]
    }))
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id)
      }))
    }, toast.duration || 4000)
  },
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  // AI Chat
  chatOpen: false,
  setChatOpen: (open) => set({ chatOpen: open }),
  toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
  
  apiKey: localStorage.getItem('pdfomni_api_key') || '',
  setApiKey: (key) => {
    localStorage.setItem('pdfomni_api_key', key)
    set({ apiKey: key })
  },

  chatModel: storedChatModel && storedChatModel !== LEGACY_DEFAULT_CHAT_MODEL ? storedChatModel : DEFAULT_CHAT_MODEL,
  setChatModel: (model) => {
    localStorage.setItem('pdfomni_chat_model', model)
    set({ chatModel: model })
  },

  activePdf: null, // { name, pdfBytes, pageCount }
  setActivePdf: (pdf) => set({ activePdf: pdf }),
  clearActivePdf: () => set({ activePdf: null }),

  chatMessages: [],
  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages, { id: crypto.randomUUID(), timestamp: Date.now(), ...msg }]
  })),
  updateChatMessage: (id, updates) => set((state) => ({
    chatMessages: state.chatMessages.map((msg) => (
      msg.id === id ? { ...msg, ...updates, editedAt: Date.now() } : msg
    ))
  })),
  deleteChatMessage: (id) => set((state) => ({
    chatMessages: state.chatMessages.filter((msg) => msg.id !== id)
  })),
  clearChat: () => set({ chatMessages: [] }),

  // Workflow
  workflowNodes: [],
  workflowEdges: [],
  setWorkflowNodes: (nodes) => set({ workflowNodes: nodes }),
  setWorkflowEdges: (edges) => set({ workflowEdges: edges }),

  // Batch management
  batchView: 'grid', // grid | list
  batchSort: 'name', // name | size | pages | date
  batchSortDir: 'asc',
  setBatchView: (view) => set({ batchView: view }),
  setBatchSort: (sort) => set((state) => ({
    batchSort: sort,
    batchSortDir: state.batchSort === sort ? (state.batchSortDir === 'asc' ? 'desc' : 'asc') : 'asc'
  })),
}))
