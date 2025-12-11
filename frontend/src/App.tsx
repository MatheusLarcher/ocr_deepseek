import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { jsPDF } from 'jspdf'
import {
  Upload,
  FileText,
  Image,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Trash2,
  Settings,
  Eye,
  Sun,
  Moon,
  Monitor,
  X,
  FileJson,
  FileType,
  Columns,
  Rows,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from './lib/utils'
import { useTheme, Theme } from './hooks/useTheme'

interface PageResult {
  page: number
  text: string
  image?: string
}

interface FileResult {
  filename: string
  type: 'pdf' | 'image'
  text?: string
  image?: string
  pages?: PageResult[]
  total_pages?: number
  success: boolean
  error?: string
}

interface ProcessingFile {
  file: File
  status: 'pending' | 'processing' | 'done' | 'error'
  result?: FileResult
  error?: string
}

const PROMPT_OPTIONS = [
  { label: 'Extrair texto', value: 'Extract the text in the image.' },
  { label: 'OCR Livre', value: 'Free OCR.' },
  { label: 'Converter para Markdown', value: '<|grounding|>Convert the document to markdown.' },
  { label: 'Analisar layout', value: '<|grounding|>Given the layout of the image.' },
  { label: 'Parsear figura', value: 'Parse the figure.' },
]

const API_BASE = 'http://localhost:8000'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'auto', label: 'Auto', icon: Monitor },
]

function App() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [files, setFiles] = useState<ProcessingFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState(PROMPT_OPTIONS[0].value)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showSettings, setShowSettings] = useState(true)
  const [dpi, setDpi] = useState(200)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [previewModal, setPreviewModal] = useState<FileResult | null>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [previewLayout, setPreviewLayout] = useState<'side' | 'stack'>('side')
  const [currentPage, setCurrentPage] = useState(1)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: ProcessingFile[] = acceptedFiles.map((file) => ({
      file,
      status: 'pending',
    }))
    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'],
    },
    multiple: true,
  })

  const processFiles = async () => {
    if (files.length === 0) return

    setIsProcessing(true)
    const prompt = customPrompt || selectedPrompt

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'processing' } : f))
      )

      try {
        const formData = new FormData()
        formData.append('file', files[i].file)
        formData.append('prompt', prompt)
        formData.append('dpi', dpi.toString())

        const isPdf = files[i].file.type === 'application/pdf'
        const endpoint = isPdf ? '/ocr/pdf' : '/ocr/image'

        const response = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Erro ao processar arquivo')
        }

        const result = await response.json()

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  status: 'done',
                  result: {
                    filename: result.filename,
                    type: isPdf ? 'pdf' : 'image',
                    text: result.text,
                    image: result.image,
                    pages: result.pages,
                    total_pages: result.total_pages,
                    success: true,
                  },
                }
              : f
          )
        )
      } catch (error) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Erro desconhecido',
                }
              : f
          )
        )
      }
    }

    setIsProcessing(false)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    setFiles([])
    setExpandedFile(null)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getResultsData = () => {
    return files
      .filter((f) => f.status === 'done' && f.result)
      .map((f) => {
        if (f.result?.type === 'pdf' && f.result.pages) {
          return {
            filename: f.result.filename,
            pages: f.result.pages.map((p) => ({
              page: p.page,
              text: p.text,
            })),
          }
        }
        return {
          filename: f.result?.filename,
          text: f.result?.text,
        }
      })
  }

  const downloadAsJson = () => {
    const results = getResultsData()
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ocr-results.json'
    a.click()
    URL.revokeObjectURL(url)
    setShowDownloadModal(false)
  }

  const downloadAsPdf = () => {
    const results = getResultsData()
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 15
    const maxWidth = pageWidth - margin * 2
    let y = 20

    doc.setFontSize(18)
    doc.text('OCR Results', margin, y)
    y += 15

    results.forEach((result, idx) => {
      if (y > 270) {
        doc.addPage()
        y = 20
      }

      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`File: ${result.filename}`, margin, y)
      y += 8

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)

      if ('pages' in result && result.pages) {
        result.pages.forEach((page: { page: number; text: string }) => {
          if (y > 270) {
            doc.addPage()
            y = 20
          }
          doc.setFont('helvetica', 'bold')
          doc.text(`Page ${page.page}:`, margin, y)
          y += 6
          doc.setFont('helvetica', 'normal')
          
          const lines = doc.splitTextToSize(page.text || '', maxWidth)
          lines.forEach((line: string) => {
            if (y > 280) {
              doc.addPage()
              y = 20
            }
            doc.text(line, margin, y)
            y += 5
          })
          y += 5
        })
      } else {
        const lines = doc.splitTextToSize(result.text || '', maxWidth)
        lines.forEach((line: string) => {
          if (y > 280) {
            doc.addPage()
            y = 20
          }
          doc.text(line, margin, y)
          y += 5
        })
      }
      y += 10

      if (idx < results.length - 1) {
        doc.setDrawColor(200)
        doc.line(margin, y - 5, pageWidth - margin, y - 5)
        y += 5
      }
    })

    doc.save('ocr-results.pdf')
    setShowDownloadModal(false)
  }

  const getFullText = (result: FileResult): string => {
    if (result.type === 'image') {
      return result.text || ''
    }
    return result.pages?.map((p) => `--- Página ${p.page} ---\n${p.text}`).join('\n\n') || ''
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const doneCount = files.filter((f) => f.status === 'done').length

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-200",
      resolvedTheme === 'dark' 
        ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" 
        : "bg-gradient-to-br from-slate-100 via-white to-slate-100"
    )}>
      {/* Header */}
      <header className={cn(
        "border-b backdrop-blur-sm",
        resolvedTheme === 'dark'
          ? "border-slate-700/50 bg-slate-900/50"
          : "border-slate-200 bg-white/80"
      )}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              resolvedTheme === 'dark' ? "bg-blue-500/20" : "bg-blue-100"
            )}>
              <Eye className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h1 className={cn(
                "text-xl font-bold",
                resolvedTheme === 'dark' ? "text-white" : "text-slate-900"
              )}>DeepSeek OCR</h1>
              <p className={cn(
                "text-sm",
                resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
              )}>Extração de texto com IA</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme Selector */}
            <div className={cn(
              "flex items-center rounded-lg p-1",
              resolvedTheme === 'dark' ? "bg-slate-800" : "bg-slate-100"
            )}>
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    title={opt.label}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      theme === opt.value
                        ? resolvedTheme === 'dark'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-blue-100 text-blue-600'
                        : resolvedTheme === 'dark'
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-400 hover:text-slate-700'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                )
              })}
            </div>
            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                showSettings
                  ? resolvedTheme === 'dark'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-blue-100 text-blue-600'
                  : resolvedTheme === 'dark'
                    ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              )}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Prompt Panel - Always visible */}
        <div className={cn(
          "mb-6 p-5 rounded-xl border",
          resolvedTheme === 'dark'
            ? "bg-slate-800/50 border-slate-700/50"
            : "bg-white border-slate-200 shadow-sm"
        )}>
          <h3 className={cn(
            "text-base font-semibold mb-4 flex items-center gap-2",
            resolvedTheme === 'dark' ? "text-white" : "text-slate-900"
          )}>
            <Settings className="w-4 h-4 text-blue-500" />
            Configuração do Prompt
          </h3>
          
          {/* Main prompt input */}
          <div className="mb-4">
            <label className={cn(
              "block text-sm mb-2 font-medium",
              resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
            )}>
              Prompt para OCR
            </label>
            <textarea
              value={customPrompt || selectedPrompt}
              onChange={(e) => {
                setCustomPrompt(e.target.value)
                setSelectedPrompt('')
              }}
              rows={2}
              placeholder="Ex: Extract the text in the image."
              className={cn(
                "w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono",
                resolvedTheme === 'dark'
                  ? "bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                  : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400"
              )}
            />
            <p className={cn(
              "text-xs mt-2",
              resolvedTheme === 'dark' ? "text-slate-500" : "text-slate-500"
            )}>
              Dica: Use <code className={cn(
                "px-1 rounded",
                resolvedTheme === 'dark' ? "bg-slate-700" : "bg-slate-200"
              )}>&lt;|grounding|&gt;</code> no início para análise de layout
            </p>
          </div>

          {/* Quick prompts */}
          <div className="mb-4">
            <label className={cn(
              "block text-sm mb-2",
              resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-600"
            )}>Prompts rápidos:</label>
            <div className="flex flex-wrap gap-2">
              {PROMPT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSelectedPrompt(opt.value)
                    setCustomPrompt('')
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                    (customPrompt === '' && selectedPrompt === opt.value)
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : resolvedTheme === 'dark'
                        ? 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                        : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced settings toggle */}
          {showSettings && (
            <div className={cn(
              "pt-4 border-t",
              resolvedTheme === 'dark' ? "border-slate-700/50" : "border-slate-200"
            )}>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className={cn(
                    "block text-sm mb-1",
                    resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-600"
                  )}>Escala / DPI</label>
                  <input
                    type="number"
                    value={dpi}
                    onChange={(e) => setDpi(Number(e.target.value))}
                    min={72}
                    max={600}
                    className={cn(
                      "w-32 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
                      resolvedTheme === 'dark'
                        ? "bg-slate-700/50 border-slate-600 text-white"
                        : "bg-slate-50 border-slate-300 text-slate-900"
                    )}
                  />
                  <span className="text-xs text-slate-500 ml-2">PDFs e imagens • Maior = melhor qualidade, mais lento</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
            isDragActive
              ? 'border-blue-500 bg-blue-500/10'
              : resolvedTheme === 'dark'
                ? 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/30'
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          )}
        >
          <input {...getInputProps()} />
          <Upload
            className={cn(
              'w-12 h-12 mx-auto mb-4',
              isDragActive ? 'text-blue-500' : resolvedTheme === 'dark' ? 'text-slate-500' : 'text-slate-400'
            )}
          />
          <p className={cn(
            "text-lg mb-2",
            resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
          )}>
            {isDragActive
              ? 'Solte os arquivos aqui...'
              : 'Arraste arquivos ou clique para selecionar'}
          </p>
          <p className="text-sm text-slate-500">
            Suporta PDF e imagens (PNG, JPG, WEBP, GIF, BMP)
          </p>
        </div>

        {/* Action Buttons */}
        {files.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={processFiles}
              disabled={isProcessing || pendingCount === 0}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                isProcessing || pendingCount === 0
                  ? resolvedTheme === 'dark'
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              )}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  Processar {pendingCount > 0 ? `(${pendingCount})` : ''}
                </>
              )}
            </button>

            {doneCount > 0 && (
              <button
                onClick={() => setShowDownloadModal(true)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                  resolvedTheme === 'dark'
                    ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                    : "bg-green-100 text-green-700 hover:bg-green-200"
                )}
              >
                <Download className="w-4 h-4" />
                Baixar resultados
              </button>
            )}

            <button
              onClick={clearAll}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                resolvedTheme === 'dark'
                  ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                  : "bg-red-100 text-red-600 hover:bg-red-200"
              )}
            >
              <Trash2 className="w-4 h-4" />
              Limpar tudo
            </button>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-6 space-y-3">
            {files.map((item, index) => (
              <div
                key={`${item.file.name}-${index}`}
                className={cn(
                  "rounded-xl border overflow-hidden",
                  resolvedTheme === 'dark'
                    ? "bg-slate-800/50 border-slate-700/50"
                    : "bg-white border-slate-200 shadow-sm"
                )}
              >
                <div className="p-4 flex items-center gap-4">
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      item.file.type === 'application/pdf'
                        ? resolvedTheme === 'dark' ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600'
                        : resolvedTheme === 'dark' ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-600'
                    )}
                  >
                    {item.file.type === 'application/pdf' ? (
                      <FileText className="w-5 h-5" />
                    ) : (
                      <Image className="w-5 h-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium truncate",
                      resolvedTheme === 'dark' ? "text-white" : "text-slate-900"
                    )}>{item.file.name}</p>
                    <p className={cn(
                      "text-sm",
                      resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>
                      {(item.file.size / 1024).toFixed(1)} KB
                      {item.result?.total_pages && ` • ${item.result.total_pages} páginas`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === 'pending' && (
                      <span className={cn(
                        "px-2 py-1 text-xs rounded-full",
                        resolvedTheme === 'dark' ? "bg-slate-600/50 text-slate-300" : "bg-slate-200 text-slate-600"
                      )}>
                        Pendente
                      </span>
                    )}
                    {item.status === 'processing' && (
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-500 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Processando
                      </span>
                    )}
                    {item.status === 'done' && (
                      <span className={cn(
                        "px-2 py-1 text-xs rounded-full flex items-center gap-1",
                        resolvedTheme === 'dark' ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"
                      )}>
                        <CheckCircle2 className="w-3 h-3" />
                        Concluído
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span className={cn(
                        "px-2 py-1 text-xs rounded-full flex items-center gap-1",
                        resolvedTheme === 'dark' ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-600"
                      )}>
                        <XCircle className="w-3 h-3" />
                        Erro
                      </span>
                    )}

                    {item.status === 'done' && item.result && (
                      <>
                        <button
                          onClick={() => setPreviewModal(item.result!)}
                          title="Visualizar resultado"
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            resolvedTheme === 'dark'
                              ? "text-slate-400 hover:text-white hover:bg-slate-700/50"
                              : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setExpandedFile(
                              expandedFile === item.file.name ? null : item.file.name
                            )
                          }
                          title="Expandir/Recolher"
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            resolvedTheme === 'dark'
                              ? "text-slate-400 hover:text-white hover:bg-slate-700/50"
                              : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => copyToClipboard(getFullText(item.result!))}
                          title="Copiar texto"
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            resolvedTheme === 'dark'
                              ? "text-slate-400 hover:text-white hover:bg-slate-700/50"
                              : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => removeFile(index)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Error Message */}
                {item.status === 'error' && item.error && (
                  <div className="px-4 pb-4">
                    <p className={cn(
                      "text-sm rounded-lg p-3",
                      resolvedTheme === 'dark' ? "text-red-400 bg-red-500/10" : "text-red-600 bg-red-50"
                    )}>
                      {item.error}
                    </p>
                  </div>
                )}

                {/* Expanded Result */}
                {expandedFile === item.file.name && item.result && (
                  <div className={cn(
                    "border-t p-4",
                    resolvedTheme === 'dark' ? "border-slate-700/50" : "border-slate-200"
                  )}>
                    {item.result.type === 'image' ? (
                      <div className={cn(
                        "rounded-lg p-4",
                        resolvedTheme === 'dark' ? "bg-slate-900/50" : "bg-slate-50"
                      )}>
                        <pre className={cn(
                          "text-sm whitespace-pre-wrap font-mono",
                          resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                        )}>
                          {item.result.text}
                        </pre>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {item.result.pages?.map((page) => (
                          <div key={page.page}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={cn(
                                "px-2 py-1 text-xs rounded-full",
                                resolvedTheme === 'dark' ? "bg-slate-600/50 text-slate-300" : "bg-slate-200 text-slate-600"
                              )}>
                                Página {page.page}
                              </span>
                              <button
                                onClick={() => copyToClipboard(page.text)}
                                className={cn(
                                  "p-1 transition-colors",
                                  resolvedTheme === 'dark' ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-700"
                                )}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <div className={cn(
                              "rounded-lg p-4",
                              resolvedTheme === 'dark' ? "bg-slate-900/50" : "bg-slate-50"
                            )}>
                              <pre className={cn(
                                "text-sm whitespace-pre-wrap font-mono",
                                resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                              )}>
                                {page.text}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {files.length === 0 && (
          <div className="mt-12 text-center">
            <div className={cn(
              "inline-flex items-center justify-center w-16 h-16 rounded-full mb-4",
              resolvedTheme === 'dark' ? "bg-slate-800/50" : "bg-slate-100"
            )}>
              <FileText className="w-8 h-8 text-slate-500" />
            </div>
            <p className={cn(
              resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-600"
            )}>Nenhum arquivo selecionado</p>
            <p className="text-sm text-slate-500 mt-1">
              Arraste PDFs ou imagens para começar
            </p>
          </div>
        )}
      </main>

      {/* Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={cn(
            "relative w-full max-w-7xl max-h-[95vh] rounded-xl shadow-2xl overflow-hidden flex flex-col",
            resolvedTheme === 'dark' ? "bg-slate-800" : "bg-white"
          )}>
            {/* Modal Header */}
            <div className={cn(
              "flex items-center justify-between px-6 py-4 border-b shrink-0",
              resolvedTheme === 'dark' ? "border-slate-700" : "border-slate-200"
            )}>
              <div className="flex items-center gap-4">
                <div>
                  <h2 className={cn(
                    "text-lg font-semibold",
                    resolvedTheme === 'dark' ? "text-white" : "text-slate-900"
                  )}>
                    {previewModal.filename}
                  </h2>
                  <p className={cn(
                    "text-sm",
                    resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>
                    {previewModal.type === 'pdf' ? `${previewModal.total_pages} páginas` : 'Imagem'}
                  </p>
                </div>
                
                {/* Page Navigation for PDFs */}
                {previewModal.type === 'pdf' && previewModal.pages && previewModal.pages.length > 1 && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        currentPage === 1
                          ? "opacity-50 cursor-not-allowed"
                          : resolvedTheme === 'dark'
                            ? "hover:bg-slate-700 text-slate-400 hover:text-white"
                            : "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className={cn(
                      "text-sm font-medium min-w-[80px] text-center",
                      resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-600"
                    )}>
                      {currentPage} / {previewModal.total_pages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(previewModal.total_pages || 1, p + 1))}
                      disabled={currentPage === previewModal.total_pages}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        currentPage === previewModal.total_pages
                          ? "opacity-50 cursor-not-allowed"
                          : resolvedTheme === 'dark'
                            ? "hover:bg-slate-700 text-slate-400 hover:text-white"
                            : "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {/* Layout Toggle */}
                <div className={cn(
                  "flex items-center rounded-lg p-1",
                  resolvedTheme === 'dark' ? "bg-slate-700" : "bg-slate-100"
                )}>
                  <button
                    onClick={() => setPreviewLayout('side')}
                    title="Lado a lado"
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      previewLayout === 'side'
                        ? resolvedTheme === 'dark'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-blue-100 text-blue-600'
                        : resolvedTheme === 'dark'
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-400 hover:text-slate-700'
                    )}
                  >
                    <Columns className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewLayout('stack')}
                    title="Empilhado"
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      previewLayout === 'stack'
                        ? resolvedTheme === 'dark'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-blue-100 text-blue-600'
                        : resolvedTheme === 'dark'
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-400 hover:text-slate-700'
                    )}
                  >
                    <Rows className="w-4 h-4" />
                  </button>
                </div>
                
                <button
                  onClick={() => copyToClipboard(getFullText(previewModal))}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    resolvedTheme === 'dark'
                      ? "text-slate-400 hover:text-white hover:bg-slate-700"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  )}
                  title="Copiar tudo"
                >
                  <Copy className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    setPreviewModal(null)
                    setCurrentPage(1)
                  }}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    resolvedTheme === 'dark'
                      ? "text-slate-400 hover:text-white hover:bg-slate-700"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-auto">
              {previewModal.type === 'image' ? (
                /* Single Image View */
                <div className={cn(
                  "h-full",
                  previewLayout === 'side' ? "flex" : "flex flex-col"
                )}>
                  {/* Image */}
                  <div className={cn(
                    "flex items-center justify-center p-4",
                    previewLayout === 'side' ? "w-1/2 border-r" : "border-b",
                    resolvedTheme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                  )}>
                    {previewModal.image ? (
                      <img 
                        src={previewModal.image} 
                        alt={previewModal.filename}
                        className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                      />
                    ) : (
                      <div className="text-slate-500">Imagem não disponível</div>
                    )}
                  </div>
                  
                  {/* Text */}
                  <div className={cn(
                    "p-6 overflow-auto",
                    previewLayout === 'side' ? "w-1/2" : "flex-1"
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={cn(
                        "text-sm font-semibold",
                        resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                      )}>Texto Extraído</h3>
                      <button
                        onClick={() => copyToClipboard(previewModal.text || '')}
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          resolvedTheme === 'dark'
                            ? "text-slate-400 hover:text-white hover:bg-slate-700"
                            : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        )}
                        title="Copiar texto"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <pre className={cn(
                      "text-sm whitespace-pre-wrap font-mono leading-relaxed select-text",
                      resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                    )}>
                      {previewModal.text}
                    </pre>
                  </div>
                </div>
              ) : (
                /* PDF View - Show current page */
                <div className={cn(
                  "h-full",
                  previewLayout === 'side' ? "flex" : "flex flex-col"
                )}>
                  {previewModal.pages && previewModal.pages[currentPage - 1] && (
                    <>
                      {/* Page Image */}
                      <div className={cn(
                        "flex items-center justify-center p-4",
                        previewLayout === 'side' ? "w-1/2 border-r" : "border-b",
                        resolvedTheme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                      )}>
                        {previewModal.pages[currentPage - 1].image ? (
                          <img 
                            src={previewModal.pages[currentPage - 1].image} 
                            alt={`Página ${currentPage}`}
                            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                          />
                        ) : (
                          <div className="text-slate-500">Imagem não disponível</div>
                        )}
                      </div>
                      
                      {/* Page Text */}
                      <div className={cn(
                        "p-6 overflow-auto",
                        previewLayout === 'side' ? "w-1/2" : "flex-1"
                      )}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className={cn(
                            "text-sm font-semibold",
                            resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                          )}>Página {currentPage} - Texto Extraído</h3>
                          <button
                            onClick={() => copyToClipboard(previewModal.pages![currentPage - 1].text || '')}
                            className={cn(
                              "p-1.5 rounded transition-colors",
                              resolvedTheme === 'dark'
                                ? "text-slate-400 hover:text-white hover:bg-slate-700"
                                : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            )}
                            title="Copiar texto desta página"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <pre className={cn(
                          "text-sm whitespace-pre-wrap font-mono leading-relaxed select-text",
                          resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                        )}>
                          {previewModal.pages[currentPage - 1].text}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={cn(
            "relative w-full max-w-md rounded-xl shadow-2xl overflow-hidden",
            resolvedTheme === 'dark' ? "bg-slate-800" : "bg-white"
          )}>
            {/* Modal Header */}
            <div className={cn(
              "flex items-center justify-between px-6 py-4 border-b",
              resolvedTheme === 'dark' ? "border-slate-700" : "border-slate-200"
            )}>
              <h2 className={cn(
                "text-lg font-semibold",
                resolvedTheme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Exportar Resultados
              </h2>
              <button
                onClick={() => setShowDownloadModal(false)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  resolvedTheme === 'dark'
                    ? "text-slate-400 hover:text-white hover:bg-slate-700"
                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <p className={cn(
                "text-sm",
                resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-600"
              )}>
                Escolha o formato de exportação:
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={downloadAsJson}
                  className={cn(
                    "flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all hover:scale-105",
                    resolvedTheme === 'dark'
                      ? "border-slate-600 hover:border-blue-500 hover:bg-blue-500/10"
                      : "border-slate-200 hover:border-blue-500 hover:bg-blue-50"
                  )}
                >
                  <FileJson className={cn(
                    "w-10 h-10",
                    resolvedTheme === 'dark' ? "text-yellow-400" : "text-yellow-600"
                  )} />
                  <div className="text-center">
                    <p className={cn(
                      "font-semibold",
                      resolvedTheme === 'dark' ? "text-white" : "text-slate-900"
                    )}>JSON</p>
                    <p className={cn(
                      "text-xs",
                      resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>Dados estruturados</p>
                  </div>
                </button>
                
                <button
                  onClick={downloadAsPdf}
                  className={cn(
                    "flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all hover:scale-105",
                    resolvedTheme === 'dark'
                      ? "border-slate-600 hover:border-red-500 hover:bg-red-500/10"
                      : "border-slate-200 hover:border-red-500 hover:bg-red-50"
                  )}
                >
                  <FileType className={cn(
                    "w-10 h-10",
                    resolvedTheme === 'dark' ? "text-red-400" : "text-red-600"
                  )} />
                  <div className="text-center">
                    <p className={cn(
                      "font-semibold",
                      resolvedTheme === 'dark' ? "text-white" : "text-slate-900"
                    )}>PDF</p>
                    <p className={cn(
                      "text-xs",
                      resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>Documento formatado</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className={cn(
        "border-t mt-auto",
        resolvedTheme === 'dark' ? "border-slate-700/50" : "border-slate-200"
      )}>
        <div className="max-w-6xl mx-auto px-4 py-4 text-center text-sm text-slate-500">
          Powered by DeepSeek-OCR via Ollama
        </div>
      </footer>
    </div>
  )
}

export default App
