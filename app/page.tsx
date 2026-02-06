'use client'

import { useState, useRef, useEffect } from 'react'
import { callAIAgent, uploadFiles } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Loader2, Upload, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, Clock, FileText, Sparkles, Download,
  BookOpen, AlertCircle, TrendingUp, Users
} from 'lucide-react'

// Agent IDs
const AGENTS = {
  DISCOVERY_COORDINATOR: '6985a8c9e2c0086a4fc43c18',
}

// TypeScript Interfaces
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: Date
}

interface DocumentInfo {
  title: string
  authors: string[]
  abstract: string
  year?: number
}

interface UnderstandingResult {
  problem_statement: string
  methodology: {
    approach: string
    techniques: string[]
    section_citation: string
  }
  results: {
    key_findings: string[]
    section_citation: string
  }
  limitations: {
    identified_limitations: string[]
    section_citation: string
  }
  key_claims: Array<{
    claim: string
    section_citation: string
    confidence: string
  }>
}

interface KeyPoint {
  point: string
  section_reference: string
}

interface Recommendation {
  rank: number
  title: string
  authors: string[]
  year: number
  source: string
  doi_or_arxiv_id: string
  relevance_score: number
  relevance_explanation: string
  abstract_snippet: string
}

type ProcessingStage = 'idle' | 'uploading' | 'conversation' | 'analyzing' | 'complete'

export default function Home() {
  // Upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [doiInput, setDoiInput] = useState('')
  const [arxivInput, setArxivInput] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([])

  // Conversation state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Processing stage
  const [stage, setStage] = useState<ProcessingStage>('idle')

  // Results state
  const [documentInfo, setDocumentInfo] = useState<DocumentInfo | null>(null)
  const [understanding, setUnderstanding] = useState<UnderstandingResult | null>(null)
  const [keyTakeaways, setKeyTakeaways] = useState<KeyPoint[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [qualityScore, setQualityScore] = useState<number | null>(null)

  // UI state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['problem']))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type === 'application/pdf') {
        setPdfFile(file)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0])
    }
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const resetAnalysis = () => {
    setPdfFile(null)
    setDoiInput('')
    setArxivInput('')
    setUploadedAssetIds([])
    setChatMessages([])
    setUserInput('')
    setStage('idle')
    setDocumentInfo(null)
    setUnderstanding(null)
    setKeyTakeaways([])
    setRecommendations([])
    setQualityScore(null)
    setExpandedSections(new Set(['problem']))
  }

  const analyzeDocument = async () => {
    if (!pdfFile && !doiInput && !arxivInput) return

    setIsLoading(true)
    setStage('uploading')

    try {
      let assetIds: string[] = []

      // Upload PDF if present
      if (pdfFile) {
        const uploadResult = await uploadFiles(pdfFile)
        if (uploadResult.success) {
          assetIds = uploadResult.asset_ids
          setUploadedAssetIds(assetIds)
        } else {
          setChatMessages([{
            role: 'assistant',
            content: `Failed to upload PDF: ${uploadResult.error}. Please try again.`,
            timestamp: new Date()
          }])
          setIsLoading(false)
          setStage('idle')
          return
        }
      }

      // Start conversation with Discovery Coordinator
      setStage('conversation')

      const initialMessage = `I've uploaded a research paper${pdfFile ? ` (PDF: ${pdfFile.name})` : ''}${doiInput ? ` (DOI: ${doiInput})` : ''}${arxivInput ? ` (arXiv: ${arxivInput})` : ''}. Please help me analyze it.`

      setChatMessages([{
        role: 'user',
        content: initialMessage,
        timestamp: new Date()
      }])

      const result = await callAIAgent(
        initialMessage,
        AGENTS.DISCOVERY_COORDINATOR,
        { assets: assetIds }
      )

      if (result.success && result.response.status === 'success') {
        const responseData = result.response.result

        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: responseData.user_message || 'What aspects of the paper would you like me to focus on? (e.g., methodology, limitations, practical applications)',
          timestamp: new Date()
        }])
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: 'I encountered an issue starting the analysis. Please try again.',
          timestamp: new Date()
        }])
      }

      setIsLoading(false)
    } catch (error) {
      console.error('Error:', error)
      setChatMessages([{
        role: 'assistant',
        content: 'An error occurred during upload. Please try again.',
        timestamp: new Date()
      }])
      setIsLoading(false)
      setStage('idle')
    }
  }

  const sendMessage = async () => {
    if (!userInput.trim() || isLoading) return

    const message = userInput.trim()
    setUserInput('')
    setChatMessages(prev => [...prev, {
      role: 'user',
      content: message,
      timestamp: new Date()
    }])
    setIsLoading(true)

    try {
      const result = await callAIAgent(
        message,
        AGENTS.DISCOVERY_COORDINATOR,
        { assets: uploadedAssetIds }
      )

      if (result.success && result.response.status === 'success') {
        const data = result.response.result

        // Add assistant response
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.user_message || 'Processing your request...',
          timestamp: new Date()
        }])

        // Check if we have aggregated results
        if (data.aggregated_results) {
          setStage('analyzing')

          // Extract document info
          if (data.aggregated_results.document_info) {
            setDocumentInfo(data.aggregated_results.document_info)
          }

          // Extract understanding
          if (data.aggregated_results.paper_analysis) {
            setUnderstanding(data.aggregated_results.paper_analysis)
          }

          // Extract summary and key points
          if (data.aggregated_results.summary) {
            setKeyTakeaways(data.aggregated_results.summary.key_points || [])
          }

          // Extract recommendations
          if (data.aggregated_results.recommendations) {
            setRecommendations(data.aggregated_results.recommendations)
          }

          // Extract quality score
          if (data.aggregated_results.quality_validation) {
            setQualityScore(data.aggregated_results.quality_validation.quality_score)
          }

          setStage('complete')
        }
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: 'I encountered an issue processing your request. Please try again.',
          timestamp: new Date()
        }])
      }

      setIsLoading(false)
    } catch (error) {
      console.error('Error:', error)
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'An error occurred. Please try again.',
        timestamp: new Date()
      }])
      setIsLoading(false)
    }
  }

  const exportSummary = () => {
    if (!documentInfo) return

    let content = `# ${documentInfo.title}\n\n`
    if (documentInfo.authors && documentInfo.authors.length > 0) {
      content += `**Authors:** ${documentInfo.authors.join(', ')}\n\n`
    }

    if (understanding?.problem_statement) {
      content += `## Problem Statement\n${understanding.problem_statement}\n\n`
    }

    if (keyTakeaways.length > 0) {
      content += `## Key Takeaways\n${keyTakeaways.map((k, i) => `${i + 1}. ${k.point}`).join('\n')}\n\n`
    }

    if (recommendations.length > 0) {
      content += `## Related Papers\n${recommendations.map(r => `- ${r.title} (${r.year})`).join('\n')}\n`
    }

    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${documentInfo.title.replace(/[^a-z0-9]/gi, '_')}_summary.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-gray-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <FileText className="w-8 h-8 text-indigo-600" />
                <Sparkles className="w-4 h-4 text-amber-500 absolute -top-1 -right-1" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent">
                  ResearchLens
                </h1>
                <p className="text-xs text-gray-500">AI-Powered Research Analysis</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {stage !== 'idle' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetAnalysis}
                  className="border-indigo-200 hover:bg-indigo-50"
                >
                  New Analysis
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden"
              >
                {sidebarOpen ? 'Hide' : 'Show'} Menu
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1800px] mx-auto px-6 py-8">
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className={`${sidebarOpen ? 'block' : 'hidden'} lg:block w-64 flex-shrink-0`}>
            <Card className="shadow-lg border-indigo-100">
              <CardHeader className="bg-gradient-to-br from-indigo-50 to-white">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  Research Interests
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">
                    Machine Learning
                  </span>
                  <span className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                    NLP
                  </span>
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                    Transformers
                  </span>
                </div>
                <div className="border-t pt-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    Recent Analyses
                  </h3>
                  <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg text-center">
                    No previous analyses
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex gap-6">
            {/* Left Panel - Upload & Conversation */}
            <div className={`${stage === 'idle' ? 'w-full max-w-2xl mx-auto' : 'w-[42%]'} transition-all duration-500`}>
              <div className="space-y-6">
                {/* Upload Zone */}
                {stage === 'idle' && (
                  <Card className="shadow-xl border-indigo-100 overflow-hidden">
                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-6 text-white">
                      <h2 className="text-xl font-bold mb-2">Upload Research Paper</h2>
                      <p className="text-indigo-100 text-sm">
                        Get AI-powered insights, summaries, and related paper recommendations
                      </p>
                    </div>
                    <CardContent className="space-y-5 pt-6">
                      {/* PDF Upload */}
                      <div
                        className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 ${
                          dragActive
                            ? 'border-indigo-500 bg-indigo-50 scale-[1.02]'
                            : pdfFile
                            ? 'border-green-400 bg-green-50'
                            : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
                        }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                      >
                        <Upload className={`w-14 h-14 mx-auto mb-4 ${pdfFile ? 'text-green-500' : 'text-gray-400'}`} />
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          {pdfFile ? (
                            <span className="text-green-600 flex items-center justify-center gap-2">
                              <CheckCircle2 className="w-4 h-4" />
                              {pdfFile.name}
                            </span>
                          ) : (
                            'Drag and drop your PDF here'
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mb-4">
                          {pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB` : 'Maximum file size: 50MB'}
                        </p>
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={handleFileChange}
                          className="hidden"
                          id="pdf-upload"
                        />
                        <label htmlFor="pdf-upload">
                          <Button
                            variant={pdfFile ? "outline" : "default"}
                            size="sm"
                            asChild
                            className={pdfFile ? '' : 'bg-indigo-600 hover:bg-indigo-700'}
                          >
                            <span>{pdfFile ? 'Change File' : 'Browse Files'}</span>
                          </Button>
                        </label>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-gray-200" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-white px-3 text-gray-500 font-medium">Or enter details</span>
                        </div>
                      </div>

                      {/* DOI Input */}
                      <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2">
                          DOI
                        </label>
                        <Input
                          placeholder="10.xxxx/xxxxx"
                          value={doiInput}
                          onChange={(e) => setDoiInput(e.target.value)}
                          className="border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>

                      {/* arXiv Input */}
                      <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2">
                          arXiv URL
                        </label>
                        <Input
                          placeholder="https://arxiv.org/abs/xxxx.xxxxx"
                          value={arxivInput}
                          onChange={(e) => setArxivInput(e.target.value)}
                          className="border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>

                      <Button
                        className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg hover:shadow-xl transition-all duration-300 h-12 text-base font-semibold"
                        onClick={analyzeDocument}
                        disabled={(!pdfFile && !doiInput && !arxivInput) || isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            {stage === 'uploading' ? 'Uploading...' : 'Starting Analysis...'}
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5 mr-2" />
                            Analyze Paper
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Conversation Panel */}
                {stage !== 'idle' && (
                  <Card className="shadow-xl border-indigo-100 flex flex-col h-[calc(100vh-12rem)]">
                    <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-600" />
                        Conversation
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {chatMessages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
                          >
                            <div
                              className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
                                msg.role === 'user'
                                  ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-md'
                                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                              }`}
                            >
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                              {msg.timestamp && (
                                <p className={`text-xs mt-2 ${msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                                  {msg.timestamp.toLocaleTimeString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                        {isLoading && (
                          <div className="flex justify-start animate-in slide-in-from-bottom-2">
                            <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-bl-md shadow-sm">
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                <span className="text-sm text-gray-600">Thinking...</span>
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Input */}
                      <div className="border-t bg-gray-50 p-4">
                        <div className="flex gap-2 mb-3">
                          <Textarea
                            ref={textareaRef}
                            placeholder="Describe what you'd like to focus on..."
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                sendMessage()
                              }
                            }}
                            disabled={isLoading}
                            className="resize-none border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 min-h-[80px]"
                          />
                          <Button
                            onClick={sendMessage}
                            disabled={isLoading || !userInput.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700 h-auto px-6"
                          >
                            Send
                          </Button>
                        </div>
                        {/* Quick Prompts */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="text-xs px-3 py-1.5 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-full text-gray-700 transition-all"
                            onClick={() => setUserInput('Focus on methodology and key techniques')}
                            disabled={isLoading}
                          >
                            Methodology & Techniques
                          </button>
                          <button
                            className="text-xs px-3 py-1.5 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-full text-gray-700 transition-all"
                            onClick={() => setUserInput('Emphasize practical applications and real-world use cases')}
                            disabled={isLoading}
                          >
                            Practical Applications
                          </button>
                          <button
                            className="text-xs px-3 py-1.5 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-full text-gray-700 transition-all"
                            onClick={() => setUserInput('Highlight limitations and future research directions')}
                            disabled={isLoading}
                          >
                            Limitations & Future Work
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Right Panel - Results */}
            {stage !== 'idle' && (
              <div className="w-[58%] space-y-6 animate-in slide-in-from-right duration-500">
                {/* Analysis Status */}
                {stage === 'analyzing' && (
                  <Card className="shadow-lg border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                        <div>
                          <p className="font-semibold text-indigo-900">Analyzing your paper...</p>
                          <p className="text-sm text-indigo-600">This may take a moment</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Document Info */}
                {documentInfo && (
                  <Card className="shadow-xl border-indigo-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
                      <h2 className="text-xl font-bold mb-3">{documentInfo.title}</h2>
                      {documentInfo.authors && documentInfo.authors.length > 0 && (
                        <div className="flex items-center gap-2 text-indigo-100 text-sm">
                          <Users className="w-4 h-4" />
                          <p>
                            {documentInfo.authors.slice(0, 3).join(', ')}
                            {documentInfo.authors.length > 3 && ` +${documentInfo.authors.length - 3} more`}
                          </p>
                        </div>
                      )}
                      {documentInfo.year && (
                        <p className="text-indigo-200 text-sm mt-1">{documentInfo.year}</p>
                      )}
                    </div>
                    {documentInfo.abstract && (
                      <CardContent className="pt-6">
                        <p className="text-sm text-gray-700 leading-relaxed">{documentInfo.abstract}</p>
                      </CardContent>
                    )}
                  </Card>
                )}

                {/* Analysis Summary */}
                {understanding && (
                  <Card className="shadow-xl border-indigo-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-indigo-600" />
                          Analysis Summary
                        </CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={exportSummary}
                          className="border-indigo-200 hover:bg-indigo-50"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-6">
                      {/* Problem Statement */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                        <button
                          className="w-full px-5 py-4 flex items-center justify-between text-left bg-gradient-to-r from-white to-gray-50 hover:from-gray-50 hover:to-gray-100 transition-colors"
                          onClick={() => toggleSection('problem')}
                        >
                          <span className="font-semibold text-gray-800">Problem Statement</span>
                          {expandedSections.has('problem') ? (
                            <ChevronUp className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          )}
                        </button>
                        {expandedSections.has('problem') && (
                          <div className="px-5 pb-4 text-sm text-gray-700 leading-relaxed bg-white">
                            {understanding.problem_statement}
                          </div>
                        )}
                      </div>

                      {/* Methodology */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                        <button
                          className="w-full px-5 py-4 flex items-center justify-between text-left bg-gradient-to-r from-white to-gray-50 hover:from-gray-50 hover:to-gray-100 transition-colors"
                          onClick={() => toggleSection('methodology')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">Methodology</span>
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full font-medium">
                              {understanding.methodology.section_citation}
                            </span>
                          </div>
                          {expandedSections.has('methodology') ? (
                            <ChevronUp className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          )}
                        </button>
                        {expandedSections.has('methodology') && (
                          <div className="px-5 pb-4 bg-white space-y-3">
                            <p className="text-sm text-gray-700 leading-relaxed">
                              {understanding.methodology.approach}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {understanding.methodology.techniques.map((tech, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 bg-indigo-100 text-indigo-700 text-xs rounded-lg font-medium"
                                >
                                  {tech}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Results */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                        <button
                          className="w-full px-5 py-4 flex items-center justify-between text-left bg-gradient-to-r from-white to-gray-50 hover:from-gray-50 hover:to-gray-100 transition-colors"
                          onClick={() => toggleSection('results')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">Key Results</span>
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full font-medium">
                              {understanding.results.section_citation}
                            </span>
                          </div>
                          {expandedSections.has('results') ? (
                            <ChevronUp className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          )}
                        </button>
                        {expandedSections.has('results') && (
                          <div className="px-5 pb-4 bg-white">
                            <ul className="space-y-2">
                              {understanding.results.key_findings.map((finding, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                  <span className="text-sm text-gray-700 leading-relaxed">{finding}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Limitations */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                        <button
                          className="w-full px-5 py-4 flex items-center justify-between text-left bg-gradient-to-r from-white to-gray-50 hover:from-gray-50 hover:to-gray-100 transition-colors"
                          onClick={() => toggleSection('limitations')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">Limitations</span>
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full font-medium">
                              {understanding.limitations.section_citation}
                            </span>
                          </div>
                          {expandedSections.has('limitations') ? (
                            <ChevronUp className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          )}
                        </button>
                        {expandedSections.has('limitations') && (
                          <div className="px-5 pb-4 bg-white">
                            <ul className="space-y-2">
                              {understanding.limitations.identified_limitations.map((limit, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                  <span className="text-sm text-gray-700 leading-relaxed">{limit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Key Takeaways */}
                {keyTakeaways.length > 0 && (
                  <Card className="shadow-xl border-indigo-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-600" />
                        Key Takeaways
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <ul className="space-y-4">
                        {keyTakeaways.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-sm font-bold shadow-md">
                              {idx + 1}
                            </div>
                            <div className="flex-1 pt-1">
                              <p className="text-sm text-gray-800 leading-relaxed font-medium">
                                {point.point}
                              </p>
                              <span className="text-xs text-indigo-600 mt-1 inline-block">
                                {point.section_reference}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                {recommendations.length > 0 && (
                  <Card className="shadow-xl border-indigo-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-600" />
                        Related Papers ({recommendations.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                      {recommendations.map((rec) => (
                        <div
                          key={rec.rank}
                          className="group border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-indigo-300 transition-all duration-300 bg-white"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-start gap-3 mb-2">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                                  {rec.rank}
                                </div>
                                <h3 className="font-semibold text-gray-900 leading-snug group-hover:text-indigo-700 transition-colors">
                                  {rec.title}
                                </h3>
                              </div>
                              <p className="text-xs text-gray-600 ml-9">
                                {rec.authors && rec.authors.length > 0 && (
                                  <>
                                    {rec.authors.slice(0, 3).join(', ')}
                                    {rec.authors.length > 3 && ` +${rec.authors.length - 3} more`}
                                    {' · '}
                                  </>
                                )}
                                {rec.year}
                              </p>
                            </div>
                            <div className="ml-3 flex-shrink-0">
                              <div className="px-3 py-1.5 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 text-xs font-bold rounded-lg shadow-sm">
                                {Math.round(rec.relevance_score * 100)}%
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-gray-700 mb-3 ml-9 leading-relaxed">
                            {rec.relevance_explanation}
                          </p>
                          <p className="text-xs text-gray-600 italic mb-4 ml-9 leading-relaxed border-l-2 border-indigo-200 pl-3">
                            {rec.abstract_snippet}
                          </p>
                          <div className="flex items-center gap-4 ml-9">
                            <a
                              href={
                                rec.doi_or_arxiv_id.startsWith('arXiv')
                                  ? `https://arxiv.org/abs/${rec.doi_or_arxiv_id.split(':')[1]}`
                                  : `https://doi.org/${rec.doi_or_arxiv_id.replace('doi:', '')}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 hover:gap-2 transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              View Paper
                            </a>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs text-gray-500 font-medium">{rec.source}</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Quality Score */}
                {qualityScore !== null && (
                  <Card className="shadow-xl border-green-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        Quality Assessment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Overall Quality Score</span>
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-32 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-1000"
                              style={{ width: `${qualityScore * 100}%` }}
                            />
                          </div>
                          <span className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                            {Math.round(qualityScore * 100)}%
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
