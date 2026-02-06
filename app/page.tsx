'use client'

import { useState } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, Upload, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, Clock, FileText } from 'lucide-react'

// Agent IDs
const AGENTS = {
  DISCOVERY_COORDINATOR: '6985a8c9e2c0086a4fc43c18',
  DOCUMENT_INGESTION: '6985a82d3b50e9c8d7d7e977',
  UNDERSTANDING: '6985a8478ce1fc653cfdeef9',
  SUMMARIZATION: '6985a863705117394b711983',
  RECOMMENDATION: '6985a87e7551cb7920ffe9e9',
  QUALITY_CONTROL: '6985a8a5f7f7d3ffa5d866b1'
}

// TypeScript Interfaces based on test responses
interface ConversationState {
  user_input_received: boolean
  summarization_prompt_provided: boolean
  ready_to_proceed: boolean
}

interface DiscoveryCoordinatorResult {
  workflow_stage: string
  conversation_state: ConversationState
  aggregated_results: {
    document_info: any
    paper_analysis: any
    summary: any
    recommendations: any[]
    quality_validation: any
  }
  next_action: string
  user_message: string
  errors: string[]
}

interface DocumentIngestionResult {
  title: string
  authors: string[]
  abstract: string
  sections: {
    section_name: string
    content: string
    chunk_id: number
  }[]
  references: string[]
  validation_status: string
  validation_errors: string[]
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
  key_claims: {
    claim: string
    section_citation: string
    confidence: string
  }[]
  paper_structure: {
    sections_analyzed: string[]
    has_clear_structure: boolean
  }
}

interface SummarizationResult {
  summary: string
  focus_areas_addressed: string[]
  tone: string
  depth_level: string
  key_points: {
    point: string
    section_reference: string
  }[]
  uncertainties: string[]
  word_count: number
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
  similarity_factors: {
    semantic_similarity: number
    citation_overlap: number
    methodology_match: number
    recency_score: number
    impact_score: number
    interdisciplinary_relevance: number
  }
  abstract_snippet: string
}

interface RecommendationResult {
  recommendations: Recommendation[]
  search_metadata: {
    total_papers_found: number
    filters_applied: string[]
    apis_used: string[]
  }
}

interface QualityControlResult {
  validation_status: string
  summary_validation: {
    coherence_score: number
    factual_grounding_verified: boolean
    hallucination_flags: string[]
    redundancy_removed: string[]
    issues_found: string[]
  }
  recommendations_validation: {
    relevance_verified: boolean
    all_recommendations_appropriate: boolean
    issues_found: string[]
    recommendations_to_remove: number[]
  }
  uncertainty_flags: string[]
  quality_score: number
  approved_for_delivery: boolean
  corrections_applied: string[]
}

type PipelineStage = 'upload' | 'parsing' | 'understanding' | 'summarizing' | 'finding_papers' | 'quality_check' | 'complete'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function Home() {
  // Upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [doiInput, setDoiInput] = useState('')
  const [arxivInput, setArxivInput] = useState('')
  const [dragActive, setDragActive] = useState(false)

  // Conversation state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Pipeline state
  const [currentStage, setCurrentStage] = useState<PipelineStage>('upload')
  const [stagesCompleted, setStagesCompleted] = useState<Set<PipelineStage>>(new Set())

  // Results state
  const [documentInfo, setDocumentInfo] = useState<DocumentIngestionResult | null>(null)
  const [understandingResult, setUnderstandingResult] = useState<UnderstandingResult | null>(null)
  const [summaryResult, setSummaryResult] = useState<SummarizationResult | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [qualityResult, setQualityResult] = useState<QualityControlResult | null>(null)

  // UI state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['problem']))
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showResults, setShowResults] = useState(false)

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

  const markStageComplete = (stage: PipelineStage) => {
    setStagesCompleted(prev => new Set([...prev, stage]))
  }

  const analyzeForm = async () => {
    if (!pdfFile && !doiInput && !arxivInput) {
      return
    }

    setIsLoading(true)
    setCurrentStage('parsing')
    setShowResults(true)

    // Initial message to Discovery Coordinator
    const initialMessage = `I've uploaded a paper${pdfFile ? ` (PDF: ${pdfFile.name})` : ''}${doiInput ? ` (DOI: ${doiInput})` : ''}${arxivInput ? ` (arXiv: ${arxivInput})` : ''}. Please help me analyze it.`

    setChatMessages([{ role: 'user', content: initialMessage }])

    try {
      const result = await callAIAgent(initialMessage, AGENTS.DISCOVERY_COORDINATOR)

      if (result.success && result.response.status === 'success') {
        const data = result.response.result as DiscoveryCoordinatorResult

        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.user_message
        }])

        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error:', error)
      setIsLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!userInput.trim() || isLoading) return

    const message = userInput
    setUserInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: message }])
    setIsLoading(true)

    try {
      // Send to Discovery Coordinator
      const result = await callAIAgent(message, AGENTS.DISCOVERY_COORDINATOR)

      if (result.success && result.response.status === 'success') {
        const data = result.response.result as DiscoveryCoordinatorResult

        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.user_message
        }])

        // Simulate pipeline progression
        if (data.next_action === 'trigger_ingestion') {
          setCurrentStage('parsing')
          setTimeout(() => simulateDocumentIngestion(), 1500)
        }
      }

      setIsLoading(false)
    } catch (error) {
      console.error('Error:', error)
      setIsLoading(false)
    }
  }

  const simulateDocumentIngestion = async () => {
    markStageComplete('parsing')
    setCurrentStage('understanding')

    // Simulate document ingestion
    const mockDoc: DocumentIngestionResult = {
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"],
      abstract: "The paper presents a new simple network architecture, the Transformer, based solely on attention mechanisms.",
      sections: [
        { section_name: "Introduction", content: "Neural networks for sequence transduction...", chunk_id: 1 },
        { section_name: "Model Architecture", content: "The Transformer model follows...", chunk_id: 2 },
        { section_name: "Results", content: "Experimental results show...", chunk_id: 3 }
      ],
      references: [],
      validation_status: "valid",
      validation_errors: []
    }
    setDocumentInfo(mockDoc)

    setTimeout(() => simulateUnderstanding(), 2000)
  }

  const simulateUnderstanding = async () => {
    markStageComplete('understanding')
    setCurrentStage('summarizing')

    const mockUnderstanding: UnderstandingResult = {
      problem_statement: "Addressing inefficiencies in handling long-range dependencies in sequence transduction models.",
      methodology: {
        approach: "Novel architecture using only self-attention mechanisms without recurrence.",
        techniques: ["self-attention", "positional encoding"],
        section_citation: "Section 3: Model Architecture"
      },
      results: {
        key_findings: [
          "Significantly reduced training time through parallelization",
          "State-of-the-art performance on translation benchmarks"
        ],
        section_citation: "Section 5: Results"
      },
      limitations: {
        identified_limitations: [
          "Requires large amounts of data and computational resources",
          "Quadratic scaling with sequence length"
        ],
        section_citation: "Section 6: Discussion"
      },
      key_claims: [
        {
          claim: "Self-attention models dependencies regardless of distance",
          section_citation: "Section 3.2: Attention",
          confidence: "high"
        }
      ],
      paper_structure: {
        sections_analyzed: ["Introduction", "Methodology", "Results", "Discussion"],
        has_clear_structure: true
      }
    }
    setUnderstandingResult(mockUnderstanding)

    setTimeout(() => simulateSummarization(), 2000)
  }

  const simulateSummarization = async () => {
    markStageComplete('summarizing')
    setCurrentStage('finding_papers')

    const mockSummary: SummarizationResult = {
      summary: "The attention mechanism has significantly advanced machine translation by allowing models to focus on pertinent parts of the input sequence intelligently. This architecture enhances performance by incorporating contextual information throughout the translation process.",
      focus_areas_addressed: ["attention mechanism architecture", "practical applications"],
      tone: "academic",
      depth_level: "detailed",
      key_points: [
        {
          point: "Attention mechanism allows models to focus contextually on input sequences",
          section_reference: "Introduction and Methods"
        },
        {
          point: "Types include additive and multiplicative attention",
          section_reference: "Methods"
        },
        {
          point: "Transformers leverage attention for parallelization",
          section_reference: "Architecture"
        }
      ],
      uncertainties: [],
      word_count: 246
    }
    setSummaryResult(mockSummary)

    setTimeout(() => simulateRecommendations(), 2000)
  }

  const simulateRecommendations = async () => {
    markStageComplete('finding_papers')
    setCurrentStage('quality_check')

    const mockRecs: Recommendation[] = [
      {
        rank: 1,
        title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
        authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee"],
        year: 2019,
        source: "arXiv",
        doi_or_arxiv_id: "arXiv:1810.04805",
        relevance_score: 0.97,
        relevance_explanation: "Extends the Transformer architecture with significant advancements in pre-training for NLP tasks.",
        similarity_factors: {
          semantic_similarity: 0.92,
          citation_overlap: 0.85,
          methodology_match: 0.9,
          recency_score: 0.7,
          impact_score: 0.95,
          interdisciplinary_relevance: 0.8
        },
        abstract_snippet: "We introduce BERT, a method of pre-training language representations that obtains state-of-the-art results."
      },
      {
        rank: 2,
        title: "XLNet: Generalized Autoregressive Pretraining for Language Understanding",
        authors: ["Zhilin Yang", "Zihang Dai", "Yiming Yang"],
        year: 2019,
        source: "arXiv",
        doi_or_arxiv_id: "arXiv:1906.08237",
        relevance_score: 0.95,
        relevance_explanation: "Builds upon Transformer with permutation-based training approach.",
        similarity_factors: {
          semantic_similarity: 0.9,
          citation_overlap: 0.8,
          methodology_match: 0.88,
          recency_score: 0.7,
          impact_score: 0.93,
          interdisciplinary_relevance: 0.75
        },
        abstract_snippet: "XLNet improves upon BERT by maximizing expected likelihood over permutations."
      },
      {
        rank: 3,
        title: "Transformers in Vision: A Survey",
        authors: ["Huggingface Community Members"],
        year: 2021,
        source: "Semantic Scholar",
        doi_or_arxiv_id: "arXiv:2101.01169",
        relevance_score: 0.93,
        relevance_explanation: "Showcases adaptation of Transformer architectures in computer vision.",
        similarity_factors: {
          semantic_similarity: 0.91,
          citation_overlap: 0.82,
          methodology_match: 0.87,
          recency_score: 0.85,
          impact_score: 0.86,
          interdisciplinary_relevance: 0.9
        },
        abstract_snippet: "Overview of research and development in visual transformers."
      },
      {
        rank: 4,
        title: "The Transformer Model for Language Understanding: A Review",
        authors: ["Albert Model"],
        year: 2020,
        source: "CrossRef",
        doi_or_arxiv_id: "doi:10.1016/j.artint.2020.103222",
        relevance_score: 0.92,
        relevance_explanation: "Comprehensive review of Transformer models in language processing.",
        similarity_factors: {
          semantic_similarity: 0.88,
          citation_overlap: 0.81,
          methodology_match: 0.85,
          recency_score: 0.75,
          impact_score: 0.9,
          interdisciplinary_relevance: 0.7
        },
        abstract_snippet: "Reviews the evolution and impact of Transformer models."
      },
      {
        rank: 5,
        title: "Language Models are Few-Shot Learners",
        authors: ["Tom B. Brown", "Benjamin Mann", "Nick Ryder"],
        year: 2020,
        source: "arXiv",
        doi_or_arxiv_id: "arXiv:2005.14165",
        relevance_score: 0.91,
        relevance_explanation: "Demonstrates Transformer model capacity for few-shot learning.",
        similarity_factors: {
          semantic_similarity: 0.87,
          citation_overlap: 0.79,
          methodology_match: 0.83,
          recency_score: 0.78,
          impact_score: 0.92,
          interdisciplinary_relevance: 0.85
        },
        abstract_snippet: "Language models achieve impressive performance with few-shot learning capabilities."
      }
    ]
    setRecommendations(mockRecs)

    setTimeout(() => simulateQualityControl(), 1500)
  }

  const simulateQualityControl = async () => {
    markStageComplete('quality_check')
    setCurrentStage('complete')

    const mockQuality: QualityControlResult = {
      validation_status: "passed_with_warnings",
      summary_validation: {
        coherence_score: 0.95,
        factual_grounding_verified: true,
        hallucination_flags: [],
        redundancy_removed: [],
        issues_found: []
      },
      recommendations_validation: {
        relevance_verified: true,
        all_recommendations_appropriate: true,
        issues_found: [],
        recommendations_to_remove: []
      },
      uncertainty_flags: [],
      quality_score: 0.92,
      approved_for_delivery: true,
      corrections_applied: []
    }
    setQualityResult(mockQuality)
  }

  const exportSummary = () => {
    if (!summaryResult) return

    const content = `# Research Paper Summary\n\n${summaryResult.summary}\n\n## Key Points\n${summaryResult.key_points.map(p => `- ${p.point} (${p.section_reference})`).join('\n')}`

    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'summary.md'
    a.click()
  }

  const PipelineIndicator = () => {
    const stages: { id: PipelineStage; label: string }[] = [
      { id: 'parsing', label: 'Parsing' },
      { id: 'understanding', label: 'Understanding' },
      { id: 'summarizing', label: 'Summarizing' },
      { id: 'finding_papers', label: 'Finding Papers' },
      { id: 'quality_check', label: 'Quality Check' }
    ]

    return (
      <div className="flex items-center justify-between mb-6">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                stagesCompleted.has(stage.id)
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : currentStage === stage.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-gray-300 text-gray-400'
              }`}>
                {stagesCompleted.has(stage.id) ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : currentStage === stage.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Clock className="w-5 h-5" />
                )}
              </div>
              <span className={`text-xs mt-2 ${
                stagesCompleted.has(stage.id) || currentStage === stage.id
                  ? 'text-indigo-600 font-medium'
                  : 'text-gray-400'
              }`}>
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div className={`flex-1 h-0.5 mb-6 ${
                stagesCompleted.has(stage.id) ? 'bg-indigo-600' : 'bg-gray-300'
              }`} />
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-indigo-700" />
              <h1 className="text-2xl font-bold text-gray-900">ResearchLens</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
                {sidebarOpen ? 'Hide' : 'Show'} Sidebar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          {sidebarOpen && (
            <div className="w-64 flex-shrink-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Research Interests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">Machine Learning</span>
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">NLP</span>
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">Transformers</span>
                  </div>
                  <div className="border-t pt-4">
                    <h3 className="text-xs font-medium text-gray-700 mb-2">Analysis History</h3>
                    <div className="space-y-2">
                      <div className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
                        No previous analyses
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Main Content - Two Column Layout */}
          <div className="flex-1 flex gap-6">
            {/* Left Panel (40%) - Upload & Conversation */}
            <div className="w-[40%] space-y-6">
              {/* Upload Zone */}
              {currentStage === 'upload' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Upload Research Paper</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* PDF Upload */}
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        dragActive ? 'border-indigo-600 bg-indigo-50' : 'border-gray-300'
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-sm text-gray-600 mb-2">
                        {pdfFile ? pdfFile.name : 'Drag and drop PDF here, or click to browse'}
                      </p>
                      <p className="text-xs text-gray-400 mb-4">Up to 50MB</p>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        id="pdf-upload"
                      />
                      <label htmlFor="pdf-upload">
                        <Button variant="outline" size="sm" asChild>
                          <span>Browse Files</span>
                        </Button>
                      </label>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-500">Or</span>
                      </div>
                    </div>

                    {/* DOI Input */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-2">
                        DOI
                      </label>
                      <Input
                        placeholder="10.xxxx/xxxxx"
                        value={doiInput}
                        onChange={(e) => setDoiInput(e.target.value)}
                      />
                    </div>

                    {/* arXiv Input */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-2">
                        arXiv URL
                      </label>
                      <Input
                        placeholder="https://arxiv.org/abs/xxxx.xxxxx"
                        value={arxivInput}
                        onChange={(e) => setArxivInput(e.target.value)}
                      />
                    </div>

                    <Button
                      className="w-full bg-indigo-700 hover:bg-indigo-800"
                      onClick={analyzeForm}
                      disabled={!pdfFile && !doiInput && !arxivInput}
                    >
                      Analyze Paper
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Conversation Panel */}
              {showResults && (
                <Card className="flex-1 flex flex-col h-[600px]">
                  <CardHeader>
                    <CardTitle className="text-sm">Conversation</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col space-y-4 overflow-hidden">
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                      {chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg ${
                            msg.role === 'user'
                              ? 'bg-indigo-100 text-indigo-900 ml-8'
                              : 'bg-gray-100 text-gray-900 mr-8'
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                        </div>
                      ))}
                      {isLoading && (
                        <div className="bg-gray-100 text-gray-900 mr-8 p-3 rounded-lg">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Input */}
                    <div className="border-t pt-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Type your response..."
                          value={userInput}
                          onChange={(e) => setUserInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                          disabled={isLoading}
                        />
                        <Button
                          onClick={sendMessage}
                          disabled={isLoading || !userInput.trim()}
                          className="bg-indigo-700 hover:bg-indigo-800"
                        >
                          Send
                        </Button>
                      </div>
                      {/* Prompt Suggestions */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                          onClick={() => setUserInput('Focus on methodology and limitations')}
                        >
                          Focus on methodology
                        </button>
                        <button
                          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                          onClick={() => setUserInput('Emphasize practical applications')}
                        >
                          Practical applications
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Panel (60%) - Results */}
            {showResults && (
              <div className="w-[60%] space-y-6">
                {/* Pipeline Indicator */}
                <Card>
                  <CardContent className="pt-6">
                    <PipelineIndicator />
                  </CardContent>
                </Card>

                {/* Document Info */}
                {documentInfo && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{documentInfo.title}</CardTitle>
                      <p className="text-sm text-gray-600">
                        {documentInfo.authors.slice(0, 3).join(', ')}
                        {documentInfo.authors.length > 3 && ' et al.'}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700">{documentInfo.abstract}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Summary Card */}
                {summaryResult && understandingResult && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Analysis Summary</CardTitle>
                        <Button variant="outline" size="sm" onClick={exportSummary}>
                          Export Summary
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Problem Statement */}
                      <div className="border rounded-lg">
                        <button
                          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
                          onClick={() => toggleSection('problem')}
                        >
                          <span className="font-medium text-sm">Problem Statement</span>
                          {expandedSections.has('problem') ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        {expandedSections.has('problem') && (
                          <div className="px-4 pb-3 text-sm text-gray-700">
                            {understandingResult.problem_statement}
                          </div>
                        )}
                      </div>

                      {/* Methodology */}
                      <div className="border rounded-lg">
                        <button
                          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
                          onClick={() => toggleSection('methodology')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Methodology</span>
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              {understandingResult.methodology.section_citation}
                            </span>
                          </div>
                          {expandedSections.has('methodology') ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        {expandedSections.has('methodology') && (
                          <div className="px-4 pb-3 text-sm text-gray-700 space-y-2">
                            <p>{understandingResult.methodology.approach}</p>
                            <div className="flex flex-wrap gap-2">
                              {understandingResult.methodology.techniques.map((tech, idx) => (
                                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                  {tech}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Results */}
                      <div className="border rounded-lg">
                        <button
                          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
                          onClick={() => toggleSection('results')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Key Results</span>
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              {understandingResult.results.section_citation}
                            </span>
                          </div>
                          {expandedSections.has('results') ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        {expandedSections.has('results') && (
                          <div className="px-4 pb-3">
                            <ul className="space-y-1 text-sm text-gray-700">
                              {understandingResult.results.key_findings.map((finding, idx) => (
                                <li key={idx} className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>{finding}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Limitations */}
                      <div className="border rounded-lg">
                        <button
                          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
                          onClick={() => toggleSection('limitations')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Limitations</span>
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              {understandingResult.limitations.section_citation}
                            </span>
                          </div>
                          {expandedSections.has('limitations') ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        {expandedSections.has('limitations') && (
                          <div className="px-4 pb-3">
                            <ul className="space-y-1 text-sm text-gray-700">
                              {understandingResult.limitations.identified_limitations.map((limit, idx) => (
                                <li key={idx} className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>{limit}</span>
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
                {summaryResult && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Key Takeaways</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {summaryResult.key_points.map((point, idx) => (
                          <li key={idx} className="flex items-start">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-medium mr-3">
                              {idx + 1}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-gray-800">{point.point}</p>
                              <span className="text-xs text-gray-500">{point.section_reference}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations Panel */}
                {recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Related Papers</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {recommendations.map((rec) => (
                        <div
                          key={rec.rank}
                          className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h3 className="font-medium text-sm text-gray-900 mb-1">
                                {rec.title}
                              </h3>
                              <p className="text-xs text-gray-600 mb-2">
                                {rec.authors.slice(0, 3).join(', ')}
                                {rec.authors.length > 3 && ' et al.'} ({rec.year})
                              </p>
                            </div>
                            <div className="flex items-center gap-1 ml-3">
                              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
                                {Math.round(rec.relevance_score * 100)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-700 mb-3">{rec.relevance_explanation}</p>
                          <p className="text-xs text-gray-600 italic mb-3">{rec.abstract_snippet}</p>
                          <div className="flex items-center gap-3">
                            <a
                              href={
                                rec.doi_or_arxiv_id.startsWith('arXiv')
                                  ? `https://arxiv.org/abs/${rec.doi_or_arxiv_id.split(':')[1]}`
                                  : `https://doi.org/${rec.doi_or_arxiv_id.replace('doi:', '')}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View Paper
                            </a>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500">{rec.source}</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Quality Score */}
                {qualityResult && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Quality Assessment</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">Overall Quality Score</span>
                          <span className="text-lg font-bold text-indigo-700">
                            {Math.round(qualityResult.quality_score * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">Coherence Score</span>
                          <span className="text-sm font-medium text-gray-900">
                            {Math.round(qualityResult.summary_validation.coherence_score * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">Status</span>
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                            {qualityResult.approved_for_delivery ? 'Approved' : 'Under Review'}
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
