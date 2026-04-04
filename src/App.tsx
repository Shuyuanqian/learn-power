/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  Lightbulb, 
  BookOpen, 
  RefreshCcw, 
  Home, 
  ChevronRight,
  MessageSquare,
  Sparkles,
  Loader2,
  AlertCircle,
  HelpCircle,
  Trophy,
  Award
} from 'lucide-react';
import confetti from 'canvas-confetti';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import { mockQuestions } from './data/questions';
import { mockPassages } from './data/passages';
import { evaluateExplanation, evaluateExplanationStream } from './services/geminiService';
import { Question, QuizStep, Chapter, ViewMode, Passage } from './types';
import { PassageView } from './components/PassageView';

// --- Constants ---

const EVALUATION_MESSAGES = [
  "正在链接赛博导师...",
  "正在解析你的逻辑迷雾...",
  "正在为你点亮语法之光...",
  "正在编织治愈系反馈...",
  "即将为你揭晓答案..."
];

// --- Components ---

const Field = ({ content, fieldName }: { content: string; fieldName: string }) => (
  <span data-field={fieldName}>{content}</span>
);

export default function App() {
  // --- State ---
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [currentPassageId, setCurrentPassageId] = useState<string | null>(null);
  const [step, setStep] = useState<QuizStep>('question');
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [userExplanation, setUserExplanation] = useState('');
  const [aiFeedback, setAiFeedback] = useState<{ status: string; comment: string; reasoning?: string } | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hintLevel, setHintLevel] = useState(0); // 0: none, 1: concept, 2: clue, 3: template
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [evalMessageIndex, setEvalMessageIndex] = useState(0);
  const [showMedal, setShowMedal] = useState(false);
  const lastClickTime = useRef(0);
  const DEBOUNCE_DELAY = 300;
  
  // Ref for auto-scrolling feedback
  const feedbackScrollRef = useRef<HTMLDivElement>(null);

  const isDebounced = () => {
    const now = Date.now();
    if (now - lastClickTime.current < DEBOUNCE_DELAY) return true;
    lastClickTime.current = now;
    return false;
  };

  const [completedQuestions, setCompletedQuestions] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('grammarflow_progress');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load progress', e);
      }
    }
    return new Set();
  });

  const [failedQuestionIds, setFailedQuestionIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('grammarflow_failed');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load errors', e);
      }
    }
    return new Set();
  });

  // --- Auto-scroll Effect ---
  useEffect(() => {
    if (feedbackScrollRef.current) {
      feedbackScrollRef.current.scrollTop = feedbackScrollRef.current.scrollHeight;
    }
  }, [aiFeedback]);

  // --- Persistence ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isEvaluating) {
      setEvalMessageIndex(0);
      interval = setInterval(() => {
        setEvalMessageIndex(prev => (prev + 1) % EVALUATION_MESSAGES.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isEvaluating]);

  useEffect(() => {
    localStorage.setItem('grammarflow_progress', JSON.stringify(Array.from(completedQuestions)));
  }, [completedQuestions]);

  useEffect(() => {
    localStorage.setItem('grammarflow_failed', JSON.stringify(Array.from(failedQuestionIds)));
  }, [failedQuestionIds]);

  // --- Derived Data ---
  const chapters = useMemo(() => {
    const map = new Map<string, Chapter & { completedCount: number }>();
    mockQuestions.forEach(q => {
      if (!map.has(q.chapterId)) {
        map.set(q.chapterId, {
          id: q.chapterId,
          name: q.chapterName,
          questionIds: [],
          completedCount: 0
        });
      }
      const chapter = map.get(q.chapterId)!;
      chapter.questionIds.push(q.id);
      if (completedQuestions.has(q.id)) {
        chapter.completedCount++;
      }
    });
    return Array.from(map.values());
  }, [completedQuestions, failedQuestionIds]);

  const filteredQuestions = useMemo(() => {
    if (!currentChapterId) return [];
    return mockQuestions.filter(q => q.chapterId === currentChapterId);
  }, [currentChapterId]);

  const currentQuestion = filteredQuestions[currentIndex] || mockQuestions[0];

  const currentPassage = useMemo(() => {
    return mockPassages.find(p => p.id === currentPassageId) || mockPassages[0];
  }, [currentPassageId]);

  const passageQuestions = useMemo(() => {
    if (!currentPassage) return [];
    return currentPassage.questionIds.map(id => mockQuestions.find(q => q.id === id)).filter(Boolean) as Question[];
  }, [currentPassage]);

  const currentChapter = chapters.find(c => c.id === currentChapterId);
  const remainingRedDots = currentChapter?.questionIds.filter(id => failedQuestionIds.has(id)).length || 0;

  // Confetti effect when mastering a chapter
  useEffect(() => {
    if (step === 'wrapUp' && currentChapterId) {
      const currentChapter = chapters.find(c => c.id === currentChapterId);
      const isMastered = currentChapter && currentChapter.completedCount >= currentChapter.questionIds.length && currentChapter.questionIds.length > 0;
      
      if (isMastered) {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
      }
    }
  }, [step, currentChapterId, chapters]);

  // --- Handlers ---
  const handleStartChapter = (id: string, isReview: boolean = false, startIndex: number = 0) => {
    if (isDebounced()) return;
    setCurrentChapterId(id);
    setCurrentIndex(startIndex);
    setStep('question');
    resetQuestionState();
    setIsReviewMode(isReview);
    setViewMode('quiz');
  };

  const handleStartPassage = (id: string) => {
    if (isDebounced()) return;
    setCurrentPassageId(id);
    setViewMode('passage');
  };

  const resetQuestionState = () => {
    setUserAnswer(null);
    setUserExplanation('');
    setAiFeedback(null);
    setShowReasoning(false);
    setHintLevel(0);
    setConsecutiveFailures(0);
  };

  const handleAnswer = (option: string) => {
    setUserAnswer(option);
    setStep('feedback');
    
    // Error Reinforcement: Add to failed list if wrong
    if (option !== currentQuestion.correctAnswer) {
      setFailedQuestionIds(prev => {
        const next = new Set(prev);
        next.add(currentQuestion.id);
        return next;
      });
      // Scaffolding: Increment hint level on failure
      setConsecutiveFailures(prev => {
        const next = prev + 1;
        if (next >= 1) setHintLevel(h => Math.min(h + 1, 3));
        return next;
      });
    } else {
      setConsecutiveFailures(0);
    }
  };

  const handleExplain = async () => {
    if (!userExplanation.trim() || isEvaluating) return;
    if (isDebounced()) return;
    
    setIsEvaluating(true);
    setAiFeedback(null);
    
    try {
      const stream = evaluateExplanationStream(
        userExplanation,
        currentQuestion,
        currentQuestion.passKeywords
      );

      let lastResult = null;
      for await (const result of stream) {
        setAiFeedback(result);
        lastResult = result;
      }

      if (lastResult && lastResult.status === 'pass') {
        setConsecutiveFailures(0);
        
        // Trigger Medal if Zhongkao and reasoning wasn't shown
        if (currentQuestion.isZhongkao && !showReasoning) {
          setShowMedal(true);
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#3b82f6', '#8b5cf6', '#ec4899']
          });
        }

        setCompletedQuestions(prev => {
          const next = new Set(prev);
          next.add(currentQuestion.id);
          return next;
        });

        // Remove from failed list if passed
        setFailedQuestionIds(prev => {
          const next = new Set(prev);
          next.delete(currentQuestion.id);
          return next;
        });
        
        // Auto-navigate to next question after a short delay
        setTimeout(() => {
          handleNextQuestion();
        }, 3000);
      } else if (lastResult && (lastResult.status === 'fail' || lastResult.status === 'partial')) {
        // Add to failed list if explanation is weak or wrong
        setFailedQuestionIds(prev => {
          const next = new Set(prev);
          next.add(currentQuestion.id);
          return next;
        });
        // Scaffolding: Increment hint level on failure
        setConsecutiveFailures(prev => {
          const next = prev + 1;
          if (next >= 1) setHintLevel(h => Math.min(h + 1, 3));
          return next;
        });
      }
    } catch (error) {
      console.error(error);
      setAiFeedback({ status: 'fail', comment: '评价过程出现了一点小问题，请重试。' });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNextQuestion = () => {
    if (isReviewMode) {
      const currentChapter = chapters.find(c => c.id === currentChapterId);
      const remainingFailedIds = currentChapter?.questionIds.filter(id => failedQuestionIds.has(id)) || [];
      
      if (remainingFailedIds.length > 0) {
        // Go to the next failed question
        const nextFailedIdx = filteredQuestions.findIndex(q => q.id === remainingFailedIds[0]);
        setCurrentIndex(nextFailedIdx);
        setStep('question');
        resetQuestionState();
      } else {
        // No more failed questions in this chapter
        setStep('wrapUp');
      }
    } else {
      if (currentIndex < filteredQuestions.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setStep('question');
        resetQuestionState();
      } else {
        setStep('wrapUp');
      }
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setStep('question');
    resetQuestionState();
    setIsReviewMode(false);
  };

  const handleBackToHome = () => {
    setCurrentChapterId(null);
    setIsReviewMode(false);
  };

  const handleNextChapter = () => {
    const currentIdx = chapters.findIndex(c => c.id === currentChapterId);
    setIsReviewMode(false);
    if (currentIdx < chapters.length - 1) {
      handleStartChapter(chapters[currentIdx + 1].id);
    } else {
      handleBackToHome();
    }
  };

  // --- Render Helpers ---

  if (viewMode === 'passage' && currentPassage) {
    return (
      <PassageView 
        passage={currentPassage}
        questions={passageQuestions}
        onComplete={(results) => {
          console.log('Passage complete', results);
          setViewMode('map');
        }}
        onBack={() => setViewMode('map')}
        evaluateExplanationStream={(explanation, question) => evaluateExplanationStream(explanation, question, question.passKeywords)}
      />
    );
  }

  if (!currentChapterId || viewMode === 'map') {
    return (
      <div className="min-h-[100dvh] bg-[#050505] text-white p-6 md:p-12 overflow-x-hidden">
        <div className="max-w-6xl mx-auto">
          <header className="mb-16 flex justify-between items-end">
            <div>
              <h1 className="text-6xl font-black tracking-tighter italic mb-2">GRAMMAR<span className="text-blue-500">FLOW</span></h1>
              <p className="text-white/40 font-medium tracking-[0.3em] uppercase text-xs">SZ Zhongkao Soul · 赛博治愈系</p>
            </div>
            <div className="hidden md:block text-right">
              <div className="text-4xl font-mono font-bold text-blue-500/50">{completedQuestions.size}</div>
              <div className="text-[10px] text-white/20 tracking-widest uppercase">Mastered Nodes</div>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-12">
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-1 h-8 bg-blue-500" />
                  <h2 className="text-2xl font-bold tracking-tight">星系图谱 · Chapter Map</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {chapters.map((chapter, idx) => {
                    const isCompleted = chapter.questionIds.every(id => completedQuestions.has(id));
                    const progress = chapter.questionIds.filter(id => completedQuestions.has(id)).length;
                    
                    return (
                      <button
                        key={chapter.id}
                        onClick={() => handleStartChapter(chapter.id)}
                        className="group relative p-8 rounded-[40px] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/50 transition-all text-left overflow-hidden active:scale-[0.98]"
                      >
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-6">
                            <span className="text-[10px] font-bold tracking-[0.3em] text-white/20 uppercase">Node {chapter.id}</span>
                            {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                          </div>
                          <h3 className="text-2xl font-bold mb-2 group-hover:text-blue-400 transition-colors">{chapter.name}</h3>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 transition-all duration-1000" 
                                style={{ width: `${(progress / chapter.questionIds.length) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-white/20">{progress}/{chapter.questionIds.length}</span>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[60px] group-hover:bg-blue-500/10 transition-all" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-1 h-8 bg-purple-500" />
                  <h2 className="text-2xl font-bold tracking-tight">星系实战 · Passage Mode</h2>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {mockPassages.map((passage) => (
                    <button
                      key={passage.id}
                      onClick={() => handleStartPassage(passage.id)}
                      className="group relative p-8 rounded-[40px] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-purple-500/50 transition-all text-left overflow-hidden active:scale-[0.98]"
                    >
                      <div className="relative z-10 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] font-bold tracking-[0.3em] text-white/20 uppercase mb-2">Passage Challenge</div>
                          <h3 className="text-2xl font-bold group-hover:text-purple-400 transition-colors">{passage.title}</h3>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-purple-500 transition-colors">
                          <ChevronRight className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[60px] group-hover:bg-purple-500/10 transition-all" />
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-8">
              <div className="p-8 rounded-[40px] bg-blue-600/10 border border-blue-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <Trophy className="w-6 h-6 text-blue-500" />
                  <h3 className="font-bold tracking-tight">成就系统 · Medals</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/10">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                      <Award className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">识破者 · Trap Cracker</div>
                      <div className="text-[10px] text-white/40">识破 10 个中考陷阱</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/10">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-purple-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">掌控者 · Text Master</div>
                      <div className="text-[10px] text-white/40">完成 1 篇语篇实战</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] p-4 sm:p-8 font-sans text-white touch-manipulation overflow-x-hidden pb-20">
      {isReviewMode && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="review-bar fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-3 shadow-lg text-sm"
        >
          🔥 正在攻克错题：本站还剩 {remainingRedDots} 处迷雾待清扫 🔥
        </motion.div>
      )}
      <div className={cn("max-w-3xl mx-auto", isReviewMode && "pt-12")}>
        {/* Progress Bar */}
        <div className="mb-8 flex items-center gap-4">
          <button 
            onClick={handleBackToHome} 
            className="touch-target hover:bg-white/10 rounded-full transition-colors active-shrink"
          >
            <Home className="w-5 h-5 text-white/40" />
          </button>
          <div className="flex-1 flex gap-2 overflow-x-auto py-2 no-scrollbar scroll-snap-x">
            {filteredQuestions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (isDebounced()) return;
                  setCurrentIndex(idx);
                  setStep('question');
                  resetQuestionState();
                }}
                className={cn(
                  "shrink-0 w-11 h-11 rounded-xl text-xs font-bold flex items-center justify-center transition-all duration-200 relative active-shrink scroll-snap-align-center",
                  idx === currentIndex ? "bg-blue-600 text-white shadow-lg shadow-blue-500/50 scale-110" : 
                  completedQuestions.has(filteredQuestions[idx].id) ? "bg-green-500/20 text-green-400 border border-green-500/20" :
                  idx < currentIndex ? "bg-blue-500/20 text-blue-400 border border-blue-500/20" : 
                  "bg-white/5 border border-white/10 text-white/40 hover:border-blue-500/50 hover:text-blue-400"
                )}
              >
                {idx + 1}
                {completedQuestions.has(filteredQuestions[idx].id) && idx !== currentIndex && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#050505] flex items-center justify-center">
                    <CheckCircle2 className="w-2 h-2 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {currentIndex + 1} / {filteredQuestions.length}
          </span>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Question */}
          {step === 'question' && (
            <motion.div 
              key="question"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white/5 rounded-3xl sm:rounded-[40px] p-6 sm:p-12 shadow-2xl border border-white/10 relative overflow-hidden"
            >
              {currentQuestion.isZhongkao && (
                <div className="absolute top-0 right-0 p-6">
                  <div className="px-4 py-1.5 rounded-full bg-blue-600/10 backdrop-blur-md border border-blue-600/20 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 animate-pulse-glow">
                    <Award className="w-3 h-3" />
                    Zhongkao Special · 中考真题
                  </div>
                </div>
              )}
              <div className="mb-8 sm:mb-10">
                <span className="inline-block px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest mb-4 sm:mb-6">
                  {currentQuestion.grammarPoint}
                </span>
                <h2 className="text-2xl sm:text-4xl font-bold leading-tight hyphens-auto text-white">
                  <Field content={currentQuestion.stem} fieldName="stem" />
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                {currentQuestion.options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(option)}
                    className="group flex items-center justify-between p-4 sm:p-6 rounded-2xl border-2 border-white/5 hover:border-blue-500 hover:bg-blue-500/10 transition-all text-left active-shrink"
                  >
                    <span className="text-base sm:text-lg font-bold group-hover:text-blue-400 text-white/80">{option}</span>
                    <div className="w-8 h-8 rounded-full border-2 border-white/10 group-hover:border-blue-500 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Feedback */}
          {step === 'feedback' && (
            <motion.div 
              key="feedback"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className={cn(
                "rounded-3xl sm:rounded-[40px] p-6 sm:p-12 border-2 shadow-2xl",
                userAnswer === currentQuestion.correctAnswer 
                  ? "bg-green-500/10 border-green-500/20" 
                  : "bg-red-500/10 border-red-500/20"
              )}>
                <div className="flex items-center gap-4 mb-6">
                  {userAnswer === currentQuestion.correctAnswer ? (
                    <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" />
                  ) : (
                    <XCircle className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" />
                  )}
                  <h3 className={cn(
                    "text-xl sm:text-2xl font-bold",
                    userAnswer === currentQuestion.correctAnswer ? "text-green-800" : "text-red-800"
                  )}>
                    {userAnswer === currentQuestion.correctAnswer 
                      ? <Field content={currentQuestion.correctTitle} fieldName="correctTitle" />
                      : <Field content={currentQuestion.incorrectTitle} fieldName="incorrectTitle" />
                    }
                  </h3>
                </div>

                <div className="bg-white/90 rounded-3xl p-6 backdrop-blur-sm border border-white/40">
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> <Field content={currentQuestion.explanationTitle} fieldName="explanationTitle" />
                  </h4>
                  <p className="text-lg leading-relaxed font-medium text-gray-900">
                    <Field content={currentQuestion.explanationSummary} fieldName="explanationSummary" />
                  </p>
                </div>

                {userAnswer === currentQuestion.correctAnswer ? (
                  <button
                    onClick={() => setStep('explain')}
                    className="mt-10 w-full py-6 bg-blue-600 text-white rounded-2xl font-bold text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3 active-shrink"
                  >
                    进入解释挑战 <ArrowRight className="w-6 h-6" />
                  </button>
                ) : (
                  <button
                    onClick={() => setStep('question')}
                    className="mt-10 w-full py-6 bg-red-600 text-white rounded-2xl font-bold text-xl hover:bg-red-700 transition-all shadow-xl shadow-red-100 flex items-center justify-center gap-3 active-shrink"
                  >
                    重新尝试 <RefreshCcw className="w-6 h-6" />
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Explain Challenge */}
          {step === 'explain' && (
            <motion.div 
              key="explain"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 sm:space-y-6"
            >
              <div className="bg-white rounded-3xl sm:rounded-[40px] p-6 sm:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
                <div className="flex items-center gap-3 mb-6 sm:mb-8">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                    <Field content={currentQuestion.explainTitle} fieldName="explainTitle" />
                  </h3>
                </div>

                <div className="bg-gray-50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 mb-6 sm:mb-8 border border-gray-100">
                  <p className="text-gray-600 font-medium leading-relaxed text-sm sm:text-base">
                    <Field content={currentQuestion.explainPrompt} fieldName="explainPrompt" />
                  </p>
                </div>

                <div className="relative">
                  <textarea
                    value={userExplanation}
                    onChange={(e) => setUserExplanation(e.target.value)}
                    placeholder={currentQuestion.explainPlaceholder}
                    className="w-full h-32 sm:h-40 p-4 sm:p-6 bg-gray-50 rounded-2xl sm:rounded-3xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none text-base sm:text-lg resize-none text-gray-900 placeholder:text-gray-400"
                  />
                  {isEvaluating && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-white/80 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center gap-6 z-10"
                    >
                      <div className="relative">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 bg-blue-100 rounded-full -z-10 blur-xl opacity-50"
                        />
                      </div>
                      <div className="h-6 flex items-center justify-center">
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={evalMessageIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="text-sm font-bold text-blue-600 uppercase tracking-widest"
                          >
                            {EVALUATION_MESSAGES[evalMessageIndex]}
                          </motion.p>
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* AI Feedback */}
                {aiFeedback && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "mt-6 p-8 rounded-[32px] border-2 transition-all duration-500",
                      aiFeedback.status === 'pass' ? "bg-green-50/50 border-green-200 cyber-glow-pass" : 
                      aiFeedback.status === 'partial' ? "bg-orange-50/50 border-orange-200 cyber-glow-partial" :
                      "bg-red-50/50 border-red-200 cyber-glow-fail"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          aiFeedback.status === 'pass' ? "bg-green-500 text-white" : 
                          aiFeedback.status === 'partial' ? "bg-orange-500 text-white" :
                          "bg-red-500 text-white"
                        )}>
                          {aiFeedback.status === 'pass' ? <CheckCircle2 className="w-5 h-5" /> : 
                           aiFeedback.status === 'partial' ? <AlertCircle className="w-5 h-5" /> :
                           <AlertCircle className="w-5 h-5" />}
                        </div>
                        <span className={cn(
                          "font-black uppercase tracking-[0.2em] text-xs",
                          aiFeedback.status === 'pass' ? "text-green-600" : 
                          aiFeedback.status === 'partial' ? "text-orange-600" :
                          "text-red-600"
                        )}>
                          {aiFeedback.status === 'pass' ? '挑战通过' : 
                           aiFeedback.status === 'partial' ? '仍需完善' : 
                           aiFeedback.status === 'error' ? '无效输入' : '挑战未通过'}
                        </span>
                      </div>

                      {aiFeedback.reasoning && (
                        <button 
                          onClick={() => setShowReasoning(!showReasoning)}
                          className="text-[10px] font-bold text-gray-400 hover:text-blue-500 transition-colors flex items-center gap-1 touch-target -m-2 active-shrink"
                        >
                          <HelpCircle className="w-3 h-3" /> {showReasoning ? '隐藏思考' : '查看思考'}
                        </button>
                      )}
                    </div>

                    <div 
                      ref={feedbackScrollRef}
                      className="text-gray-900 text-lg font-medium leading-relaxed mb-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar"
                    >
                      {aiFeedback.status === 'pass' && currentQuestion.trapAnalysis ? (
                        <div className="mb-4 p-5 rounded-3xl bg-blue-600/5 border border-blue-600/10 shadow-inner">
                          <div className="flex items-center gap-2 mb-3 text-blue-600 font-bold text-[10px] uppercase tracking-[0.2em]">
                            <Sparkles className="w-3 h-3" />
                            陷阱辨析 · Trap Analysis
                          </div>
                          <div className="text-blue-900 leading-relaxed italic text-base prose prose-blue prose-sm max-w-none">
                            <Markdown>{"*" + currentQuestion.trapAnalysis + "*"}</Markdown>
                          </div>
                        </div>
                      ) : (
                        <div className="prose prose-sm sm:prose-base max-w-none text-gray-900 font-medium leading-relaxed">
                          <Markdown>{aiFeedback.comment}</Markdown>
                        </div>
                      )}
                    </div>

                    <AnimatePresence>
                      {showReasoning && aiFeedback.reasoning && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 mt-4 border-t border-gray-200/50">
                            <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="w-3 h-3 text-blue-400" />
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">AI 老师的思考逻辑</span>
                            </div>
                            <p className="text-xs text-gray-400 italic leading-relaxed">
                              {aiFeedback.reasoning}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                <div className="mt-10 flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleExplain}
                    disabled={isEvaluating || !userExplanation.trim()}
                    className={cn(
                      "flex-1 py-6 rounded-2xl font-bold text-xl transition-all shadow-xl flex items-center justify-center gap-3 active-shrink",
                      isEvaluating || !userExplanation.trim() 
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                        : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
                    )}
                  >
                    {isEvaluating ? (
                      <>正在评价... <Loader2 className="w-6 h-6 animate-spin" /></>
                    ) : (
                      <>提交解释 <ArrowRight className="w-6 h-6" /></>
                    )}
                  </button>
                  
                  {aiFeedback && aiFeedback.status !== 'pass' && (
                    <button
                      onClick={() => {
                        setShowReasoning(true);
                        setStep('feedback');
                      }}
                      className="py-6 px-8 bg-white border-2 border-gray-100 text-gray-600 rounded-2xl font-bold text-lg hover:bg-gray-50 transition-all active-shrink"
                    >
                      查看攻略
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 4: Wrap Up */}
          {step === 'wrapUp' && (
            <motion.div 
              key="wrapUp"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white/5 rounded-[40px] p-12 text-center border border-white/10 relative overflow-hidden"
            >
              <div className="relative z-10">
                <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-8">
                  <Trophy className="w-12 h-12 text-blue-500" />
                </div>
                <h2 className="text-4xl font-bold mb-4">本站探索完毕！</h2>
                <p className="text-white/40 mb-12 text-lg">
                  你已经成功点亮了本章节的所有语法节点。
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={handleNextChapter}
                    className="py-6 bg-blue-600 text-white rounded-2xl font-bold text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active-shrink"
                  >
                    前往下一站
                  </button>
                  <button
                    onClick={handleBackToHome}
                    className="py-6 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-xl hover:bg-white/10 transition-all active-shrink"
                  >
                    返回星系图
                  </button>
                </div>
              </div>
              <div className="absolute top-0 left-0 w-full h-full bg-blue-500/5 blur-[100px] -z-10" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Medal Modal */}
        <AnimatePresence>
          {showMedal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
              onClick={() => setShowMedal(false)}
            >
              <motion.div
                initial={{ scale: 0.5, y: 100 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.5, y: 100 }}
                className="bg-white rounded-[48px] p-12 text-center max-w-sm w-full shadow-[0_0_50px_rgba(59,130,246,0.3)]"
                onClick={e => e.stopPropagation()}
              >
                <div className="w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                  <Award className="w-16 h-16 text-white" />
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                    className="absolute inset-0 border-4 border-dashed border-white/30 rounded-full"
                  />
                </div>
                <h3 className="text-3xl font-black text-gray-900 mb-4 tracking-tight uppercase">识破者勋章</h3>
                <p className="text-gray-500 font-medium mb-10 leading-relaxed">
                  恭喜！你成功识破了一个中考语法陷阱，并给出了完美的逻辑解释。
                </p>
                <button
                  onClick={() => setShowMedal(false)}
                  className="w-full py-5 bg-gray-900 text-white rounded-2xl font-bold text-lg hover:bg-black transition-all active-shrink"
                >
                  收下勋章
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
